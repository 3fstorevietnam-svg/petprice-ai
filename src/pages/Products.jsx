import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Package, Edit2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_COLORS = {
  active: 'bg-emerald-100 text-emerald-800',
  inactive: 'bg-gray-100 text-gray-600',
  killed: 'bg-red-100 text-red-700',
  combo_only: 'bg-purple-100 text-purple-800',
};

const emptyProduct = {
  sku_code: '', product_name: '', category: '', brand: '',
  cost_price: '', current_price: '', min_price: '', max_price: '',
  target_margin_pct: '', shopee_fee_pct: '', shipping_cost: '',
  stock_quantity: '', status: 'active', shopee_url: '', notes: ''
};

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyProduct);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const data = await base44.entities.Product.list('-created_date', 100);
    setProducts(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(emptyProduct); setShowDialog(true); };
  const openEdit = (p) => { setEditing(p); setForm({ ...p }); setShowDialog(true); };

  const handleSave = async () => {
    setSaving(true);
    const payload = { ...form,
      cost_price: parseFloat(form.cost_price) || 0,
      current_price: parseFloat(form.current_price) || 0,
      min_price: parseFloat(form.min_price) || 0,
      max_price: parseFloat(form.max_price) || 0,
      target_margin_pct: parseFloat(form.target_margin_pct) || 0,
      shopee_fee_pct: parseFloat(form.shopee_fee_pct) || 0,
      shipping_cost: parseFloat(form.shipping_cost) || 0,
      stock_quantity: parseInt(form.stock_quantity) || 0,
    };
    if (editing) await base44.entities.Product.update(editing.id, payload);
    else await base44.entities.Product.create(payload);
    setShowDialog(false);
    load();
    setSaving(false);
  };

  const filtered = products.filter(p => {
    const matchSearch = !search || p.product_name?.toLowerCase().includes(search.toLowerCase()) || p.sku_code?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const margin = (p) => {
    if (!p.current_price || !p.cost_price) return null;
    const gross = p.current_price - p.cost_price - (p.current_price * (p.shopee_fee_pct || 0) / 100) - (p.shipping_cost || 0);
    return ((gross / p.current_price) * 100).toFixed(1);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Products"
        subtitle={`${products.length} SKUs total`}
        actions={
          <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1.5" />Add SKU</Button>
        }
      />

      <div className="flex-1 overflow-y-auto">
        {/* Filters */}
        <div className="px-6 py-3 border-b border-border bg-card/30 flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search SKU or name..." className="pl-9 h-8 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="killed">Killed</SelectItem>
              <SelectItem value="combo_only">Combo Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {['SKU Code', 'Product Name', 'Cost', 'Price', 'Margin', 'Stock', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array(8).fill(0).map((_, i) => (
                  <tr key={i}>
                    {Array(8).fill(0).map((_, j) => (
                      <td key={j} className="px-5 py-4"><div className="h-4 bg-muted rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-16 text-center text-muted-foreground">
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No products found. Add your first SKU.
                </td></tr>
              ) : (
                filtered.map(p => {
                  const m = margin(p);
                  return (
                    <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{p.sku_code}</td>
                      <td className="px-5 py-3.5">
                        <div>
                          <p className="font-medium text-foreground">{p.product_name}</p>
                          {p.brand && <p className="text-xs text-muted-foreground">{p.brand}</p>}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs">{p.cost_price ? `₫${p.cost_price.toLocaleString()}` : '—'}</td>
                      <td className="px-5 py-3.5 font-mono text-sm font-semibold">{p.current_price ? `₫${p.current_price.toLocaleString()}` : '—'}</td>
                      <td className="px-5 py-3.5">
                        {m !== null ? (
                          <span className={cn('font-semibold text-xs', parseFloat(m) >= 0 ? 'text-emerald-600' : 'text-red-500')}>{m}%</span>
                        ) : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-sm">{p.stock_quantity ?? '—'}</td>
                      <td className="px-5 py-3.5">
                        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', STATUS_COLORS[p.status] || 'bg-muted text-muted-foreground')}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          {p.shopee_url && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                              <a href={p.shopee_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3.5 h-3.5" /></a>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Product' : 'Add New SKU'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            {[
              { key: 'sku_code', label: 'SKU Code', required: true },
              { key: 'product_name', label: 'Product Name', required: true },
              { key: 'brand', label: 'Brand' },
              { key: 'category', label: 'Category' },
              { key: 'cost_price', label: 'Cost Price (₫)', type: 'number' },
              { key: 'current_price', label: 'Selling Price (₫)', type: 'number' },
              { key: 'min_price', label: 'Min Price (₫)', type: 'number' },
              { key: 'max_price', label: 'Max Price (₫)', type: 'number' },
              { key: 'target_margin_pct', label: 'Target Margin %', type: 'number' },
              { key: 'shopee_fee_pct', label: 'Shopee Fee %', type: 'number' },
              { key: 'shipping_cost', label: 'Avg Shipping Cost (₫)', type: 'number' },
              { key: 'stock_quantity', label: 'Stock Qty', type: 'number' },
              { key: 'shopee_url', label: 'Shopee URL' },
            ].map(({ key, label, type, required }) => (
              <div key={key} className={key === 'shopee_url' ? 'col-span-2' : ''}>
                <Label className="text-xs mb-1.5 block">{label}{required && ' *'}</Label>
                <Input type={type || 'text'} value={form[key] || ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="h-8 text-sm" />
              </div>
            ))}
            <div>
              <Label className="text-xs mb-1.5 block">Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="killed">Killed</SelectItem>
                  <SelectItem value="combo_only">Combo Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}