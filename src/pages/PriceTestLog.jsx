import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/admin/DataTable';
import FormDialog from '@/components/admin/FormDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, TestTube, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';

const STATUS_COLORS = {
  planned: 'bg-blue-100 text-blue-800',
  running: 'bg-orange-100 text-orange-800',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

const FIELDS = [
  { key: 'sku', label: 'SKU', required: true },
  { key: 'status', label: 'Status', type: 'select', options: ['planned','running','completed','cancelled'].map(v => ({ value: v, label: v })) },
  { key: 'test_start_date', label: 'Start Date', type: 'date' },
  { key: 'test_end_date', label: 'End Date', type: 'date' },
  { key: 'old_price', label: 'Old Price (₫)', type: 'number' },
  { key: 'test_price', label: 'Test Price (₫)', type: 'number' },
  { key: 'result_note', label: 'Result Note', type: 'textarea', fullWidth: true },
];

const DEFAULTS = { sku: '', test_start_date: format(new Date(), 'yyyy-MM-dd'), status: 'planned' };

export default function PriceTestLog() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEFAULTS);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    base44.entities.PriceTestLog.list('-created_date', 200).then(d => { setRecords(d); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(DEFAULTS); setOpen(true); };
  const openEdit = (row) => { setEditing(row); setForm({ ...row }); setOpen(true); };
  const onChange = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.sku) { toast.error('SKU is required'); return; }
    setSaving(true);
    const payload = { ...form, old_price: parseFloat(form.old_price) || undefined, test_price: parseFloat(form.test_price) || undefined };
    if (editing) await base44.entities.PriceTestLog.update(editing.id, payload);
    else await base44.entities.PriceTestLog.create(payload);
    toast.success('Saved');
    setOpen(false);
    load();
    setSaving(false);
  };

  const handleDelete = async () => {
    await base44.entities.PriceTestLog.delete(editing.id);
    toast.success('Deleted');
    setOpen(false);
    load();
  };

  const filtered = records.filter(r => !search || r.sku?.toLowerCase().includes(search.toLowerCase()));

  const columns = [
    { key: 'sku', label: 'SKU', render: v => <span className="font-mono text-xs font-medium">{v}</span> },
    { key: 'status', label: 'Status', render: v => <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', STATUS_COLORS[v] || 'bg-muted text-muted-foreground')}>{v}</span> },
    { key: 'test_start_date', label: 'Start Date', render: v => <span className="text-xs">{v || '—'}</span> },
    { key: 'test_end_date', label: 'End Date', render: v => <span className="text-xs">{v || '—'}</span> },
    { key: 'old_price', label: 'Old Price', render: v => v ? <span className="font-mono text-xs">₫{parseFloat(v).toLocaleString()}</span> : '—' },
    { key: 'test_price', label: 'Test Price', render: (v, row) => {
      if (!v) return '—';
      const delta = v - (row.old_price || 0);
      return (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-semibold">₫{parseFloat(v).toLocaleString()}</span>
          {delta !== 0 && <span className={cn('text-xs', delta > 0 ? 'text-emerald-600' : 'text-red-500')}>{delta > 0 ? '+' : ''}{((delta / (row.old_price || 1)) * 100).toFixed(1)}%</span>}
        </div>
      );
    }},
    { key: 'result_note', label: 'Result', render: v => v ? <span className="text-xs text-muted-foreground truncate max-w-xs block">{v}</span> : '—' },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Price Test Log"
        subtitle="Track A/B price experiments"
        actions={<Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1.5" />New Test</Button>}
      />

      <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-card/30 flex-shrink-0">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Filter by SKU..." className="pl-9 h-8 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="ml-auto flex gap-2 text-xs text-muted-foreground">
          {['planned','running','completed','cancelled'].map(s => (
            <span key={s}><span className={cn('font-semibold', STATUS_COLORS[s]?.includes('emerald') ? 'text-emerald-600' : '')}>{records.filter(r => r.status === s).length}</span> {s}</span>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <DataTable columns={columns} data={filtered} loading={loading} emptyIcon={TestTube} emptyText="No price tests yet." onRowClick={openEdit} />
      </div>

      <FormDialog open={open} onOpenChange={setOpen} title="Price Test" fields={FIELDS} form={form} onChange={onChange} onSave={handleSave} onDelete={editing ? handleDelete : undefined} saving={saving} editing={editing} />
    </div>
  );
}