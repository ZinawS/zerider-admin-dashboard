import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import { Layout } from './components/Layout';
import { LoginPage } from './pages/auth/LoginPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { UsersPage } from './pages/users/UsersPage';
import { UserDetailPage } from './pages/users/UserDetailPage';
import { DriversPage } from './pages/drivers/DriversPage';
import { PayoutsPage } from './pages/payouts/PayoutsPage';
import { RidesPage } from './pages/rides/RidesPage';
import { RideDetailPage } from './pages/rides/RideDetailPage';
import { PricingPage } from './pages/pricing/PricingPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { RegionsPage } from './pages/regions/RegionsPage';
import { AuditPage } from './pages/audit/AuditPage';
import { AdminUsersPage } from './pages/admin-users/AdminUsersPage';
import { ContentPage } from './pages/content/ContentPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { ConfigPage } from './pages/settings/ConfigPage';
import { GamificationPage } from './pages/gamification/GamificationPage';
import { DeliveryPage } from './pages/delivery/DeliveryPage';
import { WalletPage } from './pages/wallet/WalletPage';
import { MarketplacePage } from './pages/marketplace/MarketplacePage';
import { SupportPage } from './pages/support/SupportPage';
import { SubscriptionsPage } from './pages/revenue/SubscriptionsPage';
import { CommissionPage } from './pages/revenue/CommissionPage';
import { AnalyticsPage } from './pages/analytics/AnalyticsPage';
import { MerchantPage } from './pages/merchant/MerchantPage';
import { MerchantOrdersPage } from './pages/merchant/MerchantOrdersPage';
import { MerchantManagementPage } from './pages/merchant/MerchantManagementPage';
import { MerchantCatalogPage } from './pages/merchant/MerchantCatalogPage';
import { ChatPage } from './pages/chat/ChatPage';
import { ChatModerationPage } from './pages/chat/ChatModerationPage';
import { DeliveryScheduledPage } from './pages/delivery-scheduled/DeliveryScheduledPage';
import { useAuthStore } from './stores/auth.store';

export function App(): JSX.Element {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken));
  if (!isAuthed) return <LoginPage />;
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/users/:id" element={<UserDetailPage />} />
        <Route path="/drivers" element={<DriversPage />} />
            <Route path="/payouts" element={<PayoutsPage />} />
        <Route path="/rides" element={<RidesPage />} />
        <Route path="/rides/:id" element={<RideDetailPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/regions" element={<RegionsPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/admin-users" element={<AdminUsersPage />} />
        <Route path="/content" element={<ContentPage />} />
        <Route path="/gamification" element={<GamificationPage />} />
        <Route path="/delivery" element={<DeliveryPage />} />
        <Route path="/wallet" element={<WalletPage />} />
        <Route path="/marketplace" element={<MarketplacePage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/merchant" element={<MerchantPage />} />
        <Route path="/merchant/orders" element={<MerchantOrdersPage />} />
        <Route path="/merchant/management" element={<MerchantManagementPage />} />
        <Route path="/merchant/catalog" element={<MerchantCatalogPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/chat/moderation" element={<ChatModerationPage />} />
        <Route path="/delivery/scheduled" element={<DeliveryScheduledPage />} />
        <Route path="/revenue/subscriptions" element={<SubscriptionsPage />} />
        <Route path="/revenue/commission" element={<CommissionPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/config" element={<ConfigPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Layout>
  );
}
