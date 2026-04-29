import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/admin/DataTable';
import FormDialog from '@/components/admin/FormDialog';
import { Button } from '@/components/ui/button';
import { Plus, Settings } from 'lucide-react';
import { toast } from 'sonner';

const FIELDS = [
  { key: 'setting_key', label: 'Setting Key', required: true, placeholder: 'e.g. DEFAULT_SHOPEE_FEE_RATE' },
  { key: 'setting_value_number', label: 'Numeric Value', type: 'number', step: '0.0001' },
  { key: 'setting_value_text', label: 'Text Value', placeholder: 'Leave blank if numeric' },
  { key: 'note', label: 'Note', type: 'textarea', fullWidth: true },
];

const DEFAULTS = { setting_key: '', setting_value_text: '', setting_value_number: '', note: '' };

export default function AppSettingsPage() {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEFAULTS);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    base44.entities.AppSettings.list('setting_key', 100).then(d => { setSettings(d); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(DEFAULTS); setOpen(true); };
  const openEdit = (row) => { setEditing(row); setForm({ ...row }); setOpen(true); };
  const onChange = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.setting_key) { toast.error('Setting key is required'); return; }
    setSaving(true);
    const payload = { ...form, setting_value_number: form.setting_value_number !== '' ? parseFloat(form.setting_value_number) : undefined };
    if (editing) await base44.entities.AppSettings.update(editing.id, payload);
    else await base44.entities.AppSettings.create(payload);
    toast.success('Setting saved');
    setOpen(false);
    load();
    setSaving(false);
  };

  const handleDelete = async () => {
    await base44.entities.AppSettings.delete(editing.id);
    toast.success('Deleted');
    setOpen(false);
    load();
  };

  const columns = [
    { key: 'setting_key', label: 'Setting Key', render: v => <span className="font-mono text-sm font-medium">{v}</span> },
    { key: 'setting_value_number', label: 'Numeric Value', render: v => v !== undefined && v !== null ? <span className="font-mono text-sm font-semibold text-primary">{v}</span> : '—' },
    { key: 'setting_value_text', label: 'Text Value', render: v => v || '—' },
    { key: 'note', label: 'Note', render: v => <span className="text-xs text-muted-foreground">{v || '—'}</span> },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="App Settings"
        subtitle="Global configuration for pricing calculations"
        actions={<Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1.5" />Add Setting</Button>}
      />

      <div className="flex-1 overflow-y-auto">
        <DataTable columns={columns} data={settings} loading={loading} emptyIcon={Settings} emptyText="No settings yet." onRowClick={openEdit} />
      </div>

      <div className="px-5 py-4 border-t border-border bg-muted/20">
        <p className="text-xs text-muted-foreground">
          <b>Key settings:</b> DEFAULT_SHOPEE_FEE_RATE (0.22), DEFAULT_OPS_FEE (3000), DEFAULT_PACKING_FEE (11000), DEFAULT_FIXED_FEE (1833) — used as fallback when a product doesn't have its own fee overrides.
        </p>
      </div>

      <FormDialog open={open} onOpenChange={setOpen} title="App Setting" fields={FIELDS} form={form} onChange={onChange} onSave={handleSave} onDelete={editing ? handleDelete : undefined} saving={saving} editing={editing} />
    </div>
  );
}