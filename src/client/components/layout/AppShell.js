import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
    return (_jsx("div", { style: { minHeight: '60vh', display: 'grid', placeItems: 'center' }, children: _jsx("span", { className: "page-sub", children: "\u062C\u0627\u0631\u064A \u0627\u0644\u062A\u062D\u0645\u064A\u0644..." }) }));
}
export function AppShell() {
    const { t } = useTranslation();
    const { user, hasRole } = useAuth();
    const [activeId, setActiveId] = useState('dashboard');
    const [sessionId, setSessionId] = useState('');
    const role = user?.role ?? 'ADMIN';
    const allowedItems = useMemo(() => navigationGroups.flatMap((group) => group.items).filter((item) => hasRole(...item.roles)), [hasRole]);
    const currentId = allowedItems.some((item) => item.id === activeId) ? activeId : allowedItems[0]?.id ?? 'dashboard';
    const currentLabel = allowedItems.find((item) => item.id === currentId)?.labelKey ?? 'navigation.dashboard';
    const navigate = (id) => {
        if (!allowedItems.some((item) => item.id === id)) {
            notify(t('session.denied', 'لا تملك الصلاحية للوصول لهذا القسم'), 'error');
            return;
        }
        setActiveId(id);
    };
    const openLobbyForSession = (id) => {
        setSessionId(id);
        setActiveId('lobby');
    };
    const content = (() => {
        switch (currentId) {
            case 'teachers': return _jsx(ManagementPage, { mode: "teachers" });
            case 'rooms': return _jsx(ManagementPage, { mode: "rooms" });
            case 'sessions': return _jsx(SchedulingPage, { onCheckIn: openLobbyForSession });
            case 'students': return _jsx(StudentsPage, {});
            case 'shift': return _jsx(OperationsPage, { mode: "shift" });
            case 'reconciliation': return _jsx(OperationsPage, { mode: "reconciliation" });
            case 'settlement': return _jsx(OperationsPage, { mode: "settlement" });
            case 'reports': return _jsx(OperationsPage, { mode: "reports" });
            case 'billing': return _jsx(BillingPage, {});
            case 'data-migration': return _jsx(DataMigrationPage, {});
            case 'lobby': return _jsx(OperationsPage, { mode: "lobby", selectedSessionId: sessionId, onSessionChange: setSessionId });
            case 'superadmin': return _jsx(SuperAdminPage, {});
            default: return _jsx(DashboardPage, { onNavigate: navigate });
        }
    })();
    return (_jsxs("div", { className: "app", children: [_jsx(Header, { activeLabel: t(currentLabel) }), _jsxs("div", { className: "app-body", children: [_jsx(Sidebar, { activeId: currentId, onSelect: navigate, role: role }), _jsxs("main", { className: "app-main", id: "main", children: [_jsx(LifecycleBanner, { onGoToBilling: () => navigate('billing') }), _jsx(Suspense, { fallback: _jsx(PageFallback, {}), children: content })] })] }), _jsx(ToastHost, {})] }));
}
