use linera_sdk::{base::Amount, contract::system_api};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct MarketState {
    pub market_id: String,
    pub description: String,
    pub status: MarketStatus,
    pub pool_yes: Amount,
    pub pool_no: Amount,
    pub yes_odds: f64,
    pub no_odds: f64,
    pub oracle_type: OracleType,
    pub resolution_time: u64,
}

#[derive(Serialize, Deserialize)]
pub enum MarketMessage {
    // Batched orders from user chain
    BatchedOrders {
        user_chain_id: ChainId,
        orders: Vec<Order>,
        nonce: u64,
    },
    // Resolution from oracle
    Resolution {
        outcome: bool,
        signature: Vec<u8>,
        oracle_type: OracleType,
    },
    // Funds transfer
    Transfer {
        from: ChainId,
        to: ChainId,
        amount: Amount,
    },
}

impl Contract for MarketApplication {
    type Message = MarketMessage;
    
    async fn execute_message(&mut self, message: Self::Message) {
        match message {
            MarketMessage::BatchedOrders { user_chain_id, orders, nonce } => {
                // Verify nonce to prevent replay attacks
                self.verify_nonce(user_chain_id, nonce);
                
                let mut total_cost = Amount::zero();
                let mut processed_orders = Vec::new();
                
                // Process each order in the batch
                for order in orders {
                    match order.side {
                        OrderSide::BuyYes => {
                            let cost = self.calculate_cost(order.amount, self.yes_odds);
                            total_cost += cost;
                            self.pool_yes += order.amount;
                        }
                        OrderSide::BuyNo => {
                            let cost = self.calculate_cost(order.amount, self.no_odds);
                            total_cost += cost;
                            self.pool_no += order.amount;
                        }
                    }
                    processed_orders.push(order.id);
                    
                    // Update odds after each order
                    self.update_odds();
                }
                
                // Send payment request to user's chain
                let payment_msg = MarketMessage::Transfer {
                    from: user_chain_id,
                    to: self.chain_id(),
                    amount: total_cost,
                };
                
                self.send_message(user_chain_id, payment_msg);
                
                // Send confirmation back
                let confirm_msg = MarketMessage::BatchConfirmed {
                    user_chain_id,
                    order_ids: processed_orders,
                    total_cost,
                };
                self.send_message(user_chain_id, confirm_msg);
            }
            
            MarketMessage::Resolution { outcome, signature, oracle_type } => {
                self.verify_oracle_signature(outcome, signature, oracle_type);
                self.status = MarketStatus::Resolved(outcome);
                self.distribute_winnings();
            }
            
            _ => {}
        }
    }
    
    fn update_odds(&mut self) {
        let total = self.pool_yes + self.pool_no;
        if total > Amount::zero() {
            self.yes_odds = (self.pool_no / total).into();
            self.no_odds = (self.pool_yes / total).into();
        }
    }
}