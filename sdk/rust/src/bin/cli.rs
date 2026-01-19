//! OddsStream CLI for Conway Testnet
//! Provides command-line interface for market operations

use clap::{Parser, Subcommand};
use oddsstream_sdk::*;
use std::str::FromStr;

#[derive(Parser)]
#[command(name = "oddsstream-cli")]
#[command(about = "OddsStream CLI for Linera Conway Testnet", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
    
    #[arg(long, default_value = "https://faucet.testnet-conway.linera.net")]
    rpc_url: String,
    
    #[arg(long)]
    chain_id: Option<String>,
    
    #[arg(long)]
    private_key: Option<String>,
}

#[derive(Subcommand)]
enum Commands {
    /// Query active markets
    Markets {
        #[arg(long)]
        filter_status: Option<String>,
        
        #[arg(long)]
        min_volume: Option<f64>,
        
        #[arg(long, default_value = "10")]
        limit: usize,
    },
    
    /// Place an order
    Order {
        #[arg(long)]
        market_id: String,
        
        #[arg(long)]
        side: String,
        
        #[arg(long)]
        amount: f64,
        
        #[arg(long)]
        max_price: Option<f64>,
    },
    
    /// Submit batched orders
    Batch {
        #[arg(long, value_delimiter = ',')]
        orders: Vec<String>, // Format: "market_id:side:amount"
    },
    
    /// Wallet operations
    Wallet {
        #[command(subcommand)]
        action: WalletAction,
    },
    
    /// AI Agent operations
    Agent {
        #[command(subcommand)]
        action: AgentAction,
    },
}

#[derive(Subcommand)]
enum WalletAction {
    /// Connect wallet
    Connect,
    
    /// Show balance
    Balance,
    
    /// Request test tokens
    Faucet,
}

#[derive(Subcommand)]
enum AgentAction {
    /// Start AI agent
    Start {
        #[arg(long)]
        strategy: String,
        
        #[arg(long)]
        market_id: String,
    },
    
    /// List available strategies
    Strategies,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    
    // Initialize SDK
    let chain_id = if let Some(id) = cli.chain_id {
        ChainId::from_str(&id)?
    } else {
        // Default chain or prompt user
        ChainId::default()
    };
    
    let sdk = OddsStreamSdk::with_rpc_url(chain_id, cli.rpc_url);
    
    match cli.command {
        Commands::Markets { filter_status, min_volume, limit } => {
            let filters = MarketFilters {
                status: filter_status,
                min_volume,
                limit: Some(limit),
                ..Default::default()
            };
            
            let markets = sdk.query_markets(filters).await?;
            
            println!("📊 Active Markets:");
            println!("==================");
            for market in markets {
                println!();
                println!("ID: {}", market.id);
                println!("Description: {}", market.description);
                println!("YES: {:.2}% | NO: {:.2}%", 
                    market.yes_odds * 100.0, 
                    market.no_odds * 100.0);
                println!("Volume: ${:.2}", market.volume);
                println!("Status: {}", market.status);
            }
        }
        
        Commands::Order { market_id, side, amount, max_price } => {
            println!("Placing order: {} {} ${}", side, market_id, amount);
            
            let order = MarketOrder {
                market_id,
                side: if side.to_lowercase() == "yes" { OrderSide::Yes } else { OrderSide::No },
                amount: amount.to_string(),
                max_price: max_price.map(|p| p.to_string()),
            };
            
            // In production, you would get user chain ID from wallet
            let user_chain_id = ChainId::default(); // Placeholder
            
            let response = sdk.submit_batched_orders(vec![order], user_chain_id).await?;
            
            println!("✅ Order submitted!");
            println!("Transaction IDs: {:?}", response.transaction_ids);
        }
        
        Commands::Batch { orders } => {
            println!("Submitting {} batched orders", orders.len());
            
            let mut market_orders = Vec::new();
            for order_str in orders {
                let parts: Vec<&str> = order_str.split(':').collect();
                if parts.len() != 3 {
                    eprintln!("Invalid order format: {}", order_str);
                    continue;
                }
                
                let order = MarketOrder {
                    market_id: parts[0].to_string(),
                    side: if parts[1].to_lowercase() == "yes" { OrderSide::Yes } else { OrderSide::No },
                    amount: parts[2].to_string(),
                    max_price: None,
                };
                market_orders.push(order);
            }
            
            let user_chain_id = ChainId::default(); // Placeholder
            let response = sdk.submit_batched_orders(market_orders, user_chain_id).await?;
            
            println!("✅ Batch submitted!");
            println!("Total orders: {}", response.total_orders);
            println!("Transactions: {}", response.transaction_ids.len());
        }
        
        Commands::Wallet { action } => {
            match action {
                WalletAction::Connect => {
                    println!("Connecting wallet to Conway testnet...");
                    // Wallet connection logic
                }
                WalletAction::Balance => {
                    println!("Fetching balance...");
                    // Balance query logic
                }
                WalletAction::Faucet => {
                    println!("Requesting test tokens from faucet...");
                    // Faucet request logic
                }
            }
        }
        
        Commands::Agent { action } => {
            match action {
                AgentAction::Start { strategy, market_id } => {
                    println!("Starting {} agent for market {}", strategy, market_id);
                    // Agent startup logic
                }
                AgentAction::Strategies => {
                    println!("Available strategies:");
                    println!("  - market_making");
                    println!("  - arbitrage");
                    println!("  - trend_following");
                    println!("  - mean_reversion");
                }
            }
        }
    }
    
    Ok(())
}