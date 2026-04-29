import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULT_FEE_RATE = 0.22;
const FIXED_COST = 15833;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { sku, date_from, date_to } = body;

    if (!sku) return Response.json({ error: 'sku is required' }, { status: 400 });

    const products = await base44.entities.Product.filter({ sku });
    const product = products[0];
    if (!product) return Response.json({ error: `SKU ${sku} not found` }, { status: 404 });

    let perf = await base44.entities.DailyPerformance.filter({ sku }, '-date', 90);

    // Apply date filters
    if (date_from) perf = perf.filter(r => r.date >= date_from);
    if (date_to) perf = perf.filter(r => r.date <= date_to);

    if (perf.length === 0) {
      return Response.json({ sku, message: 'No performance data found', profit_per_order: null, total_profit: null, roas: null });
    }

    const feeRate = parseFloat(product.shopee_fee_rate) || DEFAULT_FEE_RATE;
    const cost = parseFloat(product.cost) || 0;

    let totalRevenue = 0;
    let totalOrders = 0;
    let totalAdsSpend = 0;
    let totalUnits = 0;

    const daily = perf.map(r => {
      const revenue = parseFloat(r.revenue) || 0;
      const orders = parseInt(r.orders) || 0;
      const ads = parseFloat(r.ads_spend) || 0;
      const units = parseInt(r.units_sold) || orders;

      const netRevenue = revenue * (1 - feeRate);
      const grossProfit = netRevenue - (cost * units) - (FIXED_COST * orders);
      const netProfit = grossProfit - ads;

      totalRevenue += revenue;
      totalOrders += orders;
      totalAdsSpend += ads;
      totalUnits += units;

      return {
        date: r.date,
        revenue,
        orders,
        units_sold: units,
        ads_spend: ads,
        net_revenue: Math.round(netRevenue),
        gross_profit: Math.round(grossProfit),
        net_profit: Math.round(netProfit),
        profit_per_order: orders > 0 ? Math.round(netProfit / orders) : null,
        roas: ads > 0 ? parseFloat((revenue / ads).toFixed(2)) : null,
      };
    }).sort((a, b) => a.date.localeCompare(b.date));

    const totalNetRevenue = totalRevenue * (1 - feeRate);
    const totalGrossProfit = totalNetRevenue - (cost * totalUnits) - (FIXED_COST * totalOrders);
    const totalNetProfit = totalGrossProfit - totalAdsSpend;
    const profitPerOrder = totalOrders > 0 ? Math.round(totalNetProfit / totalOrders) : null;
    const roas = totalAdsSpend > 0 ? parseFloat((totalRevenue / totalAdsSpend).toFixed(2)) : null;
    const overallMargin = totalRevenue > 0 ? parseFloat((totalNetProfit / totalRevenue).toFixed(4)) : null;

    return Response.json({
      sku,
      product_name: product.name,
      period_days: perf.length,
      total_revenue: Math.round(totalRevenue),
      total_orders: totalOrders,
      total_units: totalUnits,
      total_ads_spend: Math.round(totalAdsSpend),
      total_net_revenue: Math.round(totalNetRevenue),
      total_gross_profit: Math.round(totalGrossProfit),
      total_net_profit: Math.round(totalNetProfit),
      profit_per_order: profitPerOrder,
      overall_margin: overallMargin,
      overall_margin_pct: overallMargin !== null ? parseFloat((overallMargin * 100).toFixed(2)) : null,
      roas,
      daily,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});