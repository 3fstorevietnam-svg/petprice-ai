import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import ActionBadge from '@/components/ActionBadge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  DollarSign, ShoppingCart, TrendingUp, AlertTriangle, 
  Brain, Clock, ArrowRight, CheckCircle, XCircle, Zap
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';

export default function Dashboard() {
  const [suggestions, setSuggestions] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.AISuggestion.filter({ status: 'pending' }, '-created_date', 10),
      base44.entities.Product.list('-created_date', 20),
    ]).then(([sugg, prods]) => {
      setSuggestions(sugg);
      setProducts(prods);
    }).finally(() => setLoading(false));
  }, []);

  const activeProducts = products.filter(p => p.status === 'active').length;
  const criticalSuggestions = suggestions.filter(s => s.priority === 'critical').length;
  const pendingApprovals = suggestions.length;

  const actionCounts = suggestions.reduce((acc, s) => {
    acc[s.action] = (acc[s.action] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Overview Dashboard"
        subtitle={`Today — ${format(new Date(), 'dd MMM yyyy')}`}
        actions={
          <Button size="sm" asChild>
            <Link to="/ai-suggestions"><Brain className="w-4 h-4 mr-1.5" />Run AI Analysis</Link>
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Active SKUs" value={activeProducts} icon={ShoppingCart} sub="Products being sold" />
          <StatCard label="Pending Approvals" value={pendingApprovals} icon={Clock} accent sub="Waiting for review" trendValue={criticalSuggestions > 0 ? `${criticalSuggestions} critical` : null} trend="down" />
          <StatCard label="Today Revenue" value="—" icon={DollarSign} sub="No data imported yet" />
          <StatCard label="Today Net Profit" value="—" icon={TrendingUp} sub="No data imported yet" />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Pending Suggestions */}
          <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-primary" />
                <h2 className="font-semibold text-sm">AI Suggestions — Pending Approval</h2>
                {pendingApprovals > 0 && (
                  <Badge variant="secondary" className="text-xs">{pendingApprovals}</Badge>
                )}
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/approval-queue">View all <ArrowRight className="w-3 h-3 ml-1" /></Link>
              </Button>
            </div>

            <div className="divide-y divide-border">
              {loading ? (
                Array(4).fill(0).map((_, i) => (
                  <div key={i} className="px-5 py-3.5 flex items-center gap-4 animate-pulse">
                    <div className="h-4 bg-muted rounded w-24" />
                    <div className="h-4 bg-muted rounded w-16" />
                    <div className="h-4 bg-muted rounded flex-1" />
                  </div>
                ))
              ) : suggestions.length === 0 ? (
                <div className="px-5 py-10 text-center text-muted-foreground text-sm">
                  <Brain className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No pending suggestions. Run AI analysis to generate recommendations.
                </div>
              ) : (
                suggestions.slice(0, 6).map(s => (
                  <div key={s.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-muted/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{s.product_name || s.sku_code}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{s.reasoning?.slice(0, 60)}...</p>
                    </div>
                    <ActionBadge action={s.action} />
                    {s.priority === 'critical' && (
                      <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Action Summary */}
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="font-semibold text-sm mb-4">Action Breakdown</h2>
              <div className="space-y-2.5">
                {Object.entries(actionCounts).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No actions queued.</p>
                ) : (
                  Object.entries(actionCounts).map(([action, count]) => (
                    <div key={action} className="flex items-center justify-between">
                      <ActionBadge action={action} />
                      <span className="text-sm font-semibold text-foreground">{count}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Quick Links */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="font-semibold text-sm mb-3">Quick Actions</h2>
              <div className="space-y-2">
                {[
                  { to: '/approval-queue', label: 'Review Approval Queue', icon: CheckCircle },
                  { to: '/kill-list', label: 'Check Kill List', icon: XCircle },
                  { to: '/combo-builder', label: 'Build Combo', icon: Zap },
                ].map(({ to, label, icon: Icon }) => (
                  <Button key={to} variant="outline" size="sm" className="w-full justify-start" asChild>
                    <Link to={to}><Icon className="w-3.5 h-3.5 mr-2" />{label}</Link>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Urgent Issues Banner */}
        {criticalSuggestions > 0 && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-4">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">
                {criticalSuggestions} critical suggestion{criticalSuggestions > 1 ? 's' : ''} require immediate review
              </p>
              <p className="text-xs text-red-600 mt-0.5">These SKUs may be losing significant profit — please review now</p>
            </div>
            <Button size="sm" variant="destructive" asChild>
              <Link to="/approval-queue">Review Now</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}