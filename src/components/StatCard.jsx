import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function StatCard({ label, value, sub, trend, trendValue, icon: Icon, accent = false, className }) {
  const trendPositive = trend === 'up';
  const trendNeutral = trend === 'neutral';

  return (
    <div className={cn(
      'bg-card border border-border rounded-xl p-5 flex flex-col gap-3 hover:shadow-sm transition-shadow',
      accent && 'border-primary/30 bg-accent/30',
      className
    )}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
        {Icon && (
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', accent ? 'bg-primary/10' : 'bg-muted')}>
            <Icon className={cn('w-4 h-4', accent ? 'text-primary' : 'text-muted-foreground')} />
          </div>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground tracking-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
      {trendValue && (
        <div className={cn(
          'flex items-center gap-1 text-xs font-medium',
          trendNeutral ? 'text-muted-foreground' : trendPositive ? 'text-emerald-600' : 'text-red-500'
        )}>
          {trendNeutral ? <Minus className="w-3 h-3" /> : trendPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {trendValue}
        </div>
      )}
    </div>
  );
}