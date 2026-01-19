use linera_sdk::{
    base::{ChainId, WithContractAbi, ApplicationId, Owner},
    contract::system_api,
    ApplicationCallResult, CalleeContext, Contract, ExecutionResult,
    OperationContext, SessionCallResult, ViewStateStorage,
};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

// Main registry state - stored on-chain
#[derive(Default, ViewStateStorage)]
pub struct RegistryState {
    // Market ID -> (ApplicationId, ChainId)
    pub markets: BTreeMap<String, (ApplicationId, ChainId)>,
    // User ChainId -> list of markets they participate in
    pub user_registrations: BTreeMap<ChainId, Vec<String>>,
}

#[derive(Serialize, Deserialize)]
pub enum RegistryOperation {
    CreateMarket {
        market_id: String,
        description: String,
        oracle_type: OracleType,
        resolution_time: u64,
    },
    RegisterUserChain {
        user_chain_id: ChainId,
    },
    UpdateOracle {
        market_id: String,
        new_oracle: OracleType,
    },
}

#[derive(Serialize, Deserialize, Clone)]
pub enum OracleType {
    FastTee { public_key: String },
    Committee { member_count: u32 },
    Hybrid,
}

pub struct OddsStreamService {
    state: RegistryState,
}

#[async_trait]
impl Contract for OddsStreamService {
    type Operation = RegistryOperation;
    type Response = ();

    async fn execute_operation(
        &mut self,
        context: OperationContext<Self::Operation>,
    ) -> ExecutionResult<Self::Response> {
        match context.operation {
            RegistryOperation::CreateMarket {
                market_id,
                description,
                oracle_type,
                resolution_time,
            } => {
                // 1. Create new microchain for this market
                let market_chain_id = system_api::create_chain(Owner::None).await?;
                
                // 2. Prepare market initialization arguments
                let market_args = MarketArgs {
                    market_id: market_id.clone(),
                    description,
                    oracle_type: oracle_type.clone(),
                    resolution_time,
                    registry_chain: context.chain_id,
                };
                
                // 3. Publish market application on the new chain
                let app_id = system_api::create_application(
                    market_chain_id,
                    MARKET_BYTECODE_ID, // You'll set this after publishing
                    &market_args,
                ).await?;
                
                // 4. Store in registry
                self.state.markets.insert(market_id, (app_id, market_chain_id));
                
                Ok(())
            }
            RegistryOperation::RegisterUserChain { user_chain_id } => {
                self.state.user_registrations.entry(user_chain_id)
                    .or_insert_with(Vec::new);
                Ok(())
            }
            _ => Ok(()),
        }
    }

    async fn handle_application_call(
        &mut self,
        _call: (),
        _forwarded_sessions: Vec<SessionId>,
        _context: CalleeContext,
    ) -> ApplicationCallResult<Self::Response> {
        Ok((vec![], None))
    }
}