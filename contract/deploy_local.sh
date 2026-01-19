#!/bin/bash

# =============================================================================
# OddsStream Deployment Script for Local Network
# =============================================================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}🚀 Starting OddsStream Local Deployment${NC}\n"

# 1. Environment Setup
# -----------------------------------------------------------------------------
# Assuming we are running from inside the 'contract/' directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WASM_TARGET="wasm32-unknown-unknown"
LOCAL_RPC="https://faucet.testnet-conway.linera.net"

# Get the default chain ID from the local wallet
echo -e "${YELLOW}🔍 Detecting Local Chain ID...${NC}"

# FIXED: Match 64-char hex string (supports output with or without 'chain-' prefix)
LINERA_CHAIN_ID=$(linera wallet show | grep -o "[0-9a-f]\{64\}" | head -1)

if [[ -z "$LINERA_CHAIN_ID" ]]; then
    if [[ -f "/root/.config/linera/wallet.json" ]]; then
         echo -e "${YELLOW}⚠️  Wallet exists but no chain detected. Trying to sync/request...${NC}"
         linera wallet request-chain --faucet "$LOCAL_RPC"
    else
         echo -e "${YELLOW}⚠️  No Chain ID found. Initializing wallet...${NC}"
         linera wallet init --faucet "$LOCAL_RPC"
         linera wallet request-chain --faucet "$LOCAL_RPC"
    fi
    LINERA_CHAIN_ID=$(linera wallet show | grep -o "[0-9a-f]\{64\}" | head -1)
fi

if [[ -z "$LINERA_CHAIN_ID" ]]; then
    echo -e "${RED}❌ Failed to detect Chain ID. Exiting.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Using Chain ID: $LINERA_CHAIN_ID${NC}"

# 2. Build Contracts
# -----------------------------------------------------------------------------
build_contract() {
    local name=$1
    local path=$2 # Expects path relative to PROJECT_ROOT (e.g. contract/service)
    echo -e "\n${GREEN}🔨 Building $name...${NC}"
    
    # FIXED: Use correct directory path
    cd "$PROJECT_ROOT/$path"
    cargo build --release --target $WASM_TARGET
    
    # Return the directory containing the builds
    echo "$PROJECT_ROOT/target/$WASM_TARGET/release"
}

# FIXED: Changed 'contracts/' to 'contract/' to match file structure
SERVICE_BUILD_DIR=$(build_contract "oddsstream-service" "contract/service")
MARKET_BUILD_DIR=$(build_contract "oddsstream-market" "contract/market")
ORACLE_BUILD_DIR=$(build_contract "oddsstream-oracle" "contract/oracle")

# 3. Publish Bytecode
# -----------------------------------------------------------------------------
echo -e "\n${GREEN}📤 Publishing Bytecode...${NC}"

publish() {
    local build_dir=$1
    local name=$2
    # FIXED: Convert name (e.g. oddsstream-service) to snake_case (oddsstream_service) for file matching
    local name_snake="${name//-/_}"
    local contract_wasm="$build_dir/${name_snake}_contract.wasm"
    local service_wasm="$build_dir/${name_snake}_service.wasm"

    # Check if files exist
    if [[ ! -f "$contract_wasm" ]] || [[ ! -f "$service_wasm" ]]; then
        echo -e "${RED}❌ Missing WASM files for $name${NC}"
        echo "Looked for: $contract_wasm and $service_wasm"
        exit 1
    fi

    # FIXED: Use 'linera publish-bytecode' taking both contract and service
    linera publish-bytecode "$contract_wasm" "$service_wasm" \
        | grep -o "BytecodeId(\"[^\"]*\")" | sed 's/BytecodeId("//;s/")//'
}

SERVICE_BYTECODE=$(publish "$SERVICE_BUILD_DIR" "oddsstream-service")
echo "Service Bytecode: $SERVICE_BYTECODE"

MARKET_BYTECODE=$(publish "$MARKET_BUILD_DIR" "oddsstream-market")
echo "Market Bytecode:  $MARKET_BYTECODE"

ORACLE_BYTECODE=$(publish "$ORACLE_BUILD_DIR" "oddsstream-oracle")
echo "Oracle Bytecode:  $ORACLE_BYTECODE"

