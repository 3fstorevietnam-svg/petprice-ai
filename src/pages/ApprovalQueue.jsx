import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle2, XCircle, Eye, TestTube, AlertTriangle, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';

const ACTION_STYLES = {
  GIU_GIA:  { cls: 'bg-blue-100 text-blue-800',    label: 'GIỮ GIÁ' },
  TANG_GIA: { cls: 'bg-emerald-100 text-emerald-800', label: 'TĂNG GIÁ' },
  GIAM_GIA: { cls: 'bg-red-100 text-red-800',       label: 'GIẢM GIÁ' },
  GOM_COMBO:{ cls: 'bg-purple-100 text-purple-800',  label: 'GOM COMBO' },
  KILL_SKU: { cls: 'bg-gray-200 text-gray-700',      label: 'KILL SKU' },
};
const ADS_STYLES = {
  GIU_NGUYEN: { cls: 'bg-muted text-muted-foreground', label: 'Giữ Nguyên' },
  CHAY_ADS: { cls: 'bg-orange-100 text-orange-800', label: 'CHẠY ADS' },
  NGUNG_ADS: { cls: 'bg-yellow-100 text-yellow-800', label: 'NGỪNG ADS' },
  TEST_LAI_GIA_VA_CONTENT: { cls: 'bg-violet-100 text-violet-800', label: 'Test Lại' },
};

