import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Products from '@/pages/Products';
import DailyPerformance from '@/pages/DailyPerformance';
import AISuggestions from '@/pages/AISuggestions';
import ApprovalQueue from '@/pages/ApprovalQueue';
import ComboBuilder from '@/pages/ComboBuilder';
import KillList from '@/pages/KillList';
import PerformanceTracking from '@/pages/PerformanceTracking';
import PriceTestLog from '@/pages/PriceTestLog';
import AppSettingsPage from '@/pages/AppSettingsPage';
import MarketConnection from '@/pages/MarketConnection';
import CompetitorSyncCenter from '@/pages/CompetitorSyncCenter';
import VariantSeedManager from '@/pages/VariantSeedManager';
import VariantCrawlCenter from '@/pages/VariantCrawlCenter';
import VariantMatchRules from '@/pages/VariantMatchRules';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
    if (authError.type === 'auth_required') { navigateToLogin(); return null; }
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/products" element={<Products />} />
        <Route path="/daily-performance" element={<DailyPerformance />} />
        <Route path="/ai-suggestions" element={<AISuggestions />} />
        <Route path="/approval-queue" element={<ApprovalQueue />} />
        <Route path="/combo-builder" element={<ComboBuilder />} />
        <Route path="/kill-list" element={<KillList />} />
        <Route path="/performance" element={<PerformanceTracking />} />
        <Route path="/price-test-log" element={<PriceTestLog />} />
        <Route path="/settings" element={<AppSettingsPage />} />
        <Route path="/market-connection" element={<MarketConnection />} />
        <Route path="/competitor-sync" element={<CompetitorSyncCenter />} />
        <Route path="/variant-seeds" element={<VariantSeedManager />} />
        <Route path="/variant-crawl" element={<VariantCrawlCenter />} />
        <Route path="/variant-match" element={<VariantMatchRules />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;