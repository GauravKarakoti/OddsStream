/**
 * OddsStream Linera Client Service
 * Handles all blockchain interactions with Conway Testnet
 */

import LOCAL_CONFIG, { OracleType } from '../config/local.ts';

// ============================================================================
// Type Definitions (re-exported from types.ts)
// ============================================================================
export interface Market {
  id: string;
  appId: string;
  chainId: string;
  description: string;
  yesOdds: number;
  noOdds: number;
  volume: number;
  liquidity: number;
  status: 'active' | 'resolved' | 'paused' | 'closed';
  oracleType: OracleType;
  resolutionTime: string;
  createdBlock: number;
  tags: string[];
}

export interface Order {
  id?: string;
  marketId: string;
  side: 'YES' | 'NO';
  amount: string;
  maxPrice?: string;
  timestamp?: number;
  status?: 'pending' | 'confirmed' | 'failed' | 'executed';
}

export interface BatchOrder {
  id: string;
  marketId: string;
  marketDescription: string;
  side: 'YES' | 'NO';
  amount: number;
  timestamp: number;
  status: 'pending' | 'processing' | 'confirmed' | 'failed';
}

export interface WalletState {
  address: string;
  chainId: string;
  balance: string;
  isConnected: boolean;
  provider: 'dynamic' | 'linera' | 'metamask' | null;
  userChainId?: string; // User's personal microchain ID
}

export interface MarketUpdate {
  marketId: string;
  yesOdds: number;
  noOdds: number;
  volume: number;
  status: string;
  timestamp: number;
  blockNumber?: number;
}

export interface BatchResponse {
  transactionIds: string[];
  totalOrders: number;
  estimatedGas?: string;
  timestamp: number;
}

export interface GraphQLResponse<T> {
  data: T;
  errors?: Array<{ message: string }>;
}

export interface SubscriptionHandle {
  unsubscribe: () => void;
}

// ============================================================================
// GraphQL Queries
// ============================================================================
const GRAPHQL_QUERIES = {
  GET_MARKETS: `
    query GetMarkets($filters: MarketFilters) {
      markets(filters: $filters) {
        id
        appId
        chainId
        description
        yesOdds
        noOdds
        volume
        liquidity
        status
        oracleType
        resolutionTime
        createdBlock
        tags
      }
    }
  `,
  
  GET_MARKET_DETAILS: `
    query GetMarketDetails($marketId: ID!) {
      market(id: $marketId) {
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
        orderBook {
          bids {
            price
            amount
          }
          asks {
            price
            amount
          }
        }
        recentTrades {
          side
          price
          amount
          timestamp
        }
      }
    }
  `,
  
  GET_USER_POSITIONS: `
    query GetUserPositions($userChainId: ID!) {
      userPositions(userChainId: $userChainId) {
        marketId
        side
        amount
        averagePrice
        currentValue
        profitLoss
        status
      }
    }
  `,
  
  GET_ORACLE_STATUS: `
    query GetOracleStatus($marketId: ID!) {
      oracleStatus(marketId: $marketId) {
        type
        status
        lastUpdate
        nextUpdate
        confidence
        attestations {
          provider
          signature
          timestamp
        }
      }
    }
  `,
} as const;

// ============================================================================
// GraphQL Subscriptions
// ============================================================================
const GRAPHQL_SUBSCRIPTIONS = {
  MARKET_UPDATES: `
    subscription OnMarketUpdates($marketIds: [ID!]) {
      marketUpdates(marketIds: $marketIds) {
        marketId
        yesOdds
        noOdds
        volume
        status
        timestamp
        blockNumber
      }
    }
  `,
  
  ORDER_UPDATES: `
    subscription OnOrderUpdates($userChainId: ID!) {
      orderUpdates(userChainId: $userChainId) {
        orderId
        marketId
        status
        executedPrice
        timestamp
      }
    }
  `,
  
  ORACLE_UPDATES: `
    subscription OnOracleUpdates($marketIds: [ID!]) {
      oracleUpdates(marketIds: $marketIds) {
        marketId
        outcome
        confidence
        timestamp
        signature
      }
    }
  `,
} as const;

// ============================================================================
// Main Linera Client Class
// ============================================================================
export class OddsStreamClient {
  private rpcUrl: string;
  private graphqlUrl: string;
  private wsUrl: string;
  private wallet: WalletState | null = null;
  private subscriptions: Map<string, WebSocket> = new Map();
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private batchQueue: BatchOrder[] = [];
  private batchTimer: NodeJS.Timeout | null = null;

