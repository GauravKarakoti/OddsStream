/**
 * OddsStream TypeScript Type Definitions
 * Centralized type definitions for Conway Testnet integration
 */

// ============================================================================
// Core Blockchain Types
// ============================================================================
export type ChainId = string;
export type Address = string;
export type TransactionId = string;
export type ApplicationId = string;

export interface ChainInfo {
  id: ChainId;
  blockHeight: number;
  blockTime: number;
  validatorCount: number;
  status: 'active' | 'inactive' | 'syncing';
}

// ============================================================================
// Market Types
// ============================================================================
export type MarketStatus = 'active' | 'resolved' | 'paused' | 'closed' | 'disputed';
export type OrderSide = 'YES' | 'NO';
export type OracleType = 'tee' | 'committee' | 'hybrid';
export type MarketCategory = 'sports' | 'crypto' | 'politics' | 'technology' | 'entertainment' | 'finance' | 'other';

export interface Market {
  id: string;
  appId: ApplicationId;
  chainId: ChainId;
  
  // Core information
  name: string;
  description: string;
  category: MarketCategory;
  tags: string[];
  
  // Trading data
  yesOdds: number;
  noOdds: number;
  volume: number;
  liquidity: number;
  totalStake: number;
  feePercentage: number;
  
  // Status
  status: MarketStatus;
  oracleType: OracleType;
  resolutionTime: string;
  createdTime: string;
  createdBlock: number;
  
  // Oracle details
  oracleProvider?: string;
  oracleConfidence?: number;
  lastOracleUpdate?: string;
  
  // Resolution
  outcome?: boolean;
  resolvedTime?: string;
  resolutionTransaction?: TransactionId;
  
  // Metadata
  creator: Address;
  creatorChainId: ChainId;
  isVerified: boolean;
  socialVolume?: number; // For trending markets
}

export interface MarketFilters {
  category?: MarketCategory;
  status?: MarketStatus;
  oracleType?: OracleType;
  minVolume?: number;
  maxVolume?: number;
  minLiquidity?: number;
  maxLiquidity?: number;
  creator?: Address;
  tags?: string[];
  searchQuery?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'volume' | 'liquidity' | 'created' | 'resolution';
  sortOrder?: 'asc' | 'desc';
}

export interface MarketUpdate {
  marketId: string;
  yesOdds: number;
  noOdds: number;
  volume: number;
  liquidity: number;
  status: MarketStatus;
  timestamp: number;
  blockNumber?: number;
  transactionId?: TransactionId;
}

export interface OrderBook {
  marketId: string;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  spread: number;
  midPrice: number;
  updatedAt: number;
}

export interface OrderBookEntry {
  price: number;
  amount: number;
  total: number;
  side: OrderSide;
}

export interface Trade {
  id: string;
  marketId: string;
  side: OrderSide;
  price: number;
  amount: number;
  total: number;
  timestamp: number;
  buyerChainId: ChainId;
  sellerChainId: ChainId;
  transactionId: TransactionId;
}

// ============================================================================
// Order Types
// ============================================================================
export type OrderStatus = 'pending' | 'confirmed' | 'executed' | 'cancelled' | 'failed' | 'expired';

export interface Order {
  id: string;
  marketId: string;
  side: OrderSide;
  amount: string; // BigNumber string
  price?: string; // Limit price (optional for market orders)
  maxPrice?: string; // Maximum price user is willing to pay
  
  // Status
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  
  // Execution
  executedPrice?: string;
  executedAmount?: string;
  feeAmount?: string;
  
  // Blockchain
  userChainId: ChainId;
  transactionId?: TransactionId;
  blockNumber?: number;
  
  // Metadata
  isBatched: boolean;
  batchId?: string;
  parentOrderId?: string; // For partial fills
}

export interface BatchOrder {
  id: string;
  marketId: string;
  marketDescription: string;
  side: OrderSide;
  amount: number;
  price?: number;
  timestamp: number;
  status: 'pending' | 'processing' | 'confirmed' | 'failed' | 'cancelled';
  userChainId?: ChainId;
  batchGroupId?: string;
}

export interface BatchResponse {
  batchId: string;
  transactionIds: TransactionId[];
  totalOrders: number;
  successfulOrders: number;
  failedOrders: number;
  estimatedGas: string;
  totalCost: string;
  timestamp: number;
  userChainId: ChainId;
}

