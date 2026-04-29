import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Skull, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function KillList() {
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState({});

  const load = () => {
    setLoading(true);
    Promise.all([
      base44.entities.AISuggestion.filter({ suggested_action: 'KILL_SKU' }, '-rec_date', 200),
      base44.entities.Product.list('-created_date', 200),
    ]).then(([sugg, prods]) => {
      setItems(sugg);
      setProducts(prods);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const productMap = products.reduce((acc, p) => { acc[p.sku] = p; return acc; }, {});

  const act = async (id, status) => {
    setProcessing(p => ({ ...p, [id]: true }));
    await base44.entities.AISuggestion.update(id, { status });
    toast.success(status === 'approved' ? '✅ Đã xác nhận kill SKU' : '❌ Đã từ chối');
    load();
    setProcessing(p => ({ ...p, [id]: false }));
  };

  const killProduct = async (sku) => {
    const p = productMap[sku];
    if (p) { await base44.entities.Product.update(p.id, { status: 'killed' }); toast.success(`SKU ${sku} đã được đánh dấu killed`); load(); }
  };

  const pending = items.filter(i => i.status === 'pending');
  const approved = items.filter(i => i.status === 'approved');
  const others = items.filter(i => !['pending','approved'].includes(i.status));

  function ItemCard({ item, showActions }) {
    const p = productMap[item.sku];
    const isKilled = p?.status === 'killed';
    return (
      <div className={cn('bg-card border rounded-xl p-5 space-y-3', isKilled ? 'border-gray-200 bg-gray-50 opacity-70' : 'border-red-200 bg-red-50/20')}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Skull className={cn('w-5 h-5 flex-shrink-0', isKilled ? 'text-gray-400' : 'text-red-500')} />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-base">{item.sku}</span>
                {p && <span className="text-sm text-muted-foreground">— {p.name}</span>}
                {isKilled && <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-semibold">KILLED</span>}
                {!isKilled && p?.status === 'paused' && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-semibold">PAUSED</span>}
              </div>
              <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                {p?.current_price && <span>Giá: <span className="font-mono text-foreground">₫{parseFloat(p.current_price).toLocaleString()}</span></span>}
                {p?.cost && <span>Vốn: <span className="font-mono text-foreground">₫{parseFloat(p.cost).toLocaleString()}</span></span>}
                {item.current_margin !== null && item.current_margin !== undefined && (
                  <span className={cn('font-semibold', item.current_margin < 0 ? 'text-red-600' : 'text-muted-foreground')}>
                    Margin: {parseFloat(item.current_margin).toFixed(1)}%
                  </span>
                )}
                <span>Ngày gợi ý: {item.rec_date}</span>
                {item.confidence && <span>Confidence: {item.confidence}%</span>}
              </div>
            </div>
          </div>
          <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full',
            item.status === 'pending' ? 'bg-orange-100 text-orange-700' :
            item.status === 'approved' ? 'bg-red-100 text-red-700' :
            item.status === 'rejected' ? 'bg-muted text-muted-foreground' : 'bg-muted text-muted-foreground'
          )}>{item.status}</span>
        </div>

        {item.reason && (
          <div className="bg-white/70 border border-red-100 rounded-lg px-4 py-2.5">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Lý do AI:</p>
            <p className="text-sm text-foreground leading-relaxed">{item.reason}</p>
          </div>
        )}

        {showActions && !isKilled && (
          <div className="flex items-center gap-2 pt-1">
            {item.status === 'pending' && (
              <>
                <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white font-semibold gap-2"
                  onClick={() => act(item.id, 'approved')} disabled={processing[item.id]}>
                  <Skull className="w-3.5 h-3.5" />Xác nhận Kill
                </Button>
                <Button size="sm" variant="outline" className="border-gray-200 text-gray-600 gap-2"
                  onClick={() => act(item.id, 'rejected')} disabled={processing[item.id]}>
                  <XCircle className="w-3.5 h-3.5" />Không Kill
                </Button>
              </>
            )}
            {item.status === 'approved' && (
              <Button size="sm" className="bg-gray-800 hover:bg-gray-900 text-white font-semibold gap-2"
                onClick={() => killProduct(item.sku)} disabled={processing[item.id]}>
                <Skull className="w-3.5 h-3.5" />Đánh Dấu Killed Trên App
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader title="SKU Kill List" subtitle={`${pending.length} chờ quyết định, ${approved.length} đã xác nhận kill`} />

      <div className="flex items-center gap-4 px-5 py-2 border-b border-border bg-red-50/30">
        <AlertTriangle className="w-4 h-4 text-red-500" />
        <p className="text-xs text-red-700 font-medium">Danh sách các SKU AI đề nghị ngừng kinh doanh. Admin phải xác nhận trước khi thực hiện.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {loading ? (
          Array(3).fill(0).map((_, i) => <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse h-32" />)
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <CheckCircle className="w-12 h-12 mb-3 opacity-20" />
            <p className="font-medium">Không có SKU nào cần kill</p>
          </div>
        ) : (
          <>
            {pending.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-orange-700 mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Chờ quyết định ({pending.length})</h2>
                <div className="space-y-3">{pending.map(item => <ItemCard key={item.id} item={item} showActions />)}</div>
              </div>
            )}
            {approved.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-red-700 mb-3 flex items-center gap-2"><Skull className="w-4 h-4" />Đã xác nhận kill ({approved.length})</h2>
                <div className="space-y-3">{approved.map(item => <ItemCard key={item.id} item={item} showActions />)}</div>
              </div>
            )}
            {others.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground mb-3">Đã xử lý ({others.length})</h2>
                <div className="space-y-3">{others.map(item => <ItemCard key={item.id} item={item} showActions={false} />)}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}