  constructor(config: typeof LOCAL_CONFIG) {
    this.rpcUrl = config.RPC_URL;
    this.graphqlUrl = config.GRAPHQL_URL;
    this.wsUrl = config.WS_URL;
  }

  // ==========================================================================
  // Wallet & Authentication
  // ==========================================================================
  
  /**
   * Connect to Linera wallet (Dynamic wallet integration for Conway)
   */
  async connectWallet(): Promise<WalletState> {
    try {
      // Check if Dynamic wallet is available
      if (typeof window !== 'undefined' && (window as any).dynamic) {
        return await this.connectDynamicWallet();
      }
      
      // Fallback to Linera SDK wallet (Wasm)
      return await this.connectLineraWallet();
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      throw new Error(`Wallet connection failed: ${(error as any).message}`);
    }
  }
  
  private async connectDynamicWallet(): Promise<WalletState> {
    const dynamic = (window as any).dynamic;

    // Initialize Dynamic wallet with Local config
    const dynamicWallet = await dynamic.setWallet(LOCAL_CONFIG.WALLET.DYNAMIC_CONFIG);

    // Request connection
    const { address, chainId } = await dynamicWallet.connect();
    
    // Temporarily set wallet to allow authenticated requests
    this.wallet = {
      address,
      chainId,
      balance: '0', // Will be updated
      isConnected: true,
      provider: 'dynamic',
    };

    // Get balance
    const balance = await this.getBalance(address);
    
    // Register user chain with registry
    const userChainId = await this.registerUserChain(address);
    
    this.wallet = {
      ...this.wallet,
      balance,
      userChainId,
    };
    
    return this.wallet;
  }
  
  private async connectLineraWallet(): Promise<WalletState> {
    // 1. Import Linera Client Dependencies
    // Note: 'LineraProvider' does not exist in @linera/client v0.15.x.
    // We must manually initialize the Client, Wallet, and Faucet.
    const { initialize, Client, Faucet } = await import('@linera/client');
    const { ethers } = await import('ethers');

    // 2. Initialize the Wasm module
    await initialize();

    // 3. Setup a Signer
    // We create a temporary ephemeral signer for this session using ethers.
    // In a real app, you might want to save/load this from localStorage.
    const ethersWallet = ethers.Wallet.createRandom();
    const ownerAddress = ethersWallet.address;

    // Create a signer object that satisfies the Linera Client interface
    const signer = {
        sign: async (owner: string, value: Uint8Array) => {
            // Sign the raw bytes (EIP-191 style)
            return await ethersWallet.signMessage(value);
        },
        containsKey: async (owner: string) => {
            return owner === ownerAddress;
        }
    };

    // 4. Create Wallet and Claim Chain
    // Use the Faucet to create a wallet and claim a microchain
    const faucet = new Faucet(this.rpcUrl);
    const wallet = await faucet.createWallet();
    
    // Claim a new chain for this user (this may take a few seconds)
    const chainId = await faucet.claimChain(wallet, ownerAddress);

    // 5. Initialize the Linera Client
    const client = new Client(wallet, signer, {
        // Optional: Add caching or timeout options here if needed
    });

    // 6. Fetch Chain Details
    const chain = await client.chain(chainId);
    const balance = await chain.balance();

    // 7. Update State
    this.wallet = {
      address: ownerAddress,
      chainId,
      balance,
      isConnected: true,
      provider: 'linera',
      userChainId: chainId,
    };

    // Register this new chain with the OddsStream registry
    // (This ensures the backend knows about this user)
    await this.registerUserChain(ownerAddress);
    
    return this.wallet;
  }
  
  /**
   * Register a new user microchain with the registry
   */
  private async registerUserChain(address: string): Promise<string> {
    const query = `
      mutation RegisterUserChain($address: String!) {
        registerUserChain(address: $address) {
          chainId
          status
        }
      }
    `;
    
    const response = await this.graphqlRequest<{ registerUserChain: { chainId: string } }>(
      query,
      { address }
    );
    
    return response.data.registerUserChain.chainId;
  }
  
  /**
   * Get balance for an address
   */
  async getBalance(address: string): Promise<string> {
    const query = `
      query GetBalance($address: String!) {
        balance(address: $address)
      }
    `;
    
    const response = await this.graphqlRequest<{ balance: string }>(query, { address });
    return response.data.balance;
  }
  
  /**
   * Disconnect wallet
   */
  disconnectWallet(): void {
    this.wallet = null;
    this.subscriptions.forEach(ws => ws.close());
    this.subscriptions.clear();
    this.clearBatchTimer();
  }
  
