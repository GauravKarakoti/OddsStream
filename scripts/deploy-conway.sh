#!/bin/bash

# =============================================================================
# OddsStream Deployment Script for Linera Conway Testnet
# Deploys all contracts and initializes the system
# =============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting OddsStream deployment to Conway Testnet${NC}\n"

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONWAY_RPC="https://faucet.testnet-conway.linera.net"
FAUCET_URL="https://faucet.testnet-conway.linera.net"
WASM_TARGET="wasm32-unknown-unknown"

# Check if user has configured their chain ID
if [[ -z "$LINERA_CHAIN_ID" ]]; then
    echo -e "${YELLOW}⚠️  LINERA_CHAIN_ID not set. Checking for existing wallet...${NC}"
    
    if ! linera --testnet conway wallet show &>/dev/null; then
        echo -e "${RED}❌ No Linera wallet found. Please run:${NC}"
        echo -e "   linera wallet init --faucet $FAUCET_URL"
        echo -e "   linera wallet request-chain --faucet $FAUCET_URL"
        echo -e "   Then set LINERA_CHAIN_ID=[your-chain-id]"
        exit 1
    fi
    
    # Try to extract chain ID
    LINERA_CHAIN_ID=$(linera --testnet conway wallet show | grep -o "chain-[a-f0-9]\{64\}" | head -1)
    if [[ -z "$LINERA_CHAIN_ID" ]]; then
        echo -e "${RED}❌ Could not determine chain ID. Please set LINERA_CHAIN_ID manually.${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Using chain ID: $LINERA_CHAIN_ID${NC}"
fi

export LINERA_CHAIN_ID

