# OddsStream

**Real-Time, AI-Powered Micro-Prediction Markets on Linera**

OddsStream is a next-generation prediction market platform built on the Linera blockchain. It leverages Linera's unique microchain architecture to deliver instant market finality, predictable costs, and a seamless real-time experience—unlocking new possibilities for live event trading and AI agent participation.

## 🎯 Features

*   **One-Click Micro-Markets:** Create prediction markets for live events that resolve in minutes or seconds.
*   **AI-Ready Infrastructure:** Built-in MCP/GraphQL support for AI agents to provide liquidity, set odds, or trade.
*   **Real-Time Updates:** Subscribe to live odds and market state changes with instant on-chain finality.
*   **Scalable by Design:** Each market runs on an isolated microchain, ensuring performance doesn't degrade with network load.
*   **Conway Testnet Compatible:** Fully deployed and operational on the Linera Conway testnet.

## 🏗️ Architecture

The system is built on three core Linera components:
1.  **Registry Service:** A main Linera service that manages the list of all active markets and their corresponding microchain IDs.
2.  **Market Applications:** Each prediction market is its own Linera application, deployed to a dedicated user or application-specific microchain.
3.  **Oracle Service:** A separate Linera service run by a staked committee that pushes resolution data to market applications.

## 🚀 Getting Started

### Prerequisites
*   Install the [Linera toolchain](https://linera.io/developers) (Tested with `linera` version compatible with Conway testnet).
*   Have a Rust development environment.
*   Install Node.js and npm for the frontend.

### Local Network Deployment
1.  **Clone the repository:**
    ```bash
    git clone https://github.com/GauravKarakoti/oddsstream.git
    cd oddsstream
    ```
2.  **Start a local Linera network:**
    ```bash
    linera net up
    ```
3.  **Deploy the OddsStream service and application bytecode:**
    ```bash
    cd contract
    ./deploy_local.sh
    ```
    This script will publish the bytecode and create the initial service state.
4.  **Run the web frontend:**
    ```bash
    cd frontend
    npm install
    npm run dev
    ```
    Open `http://localhost:5173` to interact with the application.

### Conway Testnet Deployment
1.  **Request testnet tokens** from the Linera Discord faucet.
2.  **Configure your wallet for Conway testnet.**
3.  **Publish the bytecode to testnet:**
    ```bash
    linera --testnet conway project publish-and-deploy
    ```
4.  **Update the frontend configuration** to point to your published testnet application IDs and the testnet GraphQL endpoint.

## 🔧 Interaction Guide

*   **As a User:** Connect your Linera wallet (e.g., `linera wallet`). Use the web interface to create a new market, buy/sell shares, or view your portfolio across different microchains.
*   **As an AI Agent:** Connect to the OddsStream GraphQL endpoint using an MCP client. Query open markets, current odds, and submit signed transactions to place trades. Example queries are in `/docs/ai_agent_integration.md`.

## 📁 Project Structure
```text
oddsstream/
├── contract/ # Linera service and application Rust code
│ ├── src/
│ │ ├── lib.rs # Core market logic
│ │ ├── state.rs # Data structures
│ │ └── oracle_interface.rs # Cross-chain messages
│ └── deploy_local.sh
├── frontend/ # React/TypeScript web interface
├── ai_agent/ # Example Python MCP client for AI bots
└── docs/ # Architecture diagrams and integration guides
```

## 👥 Team
*   Gaurav Karakoti - Contact: [@GauravKarakoti](https://t.me/gauravkarakoti) | [@GauravKara_Koti](https://x.com/GauravKara_Koti)

## 🙏 Acknowledgments
Built for the Linera Buildathon. Thanks to the Linera team for the developer support and the innovative protocol that makes projects like this possible.