  // ==========================================================================
  // Market Operations
  // ==========================================================================
  
  /**
   * Query markets with filters
   */
  async queryMarkets(filters?: any): Promise<Market[]> {
    const cacheKey = `markets:${JSON.stringify(filters)}`;
    const cached = this.getCachedData(cacheKey);
    
    if (cached) {
      return cached;
    }
    
    const response = await this.graphqlRequest<{ markets: Market[] }>(
      GRAPHQL_QUERIES.GET_MARKETS,
      { filters }
    );

    this.cacheData(cacheKey, response.data.markets, LOCAL_CONFIG.PERFORMANCE.CACHE_TTL.MARKET_LIST);
    return response.data.markets;
  }
  
  /**
   * Get detailed market information
   */
  async getMarketDetails(marketId: string): Promise<any> {
    const cacheKey = `market:${marketId}`;
    const cached = this.getCachedData(cacheKey);
    
    if (cached) {
      return cached;
    }
    
    const response = await this.graphqlRequest<{ market: any }>(
      GRAPHQL_QUERIES.GET_MARKET_DETAILS,
      { marketId }
    );

    this.cacheData(cacheKey, response.data.market, LOCAL_CONFIG.PERFORMANCE.CACHE_TTL.MARKET_DETAILS);
    return response.data.market;
  }
  
  /**
   * Create a new prediction market
   */
  async createMarket(marketData: {
    description: string;
    oracleType: OracleType;
    resolutionTime: string;
    category: string;
    tags?: string[];
    initialLiquidity?: number;
  }): Promise<{ marketId: string; appId: string; chainId: string }> {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }
    
    const mutation = `
      mutation CreateMarket($input: CreateMarketInput!) {
        createMarket(input: $input) {
          marketId
          appId
          chainId
          status
        }
      }
    `;
    
    const response = await this.graphqlRequest<{
      createMarket: { marketId: string; appId: string; chainId: string }
    }>(
      mutation,
      {
        input: {
          ...marketData,
          creator: this.wallet.address,
          userChainId: this.wallet.userChainId,
        }
      }
    );
    
    // Invalidate market list cache
    this.cache.delete('markets:');
    
