import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/admin/DataTable';
import FormDialog from '@/components/admin/FormDialog';
import ActionBadge from '@/components/ActionBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Brain, Plus, Sparkles, RefreshCw, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';

const ACTION_COLORS = {
  GIU_GIA: 'bg-blue-100 text-blue-800',
  TANG_GIA: 'bg-emerald-100 text-emerald-800',
  GIAM_GIA: 'bg-red-100 text-red-800',
  GOM_COMBO: 'bg-purple-100 text-purple-800',
  KILL_SKU: 'bg-gray-100 text-gray-700',
};

const ADS_ACTION_COLORS = {
  GIU_NGUYEN: 'bg-muted text-muted-foreground',
  CHAY_ADS: 'bg-orange-100 text-orange-800',
  NGUNG_ADS: 'bg-yellow-100 text-yellow-800',
  TEST_LAI_GIA_VA_CONTENT: 'bg-violet-100 text-violet-800',
};

const STATUS_COLORS = {
  pending: 'bg-orange-100 text-orange-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  testing: 'bg-blue-100 text-blue-700',
};

const FIELDS = [
  { key: 'sku', label: 'SKU', required: true },
  { key: 'rec_date', label: 'Recommendation Date', type: 'date', required: true },
  { key: 'current_price', label: 'Current Price (₫)', type: 'number' },
  { key: 'current_profit', label: 'Current Profit (₫)', type: 'number' },
  { key: 'current_margin', label: 'Current Margin (%)', type: 'number', step: '0.01' },
  { key: 'suggested_action', label: 'Suggested Action', type: 'select', options: ['GIU_GIA','TANG_GIA','GIAM_GIA','GOM_COMBO','KILL_SKU'].map(v => ({ value: v, label: v })) },
  { key: 'suggested_price', label: 'Suggested Price (₫)', type: 'number' },
  { key: 'suggested_combo_qty', label: 'Suggested Combo Qty', type: 'number' },
  { key: 'ads_action', label: 'Ads Action', type: 'select', options: ['GIU_NGUYEN','CHAY_ADS','NGUNG_ADS','TEST_LAI_GIA_VA_CONTENT'].map(v => ({ value: v, label: v })) },
  { key: 'confidence', label: 'Confidence (0-100)', type: 'number' },
  { key: 'status', label: 'Status', type: 'select', options: ['pending','approved','rejected','testing'].map(v => ({ value: v, label: v })) },
  { key: 'reason', label: 'Reason', type: 'textarea', fullWidth: true },
  { key: 'admin_note', label: 'Admin Note', type: 'textarea', fullWidth: true },
];

const DEFAULTS = { sku: '', rec_date: format(new Date(), 'yyyy-MM-dd'), suggested_action: 'GIU_GIA', ads_action: 'GIU_NGUYEN', status: 'pending', confidence: 70 };