# -----------------------------------------------------------------------------
# Function Definitions
# -----------------------------------------------------------------------------
print_step() {
    echo -e "\n${GREEN}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

build_contract() {
    local contract_name="$1"
    local contract_dir="$2"
    
    print_step "Building $contract_name..."
    
    cd "$contract_dir"
    
    # Clean previous builds
    cargo clean --target $WASM_TARGET
    
    # Build for wasm target
    if ! cargo build --release --target $WASM_TARGET; then
        print_error "Failed to build $contract_name"
        exit 1
    fi
    
    local wasm_path="../target/$WASM_TARGET/release/${contract_name//-/_}.wasm"
    if [[ ! -f "$wasm_path" ]]; then
        print_error "Wasm file not found at $wasm_path"
        exit 1
    fi
    
    echo "Wasm size: $(stat -f%z "$wasm_path" 2>/dev/null || stat -c%s "$wasm_path") bytes"
    print_success "$contract_name built successfully"
    
    echo "$wasm_path"
}

publish_bytecode() {
    local wasm_path="$1"
    local contract_name="$2"
    
    print_step "Publishing $contract_name bytecode..."
    
    # Publish to Conway testnet
    local output
    if ! output=$(linera --testnet conway project publish "$wasm_path" 2>&1); then
        print_error "Failed to publish $contract_name: $output"
        exit 1
    fi
    
    # Extract bytecode ID from output
    local bytecode_id=$(echo "$output" | grep -o "BytecodeId(\"[^\"]*\")" | sed 's/BytecodeId("//;s/")//')
    
    if [[ -z "$bytecode_id" ]]; then
        print_error "Could not extract bytecode ID for $contract_name"
        exit 1
    fi
    
    print_success "$contract_name bytecode ID: $bytecode_id"
    echo "$bytecode_id"
}

create_application() {
    local bytecode_id="$1"
    local contract_name="$2"
    local init_args="$3"
    
    print_step "Creating $contract_name application..."
    
    local output
    if ! output=$(linera --testnet conway project create-and-deploy \
        "$bytecode_id" \
        --json-argument "$init_args" \
        --chain-id "$LINERA_CHAIN_ID" 2>&1); then
        print_error "Failed to create $contract_name application: $output"
        exit 1
    fi
    
    # Extract application ID
    local app_id=$(echo "$output" | grep -o "ApplicationId(\"[^\"]*\")" | sed 's/ApplicationId("//;s/")//')
    
    if [[ -z "$app_id" ]]; then
        print_error "Could not extract application ID for $contract_name"
        exit 1
    fi
    
    print_success "$contract_name application ID: $app_id"
    echo "$app_id"
}

# -----------------------------------------------------------------------------
# Main Deployment Process
# -----------------------------------------------------------------------------
cd "$PROJECT_ROOT"

echo -e "${GREEN}📁 Project Root: $PROJECT_ROOT${NC}"
echo -e "${GREEN}🔗 Conway RPC: $CONWAY_RPC${NC}"
echo -e "${GREEN}⛓️  Chain ID: $LINERA_CHAIN_ID${NC}"

# Create build directory
mkdir -p build/conway

# -----------------------------------------------------------------------------
# 1. Build Contracts
# -----------------------------------------------------------------------------
print_step "Phase 1: Building Contracts"

SERVICE_WASM=$(build_contract "oddsstream-service" "contracts/service")
MARKET_WASM=$(build_contract "oddsstream-market" "contracts/market")
ORACLE_WASM=$(build_contract "oddsstream-oracle" "contracts/oracle")

# Copy wasm files to build directory
cp "$SERVICE_WASM" build/conway/service.wasm
cp "$MARKET_WASM" build/conway/market.wasm
cp "$ORACLE_WASM" build/conway/oracle.wasm

# -----------------------------------------------------------------------------
# 2. Publish Bytecode
# -----------------------------------------------------------------------------
print_step "Phase 2: Publishing Bytecode"

SERVICE_BYTECODE_ID=$(publish_bytecode "$SERVICE_WASM" "OddsStream Service")
MARKET_BYTECODE_ID=$(publish_bytecode "$MARKET_WASM" "OddsStream Market")
ORACLE_BYTECODE_ID=$(publish_bytecode "$ORACLE_WASM" "OddsStream Oracle")

# Save bytecode IDs to config file
cat > build/conway/bytecodes.json << EOF
{
  "service": "$SERVICE_BYTECODE_ID",
  "market": "$MARKET_BYTECODE_ID",
  "oracle": "$ORACLE_BYTECODE_ID",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "network": "conway"
}
EOF

# -----------------------------------------------------------------------------
# 3. Create Applications
# -----------------------------------------------------------------------------
print_step "Phase 3: Creating Applications"

# Create registry service (initial state is empty)
SERVICE_APP_ID=$(create_application "$SERVICE_BYTECODE_ID" "Registry Service" "{}")

# Create oracle adjudicator
ORACLE_APP_ID=$(create_application "$ORACLE_BYTECODE_ID" "Oracle Adjudicator" '{
  "tee_public_key": "test-key-001",
  "committee_size": 5,
  "stake_amount": "1000"
}')

# Create first market (example)
MARKET_APP_ID=$(create_application "$MARKET_BYTECODE_ID" "Example Market" '{
  "market_id": "match-barca-realmadrid-2024",
  "description": "Will FC Barcelona win against Real Madrid?",
  "oracle_type": "Hybrid",
  "resolution_time": "2024-12-01T20:00:00Z",
  "registry_chain": "'$LINERA_CHAIN_ID'",
  "oracle_adjudicator": "'$ORACLE_APP_ID'"
}')

# -----------------------------------------------------------------------------
# 4. Initialize System
# -----------------------------------------------------------------------------
print_step "Phase 4: Initializing System"

# Register oracle with registry
print_step "Registering oracle with registry..."
linera --testnet conway contract call "$SERVICE_APP_ID" \
  --operation '{"RegisterOracle": {"oracle_id": "'$ORACLE_APP_ID'"}}' \
  --chain-id "$LINERA_CHAIN_ID"

# Register first market
print_step "Registering first market..."
linera --testnet conway contract call "$SERVICE_APP_ID" \
  --operation '{"RegisterMarket": {
    "market_id": "match-barca-realmadrid-2024",
    "app_id": "'$MARKET_APP_ID'",
    "description": "Will FC Barcelona win against Real Madrid?"
  }}' \
  --chain-id "$LINERA_CHAIN_ID"

# Save deployment info
cat > build/conway/deployment.json << EOF
{
  "network": "conway",
  "chain_id": "$LINERA_CHAIN_ID",
  "applications": {
    "registry": "$SERVICE_APP_ID",
    "oracle_adjudicator": "$ORACLE_APP_ID",
    "example_market": "$MARKET_APP_ID"
  },
  "bytecodes": {
    "service": "$SERVICE_BYTECODE_ID",
    "market": "$MARKET_BYTECODE_ID",
    "oracle": "$ORACLE_BYTECODE_ID"
  },
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "frontend_config": {
    "rpc_url": "$CONWAY_RPC",
    "graphql_url": "$CONWAY_RPC/graphql",
    "ws_url": "wss://faucet.testnet-conway.linera.net/ws",
    "registry_app_id": "$SERVICE_APP_ID"
  }
}
EOF

