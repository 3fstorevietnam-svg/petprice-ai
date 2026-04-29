import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Package, BarChart3, Brain, 
  CheckSquare, Layers, Skull, TrendingUp, Settings,
  ChevronRight, Bell, Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const navItems = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/daily-performance', label: 'Daily Performance', icon: BarChart3 },
  { to: '/ai-suggestions', label: 'AI Suggestions', icon: Brain, badge: 'live' },
  { to: '/approval-queue', label: 'Approval Queue', icon: CheckSquare, badge: 'queue' },
  { to: '/combo-builder', label: 'Combo Builder', icon: Layers },
  { to: '/kill-list', label: 'SKU Kill List', icon: Skull },
  { to: '/performance', label: 'Performance', icon: TrendingUp },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout() {
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-sidebar flex flex-col border-r border-sidebar-border">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sidebar-accent-foreground font-semibold text-sm leading-tight">AI Pricing</p>
              <p className="text-sidebar-foreground text-xs">Shopee Pet</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <p className="text-sidebar-foreground/50 text-[10px] font-semibold uppercase tracking-widest px-3 mb-2">Menu</p>
          {navItems.map(({ to, label, icon: Icon, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => cn('sidebar-item', isActive ? 'sidebar-item-active' : 'sidebar-item-inactive')}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 text-sm">{label}</span>
              {badge === 'live' && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              )}
              {badge === 'queue' && (
                <PendingBadge />
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-sidebar-border">
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-xs text-sidebar-primary font-semibold">A</span>
            </div>
            <div>
              <p className="text-sidebar-accent-foreground text-xs font-medium">Admin</p>
              <p className="text-sidebar-foreground/60 text-[10px]">Shopee Pet Store</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}

function PendingBadge() {
  return (
    <span className="bg-orange-500/20 text-orange-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
      !
    </span>
  );
}