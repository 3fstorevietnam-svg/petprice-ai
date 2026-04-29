import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { TrendingUp, DollarSign, ShoppingCart, Target } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function PerformanceTracking() {
  const [records, setRecords] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [skuFilter, setSkuFilter] = useState('all');

  useEffect(() => {
    Promise.all([
      base44.entities.DailyPerformance.list('-date', 300),
      base44.entities.Product.list('-created_date', 200),
    ]).then(([recs, prods]) => {
      setRecords(recs);
      setProducts(prods);
      setLoading(false);
    });
  }, []);

  const filtered = skuFilter === 'all' ? records : records.filter(r => r.sku_code === skuFilter);

  // Aggregate by date
  const byDate = filtered.reduce((acc, r) => {
    const d = r.date;
    if (!acc[d]) acc[d] = { date: d, revenue: 0, net_profit: 0, orders: 0, ads_spend: 0 };
    acc[d].revenue += r.revenue || 0;
    acc[d].net_profit += r.net_profit || 0;
    acc[d].orders += r.orders || 0;
    acc[d].ads_spend += r.ads_spend || 0;
    return acc;
  }, {});

  const chartData = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)).slice(-14);

  const totals = filtered.reduce((acc, r) => ({
    revenue: acc.revenue + (r.revenue || 0),
    net_profit: acc.net_profit + (r.net_profit || 0),
    orders: acc.orders + (r.orders || 0),
    ads_spend: acc.ads_spend + (r.ads_spend || 0),
  }), { revenue: 0, net_profit: 0, orders: 0, ads_spend: 0 });

  const overallMargin = totals.revenue > 0 ? (totals.net_profit / totals.revenue * 100).toFixed(1) : '—';
  const roas = totals.ads_spend > 0 ? (totals.revenue / totals.ads_spend).toFixed(2) : '—';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Performance Tracking"
        subtitle="Revenue, profit, and order trends"
        actions={
          <Select value={skuFilter} onValueChange={setSkuFilter}>
            <SelectTrigger className="h-8 text-sm w-48"><SelectValue placeholder="All SKUs" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All SKUs</SelectItem>
              {products.map(p => <SelectItem key={p.id} value={p.sku_code}>{p.sku_code}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Revenue" value={`₫${(totals.revenue / 1000000).toFixed(1)}M`} icon={DollarSign} sub="All time" />
          <StatCard label="Total Net Profit" value={`₫${(totals.net_profit / 1000000).toFixed(1)}M`} icon={TrendingUp} accent={totals.net_profit > 0} sub={`Margin: ${overallMargin}%`} />
          <StatCard label="Total Orders" value={totals.orders.toLocaleString()} icon={ShoppingCart} sub="All time" />
          <StatCard label="ROAS" value={roas} icon={Target} sub="Revenue / Ads Spend" />
        </div>

        {chartData.length > 0 ? (
          <>
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-semibold text-sm mb-4">Revenue & Net Profit (Last 14 Days)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} barSize={16}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₫${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => `₫${v.toLocaleString()}`} />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" opacity={0.7} radius={[4,4,0,0]} name="Revenue" />
                  <Bar dataKey="net_profit" fill="hsl(var(--success))" radius={[4,4,0,0]} name="Net Profit" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-semibold text-sm mb-4">Daily Orders</h3>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="orders" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Orders" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground">
            <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="font-medium">No performance data yet</p>
            <p className="text-sm mt-1">Add daily performance records to see charts here</p>
          </div>
        )}
      </div>
    </div>
  );
}