# -----------------------------------------------------------------------------
# 5. Generate Frontend Configuration
# -----------------------------------------------------------------------------
print_step "Phase 5: Generating Frontend Configuration"

cat > frontend/src/config/conway.ts << EOF
// Auto-generated by deploy-conway.sh
// OddsStream Configuration for Conway Testnet

export const CONWAY_CONFIG = {
  NETWORK: 'conway' as const,
  RPC_URL: '$CONWAY_RPC',
  GRAPHQL_URL: '$CONWAY_RPC/graphql',
  WS_URL: 'wss://faucet.testnet-conway.linera.net/ws',
  
  // Application IDs
  APPLICATIONS: {
    REGISTRY: '$SERVICE_APP_ID',
    ORACLE_ADJUDICATOR: '$ORACLE_APP_ID',
    EXAMPLE_MARKET: '$MARKET_APP_ID'
  },
  
  // Test accounts (for development)
  TEST_ACCOUNTS: [
    {
      name: 'Market Maker',
      privateKey: 'test-key-1'
    },
    {
      name: 'Trader',
      privateKey: 'test-key-2'
    },
    {
      name: 'Oracle Provider',
      privateKey: 'test-key-3'
    }
  ],
  
  // Default market parameters
  DEFAULT_MARKET: {
    FEE_PERCENTAGE: 1.5,
    MIN_STAKE: 10,
    MAX_STAKE: 10000,
    RESOLUTION_BUFFER_SECONDS: 300
  }
};

export default CONWAY_CONFIG;
EOF

# -----------------------------------------------------------------------------
# 6. Verification
# -----------------------------------------------------------------------------
print_step "Phase 6: Verifying Deployment"

echo -e "\n${GREEN}📋 Deployment Summary:${NC}"
echo "========================================"
echo -e "Network:    ${GREEN}Conway Testnet${NC}"
echo -e "Chain ID:   ${YELLOW}$LINERA_CHAIN_ID${NC}"
echo -e "Registry:   ${YELLOW}$SERVICE_APP_ID${NC}"
echo -e "Oracle:     ${YELLOW}$ORACLE_APP_ID${NC}"
echo -e "Market:     ${YELLOW}$MARKET_APP_ID${NC}"
echo "========================================"

# Test queries
print_step "Testing GraphQL connection..."
if curl -s -X POST -H "Content-Type: application/json" \
  -d '{"query": "{ chains { id } }"}' \
  "$CONWAY_RPC/graphql" >/dev/null 2>&1; then
  print_success "GraphQL endpoint is responsive"
else
  print_error "GraphQL endpoint not responding"
fi

# Final instructions
echo -e "\n${GREEN}✅ Deployment Complete!${NC}"
echo -e "\n${YELLOW}📝 Next Steps:${NC}"
echo "1. Update frontend with the generated config:"
echo "   cat frontend/src/config/conway.ts"
echo ""
echo "2. Test the deployment:"
echo "   linera --testnet conway contract query $SERVICE_APP_ID \\"
echo "     --query 'GetMarkets' --chain-id $LINERA_CHAIN_ID"
echo ""
echo "3. Start the frontend:"
echo "   cd frontend && npm start"
echo ""
echo "4. Monitor logs:"
echo "   tail -f build/conway/deployment.log"
echo ""
echo "${GREEN}🎉 OddsStream is now live on Conway Testnet!${NC}"

# Create a simple monitoring script
cat > scripts/monitor-conway.sh << 'EOF'
#!/bin/bash
echo "Monitoring OddsStream on Conway..."
watch -n 5 "
echo '=== Conway Testnet Status ===';
curl -s -X POST -H 'Content-Type: application/json' \\
  -d '{\"query\":\"{ chains { id blockCount } }\"}' \\
  https://faucet.testnet-conway.linera.net/graphql | jq '.data.chains[]';
echo '';
echo '=== Service Health ===';
linera --testnet conway contract query $SERVICE_APP_ID \\
  --query 'GetStats' --chain-id $LINERA_CHAIN_ID 2>/dev/null || echo 'Query failed';
"
EOF

chmod +x scripts/monitor-conway.sh

print_success "Created monitoring script: scripts/monitor-conway.sh"

exit 0