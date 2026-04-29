import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/admin/DataTable';
import FormDialog from '@/components/admin/FormDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, BarChart3, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';

const DEFAULTS = { sku: '', date: format(new Date(), 'yyyy-MM-dd'), views: 0, clicks: 0, orders: 0, revenue: 0, ads_spend: 0, units_sold: 0, conversion_rate: 0, current_rank: 0, competitor_price: 0, orders_7d: 0, orders_30d: 0, views_7d: 0 };

const FIELDS = [
  { key: 'sku', label: 'SKU', required: true, placeholder: 'e.g. PET-001' },
  { key: 'date', label: 'Date', type: 'date', required: true },
  { key: 'orders', label: 'Orders', type: 'number' },
  { key: 'revenue', label: 'Revenue (₫)', type: 'number' },
  { key: 'units_sold', label: 'Units Sold', type: 'number' },
  { key: 'ads_spend', label: 'Ads Spend (₫)', type: 'number' },
  { key: 'views', label: 'Views', type: 'number' },
  { key: 'clicks', label: 'Clicks', type: 'number' },
  { key: 'conversion_rate', label: 'Conversion Rate (%)', type: 'number', step: '0.01' },
  { key: 'current_rank', label: 'Current Rank', type: 'number' },
  { key: 'competitor_price', label: 'Competitor Price (₫)', type: 'number' },
  { key: 'orders_7d', label: 'Orders 7d', type: 'number' },
  { key: 'orders_30d', label: 'Orders 30d', type: 'number' },
  { key: 'views_7d', label: 'Views 7d', type: 'number' },
];

export default function DailyPerformance() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [skuSearch, setSkuSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEFAULTS);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    base44.entities.DailyPerformance.list('-date', 300).then(d => { setRecords(d); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ ...DEFAULTS, date: dateFilter }); setOpen(true); };
  const openEdit = (row) => { setEditing(row); setForm({ ...row }); setOpen(true); };
  const onChange = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.sku || !form.date) { toast.error('SKU and Date required'); return; }
    setSaving(true);
    const payload = { ...form, views: parseInt(form.views) || 0, clicks: parseInt(form.clicks) || 0, orders: parseInt(form.orders) || 0, revenue: parseFloat(form.revenue) || 0, ads_spend: parseFloat(form.ads_spend) || 0, units_sold: parseInt(form.units_sold) || 0, conversion_rate: parseFloat(form.conversion_rate) || 0, current_rank: parseInt(form.current_rank) || 0, competitor_price: parseFloat(form.competitor_price) || 0, orders_7d: parseInt(form.orders_7d) || 0, orders_30d: parseInt(form.orders_30d) || 0, views_7d: parseInt(form.views_7d) || 0 };
    if (editing) await base44.entities.DailyPerformance.update(editing.id, payload);
    else await base44.entities.DailyPerformance.create(payload);
    toast.success('Record saved');
    setOpen(false);
    load();
    setSaving(false);
  };

  const handleDelete = async () => {
    await base44.entities.DailyPerformance.delete(editing.id);
    toast.success('Record deleted');
    setOpen(false);
    load();
  };

  const filtered = records.filter(r => {
    const matchDate = !dateFilter || r.date === dateFilter;
    const matchSku = !skuSearch || r.sku?.toLowerCase().includes(skuSearch.toLowerCase());
    return matchDate && matchSku;
  });

  const totals = filtered.reduce((a, r) => ({ orders: a.orders + (r.orders || 0), revenue: a.revenue + (r.revenue || 0), ads_spend: a.ads_spend + (r.ads_spend || 0) }), { orders: 0, revenue: 0, ads_spend: 0 });

  const columns = [
    { key: 'sku', label: 'SKU', render: v => <span className="font-mono text-xs font-medium">{v}</span> },
    { key: 'date', label: 'Date', render: v => <span className="text-xs">{v}</span> },
    { key: 'orders', label: 'Orders', render: v => <span className="font-semibold text-sm">{v || 0}</span> },
    { key: 'revenue', label: 'Revenue', render: v => <span className="font-mono text-xs">₫{(v || 0).toLocaleString()}</span> },
    { key: 'ads_spend', label: 'Ads Spend', render: v => <span className="font-mono text-xs">₫{(v || 0).toLocaleString()}</span> },
    { key: 'units_sold', label: 'Units', render: v => <span className="text-xs">{v || 0}</span> },
    { key: 'views', label: 'Views', render: v => <span className="text-xs">{(v || 0).toLocaleString()}</span> },
    { key: 'conversion_rate', label: 'CVR', render: v => <span className={cn('text-xs font-medium', (v || 0) >= 3 ? 'text-emerald-600' : (v || 0) >= 1 ? 'text-yellow-600' : 'text-muted-foreground')}>{(v || 0).toFixed(1)}%</span> },
    { key: 'current_rank', label: 'Rank', render: v => <span className="text-xs">{v || '—'}</span> },
    { key: 'competitor_price', label: 'Comp. Price', render: v => v ? <span className="font-mono text-xs">₫{(v).toLocaleString()}</span> : '—' },
    { key: 'orders_7d', label: '7d Orders', render: v => <span className="text-xs">{v || 0}</span> },
    { key: 'orders_30d', label: '30d Orders', render: v => <span className="text-xs">{v || 0}</span> },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Daily Performance"
        subtitle="Per-SKU daily data"
        actions={<Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1.5" />Add Record</Button>}
      />

      <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-card/30 flex-shrink-0 flex-wrap">
        <Input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="h-8 text-sm w-36" />
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Filter by SKU..." className="pl-9 h-8 text-sm" value={skuSearch} onChange={e => setSkuSearch(e.target.value)} />
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setDateFilter('')}>Show All</Button>
        <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
          <span>Orders: <b className="text-foreground">{totals.orders}</b></span>
          <span>Revenue: <b className="text-foreground">₫{totals.revenue.toLocaleString()}</b></span>
          <span>Ads: <b className="text-foreground">₫{totals.ads_spend.toLocaleString()}</b></span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <DataTable columns={columns} data={filtered} loading={loading} emptyIcon={BarChart3} emptyText="No performance records." onRowClick={openEdit} />
      </div>

      <FormDialog open={open} onOpenChange={setOpen} title="Performance Record" fields={FIELDS} form={form} onChange={onChange} onSave={handleSave} onDelete={editing ? handleDelete : undefined} saving={saving} editing={editing} />
    </div>
  );
}