export default function AISuggestions() {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [skuSearch, setSkuSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEFAULTS);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [detailRow, setDetailRow] = useState(null);

  const load = () => {
    setLoading(true);
    base44.entities.AISuggestion.list('-rec_date', 200).then(d => { setSuggestions(d); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(DEFAULTS); setOpen(true); };
  const openEdit = (row) => { setEditing(row); setForm({ ...row }); setOpen(true); };
  const onChange = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    const payload = { ...form, current_price: parseFloat(form.current_price) || undefined, current_profit: parseFloat(form.current_profit) || undefined, current_margin: parseFloat(form.current_margin) || undefined, suggested_price: parseFloat(form.suggested_price) || undefined, confidence: parseFloat(form.confidence) || undefined };
    if (editing) await base44.entities.AISuggestion.update(editing.id, payload);
    else await base44.entities.AISuggestion.create(payload);
    toast.success('Saved');
    setOpen(false);
    load();
    setSaving(false);
  };

  const handleDelete = async () => {
    await base44.entities.AISuggestion.delete(editing.id);
    toast.success('Deleted');
    setOpen(false);
    load();
  };

  const quickStatus = async (row, status) => {
    await base44.entities.AISuggestion.update(row.id, { status });
    toast.success(`Marked as ${status}`);
    load();
  };

  const generateSuggestions = async () => {
    setGenerating(true);
    try {
      const res = await base44.functions.invoke('generateAISuggestions', {});
      toast.success(`Generated ${res.data?.created || 0} new suggestions`);
      load();
    } catch (e) {
      toast.error('AI analysis failed: ' + e.message);
    } finally {
      setGenerating(false);
    }
  };

  const filtered = suggestions.filter(s =>
    (statusFilter === 'all' || s.status === statusFilter) &&
    (!skuSearch || s.sku?.toLowerCase().includes(skuSearch.toLowerCase()))
  );

  const columns = [
    { key: 'sku', label: 'SKU', render: v => <span className="font-mono text-xs font-medium">{v}</span> },
    { key: 'rec_date', label: 'Date', render: v => <span className="text-xs">{v}</span> },
    { key: 'suggested_action', label: 'Pricing Action', render: v => v ? <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-md border', ACTION_COLORS[v])}>{v}</span> : '—' },
    { key: 'ads_action', label: 'Ads Action', render: v => v ? <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-md', ADS_ACTION_COLORS[v])}>{v}</span> : '—' },
    { key: 'current_price', label: 'Curr. Price', render: v => v ? <span className="font-mono text-xs">₫{parseFloat(v).toLocaleString()}</span> : '—' },
    { key: 'suggested_price', label: 'Sugg. Price', render: (v, row) => {
      if (!v) return '—';
      const delta = v - (row.current_price || 0);
      return (
        <div>
          <span className="font-mono text-xs font-semibold">₫{parseFloat(v).toLocaleString()}</span>
          {delta !== 0 && <span className={cn('text-xs ml-1', delta > 0 ? 'text-emerald-600' : 'text-red-500')}>{delta > 0 ? '+' : ''}{((delta / (row.current_price || 1)) * 100).toFixed(1)}%</span>}
        </div>
      );
    }},
    { key: 'current_margin', label: 'Margin', render: v => v !== undefined && v !== null ? <span className={cn('text-xs font-medium', v >= 15 ? 'text-emerald-600' : v >= 0 ? 'text-yellow-600' : 'text-red-500')}>{parseFloat(v).toFixed(1)}%</span> : '—' },
    { key: 'confidence', label: 'Confidence', render: v => v ? <span className="text-xs">{v}%</span> : '—' },
    { key: 'status', label: 'Status', render: (v, row) => (
      <div className="flex items-center gap-1.5">
        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', STATUS_COLORS[v])}>{v}</span>
        {v === 'pending' && (
          <div className="flex gap-1 ml-1">
            <button onClick={e => { e.stopPropagation(); quickStatus(row, 'approved'); }} className="text-xs text-emerald-700 hover:underline font-medium">✓</button>
            <button onClick={e => { e.stopPropagation(); quickStatus(row, 'rejected'); }} className="text-xs text-red-600 hover:underline font-medium">✕</button>
          </div>
        )}
      </div>
    )},
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="AI Pricing Suggestions"
        subtitle={`${suggestions.filter(s => s.status === 'pending').length} pending approval`}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={openCreate}><Plus className="w-4 h-4 mr-1.5" />Manual Entry</Button>
            <Button size="sm" onClick={generateSuggestions} disabled={generating}>
              {generating ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
              {generating ? 'Analyzing...' : 'Run AI Analysis'}
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-card/30 flex-shrink-0">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Filter by SKU..." className="pl-9 h-8 text-sm" value={skuSearch} onChange={e => setSkuSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="testing">Testing</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} records</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <DataTable columns={columns} data={filtered} loading={loading} emptyIcon={Brain} emptyText="No suggestions yet. Run AI Analysis to generate recommendations." onRowClick={openEdit} />
      </div>

      <FormDialog open={open} onOpenChange={setOpen} title="AI Suggestion" fields={FIELDS} form={form} onChange={onChange} onSave={handleSave} onDelete={editing ? handleDelete : undefined} saving={saving} editing={editing} />
    </div>
  );
}