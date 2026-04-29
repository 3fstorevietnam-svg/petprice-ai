import { Outlet, NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Package, BarChart3, Brain,
  CheckSquare, Layers, Skull, TrendingUp, Settings,
  TestTube, Zap, Globe, Wifi, Dna, Microscope, GitMerge
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/approval-queue', label: 'Approval Queue', icon: CheckSquare, highlight: true },
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/ai-suggestions', label: 'AI Suggestions', icon: Brain, pulse: true },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/daily-performance', label: 'Daily Performance', icon: BarChart3 },
  { to: '/combo-builder', label: 'Combo Builder', icon: Layers },
  { to: '/kill-list', label: 'SKU Kill List', icon: Skull },
  { to: '/performance', label: 'Performance', icon: TrendingUp },
  { to: '/price-test-log', label: 'Price Test Log', icon: TestTube },
  { to: '/settings', label: 'App Settings', icon: Settings },
  { to: '/market-connection', label: 'Market Connection', icon: Wifi, section: 'market' },
  { to: '/competitor-sync', label: 'Competitor Sync', icon: Globe, section: 'market' },
  { to: '/variant-seeds', label: 'Variant Seeds', icon: Dna, section: 'variant' },
  { to: '/variant-crawl', label: 'Variant Crawl', icon: Microscope, section: 'variant' },
  { to: '/variant-match', label: 'Match Rules', icon: GitMerge, section: 'variant' },
];

export default function Layout() {
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <aside className="w-56 flex-shrink-0 bg-sidebar flex flex-col border-r border-sidebar-border">
        {/* Logo */}
        <div className="px-4 py-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-sidebar-accent-foreground font-semibold text-xs leading-tight">AI Pricing</p>
              <p className="text-sidebar-foreground/60 text-[10px]">Shopee Pet</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map(({ to, label, icon: Icon, pulse, highlight, section }, idx) => {
            const isFirstMarket = section === 'market' && navItems[idx - 1]?.section !== 'market';
            const isFirstVariant = section === 'variant' && navItems[idx - 1]?.section !== 'variant';
            return (
              <div key={to}>
                {isFirstMarket && (
                  <div className="pt-2 pb-1 px-3">
                    <p className="text-[9px] font-bold text-sidebar-foreground/40 uppercase tracking-widest">Market Intel</p>
                  </div>
                )}
                {isFirstVariant && (
                  <div className="pt-2 pb-1 px-3">
                    <p className="text-[9px] font-bold text-sidebar-foreground/40 uppercase tracking-widest">Variant Deep Crawl</p>
                  </div>
                )}
                <NavLink
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) => cn(
                    'flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : highlight
                        ? 'text-orange-300 hover:bg-sidebar-accent/60 hover:text-orange-200'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
                  )}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="flex-1">{label}</span>
                  {highlight && <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />}
                  {pulse && !highlight && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                </NavLink>
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-sidebar-border">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] text-sidebar-primary font-bold">A</span>
            </div>
            <div>
              <p className="text-sidebar-accent-foreground text-[11px] font-medium">Admin</p>
              <p className="text-sidebar-foreground/50 text-[9px]">Shopee Pet Store</p>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}