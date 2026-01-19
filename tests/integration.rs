#[tokio::test]
async fn test_batched_orders() {
    // 1. Initialize test environment
    let (registry, markets, users) = setup_test_environment().await;
    
    // 2. Create test orders
    let orders = vec![
        Order::new("market-1", OrderSide::BuyYes, 100.0),
        Order::new("market-2", OrderSide::BuyNo, 50.0),
    ];
    
    // 3. Submit batch
    let result = users[0].submit_batch(orders).await;
    
    // 4. Verify results
    assert!(result.is_ok());
    assert_eq!(get_market_state("market-1").await.pool_yes, 100.0);
    assert_eq!(get_market_state("market-2").await.pool_no, 50.0);
}

#[tokio::test]
async fn test_tee_oracle_resolution() {
    // Simulate TEE oracle flow
    let oracle = TeeOracle::new(TEST_TEE_CONFIG);
    let outcome = true;
    let signature = oracle.create_signature("test-market", outcome);
    
    // Verify signature
    assert!(oracle.verify_signature("test-market", outcome, &signature));
    
    // Trigger resolution
    let result = resolve_market("test-market", outcome, signature).await;
    assert!(result.market_status == MarketStatus::Resolved(true));
}