import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2, Trash2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const IMPORTANT_FIELDS = [
  'name','category','cost','current_price','shopee_fee_rate','ops_fee','packing_fee',
  'fixed_fee','sku_role','combo_qty','min_price','max_price','status','notes',
  'market_low','market_avg','market_high','last_sold_at',
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('rate limit') || message.includes('too many requests') || message.includes('429');
}

async function withRateLimitRetry(operation) {
  let lastError;
  for (let attempt = 0; attempt <= 6; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRateLimitError(error) || attempt === 6) break;
      await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastError;
}

function pickBestRecord(records) {
  return records.slice().sort((a, b) => {
    const da = new Date(a.updated_date || a.created_date || 0).getTime();
    const db = new Date(b.updated_date || b.created_date || 0).getTime();
    return db - da;
  })[0];
}

function mergePayload(keeper, clones) {
  const merged = { ...keeper };
  for (const clone of clones) {
    for (const field of IMPORTANT_FIELDS) {
      const kv = merged[field];
      const cv = clone[field];
      const isEmpty = kv === null || kv === undefined || kv === '';
      if (isEmpty && cv !== null && cv !== undefined && cv !== '') {
        merged[field] = cv;
      }
    }
  }
  // only return the mergeable fields, not system fields
  const payload = {};
  for (const field of ['sku', ...IMPORTANT_FIELDS]) {
    if (merged[field] !== undefined) payload[field] = merged[field];
  }
  return payload;
}

export default function DedupeProductsModal({ open, onOpenChange, onDone }) {
  const [phase, setPhase] = useState('confirm'); // confirm | running | done
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState(null);

  const handleClose = (v) => {
    if (phase === 'running') return;
    setPhase('confirm');
    setResult(null);
    setProgress('');
    onOpenChange(v);
  };

  const runDedupe = async () => {
    setPhase('running');
    setProgress('Loading all products...');

    let totalProducts = 0;
    let duplicateSkuGroups = 0;
    let clonesDeleted = 0;
    let keepersUpdated = 0;
    const errors = [];
    const dedupeLog = [];

    try {
      // Load all products with pagination
      const pageSize = 500;
      let offset = 0;
      const all = [];
      while (true) {
        const page = await withRateLimitRetry(() =>
          base44.entities.Product.list('-updated_date', pageSize, offset)
        );
        if (!Array.isArray(page) || page.length === 0) break;
        all.push(...page);
        if (page.length < pageSize) break;
        offset += pageSize;
        setProgress(`Loaded ${all.length} products...`);
      }

      totalProducts = all.length;
      setProgress(`Loaded ${totalProducts} products. Grouping by SKU...`);

      // Group by normalized SKU
      const groups = {};
      for (const product of all) {
        const key = String(product.sku || '').trim().toUpperCase();
        if (!key) continue;
        if (!groups[key]) groups[key] = [];
        groups[key].push(product);
      }

      const dupGroups = Object.entries(groups).filter(([, records]) => records.length > 1);
      duplicateSkuGroups = dupGroups.length;
      setProgress(`Found ${duplicateSkuGroups} duplicate SKU groups. Cleaning up...`);

      let processed = 0;
      for (const [skuKey, records] of dupGroups) {
        processed += 1;
        setProgress(`Processing ${processed}/${duplicateSkuGroups}: ${skuKey}`);

        const keeper = pickBestRecord(records);
        const clones = records.filter((r) => r.id !== keeper.id);

        try {
          // Merge best data into keeper and update
          const mergedPayload = mergePayload(keeper, clones);
          await withRateLimitRetry(() => base44.entities.Product.update(keeper.id, mergedPayload));
          keepersUpdated += 1;

          // Delete all clones
          for (const clone of clones) {
            await withRateLimitRetry(() => base44.entities.Product.delete(clone.id));
            clonesDeleted += 1;
            await sleep(300);
          }

          dedupeLog.push({ sku: skuKey, kept: keeper.id, deleted: clones.length });
          console.log(`[Dedupe] SKU ${skuKey}: kept ${keeper.id}, deleted ${clones.length} clone(s)`);
        } catch (err) {
          errors.push({ sku: skuKey, error: err.message });
          console.error(`[Dedupe] Error on SKU ${skuKey}:`, err);
        }

        await sleep(400);
      }

      const summary = { totalProducts, duplicateSkuGroups, clonesDeleted, keepersUpdated, errors, dedupeLog };
      setResult(summary);
      setPhase('done');

      if (errors.length > 0) {
        toast.warning(`Dedupe finished with ${errors.length} error(s). Deleted ${clonesDeleted} clones.`);
      } else {
        toast.success(`Dedupe complete! Deleted ${clonesDeleted} duplicate records across ${duplicateSkuGroups} SKUs.`);
      }

      onDone?.();
    } catch (err) {
      toast.error('Dedupe failed: ' + err.message);
      setPhase('confirm');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Dedupe Product SKUs
          </DialogTitle>
        </DialogHeader>

        {phase === 'confirm' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-amber-800 space-y-1">
                <p className="font-semibold">This will permanently delete duplicate product records.</p>
                <p>For each SKU with multiple records, only the most recently updated record will be kept. Data from clones will be merged into the keeper before deletion.</p>
                <p className="font-medium">Only Product entity records are affected. Sales, market, and variant data are untouched.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button onClick={runDedupe} className="gap-2 bg-red-600 hover:bg-red-700">
                <Trash2 className="w-3.5 h-3.5" />Run Dedupe
              </Button>
            </div>
          </div>
        )}

        {phase === 'running' && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3">
              <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin flex-shrink-0" />
              <p className="text-sm text-muted-foreground">{progress}</p>
            </div>
            <p className="text-xs text-muted-foreground">Do not close this window while running...</p>
          </div>
        )}

        {phase === 'done' && result && (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-semibold text-emerald-800">Dedupe Complete</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Total Products', result.totalProducts, ''],
                  ['Duplicate Groups', result.duplicateSkuGroups, result.duplicateSkuGroups > 0 ? 'text-amber-600' : 'text-emerald-600'],
                  ['Clones Deleted', result.clonesDeleted, result.clonesDeleted > 0 ? 'text-red-600' : ''],
                  ['Keepers Updated', result.keepersUpdated, 'text-blue-700'],
                ].map(([label, val, cls]) => (
                  <div key={label} className="text-center bg-white rounded-lg p-3 border border-border">
                    <div className={cn('text-2xl font-bold', cls || 'text-foreground')}>{val}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
              {result.errors?.length > 0 && (
                <div className="mt-3 max-h-24 overflow-auto text-[11px] text-red-700 bg-red-50 rounded p-2">
                  {result.errors.map((e, i) => (
                    <div key={i}>{e.sku}: {e.error}</div>
                  ))}
                </div>
              )}
              {result.dedupeLog?.length > 0 && (
                <details className="mt-3">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">View dedupe log ({result.dedupeLog.length} SKUs cleaned)</summary>
                  <div className="mt-2 max-h-32 overflow-auto text-[11px] font-mono text-muted-foreground space-y-0.5">
                    {result.dedupeLog.map((e, i) => (
                      <div key={i}>{e.sku}: deleted {e.deleted} clone(s)</div>
                    ))}
                  </div>
                </details>
              )}
            </div>
            <div className="flex justify-end">
              <Button onClick={() => handleClose(false)}>Close</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}