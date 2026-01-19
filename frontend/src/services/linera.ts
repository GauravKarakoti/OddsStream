import { ethers } from 'ethers';
// Import the actual available members from the Wasm client
import { initialize, Client, Faucet } from '@linera/client';

// 1. Define the interfaces that match your app's needs
export interface Order {
    marketId: string;
    side: 'YES' | 'NO';
    amount: string;
}

// 2. Implement the Signer interface required by @linera/client
// The Wasm client needs a signer to authorize transactions
class EthersSigner {
    private wallet: ethers.HDNodeWallet | ethers.Wallet;

    constructor(privateKey?: string) {
        // Create a random ephemeral wallet if no key provided
        this.wallet = privateKey 
            ? new ethers.Wallet(privateKey) 
            : ethers.Wallet.createRandom();
    }

    get address() {
        return this.wallet.address;
    }

    // Matches the Linera Signer interface: sign(owner: string, value: Uint8Array): Promise<string>
    async sign(owner: string, value: Uint8Array): Promise<string> {
        if (owner.toLowerCase() !== this.wallet.address.toLowerCase()) {
            throw new Error(`Signer address mismatch: expected ${owner}, got ${this.wallet.address}`);
        }
        // Sign the raw bytes (Linera expects EIP-191 style signature)
        return await this.wallet.signMessage(value);
    }

    async containsKey(owner: string): Promise<boolean> {
        return owner.toLowerCase() === this.wallet.address.toLowerCase();
    }
}

// 3. Create a Wrapper to act as the "Provider"
export class LineraWrapper {
    public client: Client | null = null;
    public chainId: string | null = null;
    public owner: string | null = null;
    
    constructor(
        private rpcUrl: string,
        private wsUrl: string,
        private networkName: string
    ) {}

    async connect(type: 'dynamic' | 'local' = 'dynamic') {
        // Initialize the Wasm module
        await initialize();

        // Setup Signer
        const signer = new EthersSigner();
        this.owner = signer.address;

        // Use Faucet to create/claim a wallet on the testnet
        const faucet = new Faucet(this.rpcUrl);
        const wallet = await faucet.createWallet();
        
        // Claim a microchain for this user (this might take a moment)
        console.log("Claiming chain from faucet...");
        this.chainId = await faucet.claimChain(wallet, this.owner);
        console.log(`Claimed chain: ${this.chainId}`);

        // Initialize the low-level Client
        this.client = new Client(wallet, signer as any, {
            // Options for timeouts, validators, etc.
            maxRetries: 3
        });
        
        return this.chainId;
    }

    async getChain() {
        if (!this.client || !this.chainId) throw new Error("Client not initialized");
        return await this.client.chain(this.chainId);
    }

    // Emulate the 'subscribe' method using the Chain's notification system
    async subscribe(query: string, callback: (data: any) => void) {
        const chain = await this.getChain();
        
        // The Wasm 'onNotification' usually triggers on new blocks/messages
        // For specific GraphQL subscriptions, we might need to poll or use the standard WS endpoint
        // depending on what the specific application supports.
        // Here we map it to the chain notification for incoming messages.
        chain.onNotification((notification: any) => {
            console.log("Chain notification:", notification);
            // In a real implementation, you would check if this notification matches your query
            // or trigger a fresh query to update the UI.
            this.queryApplication(query).then(callback).catch(console.error);
        });
        
        return { unsubscribe: () => {} }; // Placeholder cleanup
    }

    async queryApplication(query: string, variables: any = {}) {
        const chain = await this.getChain();
        // You need the Application ID of your OddsStream contract here
        // For now, we assume it's passed or stored in config
        const APP_ID = "YOUR_APP_ID_HERE"; 
        
        const app = await chain.application(APP_ID);
        const response = await app.query(query);
        return JSON.parse(response);
    }
}

// 4. Initialize Function
export const initializeLinera = async () => {
    const provider = new LineraWrapper(
        'https://faucet.testnet-conway.linera.net',
        'wss://faucet.testnet-conway.linera.net/ws',
        'conway-testnet'
    );
    
    await provider.connect('dynamic');
    
    // Subscribe logic
    // Note: The Wasm client handles sync automatically, but for React UI updates,
    // you might want to wrap this in a loop or trigger based on 'onNotification'
    await provider.subscribe(
        `query { marketUpdate { ... } }`, // Changed to query for polling/notification fetch
        (data) => {
            console.log("Market Update:", data);
            // updateMarketDisplay(data);
        }
    );

    return provider;
};

// 5. Batch Order Submission
export const submitBatchedOrders = async (
    provider: LineraWrapper,
    orders: Array<Order>,
    registryAppId: string // Passed explicitly or managed in provider
): Promise<string> => {
    const chain = await provider.getChain();
    const app = await chain.application(registryAppId);

    // In Linera, operations are performed via GraphQL mutations on the application
    // We construct a mutation string matching your "SubmitBatch" operation
    const mutation = `
        mutation SubmitBatch($orders: [OrderInput!]!) {
            submitBatch(orders: $orders)
        }
    `;

    // Map your orders to the GraphQL input format expected by your contract
    const orderInputs = orders.map(o => ({
        marketId: o.marketId,
        side: o.side,
        amount: o.amount.toString()
    }));

    // The 'query' method in Wasm client handles mutations as well if they change state
    // Note: The actual method to *execute* a block operation usually involves
    // submitting the operation to the inbox/chain, which 'query' might not do directly
    // depending on the SDK version. 
    // If 'query' is read-only, you interact by synchronizing the chain which executes pending incoming messages.
    // However, for *originating* a transaction, we often use GraphQL mutations.
    
    const response = await app.query(JSON.stringify({
        query: mutation,
        variables: { orders: orderInputs }
    }));
    
    return response;
};