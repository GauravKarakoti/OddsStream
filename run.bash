#!/usr/bin/env bash

set -eu

export LINERA_FAUCET_URL=https://faucet.testnet-conway.linera.net
linera wallet init --faucet="$LINERA_FAUCET_URL"
linera wallet request-chain --faucet="$LINERA_FAUCET_URL"

# 2. Build and Deploy OddsStream Contracts
echo "Deploying OddsStream Contracts..."
cd contract
# Ensure the script is executable
chmod +x deploy_local.sh
# Run your existing local deployment script
./deploy_local.sh

# 3. Start the Frontend
echo "Starting Frontend..."
cd ../frontend
npm install
npm start