import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import './App.css';
import CONWAY_CONFIG from './config/conway.ts';
import { OddsStreamClient } from './services/linera-client.ts';
// Import types, but we will handle the mismatch in submitBatch
import { Market, Order, BatchOrder, WalletState } from './types.ts';

const App: React.FC = () => {
  // State
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [batchOrders, setBatchOrders] = useState<BatchOrder[]>([]);
  const [amount, setAmount] = useState<string>('100');
  const [loading, setLoading] = useState<boolean>(true);
  const [realTimeUpdate, setRealTimeUpdate] = useState<string>('');
  const [client, setClient] = useState<OddsStreamClient | null>(null);

  // Initialize Linera client
  useEffect(() => {
    const initClient = async () => {
      try {
        const lineraClient = new OddsStreamClient(CONWAY_CONFIG);
        setClient(lineraClient);
        
        // Load initial markets
        const initialMarkets = await lineraClient.queryMarkets({ limit: 10 });
        setMarkets(initialMarkets);
        
        if (initialMarkets.length > 0) {
          setSelectedMarket(initialMarkets[0]);
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Failed to initialize client:', error);
        setLoading(false);
      }
    };
    
    initClient();
  }, []);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!client || !selectedMarket) return;
    
    // FIX 1: Pass array directly, not inside an object
    const subscriptionHandle = client.subscribeToMarketUpdates(
      [selectedMarket.id],
      (update: any) => {
        // Update market odds in real-time
        setMarkets(prev => prev.map(market => 
          market.id === update.marketId 
            ? { ...market, ...update }
            : market
        ));
        
        if (selectedMarket.id === update.marketId) {
          setSelectedMarket(prev => prev ? { ...prev, ...update } : null);
          
          // Show real-time notification
          const change = update.yesOdds > selectedMarket.yesOdds ? '📈' : '📉';
          setRealTimeUpdate(`${change} ${selectedMarket.description}: $${update.yesOdds.toFixed(2)}`);
          setTimeout(() => setRealTimeUpdate(''), 3000);
        }
      }
    );
    
    // FIX 2: Call .unsubscribe() on the handle
    return () => subscriptionHandle.unsubscribe();
  }, [client, selectedMarket]);

  // Wallet connection
  const connectWallet = useCallback(async () => {
    if (!client) return;
    
    try {
      setLoading(true);
      const walletState = await client.connectWallet();
      setWallet(walletState);
      
      // FIX 3: Removed getUserChainInfo() as it doesn't exist.
      // The chain info is already inside walletState.chainId or walletState.userChainId
      console.log('Connected wallet:', walletState);
      if (walletState.userChainId) {
          console.log('User Microchain ID:', walletState.userChainId);
      }

    } catch (error) {
      console.error('Wallet connection failed:', error);
    } finally {
      setLoading(false);
    }
  }, [client]);

  // Add order to batch
  const addToBatch = useCallback((side: 'YES' | 'NO') => {
    if (!selectedMarket || !amount) return;
    
    const order: BatchOrder = {
      id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      marketId: selectedMarket.id,
      marketDescription: selectedMarket.description,
      side,
      amount: parseFloat(amount),
      timestamp: Date.now(),
      status: 'pending'
    };
    
    setBatchOrders(prev => [...prev, order]);
    
    // Reset amount
    setAmount('100');
  }, [selectedMarket, amount]);

  // Remove order from batch
  const removeFromBatch = useCallback((orderId: string) => {
    setBatchOrders(prev => prev.filter(order => order.id !== orderId));
  }, []);

  // Submit batched orders
  const submitBatch = useCallback(async () => {
    if (!client || !wallet || batchOrders.length === 0) return;
    
    try {
      setLoading(true);
      
      // Group orders by market
      const ordersByMarket: Record<string, Order[]> = {};
      batchOrders.forEach(order => {
        if (!ordersByMarket[order.marketId]) {
          ordersByMarket[order.marketId] = [];
        }
        ordersByMarket[order.marketId].push({
          marketId: order.marketId,
          side: order.side,
          amount: order.amount.toString(),
          maxPrice: undefined,
          // Explicitly setting status to undefined or 'pending' if required by types.ts
          status: 'pending' 
        });
      });
      
      // FIX 4: Map strictly to the client's expected type to avoid incompatible 'status' enums
      // (e.g. 'cancelled' might be in types.ts but not in linera-client.ts)
      const clientOrders = Object.values(ordersByMarket).flat().map(o => ({
          marketId: o.marketId,
          side: o.side,
          amount: o.amount,
          maxPrice: o.maxPrice
          // We omit 'status' to let the client handle it, or pass it if compatible.
          // This avoids the "Type '...Order[]' is not assignable..." error.
      }));

      // Send batched orders
      const result = await client.submitBatchedOrders(
        clientOrders as any, // Cast to any if imports are strictly incompatible
        wallet.chainId
      );
      
      console.log('Batch submitted:', result);
      
      // Clear batch
      setBatchOrders([]);
      
      // Show success
      setRealTimeUpdate(`✅ ${batchOrders.length} orders submitted successfully!`);
      setTimeout(() => setRealTimeUpdate(''), 3000);
      
    } catch (error) {
      console.error('Batch submission failed:', error);
      setRealTimeUpdate('❌ Failed to submit orders. Please try again.');
      setTimeout(() => setRealTimeUpdate(''), 3000);
    } finally {
      setLoading(false);
    }
  }, [client, wallet, batchOrders]);

  // Quick amount buttons
  const quickAmounts = [100, 500, 1000, 5000];

  if (loading && !wallet) {
    return (
      <div className="App">
        <div className="loading-screen">
          <div className="loading-spinner"></div>
          <p>Connecting to Conway Testnet...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <div className="logo-section">
            <div className="logo">
              <span className="logo-icon">🎯</span>
              <span>OddsStream</span>
            </div>
            <div className="network-status">
              <span className="status-dot"></span>
              <span className="conway-badge">Conway Testnet</span>
            </div>
          </div>
          
          <div className="wallet-section">
            {wallet ? (
              <>
                <div className="balance">
                  {ethers.formatEther(wallet.balance)} LIN
                </div>
                <div className="wallet-address">
                  {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                </div>
              </>
            ) : (
              <button 
                className="connect-button"
                onClick={connectWallet}
                disabled={loading}
              >
                {loading ? 'Connecting...' : 'Connect Wallet'}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-main">
        <div className="dashboard">
          {/* Left Sidebar - Markets List */}
          <aside className="markets-sidebar">
            <div className="sidebar-header">
              <h3>Live Markets</h3>
              <button className="create-market-btn">+ Create</button>
            </div>
            <div className="markets-list">
              {markets.map(market => (
                <div 
                  key={market.id}
                  className={`market-card ${selectedMarket?.id === market.id ? 'active' : ''}`}
                  onClick={() => setSelectedMarket(market)}
                >
                  <h4>{market.description}</h4>
                  <div className="market-stats">
                    <span>Vol: ${market.volume.toLocaleString()}</span>
                    <span>{market.status}</span>
                  </div>
                  <div className="market-odds">
                    <div className="odds-yes">
                      YES: {(market.yesOdds * 100).toFixed(1)}%
                    </div>
                    <div className="odds-no">
                      NO: {(market.noOdds * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          {/* Center - Trading View */}
          <section className="trading-view">
            {selectedMarket ? (
              <>
                <div className="trading-header">
                  <h2 className="market-title">{selectedMarket.description}</h2>
                  <p className="market-description">
                    Resolves: {new Date(selectedMarket.resolutionTime).toLocaleString()}
                  </p>
                  <div className="market-odds-display">
                    <div className="odds-large yes">
                      <span className="odds-label">YES</span>
                      <span className="odds-value">{(selectedMarket.yesOdds * 100).toFixed(2)}%</span>
                    </div>
                    <div className="odds-large no">
                      <span className="odds-label">NO</span>
                      <span className="odds-value">{(selectedMarket.noOdds * 100).toFixed(2)}%</span>
                    </div>
                  </div>
                </div>
                
                <div className="order-book">
                  <div className="order-book-section">
                    <h4 className="section-title">Order Book</h4>
                    <div className="order-rows">
                      {/* Buy orders */}
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={`buy-${i}`} className="order-row buy">
                          <span>{(selectedMarket.yesOdds * 0.95 * (1 - i/10) * 100).toFixed(2)}%</span>
                          <span>{(100 * i).toLocaleString()}</span>
                          <span className="text-bull">BUY</span>
                        </div>
                      ))}
                      
                      {/* Current price */}
                      <div className="order-row current">
                        <span className="current-price">
                          {(selectedMarket.yesOdds * 100).toFixed(2)}%
                        </span>
                        <span>Market Price</span>
                        <span className="text-neutral">●</span>
                      </div>
                      
                      {/* Sell orders */}
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={`sell-${i}`} className="order-row sell">
                          <span>{(selectedMarket.yesOdds * 1.05 * (1 + i/10) * 100).toFixed(2)}%</span>
                          <span>{(100 * i).toLocaleString()}</span>
                          <span className="text-bear">SELL</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="no-market-selected">
                <p>Select a market to start trading</p>
              </div>
            )}
          </section>

          {/* Right Sidebar - Order Form & Batch */}
          <aside className="order-sidebar">
            {/* Order Form */}
            <div className="order-form">
              <h3 className="form-title">Place Order</h3>
              
              <div className="amount-section">
                <label>Amount (LIN)</label>
                <input
                  type="text"
                  className="amount-input"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
                
                <div className="amount-buttons">
                  {quickAmounts.map(amt => (
                    <button
                      key={amt}
                      className="amount-btn"
                      onClick={() => setAmount(amt.toString())}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="trade-buttons">
                <button 
                  className="buy-btn"
                  onClick={() => addToBatch('YES')}
                  disabled={!selectedMarket || !wallet}
                >
                  Buy YES
                </button>
                <button 
                  className="sell-btn"
                  onClick={() => addToBatch('NO')}
                  disabled={!selectedMarket || !wallet}
                >
                  Buy NO
                </button>
              </div>
            </div>
            
            {/* Batched Orders */}
            <div className="batch-panel">
              <div className="batch-header">
                <h3>Batch Orders</h3>
                <span className="batch-count">{batchOrders.length} orders</span>
              </div>
              
              <div className="batch-items">
                {batchOrders.map(order => (
                  <div key={order.id} className="batch-item">
                    <div className="batch-item-info">
                      <div className="batch-item-side">
                        {order.side === 'YES' ? '🟢' : '🔴'} {order.side}
                      </div>
                      <div className="batch-item-market">
                        {order.marketDescription}
                      </div>
                      <div className="batch-item-amount">
                        ${order.amount.toLocaleString()}
                      </div>
                    </div>
                    <button
                      className="batch-item-remove"
                      onClick={() => removeFromBatch(order.id)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                
                {batchOrders.length === 0 && (
                  <p className="empty-batch">No orders in batch</p>
                )}
              </div>
              
              <button
                className="submit-batch-btn"
                onClick={submitBatch}
                disabled={batchOrders.length === 0 || !wallet || loading}
              >
                {loading ? 'Processing...' : `Submit ${batchOrders.length} Orders`}
              </button>
            </div>
          </aside>
        </div>
      </main>

      {/* Real-time Updates Notification */}
      {realTimeUpdate && (
        <div className="realtime-update">
          <div className="update-content">
            <span className="update-icon">⚡</span>
            <span className="update-text">{realTimeUpdate}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;