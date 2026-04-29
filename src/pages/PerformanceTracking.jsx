import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp } from 'lucide-react';

const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316'];

function ChartCard({ title, children }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="font-semibold text-sm mb-4">{title}</h3>
      {children}
    </div>
  );
}

export default function PerformanceTracking() {
  const [records, setRecords] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [skuFilter, setSkuFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    Promise.all([
      base44.entities.DailyPerformance.list('-date', 500),
      base44.entities.AISuggestion.list('-rec_date', 500),
      base44.entities.Product.list('-created_date', 200),
    ]).then(([r, s, p]) => { setRecords(r); setSuggestions(s); setProducts(p); setLoading(false); });
  }, []);

  const skus = [...new Set(records.map(r => r.sku))].sort();

  const filtered = records.filter(r => {
    if (skuFilter !== 'all' && r.sku !== skuFilter) return false;
    if (dateFrom && r.date < dateFrom) return false;
    if (dateTo && r.date > dateTo) return false;
    return true;
  });

  // Aggregate by date
  const byDate = filtered.reduce((acc, r) => {
    if (!acc[r.date]) acc[r.date] = { date: r.date, revenue: 0, ads_spend: 0, orders: 0, units_sold: 0 };
    acc[r.date].revenue += r.revenue || 0;
    acc[r.date].ads_spend += r.ads_spend || 0;
    acc[r.date].orders += r.orders || 0;
    acc[r.date].units_sold += r.units_sold || 0;
    return acc;
  }, {});
  const chartData = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)).slice(-30);

  // Rank & competitor price (per-sku)
  const rankData = filtered.filter(r => r.current_rank > 0).sort((a, b) => a.date.localeCompare(b.date)).slice(-30)
    .map(r => ({ date: r.date.slice(5), rank: r.current_rank, competitor: r.competitor_price || null }));

  // Suggestion action breakdown
  const actionCounts = suggestions.reduce((acc, s) => {
    const key = s.suggested_action || 'Unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const pieData = Object.entries(actionCounts).map(([name, value]) => ({ name, value }));

  const fmtVnd = v => `₫${(v / 1000).toFixed(0)}k`;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader title="Performance Tracking" subtitle="Biểu đồ xu hướng doanh thu, ads và đơn hàng" />

      <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-card/30 flex-shrink-0 flex-wrap">
        <Select value={skuFilter} onValueChange={setSkuFilter}>
          <SelectTrigger className="h-8 text-sm w-40"><SelectValue placeholder="All SKUs" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả SKU</SelectItem>
            {skus.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 text-sm w-36" placeholder="From" />
        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 text-sm w-36" placeholder="To" />
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} records</span>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin mr-3" />Loading charts...
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <TrendingUp className="w-10 h-10 mb-3 opacity-20" />
            <p className="font-medium">Chưa có dữ liệu</p>
            <p className="text-sm mt-1">Thêm dữ liệu vào Daily Performance để xem biểu đồ</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <ChartCard title="Doanh thu & Ads Spend (30 ngày gần nhất)">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} barSize={10}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtVnd} />
                    <Tooltip formatter={v => `₫${v.toLocaleString()}`} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="revenue" fill="#3b82f6" opacity={0.8} radius={[3,3,0,0]} name="Revenue" />
                    <Bar dataKey="ads_spend" fill="#f97316" opacity={0.8} radius={[3,3,0,0]} name="Ads Spend" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Đơn hàng theo ngày">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="orders" stroke="#10b981" strokeWidth={2} dot={false} name="Orders" />
                    <Line type="monotone" dataKey="units_sold" stroke="#8b5cf6" strokeWidth={2} dot={false} name="Units Sold" strokeDasharray="4 2" />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {rankData.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <ChartCard title="Xu hướng Ranking (thấp hơn = tốt hơn)">
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={rankData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis reversed tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="rank" stroke="#f59e0b" strokeWidth={2} dot={false} name="Rank" />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Giá đối thủ theo ngày">
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={rankData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `₫${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={v => `₫${v?.toLocaleString()}`} />
                      <Line type="monotone" dataKey="competitor" stroke="#ef4444" strokeWidth={2} dot={false} name="Competitor Price" />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>
            )}

            {pieData.length > 0 && (
              <ChartCard title="Phân bổ AI Suggestions theo loại hành động">
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width={220} height={180}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={80} dataKey="value" paddingAngle={2}>
                        {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2">
                    {pieData.map((entry, i) => (
                      <div key={entry.name} className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="font-medium">{entry.name}</span>
                        <span className="text-muted-foreground ml-auto pl-4">{entry.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </ChartCard>
            )}
          </>
        )}
      </div>
    </div>
  );
}