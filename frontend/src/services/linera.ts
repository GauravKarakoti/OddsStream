import { LineraProvider } from '@linera/client';

export const initializeLinera = async () => {
    // For Conway testnet
    const provider = new LineraProvider({
        rpcUrl: 'https://faucet.testnet-conway.linera.net',
        wsUrl: 'wss://faucet.testnet-conway.linera.net/ws',
        chainId: 'conway-testnet',
    });
    
    // Connect Dynamic wallet (integrated with Conway)
    await provider.connect('dynamic');
    
    // Subscribe to real-time updates
    const subscription = provider.subscribe(
        `subscription OnMarketUpdate {
            marketUpdate {
                marketId
                yesOdds
                noOdds
                volume
                status
            }
        }`,
        (data: any) => {
            // Update UI in real-time
            updateMarketDisplay(data.marketUpdate);
        }
    );
    
    return provider;
};

// Batch order submission
export const submitBatchedOrders = async (
    provider: LineraProvider,
    orders: Array<Order>
): Promise<string> => {
    const userChainId = await provider.getChainId();
    
    const tx = await provider.sendMessage({
        targetChain: registryChainId,
        message: {
            operation: 'SubmitBatch',
            userChainId,
            orders: orders.map(o => ({
                marketId: o.marketId,
                side: o.side,
                amount: o.amount.toString(),
            })),
            nonce: Date.now(),
        },
    });
    
    return tx.hash;
};