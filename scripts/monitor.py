import asyncio
import aiohttp
from datetime import datetime

class OddsStreamMonitor:
    def __init__(self, conway_endpoint: str):
        self.endpoint = conway_endpoint
        self.metrics = {
            'messages_per_second': 0,
            'avg_latency': 0,
            'active_markets': 0,
            'total_liquidity': 0,
        }
    
    async def track_performance(self):
        async with aiohttp.ClientSession() as session:
            while True:
                # Query Linera metrics
                async with session.post(
                    f"{self.endpoint}/graphql",
                    json={
                        "query": """
                            query GetSystemMetrics {
                                chainStats { txCount, blockTime }
                                applicationStats { activeApplications }
                            }
                        """
                    }
                ) as resp:
                    data = await resp.json()
                    
                    # Update metrics
                    self.metrics.update({
                        'active_markets': data['applicationStats']['activeApplications'],
                        'avg_block_time': data['chainStats']['blockTime'],
                    })
                    
                    print(f"[{datetime.now()}] Metrics: {self.metrics}")
                    
                await asyncio.sleep(5)