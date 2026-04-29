import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import ActionBadge from '@/components/ActionBadge';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Clock, AlertTriangle, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function ApprovalQueue() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState({});

  const load = async () => {
    setLoading(true);
    const data = await base44.entities.AISuggestion.filter({ status: 'pending' }, '-created_date', 100);
    setItems(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const act = async (id, status) => {
    setProcessing(p => ({ ...p, [id]: true }));
    await base44.entities.AISuggestion.update(id, { status, reviewed_at: new Date().toISOString() });
    toast.success(status === 'approved' ? '✓ Approved' : '✕ Rejected');
    setItems(prev => prev.filter(i => i.id !== id));
    setProcessing(p => ({ ...p, [id]: false }));
  };

  const approveAll = async () => {
    const criticalFirst = [...items].sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[a.priority] - order[b.priority];
    });
    for (const item of criticalFirst) {
      await base44.entities.AISuggestion.update(item.id, { status: 'approved', reviewed_at: new Date().toISOString() });
    }
    toast.success(`Approved ${items.length} suggestions`);
    setItems([]);
  };

  const criticalCount = items.filter(i => i.priority === 'critical').length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Approval Queue"
        subtitle={`${items.length} suggestions waiting for manual review`}
        actions={
          items.length > 0 && (
            <Button size="sm" variant="outline" onClick={approveAll}>
              <CheckSquare className="w-4 h-4 mr-1.5" />Approve All
            </Button>
          )
        }
      />

      {criticalCount > 0 && (
        <div className="mx-6 mt-4 flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-3">
          <AlertTriangle className="w-4 h-4 text-red-600" />
          <p className="text-sm font-medium text-red-800">{criticalCount} critical items need immediate action</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {loading ? (
          Array(5).fill(0).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse">
              <div className="h-5 bg-muted rounded w-48 mb-2" />
              <div className="h-4 bg-muted rounded w-full mb-3" />
              <div className="flex gap-2">
                <div className="h-8 bg-muted rounded flex-1" />
                <div className="h-8 bg-muted rounded flex-1" />
              </div>
            </div>
          ))
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <CheckCircle className="w-12 h-12 mb-3 opacity-20" />
            <p className="font-medium">All clear!</p>
            <p className="text-sm mt-1">No suggestions pending approval</p>
          </div>
        ) : (
          items.map(item => (
            <div key={item.id} className={cn(
              'bg-card border rounded-xl p-5 transition-all',
              item.priority === 'critical' ? 'border-red-200 bg-red-50/30' : 'border-border'
            )}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  {item.priority === 'critical' && <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-sm">{item.product_name || item.sku_code}</span>
                      <span className="font-mono text-xs text-muted-foreground">{item.sku_code}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ActionBadge action={item.action} />
                      <span className={cn('text-xs px-2 py-0.5 rounded border font-medium',
                        item.priority === 'critical' ? 'text-red-600 bg-red-50 border-red-200' :
                        item.priority === 'high' ? 'text-orange-600 bg-orange-50 border-orange-200' :
                        'text-blue-600 bg-blue-50 border-blue-200'
                      )}>{item.priority}</span>
                    </div>
                  </div>
                </div>

                {item.suggested_price && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">₫{(item.current_price || 0).toLocaleString()} → </p>
                    <p className={cn('font-mono font-bold text-sm', item.action === 'TANG_GIA' ? 'text-emerald-600' : 'text-red-500')}>
                      ₫{item.suggested_price.toLocaleString()}
                    </p>
                  </div>
                )}
              </div>

              <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{item.reasoning}</p>

              <div className="flex gap-2">
                <Button
                  size="sm" variant="outline"
                  className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
                  onClick={() => act(item.id, 'rejected')}
                  disabled={processing[item.id]}
                >
                  <XCircle className="w-3.5 h-3.5 mr-1.5" />Reject
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => act(item.id, 'approved')}
                  disabled={processing[item.id]}
                >
                  <CheckCircle className="w-3.5 h-3.5 mr-1.5" />Approve
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}