# 4. Create Applications
# -----------------------------------------------------------------------------
echo -e "\n${GREEN}🌱 Creating Applications...${NC}"

create_app() {
    local bytecode=$1
    local json_args=$2
    # FIXED: Use 'linera create-application'
    linera create-application "$bytecode" --json-argument "$json_args" \
        | grep -o "ApplicationId(\"[^\"]*\")" | sed 's/ApplicationId("//;s/")//'
}

# A. Registry Service
SERVICE_APP_ID=$(create_app "$SERVICE_BYTECODE" "{}")
echo "Registry App ID: $SERVICE_APP_ID"

# B. Oracle Adjudicator
ORACLE_APP_ID=$(create_app "$ORACLE_BYTECODE" '{
  "tee_public_key": "local-test-key",
  "committee_size": 1,
  "stake_amount": "100"
}')
echo "Oracle App ID:   $ORACLE_APP_ID"

# C. Example Market
MARKET_APP_ID=$(create_app "$MARKET_BYTECODE" '{
  "market_id": "local-match-001",
  "description": "Local Test: Team A vs Team B",
  "oracle_type": "Hybrid",
  "resolution_time": "2026-01-01T00:00:00Z",
  "registry_chain": "'$LINERA_CHAIN_ID'",
  "oracle_adjudicator": "'$ORACLE_APP_ID'"
}')
echo "Market App ID:   $MARKET_APP_ID"

# 5. Initialization (Wiring)
# -----------------------------------------------------------------------------
echo -e "\n${GREEN}🔗 Wiring Contracts...${NC}"

# Start a temporary Linera service to handle GraphQL mutations
echo -e "${YELLOW}Starting temporary Linera service...${NC}"
linera service --port 8085 &
SERVICE_PID=$!
sleep 5 # Wait for service to start

# Function to execute GraphQL mutation using curl
gql_mutate() {
    local app_id=$1
    local mutation=$2
    # Escape quotes for JSON
    local clean_mutation=$(echo "$mutation" | tr -d '\n' | sed 's/"/\\"/g')
    
    curl -s -X POST -H "Content-Type: application/json" \
        -d "{\"query\": \"mutation { $mutation }\"}" \
        "http://localhost:8085/chains/$LINERA_CHAIN_ID/applications/$app_id" > /dev/null
}

echo "Registering Oracle..."
gql_mutate "$SERVICE_APP_ID" "registerOracle(oracleId: \\\"$ORACLE_APP_ID\\\")"

echo "Registering Market..."
gql_mutate "$SERVICE_APP_ID" "registerMarket(marketId: \\\"local-match-001\\\", appId: \\\"$MARKET_APP_ID\\\", description: \\\"Local Test: Team A vs Team B\\\")"

# Stop the temporary service
kill $SERVICE_PID
echo -e "${GREEN}✓ Wiring complete${NC}"

# 6. Generate Frontend Config
# -----------------------------------------------------------------------------
echo -e "\n${GREEN}📝 Generating Frontend Config...${NC}"

CONFIG_PATH="$PROJECT_ROOT/frontend/src/config/local.ts"
mkdir -p "$(dirname "$CONFIG_PATH")"

cat > "$CONFIG_PATH" << EOF
// Auto-generated by deploy_local.sh
export const LOCAL_CONFIG = {
  NETWORK: 'local' as const,
  RPC_URL: 'https://faucet.testnet-conway.linera.net',
  GRAPHQL_URL: 'https://faucet.testnet-conway.linera.net',
  WS_URL: 'wss://faucet.testnet-conway.linera.net/ws',

  APPLICATIONS: {
    REGISTRY: '$SERVICE_APP_ID',
    ORACLE_ADJUDICATOR: '$ORACLE_APP_ID',
    EXAMPLE_MARKET: '$MARKET_APP_ID'
  },
  
  CHAIN_ID: '$LINERA_CHAIN_ID'
};

export default LOCAL_CONFIG;
EOF

echo -e "${GREEN}✅ Deployment Complete! Config written to frontend/src/config/local.ts${NC}"