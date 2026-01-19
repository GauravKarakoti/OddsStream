import { OracleType } from './config/conway.ts';

export type { OracleType };

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
  // Optional fields to satisfy strict type checks if needed elsewhere
  name?: string;
  category?: string;
  totalStake?: number;
  feePercentage?: number;
}

export interface Order {
  id?: string;
  marketId: string;
  side: 'YES' | 'NO';
  amount: string;
  maxPrice?: string;
  timestamp?: number;
  status?: 'pending' | 'confirmed' | 'failed' | 'executed' | 'cancelled';
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
  userChainId?: string;
  // Added to fix type compatibility errors
  network?: string;
  rpcUrl?: string;
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