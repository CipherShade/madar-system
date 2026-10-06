import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { lazy, Suspense, useState, useEffect } from 'react';
import { useAuth } from './auth/AuthContext';
import { useTranslation } from 'react-i18next';
import { AppShell } from './components/layout/AppShell';
// ── Lazy-loaded guest routes (code splitting) ─────────────────────────────────
const LandingPage = lazy(() => import('./features/landing/LandingPage').then((m) => ({ default: m.LandingPage })));
const LoginPage = lazy(() => import('./auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const SignupPage = lazy(() => import('./auth/SignupPage').then((m) => ({ default: m.SignupPage })));
function GuestFallback() {
    return (_jsx("div", { style: { minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg-base, #0f172a)' }, children: _jsxs("div", { style: { textAlign: 'center' }, children: [_jsx("span", { className: "brand-logo", style: { width: 54, height: 54, fontSize: 26, margin: '0 auto 14px' }, children: "\u0645" }), _jsx("div", { style: { color: 'var(--text-muted, #94a3b8)', fontSize: 14 }, children: "\u062C\u0627\u0631\u064A \u0627\u0644\u062A\u062D\u0645\u064A\u0644..." })] }) }));
}
export function App() {
    const { t } = useTranslation();
    const { user, loading } = useAuth();
    const [currentView, setCurrentView] = useState(() => {
        const hash = window.location.hash;
        if (hash.includes('login'))
            return 'login';
        if (hash.includes('signup'))
            return 'signup';
        return 'landing';
    });
    useEffect(() => {
        const handleHashChange = () => {
            const hash = window.location.hash;
            if (hash.includes('login'))
                setCurrentView('login');
            else if (hash.includes('signup'))
                setCurrentView('signup');
            else if (hash.includes('landing'))
                setCurrentView('landing');
        };
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, []);
    if (loading) {
        return (_jsx("div", { className: "app", style: { minHeight: '100vh', display: 'grid', placeItems: 'center' }, children: _jsxs("div", { style: { textAlign: 'center' }, children: [_jsx("span", { className: "brand-logo", style: { width: 54, height: 54, fontSize: 26, margin: '0 auto 14px' }, children: "\u0645" }), _jsx("div", { style: { fontWeight: 800, fontSize: 17 }, children: t('appName') }), _jsx("div", { className: "page-sub", children: t('auth.loading') })] }) }));
    }
    // If authenticated, always show main application shell
    if (user) {
        return _jsx(AppShell, {});
    }
    // Guest routing — lazy-loaded for smaller initial bundle
    return (_jsxs(Suspense, { fallback: _jsx(GuestFallback, {}), children: [currentView === 'login' && (_jsx(LoginPage, { onNavigateLanding: () => { window.location.hash = '#landing'; setCurrentView('landing'); }, onNavigateSignup: () => { window.location.hash = '#signup'; setCurrentView('signup'); } })), currentView === 'signup' && (_jsx(SignupPage, { onNavigateLanding: () => { window.location.hash = '#landing'; setCurrentView('landing'); }, onNavigateLogin: () => { window.location.hash = '#login'; setCurrentView('login'); } })), currentView === 'landing' && (_jsx(LandingPage, { onNavigateLogin: () => { window.location.hash = '#login'; setCurrentView('login'); }, onNavigateSignup: () => { window.location.hash = '#signup'; setCurrentView('signup'); } }))] }));
}