export default function ApprovalQueue() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState({});
  const [detailItem, setDetailItem] = useState(null);
  const [noteMap, setNoteMap] = useState({});

  const load = () => {
    setLoading(true);
    base44.entities.AISuggestion.filter({ status: 'pending' }, '-rec_date', 200).then(d => { setItems(d); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const act = async (id, status) => {
    setProcessing(p => ({ ...p, [id]: true }));
    await base44.entities.AISuggestion.update(id, { status, admin_note: noteMap[id] || undefined });
    const labels = { approved: '✅ Đã duyệt', rejected: '❌ Đã từ chối', testing: '🧪 Test 7 ngày' };
    toast.success(labels[status] || status);
    setItems(prev => prev.filter(i => i.id !== id));
    setProcessing(p => ({ ...p, [id]: false }));
  };

  const testPrice = async (item) => {
    // Create a price test log entry and mark as testing
    await base44.entities.PriceTestLog.create({
      sku: item.sku,
      old_price: item.current_price,
      test_price: item.suggested_price,
      test_start_date: format(new Date(), 'yyyy-MM-dd'),
      status: 'running',
      result_note: `AI Suggestion from ${item.rec_date}: ${item.reason?.slice(0, 200)}`,
    });
    await act(item.id, 'testing');
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader title="Price Approval Queue" subtitle={`${items.length} suggestions chờ phê duyệt`}
        actions={
          items.length > 0 && (
            <span className="text-xs text-muted-foreground">Admin must approve each action manually</span>
          )
        }
      />

      {items.length > 0 && (
        <div className="px-5 py-2 border-b border-border bg-orange-50/40 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-orange-500" />
          <p className="text-xs text-orange-700 font-medium">AI only creates suggestions. No changes are pushed to Shopee. Admin must approve manually.</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {loading ? Array(4).fill(0).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse h-32" />
        )) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <CheckCircle2 className="w-12 h-12 mb-3 opacity-20" />
            <p className="font-medium">Không có gợi ý nào chờ duyệt</p>
          </div>
        ) : items.map(item => {
          const actionStyle = ACTION_STYLES[item.suggested_action] || {};
          const adsStyle = ADS_STYLES[item.ads_action] || {};
          const isLosing = item.current_profit < 0 || item.current_margin < 0;
          const priceDelta = item.suggested_price && item.current_price ? parseFloat(item.suggested_price) - parseFloat(item.current_price) : null;

          return (
            <div key={item.id} className={cn(
              'bg-card border rounded-xl p-5 space-y-3 transition-shadow hover:shadow-sm',
              isLosing ? 'border-red-200 bg-red-50/20' :
              item.suggested_action === 'KILL_SKU' ? 'border-gray-300 bg-gray-50/40' :
              item.suggested_action === 'GOM_COMBO' ? 'border-purple-200 bg-purple-50/10' :
              'border-border'
            )}>
              {/* Header Row */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-base">{item.sku}</span>
                  <span className={cn('text-xs font-bold px-2.5 py-1 rounded-md border', actionStyle.cls)}>{actionStyle.label || item.suggested_action}</span>
                  {item.ads_action && item.ads_action !== 'GIU_NGUYEN' && (
                    <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', adsStyle.cls)}>{adsStyle.label}</span>
                  )}
                  {isLosing && <span className="flex items-center gap-1 text-xs text-red-600 font-semibold"><AlertTriangle className="w-3.5 h-3.5" />Đang lỗ</span>}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Ngày: {item.rec_date}</span>
                  {item.confidence && (
                    <span className="bg-muted px-2 py-0.5 rounded-full font-medium">Confidence: {item.confidence}%</span>
                  )}
                </div>
              </div>

              {/* Price Info */}
              <div className="flex items-center gap-6 text-sm flex-wrap">
                <div>
                  <p className="text-xs text-muted-foreground">Giá hiện tại</p>
                  <p className="font-mono font-bold">{item.current_price ? `₫${parseFloat(item.current_price).toLocaleString()}` : '—'}</p>
                </div>
                {item.suggested_price && (
                  <div>
                    <p className="text-xs text-muted-foreground">Giá đề xuất</p>
                    <div className="flex items-baseline gap-1.5">
                      <p className="font-mono font-bold text-primary">₫{parseFloat(item.suggested_price).toLocaleString()}</p>
                      {priceDelta !== null && (
                        <span className={cn('text-xs font-semibold', priceDelta > 0 ? 'text-emerald-600' : 'text-red-500')}>
                          {priceDelta > 0 ? '+' : ''}{((priceDelta / parseFloat(item.current_price)) * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {item.current_profit !== null && item.current_profit !== undefined && (
                  <div>
                    <p className="text-xs text-muted-foreground">Lợi nhuận</p>
                    <p className={cn('font-mono font-bold', item.current_profit < 0 ? 'text-red-600' : 'text-emerald-600')}>
                      ₫{parseFloat(item.current_profit).toLocaleString('vi-VN', { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                )}
                {item.current_margin !== null && item.current_margin !== undefined && (
                  <div>
                    <p className="text-xs text-muted-foreground">Margin</p>
                    <p className={cn('font-bold', item.current_margin < 0 ? 'text-red-600' : 'text-emerald-600')}>
                      {parseFloat(item.current_margin).toFixed(1)}%
                    </p>
                  </div>
                )}
                {item.suggested_combo_qty && (
                  <div>
                    <p className="text-xs text-muted-foreground">Combo Qty</p>
                    <p className="font-bold text-purple-700">{item.suggested_combo_qty}</p>
                  </div>
                )}
              </div>

              {/* Reason */}
              {item.reason && (
                <div className="bg-muted/40 rounded-lg px-4 py-2.5">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Lý do AI:</p>
                  <p className="text-sm text-foreground leading-relaxed">{item.reason}</p>
                </div>
              )}

              {/* Admin Note */}
              <div>
                <Textarea
                  placeholder="Ghi chú của admin (tuỳ chọn)..."
                  className="text-xs h-14 resize-none"
                  value={noteMap[item.id] || ''}
                  onChange={e => setNoteMap(m => ({ ...m, [item.id]: e.target.value }))}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-5 gap-2"
                  onClick={() => act(item.id, 'approved')}
                  disabled={processing[item.id]}
                >
                  <CheckCircle2 className="w-4 h-4" />Duyệt Giá
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-200 text-red-600 hover:bg-red-50 font-semibold gap-2"
                  onClick={() => act(item.id, 'rejected')}
                  disabled={processing[item.id]}
                >
                  <XCircle className="w-4 h-4" />Từ Chối
                </Button>
                {item.suggested_price && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-blue-200 text-blue-700 hover:bg-blue-50 font-semibold gap-2"
                    onClick={() => testPrice(item)}
                    disabled={processing[item.id]}
                  >
                    <TestTube className="w-4 h-4" />Test Giá 7 Ngày
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground gap-1.5"
                  onClick={() => setDetailItem(item)}
                >
                  <Eye className="w-4 h-4" />Xem Lý Do
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail Modal */}
      <Dialog open={!!detailItem} onOpenChange={() => setDetailItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Chi tiết gợi ý — {detailItem?.sku}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="bg-muted/30 rounded-lg p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Lý do đầy đủ</p>
              <p className="text-sm leading-relaxed">{detailItem?.reason || '—'}</p>
            </div>
            {detailItem?.admin_note && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-xs font-semibold text-blue-700 mb-1">Ghi chú admin</p>
                <p className="text-sm">{detailItem.admin_note}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}