//! OddsStream Rust SDK for Linera Conway Testnet
//! Provides high-level abstractions for interacting with OddsStream contracts

mod client;
mod types;
mod errors;
mod utils;

pub use client::*;
pub use types::*;
pub use errors::*;

use linera_sdk::base::ChainId;
use serde::{Deserialize, Serialize};
use async_trait::async_trait;

/// Main OddsStream SDK client
pub struct OddsStreamSdk {
    rpc_url: String,
    chain_id: ChainId,
    client: reqwest::Client,
}

impl OddsStreamSdk {
    /// Create a new SDK instance for Conway testnet
    pub fn new(chain_id: ChainId) -> Self {
        Self {
            rpc_url: "https://faucet.testnet-conway.linera.net".to_string(),
            chain_id,
            client: reqwest::Client::new(),
        }
    }
    
    /// Create SDK with custom RPC URL
    pub fn with_rpc_url(chain_id: ChainId, rpc_url: String) -> Self {
        Self {
            rpc_url,
            chain_id,
            client: reqwest::Client::new(),
        }
    }
    
    /// Get current chain ID
    pub fn chain_id(&self) -> &ChainId {
        &self.chain_id
    }
    
    /// Submit batched orders to multiple markets
    pub async fn submit_batched_orders(
        &self,
        orders: Vec<MarketOrder>,
        user_chain_id: ChainId,
    ) -> Result<BatchResponse, SdkError> {
        // Group orders by market chain
        let mut orders_by_market: std::collections::HashMap<ChainId, Vec<MarketOrder>> = 
            std::collections::HashMap::new();
        
        for order in orders {
            // In production, you would fetch market chain ID from registry
            let market_chain_id = self.resolve_market_chain(&order.market_id).await?;
            orders_by_market
                .entry(market_chain_id)
                .or_insert_with(Vec::new)
                .push(order);
        }
        
        // Send batched messages to each market chain
        let mut responses = Vec::new();
        for (market_chain_id, market_orders) in orders_by_market {
            let message = MarketMessage::BatchedOrders {
                user_chain_id,
                orders: market_orders,
                nonce: self.get_nonce().await?,
            };
            
            let response = self
                .send_message(market_chain_id, message)
                .await?;
            
            responses.push(response);
        }
        
        Ok(BatchResponse {
            transaction_ids: responses,
            total_orders: orders.len(),
        })
    }
    
    /// Query active markets with filters
    pub async fn query_markets(
        &self,
        filters: MarketFilters,
    ) -> Result<Vec<MarketInfo>, SdkError> {
        let query = format!(
            r#"
            query GetMarkets($filters: MarketFilters) {{
                markets(filters: $filters) {{
                    id
                    description
                    yesOdds
                    noOdds
                    volume
                    liquidity
                    status
                    oracleType
                    resolutionTime
                    createdBlock
                }}
            }}
            "#
        );
        
        let response = self
            .client
            .post(&format!("{}/graphql", self.rpc_url))
            .json(&serde_json::json!({
                "query": query,
                "variables": { "filters": filters }
            }))
            .send()
            .await?;
        
        let data: GraphQLResponse<MarketsData> = response.json().await?;
        Ok(data.data.markets)
    }
    
    /// Subscribe to real-time market updates
    pub async fn subscribe_market_updates(
        &self,
        market_ids: Vec<String>,
        callback: impl Fn(MarketUpdate) + Send + 'static,
    ) -> Result<SubscriptionHandle, SdkError> {
        let subscription_query = format!(
            r#"
            subscription OnMarketUpdates($marketIds: [String!]) {{
                marketUpdates(marketIds: $marketIds) {{
                    marketId
                    yesOdds
                    noOdds
                    volume
                    status
                    timestamp
                }}
            }}
            "#
        );
        
        // Establish WebSocket connection
        let ws_url = self.rpc_url.replace("https://", "wss://").replace("http://", "ws://");
        let (mut ws_stream, _) = tokio_tungstenite::connect_async(&format!("{}/ws", ws_url))
            .await
            .map_err(|e| SdkError::ConnectionError(e.to_string()))?;
        
        // Send subscription
        let subscribe_msg = serde_json::json!({
            "type": "subscribe",
            "query": subscription_query,
            "variables": { "marketIds": market_ids }
        });
        
        ws_stream
            .send(tokio_tungstenite::tungstenite::Message::Text(
                subscribe_msg.to_string(),
            ))
            .await
            .map_err(|e| SdkError::WebSocketError(e.to_string()))?;
        
        // Spawn task to handle incoming messages
        let handle = tokio::spawn(async move {
            while let Some(msg) = ws_stream.next().await {
                match msg {
                    Ok(tokio_tungstenite::tungstenite::Message::Text(text)) => {
                        if let Ok(update) = serde_json::from_str::<MarketUpdate>(&text) {
                            callback(update);
                        }
                    }
                    Err(e) => {
                        eprintln!("WebSocket error: {}", e);
                        break;
                    }
                    _ => {}
                }
            }
        });
        
        Ok(SubscriptionHandle { handle })
    }
    
    /// Create AI agent instance
    pub fn create_ai_agent(
        &self,
        strategy: Box<dyn TradingStrategy>,
        config: AgentConfig,
    ) -> AIAgent {
        AIAgent::new(strategy, config, self.chain_id.clone())
    }
}

// ... Additional types and implementations

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_sdk_initialization() {
        let chain_id = ChainId::from([0u8; 32]);
        let sdk = OddsStreamSdk::new(chain_id);
        
        assert_eq!(sdk.chain_id(), &chain_id);
        assert!(!sdk.rpc_url.is_empty());
    }
    
    #[tokio::test]
    async fn test_market_query() {
        // This would be an integration test with Conway testnet
        // For now, just test that the SDK compiles correctly
        let chain_id = ChainId::from([0u8; 32]);
        let sdk = OddsStreamSdk::new(chain_id);
        
        let filters = MarketFilters {
            min_volume: Some(1000.0),
            status: Some("active".to_string()),
            ..Default::default()
        };
        
        // Note: This would actually call the testnet in integration tests
        println!("SDK initialized for Conway testnet");
    }
}