import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/admin/DataTable';
import FormDialog from '@/components/admin/FormDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Package, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const STATUS_COLORS = {
  active: 'bg-emerald-100 text-emerald-800',
  paused: 'bg-yellow-100 text-yellow-800',
  killed: 'bg-red-100 text-red-700',
};

const ROLE_COLORS = {
  moi: 'bg-purple-100 text-purple-800',
  core: 'bg-blue-100 text-blue-800',
  upsell: 'bg-orange-100 text-orange-800',
};

const FIELDS = [
  { key: 'sku', label: 'SKU', required: true, placeholder: 'e.g. PET-001' },
  { key: 'name', label: 'Product Name', required: true, placeholder: 'Product name', fullWidth: true },
  { key: 'category', label: 'Category', placeholder: 'e.g. Dog Food' },
  { key: 'sku_role', label: 'SKU Role', type: 'select', options: [{ value: 'moi', label: 'Mới (New)' }, { value: 'core', label: 'Core' }, { value: 'upsell', label: 'Upsell' }] },
  { key: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }, { value: 'killed', label: 'Killed' }] },
  { key: 'cost', label: 'Cost (₫)', type: 'number', placeholder: '0' },
  { key: 'current_price', label: 'Current Price (₫)', type: 'number', placeholder: '0' },
  { key: 'min_price', label: 'Min Price (₫)', type: 'number', placeholder: '0' },
  { key: 'max_price', label: 'Max Price (₫)', type: 'number', placeholder: '0' },
  { key: 'shopee_fee_rate', label: 'Shopee Fee Rate', type: 'number', step: '0.01', placeholder: '0.22' },
  { key: 'ops_fee', label: 'Ops Fee (₫)', type: 'number', placeholder: '3000' },
  { key: 'packing_fee', label: 'Packing Fee (₫)', type: 'number', placeholder: '11000' },
  { key: 'fixed_fee', label: 'Fixed Fee (₫)', type: 'number', placeholder: '1833' },
  { key: 'combo_qty', label: 'Combo Qty', type: 'number', placeholder: '1' },
  { key: 'notes', label: 'Notes', type: 'textarea', fullWidth: true },
];

const DEFAULTS = { sku: '', name: '', category: '', cost: 0, current_price: 0, shopee_fee_rate: 0.22, ops_fee: 3000, packing_fee: 11000, fixed_fee: 1833, sku_role: 'core', combo_qty: 1, min_price: 0, max_price: '', status: 'active', notes: '' };

function calcProfit(p) {
  if (!p.current_price || !p.cost) return null;
  const price = parseFloat(p.current_price);
  const fee = price * parseFloat(p.shopee_fee_rate || 0.22);
  return price - parseFloat(p.cost) - fee - parseFloat(p.ops_fee || 3000) - parseFloat(p.packing_fee || 11000) - parseFloat(p.fixed_fee || 1833);
}

function calcMargin(p) {
  if (!p.current_price) return null;
  const profit = calcProfit(p);
  if (profit === null) return null;
  return (profit / parseFloat(p.current_price)) * 100;
}

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEFAULTS);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    base44.entities.Product.list('-created_date', 200).then(d => { setProducts(d); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(DEFAULTS); setOpen(true); };
  const openEdit = (row) => { setEditing(row); setForm({ ...row }); setOpen(true); };
  const onChange = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.sku || !form.name) { toast.error('SKU and Name are required'); return; }
    setSaving(true);
    const payload = { ...form, cost: parseFloat(form.cost) || 0, current_price: parseFloat(form.current_price) || 0, min_price: parseFloat(form.min_price) || 0, max_price: parseFloat(form.max_price) || undefined, shopee_fee_rate: parseFloat(form.shopee_fee_rate) || 0.22, ops_fee: parseFloat(form.ops_fee) || 3000, packing_fee: parseFloat(form.packing_fee) || 11000, fixed_fee: parseFloat(form.fixed_fee) || 1833, combo_qty: parseInt(form.combo_qty) || 1 };
    if (editing) await base44.entities.Product.update(editing.id, payload);
    else await base44.entities.Product.create(payload);
    toast.success(editing ? 'Product updated' : 'Product created');
    setOpen(false);
    load();
    setSaving(false);
  };

  const handleDelete = async () => {
    await base44.entities.Product.delete(editing.id);
    toast.success('Product deleted');
    setOpen(false);
    load();
  };

  const filtered = products.filter(p => {
    const s = search.toLowerCase();
    return (!s || p.sku?.toLowerCase().includes(s) || p.name?.toLowerCase().includes(s)) &&
      (statusFilter === 'all' || p.status === statusFilter);
  });

  const columns = [
    { key: 'sku', label: 'SKU', render: (v) => <span className="font-mono text-xs font-medium">{v}</span> },
    { key: 'name', label: 'Product Name', render: (v, row) => (
      <div>
        <p className="font-medium text-sm">{v}</p>
        {row.category && <p className="text-xs text-muted-foreground">{row.category}</p>}
      </div>
    )},
    { key: 'sku_role', label: 'Role', render: (v) => v ? <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', ROLE_COLORS[v])}>{v}</span> : '—' },
    { key: 'cost', label: 'Cost', render: (v) => v ? <span className="font-mono text-xs">₫{parseFloat(v).toLocaleString()}</span> : '—' },
    { key: 'current_price', label: 'Price', render: (v) => <span className="font-mono text-sm font-semibold">₫{parseFloat(v || 0).toLocaleString()}</span> },
    { key: 'id', label: 'Profit/Margin', render: (_, row) => {
      const profit = calcProfit(row);
      const margin = calcMargin(row);
      if (profit === null) return '—';
      return (
        <div>
          <p className={cn('font-mono text-xs font-semibold', profit >= 0 ? 'text-emerald-600' : 'text-red-500')}>₫{profit.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}</p>
          <p className={cn('text-xs', margin >= 15 ? 'text-emerald-600' : margin >= 0 ? 'text-yellow-600' : 'text-red-500')}>{margin.toFixed(1)}%</p>
        </div>
      );
    }},
    { key: 'combo_qty', label: 'Combo Qty', render: (v) => <span className="text-xs">{v || 1}</span> },
    { key: 'status', label: 'Status', render: (v) => <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', STATUS_COLORS[v] || 'bg-muted text-muted-foreground')}>{v}</span> },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Products"
        subtitle={`${products.length} SKUs`}
        actions={<Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1.5" />Add SKU</Button>}
      />

      <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-card/30 flex-shrink-0">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search SKU or name..." className="pl-9 h-8 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="killed">Killed</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} shown</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <DataTable columns={columns} data={filtered} loading={loading} emptyIcon={Package} emptyText="No products yet. Add your first SKU." onRowClick={openEdit} />
      </div>

      <FormDialog
        open={open} onOpenChange={setOpen} title="Product"
        fields={FIELDS} form={form} onChange={onChange}
        onSave={handleSave} onDelete={editing ? handleDelete : undefined}
        saving={saving} editing={editing}
      />
    </div>
  );
}