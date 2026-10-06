import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { KeyRound, LogIn, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';
import { Banner } from '../components/ui/kit';
const CENTER_NAME = import.meta.env.VITE_CENTER_NAME || '';
export function LoginPage({ onNavigateLanding, onNavigateSignup }) {
    const { t } = useTranslation();
    const { login } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    async function submit(event) {
        event.preventDefault();
        setError('');
        setSubmitting(true);
        try {
            await login({ username, password });
        }
        catch {
            setError(t('auth.invalidCredentials'));
        }
        finally {
            setSubmitting(false);
        }
    }
    return (_jsx("main", { className: "login-bg", children: _jsxs("form", { onSubmit: submit, className: "login-card", children: [_jsx("div", { className: "login-logo", style: { cursor: 'pointer' }, onClick: onNavigateLanding, children: "\u0645" }), _jsxs("p", { className: "login-brand-sub", children: [t('auth.welcome'), " ", t('appName')] }), _jsx("h1", { className: "login-title", children: CENTER_NAME || t('auth.title') }), _jsx("p", { className: "login-sub", children: t('auth.subtitle') }), _jsx(Banner, { text: error, tone: "error" }), _jsxs("div", { className: "form-stack", children: [_jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: t('auth.username') }), _jsxs("div", { className: "searchbar", children: [_jsx(UserRound, { className: "h-4 w-4", "aria-hidden": "true" }), _jsx("input", { className: "input", autoComplete: "username", required: true, value: username, onChange: (event) => setUsername(event.target.value) })] })] }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: t('auth.password') }), _jsxs("div", { className: "searchbar", children: [_jsx(KeyRound, { className: "h-4 w-4", "aria-hidden": "true" }), _jsx("input", { className: "input", type: "password", autoComplete: "current-password", required: true, value: password, onChange: (event) => setPassword(event.target.value) })] })] }), _jsxs("button", { className: "btn btn--primary", style: { width: '100%', paddingBlock: 11 }, disabled: submitting, children: [_jsx(LogIn, { className: "h-4 w-4", "aria-hidden": "true" }), submitting ? t('auth.signingIn') : t('auth.signIn')] })] }), _jsxs("div", { style: { marginTop: 14, padding: '10px 12px', background: 'var(--surface, #f8fafc)', borderRadius: 8, border: '1px dashed var(--border)', fontSize: 12 }, children: [_jsx("div", { style: { fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }, children: "\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062F\u062E\u0648\u0644 \u0644\u0644\u062A\u062C\u0631\u0628\u0629 (Demo):" }), _jsxs("div", { style: { display: 'flex', gap: 8, flexWrap: 'wrap' }, children: [_jsx("button", { type: "button", className: "btn btn--outline", style: { flex: 1, fontSize: 12, paddingBlock: 6 }, onClick: () => { setUsername('admin'); setPassword('Admin@12345!'); }, children: "\u0645\u062F\u064A\u0631 (admin)" }), _jsx("button", { type: "button", className: "btn btn--outline", style: { flex: 1, fontSize: 12, paddingBlock: 6 }, onClick: () => { setUsername('reception1'); setPassword('Desk@12345!'); }, children: "\u0627\u0633\u062A\u0642\u0628\u0627\u0644 (reception1)" }), _jsx("button", { type: "button", className: "btn btn--outline", style: { flex: 1, fontSize: 12, paddingBlock: 6 }, onClick: () => { setUsername('superadmin'); setPassword('Platform@12345!'); }, children: "\u0645\u062F\u064A\u0631 \u0627\u0644\u0645\u0646\u0635\u0629 (superadmin)" })] })] }), _jsxs("div", { style: { marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: 13, gap: 8, flexWrap: 'wrap' }, children: [onNavigateLanding && (_jsx("button", { type: "button", onClick: onNavigateLanding, className: "btn-link", style: { color: 'var(--text-secondary)' }, children: "\u2190 \u0627\u0644\u0639\u0648\u062F\u0629 \u0644\u0644\u0631\u0626\u064A\u0633\u064A\u0629" })), onNavigateSignup && (_jsx("button", { type: "button", onClick: onNavigateSignup, className: "btn-link", style: { color: 'var(--primary)', fontWeight: 700 }, children: "\u0625\u0646\u0634\u0627\u0621 \u0633\u0646\u062A\u0631 \u062C\u062F\u064A\u062F \u0648\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643" }))] })] }) }));
}