export interface OrderExecution {
  orderId: string;
  marketId: string;
  side: OrderSide;
  executedPrice: string;
  executedAmount: string;
  remainingAmount: string;
  feeAmount: string;
  timestamp: number;
  transactionId: TransactionId;
}

// ============================================================================
// Wallet & User Types
// ============================================================================
export type WalletProvider = 'dynamic' | 'linera' | 'metamask' | 'walletconnect' | 'coinbase';

export interface WalletState {
  address: Address;
  chainId: ChainId;
  balance: string; // BigNumber string
  isConnected: boolean;
  provider: WalletProvider | null;
  
  // User microchain (core innovation)
  userChainId?: ChainId;
  userChainStatus?: 'active' | 'pending' | 'inactive';
  
  // Session
  sessionId?: string;
  connectedAt?: number;
  lastActivity?: number;
  
  // Network
  network: 'conway' | 'mainnet' | 'local';
  rpcUrl: string;
}

export interface UserPosition {
  marketId: string;
  side: OrderSide;
  amount: string;
  averagePrice: string;
  currentValue: string;
  profitLoss: string;
  profitLossPercentage: number;
  status: 'open' | 'closed' | 'liquidated';
  openedAt: number;
  closedAt?: number;
  lastUpdated: number;
}

export interface UserStats {
  totalTrades: number;
  totalVolume: string;
  winningTrades: number;
  losingTrades: number;
  totalProfitLoss: string;
  successRate: number;
  favoriteMarket?: string;
  mostProfitableMarket?: string;
  tradingDays: number;
  averageTradeSize: string;
}

// ============================================================================
// Oracle Types
// ============================================================================
export type OracleProvider = 'tee' | 'committee' | 'pyth' | 'chainlink' | 'custom';
export type OracleStatus = 'active' | 'inactive' | 'disputed' | 'slashed';

export interface OracleInfo {
  provider: OracleProvider;
  address: Address;
  publicKey: string;
  stakeAmount: string;
  status: OracleStatus;
  uptime: number;
  accuracy: number;
  lastUpdate: number;
}

export interface OracleResolution {
  marketId: string;
  outcome: boolean;
  confidence: number;
  timestamp: number;
  provider: OracleProvider;
  signature: string;
  attestation?: any; // TEE attestation data
  committeeVotes?: CommitteeVote[];
  transactionId: TransactionId;
}

export interface CommitteeVote {
  member: Address;
  vote: boolean;
  signature: string;
  timestamp: number;
  stakeAmount: string;
}

export interface TEEAttestation {
  quote: string; // Base64 encoded quote
  publicKey: string;
  timestamp: number;
  enclaveHash: string;
  provider: 'intel-sgx' | 'amd-sev' | 'azure-confidential';
}

// ============================================================================
// AI Agent Types
// ============================================================================
export type AgentStrategy = 'market-maker' | 'arbitrage' | 'trend-follower' | 'mean-reversion' | 'custom';
export type AgentStatus = 'active' | 'paused' | 'stopped' | 'error';

export interface AIAgent {
  id: string;
  name: string;
  description: string;
  strategy: AgentStrategy;
  status: AgentStatus;
  
  // Configuration
  params: Record<string, any>;
  markets: string[]; // Market IDs this agent trades on
  stakeAmount: string;
  performanceFee: number;
  
  // Performance
  totalProfit: string;
  totalVolume: string;
  winRate: number;
  sharpeRatio?: number;
  maxDrawdown?: number;
  createdAt: number;
  lastActive: number;
  
  // Ownership
  owner: Address;
  ownerChainId: ChainId;
  isPublic: boolean;
  cloneCount: number;
  
  // Technical
  mcpEndpoint?: string;
  version: string;
}

export interface AgentPerformance {
  agentId: string;
  period: '1d' | '7d' | '30d' | 'all';
  profitLoss: string;
  volume: string;
  trades: number;
  winRate: number;
  feesPaid: string;
  rewardsEarned: string;
  timestamp: number;
}

