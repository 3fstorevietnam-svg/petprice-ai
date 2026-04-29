import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import {
  Download, Play, RefreshCw, EyeOff, Search, Dna, ExternalLink,
  CheckCircle2, Clock, AlertCircle, XCircle, Loader2
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const STATUS_CONFIG = {
  pending:  { label: 'Pending',  cls: 'bg-yellow-100 text-yellow-800', icon: Clock },
  queued:   { label: 'Queued',   cls: 'bg-blue-100 text-blue-800',   icon: Loader2 },
  crawled:  { label: 'Crawled',  cls: 'bg-emerald-100 text-emerald-800', icon: CheckCircle2 },
  failed:   { label: 'Failed',   cls: 'bg-red-100 text-red-800',     icon: AlertCircle },
  ignored:  { label: 'Ignored',  cls: 'bg-gray-100 text-gray-500',   icon: XCircle },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full', cfg.cls)}>
      <Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  );
}

export default function VariantSeedManager() {
  const [seeds, setSeeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const data = await base44.entities.MarketProductSeed.list('-created_date', 500);
    setSeeds(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const runFn = async (fnName, label) => {
    setBusy(fnName);
    try {
      const res = await base44.functions.invoke(fnName, {});
      toast({ title: `${label} complete`, description: res.data?.note || JSON.stringify(res.data || {}).slice(0, 120) });
      await load();
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setBusy(null);
  };

  const updateStatus = async (id, crawl_status) => {
    await base44.entities.MarketProductSeed.update(id, { crawl_status });
    setSeeds(s => s.map(x => x.id === id ? { ...x, crawl_status } : x));
  };

  const filtered = seeds.filter(s => {
    const matchStatus = filterStatus === 'all' || s.crawl_status === filterStatus;
    const matchSearch = !search || s.sku?.toLowerCase().includes(search.toLowerCase()) ||
      s.product_name?.toLowerCase().includes(search.toLowerCase()) ||
      s.shop_name?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const counts = seeds.reduce((acc, s) => { acc[s.crawl_status] = (acc[s.crawl_status] || 0) + 1; return acc; }, {});

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Variant Seed Manager"
        subtitle="Product links used as deep crawl seeds for variant-level analysis"
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => runFn('importMarketSeedsFromParentData', 'Import Seeds')} disabled={!!busy}>
              {busy === 'importMarketSeedsFromParentData' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Import Seeds
            </Button>
            <Button size="sm" onClick={() => runFn('queueVariantCrawl', 'Queue Crawl')} disabled={!!busy}>
              {busy === 'queueVariantCrawl' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              Queue Crawl
            </Button>
          </div>
        }
      />

      {/* Filter bar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-muted/30">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input className="pl-8 h-8 text-xs" placeholder="Filter by SKU, name, shop..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1.5">
          {['all', 'pending', 'queued', 'crawled', 'failed', 'ignored'].map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={cn('text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors', filterStatus === s ? 'bg-primary text-white border-primary' : 'border-border text-muted-foreground hover:border-primary/50')}
            >
              {s === 'all' ? `All (${seeds.length})` : `${STATUS_CONFIG[s]?.label} (${counts[s] || 0})`}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs min-w-[1200px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-muted/80 backdrop-blur">
              {['SKU', 'Product Name', 'Shop', 'Parent Price', 'Var Min', 'Var Max', 'Sold', 'Needs Variant?', 'Status', 'Last Crawled', 'Error', 'Actions'].map(h => (
                <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? Array(6).fill(0).map((_, i) => (
              <tr key={i}>{Array(12).fill(0).map((_, j) => <td key={j} className="px-3 py-3"><div className="h-3 bg-muted rounded animate-pulse" /></td>)}</tr>
            )) : filtered.length === 0 ? (
              <tr><td colSpan={12} className="py-16 text-center text-muted-foreground">
                <Dna className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p>No seeds found. Import from parent market data to get started.</p>
              </td></tr>
            ) : filtered.map(s => (
              <tr key={s.id} className={cn('hover:bg-muted/20 transition-colors', s.crawl_status === 'failed' && 'bg-red-50')}>
                <td className="px-3 py-2.5 font-mono font-semibold">{s.sku || '—'}</td>
                <td className="px-3 py-2.5 max-w-[180px]">
                  <div className="flex items-center gap-1">
                    <span className="truncate">{s.product_name || '—'}</span>
                    {s.product_link && (
                      <a href={s.product_link} target="_blank" rel="noreferrer">
                        <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-primary flex-shrink-0" />
                      </a>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground truncate max-w-[120px]">{s.shop_name || '—'}</td>
                <td className="px-3 py-2.5 font-mono">{s.parent_price ? `₫${parseFloat(s.parent_price).toLocaleString()}` : '—'}</td>
                <td className="px-3 py-2.5 font-mono text-muted-foreground">{s.variant_price_min ? `₫${parseFloat(s.variant_price_min).toLocaleString()}` : '—'}</td>
                <td className="px-3 py-2.5 font-mono text-muted-foreground">{s.variant_price_max ? `₫${parseFloat(s.variant_price_max).toLocaleString()}` : '—'}</td>
                <td className="px-3 py-2.5 text-center">{s.sold_count?.toLocaleString() || '—'}</td>
                <td className="px-3 py-2.5 text-center">
                  {s.needs_variant_analysis
                    ? <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">Yes</span>
                    : <span className="text-[10px] text-muted-foreground">No</span>}
                </td>
                <td className="px-3 py-2.5"><StatusBadge status={s.crawl_status} /></td>
                <td className="px-3 py-2.5 text-muted-foreground text-[10px]">
                  {s.last_crawled_at ? new Date(s.last_crawled_at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                </td>
                <td className="px-3 py-2.5 max-w-[160px]">
                  {s.last_error ? <span className="text-[10px] text-red-600 truncate block" title={s.last_error}>{s.last_error.slice(0, 60)}…</span> : '—'}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1">
                    {s.crawl_status === 'failed' && (
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 text-blue-600" onClick={() => updateStatus(s.id, 'pending')}>
                        <RefreshCw className="w-2.5 h-2.5 mr-0.5" />Retry
                      </Button>
                    )}
                    {s.crawl_status !== 'ignored' && (
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 text-muted-foreground" onClick={() => updateStatus(s.id, 'ignored')}>
                        <EyeOff className="w-2.5 h-2.5 mr-0.5" />Ignore
                      </Button>
                    )}
                    {s.crawl_status === 'ignored' && (
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 text-emerald-600" onClick={() => updateStatus(s.id, 'pending')}>
                        Restore
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}