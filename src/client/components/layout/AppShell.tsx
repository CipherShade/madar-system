import { lazy, Suspense, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { ToastHost, notify } from '../ui/kit';
import { navigationGroups } from '../../features/navigation/navigationItems';
import { LifecycleBanner } from '../../features/billing/LifecycleBanner';

// ── Lazy-loaded page chunks (code splitting) ─────────────────────────────────
// Each page is split into its own async chunk, reducing initial JS payload.
const DashboardPage = lazy(() => import('../../features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const ManagementPage = lazy(() => import('../../features/management/ManagementPage').then((m) => ({ default: m.ManagementPage })));
const SchedulingPage = lazy(() => import('../../features/scheduling/SchedulingPage').then((m) => ({ default: m.SchedulingPage })));
const StudentsPage = lazy(() => import('../../features/students/StudentsPage').then((m) => ({ default: m.StudentsPage })));
const OperationsPage = lazy(() => import('../../features/operations/OperationsPage').then((m) => ({ default: m.OperationsPage })));
const BillingPage = lazy(() => import('../../features/billing/BillingPage').then((m) => ({ default: m.BillingPage })));
const DataMigrationPage = lazy(() => import('../../features/billing/DataMigrationPage').then((m) => ({ default: m.DataMigrationPage })));
const SuperAdminPage = lazy(() => import('../../features/admin/SuperAdminPage').then((m) => ({ default: m.SuperAdminPage })));

// ── Page loading fallback ─────────────────────────────────────────────────────
function PageFallback() {
  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
      <span className="page-sub">جاري التحميل...</span>
    </div>
  );
}

export function AppShell() {
  const { t } = useTranslation();
  const { user, hasRole } = useAuth();
  const [activeId, setActiveId] = useState('dashboard');
  const [sessionId, setSessionId] = useState('');

  const role = user?.role ?? 'ADMIN';

  const allowedItems = useMemo(
    () => navigationGroups.flatMap((group) => group.items).filter((item) => hasRole(...item.roles)),
    [hasRole],
  );
  const currentId = allowedItems.some((item) => item.id === activeId) ? activeId : allowedItems[0]?.id ?? 'dashboard';
  const currentLabel = allowedItems.find((item) => item.id === currentId)?.labelKey ?? 'navigation.dashboard';

  const navigate = (id: string) => {
    if (!allowedItems.some((item) => item.id === id)) {
      notify(t('session.denied', 'لا تملك الصلاحية للوصول لهذا القسم'), 'error');
      return;
    }
    setActiveId(id);
  };

  const openLobbyForSession = (id: string) => {
    setSessionId(id);
    setActiveId('lobby');
  };

  const content = (() => {
    switch (currentId) {
      case 'teachers': return <ManagementPage mode="teachers" />;
      case 'rooms': return <ManagementPage mode="rooms" />;
      case 'sessions': return <SchedulingPage onCheckIn={openLobbyForSession} />;
      case 'students': return <StudentsPage />;
      case 'shift': return <OperationsPage mode="shift" />;
      case 'reconciliation': return <OperationsPage mode="reconciliation" />;
      case 'settlement': return <OperationsPage mode="settlement" />;
      case 'reports': return <OperationsPage mode="reports" />;
      case 'billing': return <BillingPage />;
      case 'data-migration': return <DataMigrationPage />;
      case 'lobby': return <OperationsPage mode="lobby" selectedSessionId={sessionId} onSessionChange={setSessionId} />;
      case 'superadmin': return <SuperAdminPage />;
      default: return <DashboardPage onNavigate={navigate} />;
    }
  })();

  return (
    <div className="app">
      <Header activeLabel={t(currentLabel)} />
      <div className="app-body">
        <Sidebar activeId={currentId} onSelect={navigate} role={role} />
        <main className="app-main" id="main">
          <LifecycleBanner onGoToBilling={() => navigate('billing')} />
          <Suspense fallback={<PageFallback />}>
            {content}
          </Suspense>
        </main>
      </div>
      <ToastHost />
    </div>
  );
}
