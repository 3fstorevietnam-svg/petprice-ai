import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import { Plus, Save, Trash2, Search, GitMerge, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const EMPTY_RULE = {
  sku: '', internal_variant_label: '',
  normalized_weight: '', normalized_volume: '',
  normalized_pack_count: '', normalized_flavor: '', normalized_type: '',
  matching_keywords: '', is_active: true, notes: '',
};

function RuleRow({ rule, onChange, onSave, onDelete, saving, isNew }) {
  return (
    <tr className={cn('hover:bg-muted/20 transition-colors', !rule.is_active && 'opacity-50')}>
      <td className="px-2 py-2">
        <Input className="h-7 text-xs font-mono" value={rule.sku} onChange={e => onChange('sku', e.target.value)} placeholder="SKU" />
      </td>
      <td className="px-2 py-2">
        <Input className="h-7 text-xs" value={rule.internal_variant_label} onChange={e => onChange('internal_variant_label', e.target.value)} placeholder="e.g. 85g x 24" />
      </td>
      <td className="px-2 py-2">
        <Input className="h-7 text-xs" value={rule.normalized_weight} onChange={e => onChange('normalized_weight', e.target.value)} placeholder="e.g. 85g" />
      </td>
      <td className="px-2 py-2">
        <Input className="h-7 text-xs" value={rule.normalized_volume} onChange={e => onChange('normalized_volume', e.target.value)} placeholder="e.g. 1L" />
      </td>
      <td className="px-2 py-2">
        <Input className="h-7 text-xs" type="number" value={rule.normalized_pack_count} onChange={e => onChange('normalized_pack_count', e.target.value)} placeholder="e.g. 24" />
      </td>
      <td className="px-2 py-2">
        <Input className="h-7 text-xs" value={rule.normalized_flavor} onChange={e => onChange('normalized_flavor', e.target.value)} placeholder="e.g. vị cá" />
      </td>
      <td className="px-2 py-2">
        <Input className="h-7 text-xs" value={rule.normalized_type} onChange={e => onChange('normalized_type', e.target.value)} placeholder="e.g. pate" />
      </td>
      <td className="px-2 py-2">
        <Textarea className="text-xs min-h-[28px] h-7 resize-none py-1" value={rule.matching_keywords} onChange={e => onChange('matching_keywords', e.target.value)} placeholder="keywords, comma-sep" />
      </td>
      <td className="px-2 py-2 text-center">
        <button onClick={() => onChange('is_active', !rule.is_active)} className="text-muted-foreground hover:text-primary transition-colors">
          {rule.is_active ? <ToggleRight className="w-5 h-5 text-emerald-600" /> : <ToggleLeft className="w-5 h-5" />}
        </button>
      </td>
      <td className="px-2 py-2">
        <Input className="h-7 text-xs" value={rule.notes} onChange={e => onChange('notes', e.target.value)} placeholder="optional notes" />
      </td>
      <td className="px-2 py-2">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 text-primary" />}
          </Button>
          {!isNew && (
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onDelete}>
              <Trash2 className="w-3 h-3 text-red-500" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function VariantMatchRules() {
  const [rules, setRules] = useState([]);
  const [editStates, setEditStates] = useState({});
  const [newRule, setNewRule] = useState({ ...EMPTY_RULE });
  const [savingId, setSavingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const data = await base44.entities.VariantMatchRule.list('-created_date', 500);
    setRules(data);
    const states = {};
    for (const r of data) states[r.id] = { ...r };
    setEditStates(states);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveRule = async (id) => {
    setSavingId(id);
    const data = { ...editStates[id] };
    if (data.normalized_pack_count) data.normalized_pack_count = parseFloat(data.normalized_pack_count);
    await base44.entities.VariantMatchRule.update(id, data);
    toast({ title: 'Rule saved' });
    setSavingId(null);
  };

  const deleteRule = async (id) => {
    await base44.entities.VariantMatchRule.delete(id);
    setRules(r => r.filter(x => x.id !== id));
    toast({ title: 'Rule deleted' });
  };

  const saveNewRule = async () => {
    if (!newRule.sku) { toast({ title: 'SKU required', variant: 'destructive' }); return; }
    setSavingId('new');
    const data = { ...newRule };
    if (data.normalized_pack_count) data.normalized_pack_count = parseFloat(data.normalized_pack_count);
    const created = await base44.entities.VariantMatchRule.create(data);
    setRules(r => [created, ...r]);
    setEditStates(s => ({ ...s, [created.id]: { ...created } }));
    setNewRule({ ...EMPTY_RULE });
    toast({ title: 'Rule created' });
    setSavingId(null);
  };

  const updateEdit = (id, field, value) => {
    setEditStates(s => ({ ...s, [id]: { ...s[id], [field]: value } }));
  };

  const filtered = rules.filter(r =>
    !search || r.sku?.toLowerCase().includes(search.toLowerCase()) ||
    r.internal_variant_label?.toLowerCase().includes(search.toLowerCase())
  );

  const HEADERS = ['SKU *', 'Internal Label', 'Weight', 'Volume', 'Pack Count', 'Flavor', 'Type', 'Keywords', 'Active', 'Notes', ''];

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Variant Match Rules"
        subtitle="Map your internal SKU variants to external competitor variant dimensions"
        actions={
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input className="pl-8 h-8 text-xs" placeholder="Filter by SKU or label…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        }
      />

      {/* Matching Logic Reference */}
      <div className="mx-6 mt-4 mb-2 bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-800">
        <div className="flex items-center gap-2 mb-2 font-semibold">
          <GitMerge className="w-4 h-4" />
          Matching Priority Logic
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            { rank: '1', label: 'normalized_weight', eg: '"80g", "1kg"' },
            { rank: '2', label: 'normalized_pack_count', eg: '"x24", "combo 6"' },
            { rank: '3', label: 'normalized_type', eg: '"pate", "súp"' },
            { rank: '4', label: 'normalized_flavor', eg: '"vị cá", "gà"' },
            { rank: '5', label: 'matching_keywords', eg: 'fuzzy fallback' },
          ].map(m => (
            <div key={m.rank} className="bg-white/60 rounded-lg px-2 py-1.5">
              <span className="font-bold text-blue-700">#{m.rank}</span>
              <div className="font-mono text-[10px] mt-0.5">{m.label}</div>
              <div className="text-[10px] text-blue-600 italic">{m.eg}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-blue-600">Unmatched variants remain visible in the Crawl Center for manual review. Do not force a match when confidence is low.</p>
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-auto">
            <table className="w-full text-xs min-w-[1400px]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-muted/80 backdrop-blur">
                  {HEADERS.map(h => (
                    <th key={h} className="text-left px-2 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {/* New rule row */}
                <tr className="bg-emerald-50/40">
                  <td className="px-2 py-2"><Input className="h-7 text-xs font-mono" value={newRule.sku} onChange={e => setNewRule(r => ({ ...r, sku: e.target.value }))} placeholder="NEW SKU *" /></td>
                  <td className="px-2 py-2"><Input className="h-7 text-xs" value={newRule.internal_variant_label} onChange={e => setNewRule(r => ({ ...r, internal_variant_label: e.target.value }))} placeholder="Label" /></td>
                  <td className="px-2 py-2"><Input className="h-7 text-xs" value={newRule.normalized_weight} onChange={e => setNewRule(r => ({ ...r, normalized_weight: e.target.value }))} placeholder="Weight" /></td>
                  <td className="px-2 py-2"><Input className="h-7 text-xs" value={newRule.normalized_volume} onChange={e => setNewRule(r => ({ ...r, normalized_volume: e.target.value }))} placeholder="Volume" /></td>
                  <td className="px-2 py-2"><Input className="h-7 text-xs" type="number" value={newRule.normalized_pack_count} onChange={e => setNewRule(r => ({ ...r, normalized_pack_count: e.target.value }))} placeholder="Pack" /></td>
                  <td className="px-2 py-2"><Input className="h-7 text-xs" value={newRule.normalized_flavor} onChange={e => setNewRule(r => ({ ...r, normalized_flavor: e.target.value }))} placeholder="Flavor" /></td>
                  <td className="px-2 py-2"><Input className="h-7 text-xs" value={newRule.normalized_type} onChange={e => setNewRule(r => ({ ...r, normalized_type: e.target.value }))} placeholder="Type" /></td>
                  <td className="px-2 py-2"><Input className="h-7 text-xs" value={newRule.matching_keywords} onChange={e => setNewRule(r => ({ ...r, matching_keywords: e.target.value }))} placeholder="keywords" /></td>
                  <td className="px-2 py-2 text-center">
                    <button onClick={() => setNewRule(r => ({ ...r, is_active: !r.is_active }))} className="text-muted-foreground hover:text-primary">
                      {newRule.is_active ? <ToggleRight className="w-5 h-5 text-emerald-600" /> : <ToggleLeft className="w-5 h-5" />}
                    </button>
                  </td>
                  <td className="px-2 py-2"><Input className="h-7 text-xs" value={newRule.notes} onChange={e => setNewRule(r => ({ ...r, notes: e.target.value }))} placeholder="Notes" /></td>
                  <td className="px-2 py-2">
                    <Button size="sm" className="h-6 px-2 text-[10px]" onClick={saveNewRule} disabled={savingId === 'new'}>
                      {savingId === 'new' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3 mr-0.5" />}Add
                    </Button>
                  </td>
                </tr>

                {loading ? Array(4).fill(0).map((_, i) => (
                  <tr key={i}>{Array(11).fill(0).map((_, j) => <td key={j} className="px-2 py-3"><div className="h-3 bg-muted rounded animate-pulse" /></td>)}</tr>
                )) : filtered.length === 0 ? (
                  <tr><td colSpan={11} className="py-10 text-center text-muted-foreground text-xs">
                    <GitMerge className="w-6 h-6 mx-auto mb-1 opacity-20" />No rules yet. Add your first rule above.
                  </td></tr>
                ) : filtered.map(r => (
                  editStates[r.id] ? (
                    <RuleRow
                      key={r.id}
                      rule={editStates[r.id]}
                      onChange={(f, v) => updateEdit(r.id, f, v)}
                      onSave={() => saveRule(r.id)}
                      onDelete={() => deleteRule(r.id)}
                      saving={savingId === r.id}
                    />
                  ) : null
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}