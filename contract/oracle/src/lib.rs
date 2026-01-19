pub enum OracleRequest {
    FastTee {
        market_id: String,
        event_source: EventSource,
        tee_config: TeeConfig,
    },
    Committee {
        market_id: String,
        event_source: EventSource,
        committee_size: u32,
    },
}

impl OracleAdjudicator {
    async fn process_request(&mut self, request: OracleRequest) {
        match request {
            OracleRequest::FastTee { market_id, event_source, tee_config } => {
                // 1. Fetch real-world data (off-chain)
                let outcome = self.fetch_event_outcome(&event_source).await;
                
                // 2. Get TEE-signed attestation
                let (quote, signature) = self.request_tee_attestation(
                    &market_id,
                    outcome,
                    &tee_config,
                ).await;
                
                // 3. Verify and forward to market
                if self.verify_tee_attestation(&quote, &signature) {
                    let msg = MarketMessage::Resolution {
                        outcome,
                        signature,
                        oracle_type: OracleType::FastTee,
                    };
                    self.send_to_market(&market_id, msg);
                }
            }
            
            OracleRequest::Committee { market_id, event_source, committee_size } => {
                // Start multi-signature gathering
                self.initiate_committee_vote(&market_id, event_source, committee_size);
            }
        }
    }
}