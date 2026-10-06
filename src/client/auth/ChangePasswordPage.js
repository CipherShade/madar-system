import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { KeyRound, Save } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiUrl } from '../lib/config';
import { ErrorState } from '../components/ui/AsyncState';
async function changePassword(currentPassword, newPassword) {
    const response = await fetch(apiUrl('/api/auth/change-password'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!response.ok) {
        const body = (await response.json().catch(() => null));
        throw new Error(body?.error?.code || body?.error?.message || 'REQUEST_FAILED');
    }
}
export function ChangePasswordPage() {
    const { t } = useTranslation();
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    async function submit(event) {
        event.preventDefault();
        if (saving)
            return;
        if (next.length < 8) {
            setError(t('changePassword.minLength'));
            return;
        }
        if (next !== confirm) {
            setError(t('changePassword.mismatch'));
            return;
        }
        setSaving(true);
        setError('');
        setSuccess('');
        try {
            await changePassword(current, next);
            setSuccess(t('changePassword.saved'));
            setCurrent('');
            setNext('');
            setConfirm('');
        }
        catch (err) {
            const key = err instanceof Error ? err.message : '';
            setError(key ? t(`errors.${key}`, { defaultValue: t('auth.loginError') }) : t('auth.loginError'));
        }
        finally {
            setSaving(false);
        }
    }
    const fields = [
        { key: 'current', label: t('changePassword.current'), value: current, onChange: setCurrent, type: 'password' },
        { key: 'next', label: t('changePassword.newPassword'), value: next, onChange: setNext, type: 'password' },
        { key: 'confirm', label: t('changePassword.confirm'), value: confirm, onChange: setConfirm, type: 'password' },
    ];
    return (_jsxs("section", { className: "space-y-6", children: [_jsxs("header", { children: [_jsxs("div", { className: "flex items-center gap-3 text-emerald-400", children: [_jsx(KeyRound, { className: "h-5 w-5", "aria-hidden": "true" }), _jsx("span", { className: "text-sm font-semibold", children: t('auth.subtitle') })] }), _jsx("h2", { className: "mt-2 text-2xl font-bold text-white", children: t('changePassword.title') })] }), error && _jsx(ErrorState, { message: error }), success && _jsx("p", { role: "status", className: "rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200", children: success }), _jsxs("form", { onSubmit: submit, className: "max-w-xl space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5", children: [fields.map(({ key, label, value, onChange, type }) => (_jsxs("label", { className: "block text-sm font-semibold text-slate-300", children: [label, _jsx("input", { required: true, type: type, autoComplete: key === 'current' ? 'current-password' : 'new-password', value: value, onChange: (event) => onChange(event.target.value), className: "mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none focus:border-emerald-500" })] }, key))), _jsxs("button", { disabled: saving, className: "inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-bold disabled:opacity-60", children: [_jsx(Save, { className: "h-4 w-4" }), saving ? t('ui.processing') : t('changePassword.submit')] })] })] }));
}
