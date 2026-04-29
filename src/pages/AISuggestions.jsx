import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import ActionBadge from '@/components/ActionBadge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Brain, Sparkles, RefreshCw, AlertTriangle, ChevronRight, TrendingUp, TrendingDown, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const PRIORITY_COLORS = {
  critical: 'text-red-600 bg-red-50 border-red-200',
  high: 'text-orange-600 bg-orange-50 border-orange-200',
  medium: 'text-blue-600 bg-blue-50 border-blue-200',
  low: 'text-gray-500 bg-gray-50 border-gray-200',
};

export default function AISuggestions() {
  const [suggestions, setSuggestions] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [actionFilter, setActionFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    const [sugg, prods] = await Promise.all([
      base44.entities.AISuggestion.list('-created_date', 100),
      base44.entities.Product.filter({ status: 'active' }, '-created_date', 200),
    ]);
    setSuggestions(sugg);
    setProducts(prods);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const generateSuggestions = async () => {
    if (products.length === 0) { toast.error('Add products first before generating suggestions.'); return; }
    setGenerating(true);
    try {
      const res = await base44.functions.invoke('generateAISuggestions', { product_ids: products.map(p => p.id) });
      toast.success(`Generated ${res.data?.created || 0} new suggestions`);
      load();
    } catch (e) {
      toast.error('Failed to generate suggestions');
    } finally {
      setGenerating(false);
    }
  };

  const filtered = suggestions.filter(s => {
    if (actionFilter !== 'all' && s.action !== actionFilter) return false;
    if (priorityFilter !== 'all' && s.priority !== priorityFilter) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="AI Suggestions"
        subtitle={`${suggestions.filter(s => s.status === 'pending').length} pending review`}
        actions={
          <div className="flex items-center gap-2">
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="h-8 text-sm w-36"><SelectValue placeholder="All actions" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {['GIU_GIA','TANG_GIA','GIAM_GIA','GOM_COMBO','KILL_SKU','CHAY_ADS','NGUNG_ADS'].map(a => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="h-8 text-sm w-32"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={generateSuggestions} disabled={generating}>
              {generating ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
              {generating ? 'Generating...' : 'Run AI Analysis'}
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {loading ? (
          Array(6).fill(0).map((_, i) => (
            <div key={i} className="px-6 py-4 flex items-center gap-4 animate-pulse">
              <div className="h-5 bg-muted rounded w-20" />
              <div className="h-5 bg-muted rounded w-40 flex-1" />
              <div className="h-5 bg-muted rounded w-24" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Brain className="w-12 h-12 mb-3 opacity-20" />
            <p className="font-medium">No suggestions yet</p>
            <p className="text-sm mt-1">Click "Run AI Analysis" to generate pricing suggestions</p>
          </div>
        ) : (
          filtered.map(s => (
            <div key={s.id}
              className="px-6 py-4 flex items-center gap-4 hover:bg-muted/20 transition-colors cursor-pointer"
              onClick={() => setSelected(s)}
            >
              <div className={cn('flex-shrink-0 w-2 h-2 rounded-full', {
                'bg-red-500': s.priority === 'critical',
                'bg-orange-500': s.priority === 'high',
                'bg-blue-500': s.priority === 'medium',
                'bg-gray-400': s.priority === 'low',
              })} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-sm text-foreground">{s.product_name || s.sku_code}</span>
                  <span className="font-mono text-xs text-muted-foreground">{s.sku_code}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{s.reasoning}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <ActionBadge action={s.action} />
                {s.suggested_price && (
                  <div className="text-right">
                    <p className="font-mono text-xs text-muted-foreground">₫{(s.current_price || 0).toLocaleString()}</p>
                    <p className={cn('font-mono text-sm font-semibold', s.action === 'TANG_GIA' ? 'text-emerald-600' : 'text-red-500')}>
                      → ₫{s.suggested_price.toLocaleString()}
                    </p>
                  </div>
                )}
                <span className={cn('text-xs px-2 py-0.5 rounded border font-medium', PRIORITY_COLORS[s.priority])}>
                  {s.priority}
                </span>
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                  s.status === 'pending' ? 'bg-orange-100 text-orange-700' :
                  s.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                  s.status === 'rejected' ? 'bg-red-100 text-red-700' :
                  'bg-muted text-muted-foreground'
                )}>
                  {s.status}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Detail Drawer */}
      {selected && (
        <SuggestionDetail suggestion={selected} onClose={() => setSelected(null)} onRefresh={load} />
      )}
    </div>
  );
}

function SuggestionDetail({ suggestion: s, onClose, onRefresh }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const act = async (status) => {
    setSaving(true);
    await base44.entities.AISuggestion.update(s.id, { status, admin_note: note, reviewed_at: new Date().toISOString() });
    toast.success(status === 'approved' ? 'Suggestion approved' : 'Suggestion rejected');
    onRefresh();
    onClose();
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-semibold text-lg">{s.product_name || s.sku_code}</h3>
            <p className="text-xs text-muted-foreground font-mono">{s.sku_code}</p>
          </div>
          <ActionBadge action={s.action} size="md" />
        </div>

        <div className="space-y-3 mb-4">
          <div className="bg-muted/40 rounded-lg p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-1">AI Reasoning</p>
            <p className="text-sm text-foreground">{s.reasoning}</p>
          </div>

          {s.suggested_price && (
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <p className="text-xs text-muted-foreground">Current Price</p>
                <p className="font-mono font-semibold text-sm mt-1">₫{(s.current_price || 0).toLocaleString()}</p>
              </div>
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <p className="text-xs text-muted-foreground">Suggested Price</p>
                <p className="font-mono font-semibold text-sm mt-1">₫{s.suggested_price.toLocaleString()}</p>
              </div>
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <p className="text-xs text-muted-foreground">Change</p>
                <p className={cn('font-mono font-semibold text-sm mt-1', (s.price_delta || 0) > 0 ? 'text-emerald-600' : 'text-red-500')}>
                  {(s.price_delta || 0) > 0 ? '+' : ''}{(s.price_delta_pct || 0).toFixed(1)}%
                </p>
              </div>
            </div>
          )}

          {s.signals?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Signals</p>
              <div className="flex flex-wrap gap-1.5">
                {s.signals.map((sig, i) => (
                  <span key={i} className="text-xs bg-accent text-accent-foreground px-2 py-0.5 rounded-full">{sig}</span>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1.5">Admin Note</p>
            <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note..." className="text-sm h-20 resize-none" />
          </div>
        </div>

        {s.status === 'pending' && (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => act('rejected')} disabled={saving}>Reject</Button>
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => act('approved')} disabled={saving}>
              Approve
            </Button>
          </div>
        )}

        {s.status !== 'pending' && (
          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        )}
      </div>
    </div>
  );
}