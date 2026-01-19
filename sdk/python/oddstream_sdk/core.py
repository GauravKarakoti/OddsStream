import asyncio
from typing import List, Optional
from dataclasses import dataclass
from linera_sdk import LineraClient

@dataclass
class Order:
    market_id: str
    side: str  # "YES" or "NO"
    amount: float
    max_price: Optional[float] = None

class OddsStreamAgent:
    def __init__(self, private_key: str, rpc_endpoint: str = "https://faucet.testnet-conway.linera.net"):
        self.client = LineraClient(rpc_endpoint, private_key)
        self.user_chain_id = None
        self.pending_batch = []
        
    async def initialize(self):
        """Set up user microchain on Linera"""
        if not self.user_chain_id:
            # Create user microchain
            self.user_chain_id = await self.client.create_chain()
            
            # Register with registry service
            await self.client.send_message(
                registry_chain_id,
                {
                    "operation": "RegisterUserChain",
                    "user_chain_id": self.user_chain_id
                }
            )
    
    async def place_batch_order(self, orders: List[Order]):
        """Implement batched order processing"""
        # Group orders by market chain
        orders_by_market = {}
        for order in orders:
            # Get market chain ID from registry
            market_info = await self.get_market_info(order.market_id)
            if market_info.chain_id not in orders_by_market:
                orders_by_market[market_info.chain_id] = []
            orders_by_market[market_info.chain_id].append(order)
        
        # Send batched messages to each market chain
        tasks = []
        for market_chain_id, market_orders in orders_by_market.items():
            message = {
                "type": "BatchedOrders",
                "user_chain_id": self.user_chain_id,
                "orders": [o.__dict__ for o in market_orders],
                "nonce": await self.get_next_nonce()
            }
            task = self.client.send_message(market_chain_id, message)
            tasks.append(task)
        
        # Execute all concurrently
        await asyncio.gather(*tasks)
    
    async def market_making_strategy(self, market_id: str, spread: float = 0.02):
        """Example strategy: provide liquidity on both sides"""
        while True:
            market_state = await self.get_market_state(market_id)
            
            # Calculate bid/ask prices
            mid_price = (market_state.yes_odds + (1 - market_state.no_odds)) / 2
            bid_price = mid_price * (1 - spread/2)
            ask_price = mid_price * (1 + spread/2)
            
            # Place orders
            orders = [
                Order(market_id=market_id, side="YES", amount=100, max_price=bid_price),
                Order(market_id=market_id, side="NO", amount=100, max_price=1-ask_price),
            ]
            
            await self.place_batch_order(orders)
            
            # Wait for next iteration
            await asyncio.sleep(30)  # Rebalance every 30 seconds