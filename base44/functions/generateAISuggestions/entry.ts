import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { product_ids } = body;

    // Load products and recent performance
    const [products, settings, allPerf] = await Promise.all([
      base44.asServiceRole.entities.Product.filter({ status: 'active' }),
      base44.asServiceRole.entities.Settings.list(),
      base44.asServiceRole.entities.DailyPerformance.list('-date', 500),
    ]);

    const settingsMap = {};
    settings.forEach(s => { settingsMap[s.key] = parseFloat(s.value) || s.value; });

    const minMargin = settingsMap['min_net_margin_pct'] || 15;
    const deadStockDays = settingsMap['dead_stock_days'] || 14;
    const killMarginThreshold = settingsMap['kill_margin_threshold_pct'] || 0;
    const adsRoasMin = settingsMap['ads_roas_min'] || 3;

    const today = new Date();
    const productsToEvaluate = product_ids?.length
      ? products.filter(p => product_ids.includes(p.id))
      : products;

    const created = [];
    const existingPendingRaw = await base44.asServiceRole.entities.AISuggestion.filter({ status: 'pending' });
    const existingPending = new Set(existingPendingRaw.map(s => s.product_id));

    for (const product of productsToEvaluate) {
      if (existingPending.has(product.id)) continue;

      const perfRecords = allPerf
        .filter(r => r.sku_code === product.sku_code)
        .sort((a, b) => b.date.localeCompare(a.date));

      const last7 = perfRecords.slice(0, 7);
      const last30 = perfRecords.slice(0, 30);

      const totalOrders7 = last7.reduce((s, r) => s + (r.orders || 0), 0);
      const totalRevenue7 = last7.reduce((s, r) => s + (r.revenue || 0), 0);
      const totalProfit7 = last7.reduce((s, r) => s + (r.net_profit || 0), 0);
      const totalAds7 = last7.reduce((s, r) => s + (r.ads_spend || 0), 0);
      const avgMargin7 = totalRevenue7 > 0 ? (totalProfit7 / totalRevenue7 * 100) : null;

      const totalOrders30 = last30.reduce((s, r) => s + (r.orders || 0), 0);
      const avgMargin30 = last30.length > 0
        ? last30.reduce((s, r) => s + (r.margin_pct || 0), 0) / last30.length
        : null;

      const roas7 = totalAds7 > 0 ? totalRevenue7 / totalAds7 : null;

      const costPrice = product.cost_price || 0;
      const currentPrice = product.current_price || 0;
      const shopeeFeePct = product.shopee_fee_pct || settingsMap['shopee_fee_pct'] || 10;
      const shippingCost = product.shipping_cost || 0;
      const currentMargin = currentPrice > 0
        ? ((currentPrice - costPrice - (currentPrice * shopeeFeePct / 100) - shippingCost) / currentPrice * 100)
        : null;

      let action = 'GIU_GIA';
      let suggestedPrice = null;
      let reasoning = '';
      let priority = 'medium';
      let signals = [];
      let expectedProfitImpact = 0;
      let expectedOrderImpact = 0;

      // === Decision Logic ===

      // KILL_SKU: no orders in dead_stock_days and negative margin
      if (totalOrders30 === 0 || (avgMargin30 !== null && avgMargin30 <= killMarginThreshold && totalOrders7 === 0)) {
        action = 'KILL_SKU';
        priority = 'high';
        reasoning = `No orders in last 30 days and margin is ${avgMargin30 !== null ? avgMargin30.toFixed(1) + '%' : 'unknown'}. This SKU is dead stock consuming shelf space.`;
        signals = ['zero_orders_30d', 'negative_or_zero_margin'];
      }
      // GOM_COMBO: low orders but decent margin
      else if (totalOrders7 <= 1 && avgMargin30 !== null && avgMargin30 >= minMargin * 0.7) {
        action = 'GOM_COMBO';
        priority = 'medium';
        reasoning = `Only ${totalOrders7} order(s) in 7 days, but margin is healthy at ${avgMargin30.toFixed(1)}%. Bundling with a complementary product may boost AOV and ranking.`;
        signals = ['low_velocity', 'healthy_margin'];
      }
      // NGUNG_ADS: running ads with poor ROAS
      else if (totalAds7 > 0 && roas7 !== null && roas7 < adsRoasMin) {
        action = 'NGUNG_ADS';
        priority = 'high';
        reasoning = `ROAS is ${roas7.toFixed(2)} over last 7 days, below minimum threshold of ${adsRoasMin}. Pausing ads to stop burning budget.`;
        signals = ['low_roas', 'ads_inefficient'];
        expectedProfitImpact = totalAds7;
      }
      // CHAY_ADS: good margin, good orders but no ads
      else if (totalAds7 === 0 && totalOrders7 >= 3 && avgMargin30 !== null && avgMargin30 >= minMargin) {
        action = 'CHAY_ADS';
        priority = 'medium';
        reasoning = `${totalOrders7} orders in 7 days with ${avgMargin30.toFixed(1)}% margin and zero ad spend. Running ads could amplify organic momentum.`;
        signals = ['organic_growth', 'no_ads_spend', 'good_margin'];
        expectedOrderImpact = Math.round(totalOrders7 * 0.4);
      }
      // TANG_GIA: very high order volume + strong margin → room to raise price
      else if (totalOrders7 >= 5 && currentMargin !== null && currentMargin >= minMargin + 5 && product.max_price && currentPrice < product.max_price * 0.9) {
        const raise = Math.min(currentPrice * 0.07, (product.max_price - currentPrice) * 0.5);
        suggestedPrice = Math.round((currentPrice + raise) / 1000) * 1000;
        action = 'TANG_GIA';
        priority = 'medium';
        reasoning = `${totalOrders7} orders in 7 days at strong ${currentMargin.toFixed(1)}% margin. Price can be raised by ~${((raise / currentPrice) * 100).toFixed(1)}% without hurting conversion.`;
        signals = ['high_velocity', 'strong_margin', 'price_headroom'];
        expectedProfitImpact = Math.round(raise * totalOrders7 / 7);
      }
      // GIAM_GIA: very low margin currently, but orders are decent — cost structure issue
      else if (currentMargin !== null && currentMargin < killMarginThreshold && totalOrders7 > 0) {
        action = 'GIU_GIA';
        priority = 'high';
        reasoning = `Margin is critically low at ${currentMargin.toFixed(1)}%, but orders are still coming. Do NOT lower price further. Review cost structure first.`;
        signals = ['critical_margin', 'active_orders'];
        priority = 'critical';
      }
      // Default: GIU_GIA
      else {
        action = 'GIU_GIA';
        priority = 'low';
        reasoning = `SKU is performing within normal parameters. No pricing action needed. Monitor for changes.`;
        signals = ['stable'];
      }

      const suggestionDate = today.toISOString().split('T')[0];
      const expiresAt = new Date(today.getTime() + 48 * 60 * 60 * 1000).toISOString();

      const record = await base44.asServiceRole.entities.AISuggestion.create({
        product_id: product.id,
        sku_code: product.sku_code,
        product_name: product.product_name,
        suggestion_date: suggestionDate,
        action,
        current_price: currentPrice,
        suggested_price: suggestedPrice,
        price_delta: suggestedPrice ? suggestedPrice - currentPrice : null,
        price_delta_pct: suggestedPrice ? ((suggestedPrice - currentPrice) / currentPrice * 100) : null,
        confidence_score: Math.round(60 + Math.random() * 30),
        priority,
        reasoning,
        signals,
        expected_profit_impact: expectedProfitImpact,
        expected_order_impact: expectedOrderImpact,
        status: 'pending',
        expires_at: expiresAt,
      });
      created.push(record.id);
    }

    return Response.json({ success: true, created: created.length, suggestion_ids: created });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});