export interface AgentSignal {
  agentId: string;
  marketId: string;
  signal: 'BUY_YES' | 'BUY_NO' | 'SELL' | 'HOLD';
  confidence: number;
  targetPrice?: number;
  stopLoss?: number;
  timestamp: number;
  expiration: number;
}

// ============================================================================
// GraphQL Types
// ============================================================================
export interface GraphQLResponse<T = any> {
  data: T;
  errors?: GraphQLError[];
  extensions?: Record<string, any>;
}

export interface GraphQLError {
  message: string;
  locations?: { line: number; column: number }[];
  path?: string[];
  extensions?: Record<string, any>;
}

export interface GraphQLSubscription<T = any> {
  data: T;
  id: string;
  type: 'data' | 'complete' | 'error';
}

export interface SubscriptionHandle {
  unsubscribe: () => void;
  id: string;
}

// ============================================================================
// Event Types
// ============================================================================
export type EventType = 
  | 'market.created'
  | 'market.updated'
  | 'market.resolved'
  | 'order.placed'
  | 'order.executed'
  | 'order.cancelled'
  | 'batch.submitted'
  | 'batch.processed'
  | 'oracle.updated'
  | 'agent.signal'
  | 'wallet.connected'
  | 'wallet.disconnected'
  | 'balance.updated'
  | 'error.occurred';

export interface AppEvent<T = any> {
  type: EventType;
  data: T;
  timestamp: number;
  source: 'blockchain' | 'ui' | 'backend' | 'oracle' | 'agent';
  transactionId?: TransactionId;
  chainId?: ChainId;
}

// ============================================================================
// UI State Types
// ============================================================================
export interface UIState {
  theme: 'light' | 'dark' | 'auto';
  currency: 'USD' | 'EUR' | 'GBP' | 'LIN';
  language: string;
  notifications: {
    enabled: boolean;
    sound: boolean;
    types: EventType[];
  };
  charts: {
    timeframe: string;
    indicators: string[];
    showVolume: boolean;
    showOrderBook: boolean;
  };
  trading: {
    defaultAmount: number;
    confirmOrders: boolean;
    showAdvanced: boolean;
    autoBatch: boolean;
    batchWindow: number;
  };
}

export interface Notification {
  id: string;
  type: EventType;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
  priority: 'low' | 'medium' | 'high' | 'critical';
}

// ============================================================================
// API Response Types
// ============================================================================
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: number;
  requestId: string;
}

export interface PaginatedResponse<T = any> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  nextCursor?: string;
}

// ============================================================================
// Form & Validation Types
// ============================================================================
export interface CreateMarketForm {
  name: string;
  description: string;
  category: MarketCategory;
  tags: string[];
  oracleType: OracleType;
  resolutionTime: string;
  resolutionDetails?: string;
  initialLiquidity?: number;
  feePercentage?: number;
  minStake?: number;
  maxStake?: number;
}

export interface PlaceOrderForm {
  marketId: string;
  side: OrderSide;
  amount: number;
  price?: number;
  maxPrice?: number;
  expiry?: number;
  isBatchable: boolean;
}

export interface BatchOrderForm {
  orders: PlaceOrderForm[];
  userChainId?: ChainId;
  autoSubmit: boolean;
  batchWindow: number;
}

// ============================================================================
// Utility Types
// ============================================================================
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
};

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// ============================================================================
// Configuration Types
// ============================================================================
export interface NetworkConfig {
  name: string;
  rpcUrl: string;
  graphqlUrl: string;
  wsUrl: string;
  explorerUrl: string;
  faucetUrl?: string;
  chainId: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  applications: {
    registry: ApplicationId;
    oracleAdjudicator: ApplicationId;
  };
  features: Record<string, boolean>;
}

// ============================================================================
// Export All Types
// ============================================================================
export type {
  // Re-export for backward compatibility
  MarketUpdate as RealTimeUpdate,
  WalletState as UserWallet,
  Order as TradeOrder,
  BatchOrder as QueuedOrder,
};

// Helper type guards
export function isMarketActive(market: Market): boolean {
  return market.status === 'active';
}

export function isOrderExecutable(order: Order): boolean {
  return order.status === 'confirmed' || order.status === 'pending';
}

export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function isConwayNetwork(chainId: string): boolean {
  return chainId.includes('conway') || chainId === 'conway-testnet';
}