    return response.data.createMarket;
  }
  
  // ==========================================================================
  // Trading Operations
  // ==========================================================================
  
  /**
   * Submit batched orders (core feature)
   */
  async submitBatchedOrders(
    orders: Order[],
    userChainId?: string
  ): Promise<BatchResponse> {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }
    
    const targetUserChainId = userChainId || this.wallet.userChainId;
    if (!targetUserChainId) {
      throw new Error('User chain ID not found');
    }
    
    // Group orders by market chain
    const ordersByMarket: Record<string, Order[]> = {};
    
    for (const order of orders) {
      // Get market chain ID
      const marketChainId = await this.getMarketChainId(order.marketId);
      
      if (!ordersByMarket[marketChainId]) {
        ordersByMarket[marketChainId] = [];
      }
      
      ordersByMarket[marketChainId].push({
        ...order,
        id: order.id || `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        status: 'pending',
      });
    }
    
    // Prepare batch message for each market chain
    const transactions: string[] = [];
    
    for (const [marketChainId, marketOrders] of Object.entries(ordersByMarket)) {
      const batchMessage = {
        type: 'BatchedOrders' as const,
        userChainId: targetUserChainId,
        orders: marketOrders,
        nonce: await this.getNonce(targetUserChainId),
        timestamp: Date.now(),
      };
      
      // Send cross-chain message
      const txId = await this.sendCrossChainMessage(
        targetUserChainId,
        marketChainId,
        batchMessage
      );
      
      transactions.push(txId);
    }
    
    return {
      transactionIds: transactions,
      totalOrders: orders.length,
      timestamp: Date.now(),
    };
  }
  
  /**
   * Add order to batch queue (for UI batch accumulation)
   */
  addToBatchQueue(order: BatchOrder): void {
    this.batchQueue.push(order);
    
    // Start batch timer if not already running
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => this.processBatchQueue(), 5000); // 5 second batch window
    }
  }
  
  /**
   * Process accumulated batch queue
   */
  private async processBatchQueue(): Promise<void> {
    if (this.batchQueue.length === 0) {
      this.clearBatchTimer();
      return;
    }
    
    try {
      const orders: Order[] = this.batchQueue.map(batchOrder => ({
        marketId: batchOrder.marketId,
        side: batchOrder.side,
        amount: batchOrder.amount.toString(),
        timestamp: batchOrder.timestamp,
      }));
      
      await this.submitBatchedOrders(orders);
      
      // Clear queue on success
      this.batchQueue = [];
      
      // Emit batch success event
      this.emitEvent('batch-success', {
        count: orders.length,
        timestamp: Date.now(),
      });
      
    } catch (error) {
      console.error('Batch processing failed:', error);
      
      // Emit batch error event
      this.emitEvent('batch-error', {
        error: (error as any).message,
        remainingOrders: this.batchQueue.length,
      });
    } finally {
      this.clearBatchTimer();
    }
  }
  
  private clearBatchTimer(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
  }
  
  /**
   * Get user's positions across all markets
   */
  async getUserPositions(userChainId?: string): Promise<any[]> {
    const targetUserChainId = userChainId || this.wallet?.userChainId;
    
    if (!targetUserChainId) {
      return [];
    }
    
    const response = await this.graphqlRequest<{ userPositions: any[] }>(
      GRAPHQL_QUERIES.GET_USER_POSITIONS,
      { userChainId: targetUserChainId }
    );
    
    return response.data.userPositions;
  }
  
  // ==========================================================================
  // Oracle Operations
  // ==========================================================================
  
  /**
   * Get oracle status for a market
   */
  async getOracleStatus(marketId: string): Promise<any> {
    const cacheKey = `oracle:${marketId}`;
    const cached = this.getCachedData(cacheKey);
    
    if (cached) {
      return cached;
    }
    
    const response = await this.graphqlRequest<{ oracleStatus: any }>(
      GRAPHQL_QUERIES.GET_ORACLE_STATUS,
      { marketId }
    );
    
    this.cacheData(cacheKey, response.data.oracleStatus, LOCAL_CONFIG.PERFORMANCE.CACHE_TTL.ORACLE_DATA);
    return response.data.oracleStatus;
  }
  
  /**
   * Submit oracle data (for TEE or committee members)
   */
  async submitOracleData(marketId: string, outcome: boolean, signature: string): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }
    
    const mutation = `
      mutation SubmitOracleData($input: OracleDataInput!) {
        submitOracleData(input: $input) {
          transactionId
          status
        }
      }
    `;
    
    const response = await this.graphqlRequest<{ submitOracleData: { transactionId: string } }>(
      mutation,
      {
        input: {
          marketId,
          outcome,
          signature,
          provider: this.wallet.address,
          timestamp: Date.now(),
        }
      }
    );
    
    return response.data.submitOracleData.transactionId;
  }
  
  // ==========================================================================
  // Real-time Subscriptions
  // ==========================================================================
  
  /**
   * Subscribe to market updates
   */
  subscribeToMarketUpdates(
    marketIds: string[],
    callback: (update: MarketUpdate) => void
  ): SubscriptionHandle {
    const subscriptionId = `market-updates-${Date.now()}`;
    
    const ws = new WebSocket(this.wsUrl);
    
    ws.onopen = () => {
      const subscribeMessage = {
        id: subscriptionId,
        type: 'subscribe',
        query: GRAPHQL_SUBSCRIPTIONS.MARKET_UPDATES,
        variables: { marketIds },
      };
      
      ws.send(JSON.stringify(subscribeMessage));
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'data' && data.payload?.data?.marketUpdates) {
          callback(data.payload.data.marketUpdates);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    this.subscriptions.set(subscriptionId, ws);
    
    return {
      unsubscribe: () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            id: subscriptionId,
            type: 'unsubscribe',
          }));
        }
        ws.close();
        this.subscriptions.delete(subscriptionId);
      }
    };
  }
  
  /**
   * Subscribe to order updates for a user
   */
  subscribeToOrderUpdates(
    userChainId: string,
    callback: (update: any) => void
  ): SubscriptionHandle {
    const subscriptionId = `order-updates-${Date.now()}`;
    
    const ws = new WebSocket(this.wsUrl);
    
    ws.onopen = () => {
      const subscribeMessage = {
        id: subscriptionId,
        type: 'subscribe',
        query: GRAPHQL_SUBSCRIPTIONS.ORDER_UPDATES,
        variables: { userChainId },
      };
      
      ws.send(JSON.stringify(subscribeMessage));
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'data' && data.payload?.data?.orderUpdates) {
          callback(data.payload.data.orderUpdates);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };
    
    this.subscriptions.set(subscriptionId, ws);
    
    return {
      unsubscribe: () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            id: subscriptionId,
            type: 'unsubscribe',
          }));
        }
        ws.close();
        this.subscriptions.delete(subscriptionId);
      }
    };
  }
  
  // ==========================================================================
  // Utility Methods
  // ==========================================================================
  
  private async graphqlRequest<T>(query: string, variables?: any): Promise<GraphQLResponse<T>> {
    const response = await fetch(this.graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.wallet ? { 'Authorization': `Bearer ${this.wallet.address}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });
    
    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.statusText}`);
    }
    
    return await response.json();
  }
  
  private async sendCrossChainMessage(
    fromChainId: string,
    toChainId: string,
    message: any
  ): Promise<string> {
    const response = await fetch(`${this.rpcUrl}/send-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.wallet?.address}`,
      },
      body: JSON.stringify({
        fromChainId,
        toChainId,
        message,
        timestamp: Date.now(),
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Cross-chain message failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.transactionId;
  }
  
  private async getMarketChainId(marketId: string): Promise<string> {
    // In production, this would query the registry
    // For now, use a mock based on our config
    const market = LOCAL_CONFIG.APPLICATIONS.EXAMPLE_MARKETS?.find((m: any) => m.id === marketId);

    if (!market) {
      // Fallback for dynamic markets
      // Assume chain ID is part of the market metadata or queryable
      return `chain-fallback-${marketId.substring(0, 8)}`;
    }
    
    // Extract chain ID from app ID (simplified)
    return `chain-${market.appId.substring(0, 16)}`;
  }
  
  private async getNonce(userChainId: string): Promise<number> {
    const response = await fetch(`${this.rpcUrl}/nonce/${userChainId}`);
    const data = await response.json();
    return data.nonce;
  }
  
  private getCachedData(key: string): any | null {
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.timestamp < LOCAL_CONFIG.PERFORMANCE.CACHE_TTL.MARKET_LIST) {
      return cached.data;
    }
    
    return null;
  }
  
  private cacheData(key: string, data: any, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
    
    // Clean up old cache entries
    setTimeout(() => {
      this.cache.delete(key);
    }, ttl);
  }
  
  private emitEvent(eventName: string, data: any): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(`oddsstream:${eventName}`, { detail: data }));
    }
  }
  
  // ==========================================================================
  // AI Agent Integration
  // ==========================================================================
  
  /**
   * Connect AI agent via Model Context Protocol (MCP)
   */
  async connectAIAgent(agentConfig: {
    strategy: string;
    params?: Record<string, any>;
    stakeAmount?: number;
  }): Promise<{ agentId: string; status: string }> {
    if (!LOCAL_CONFIG.FEATURES.ENABLE_AI_AGENTS) {
      throw new Error('AI agents feature is disabled');
    }

    const response = await fetch(`${LOCAL_CONFIG.AI_AGENT.MCP_SERVER_URL}/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.wallet?.address}`,
      },
      body: JSON.stringify({
        ...agentConfig,
        userChainId: this.wallet?.userChainId,
        walletAddress: this.wallet?.address,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`AI agent connection failed: ${response.statusText}`);
    }
    
    return await response.json();
  }
  
  /**
   * Get AI agent performance metrics
   */
  async getAgentMetrics(agentId: string): Promise<any> {
    const response = await fetch(`${LOCAL_CONFIG.AI_AGENT.MCP_SERVER_URL}/metrics/${agentId}`);
    return await response.json();
  }
  
  // ==========================================================================
  // System Status & Monitoring
  // ==========================================================================
  
  /**
   * Get system health status
   */
  async getSystemHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: Record<string, any>;
    timestamp: number;
  }> {
    try {
      const response = await fetch(LOCAL_CONFIG.PERFORMANCE.HEALTH_CHECK_URL);
      return await response.json();
    } catch (error) {
      return {
        status: 'unhealthy',
        components: { rpc: 'unreachable', graphql: 'unknown', ws: 'unknown' },
        timestamp: Date.now(),
      };
    }
  }
  
  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(): Promise<any> {
    const response = await fetch(LOCAL_CONFIG.PERFORMANCE.METRICS_ENDPOINT);
    return await response.json();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================
let clientInstance: OddsStreamClient | null = null;

export function getLineraClient(): OddsStreamClient {
  if (!clientInstance) {
    clientInstance = new OddsStreamClient(LOCAL_CONFIG);
  }
  return clientInstance;
}

export function resetLineraClient(): void {
  clientInstance?.disconnectWallet();
  clientInstance = null;
}