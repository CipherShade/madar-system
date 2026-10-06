import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { KeyRound, Plus, Save, UserCog, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { apiUrl } from '../../lib/config';
import { EGYPTIAN_MOBILE, formatDate } from '../../lib/format';
import { EmptyState, ErrorState, LoadingState, PermissionState } from '../../components/ui/AsyncState';
async function request(path, options) {
    const response = await fetch(apiUrl(`/api${path}`), { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...options?.headers } });
    if (!response.ok) {
        const body = (await response.json().catch(() => null));
        throw new Error(body?.error?.code || body?.error?.message || 'REQUEST_FAILED');
    }
    return (await response.json()).data;
}
export function UsersPage() {
    const { t } = useTranslation();
    const { user: currentUser, hasRole } = useAuth();
    const isAdmin = hasRole('ADMIN');
    const [users, setUsers] = useState([]);
    const [adding, setAdding] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const load = async () => {
        setLoading(true);
        setError('');
        try {
            const usersRes = await request('/users');
            setUsers(usersRes.users);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : t('users.loadError'));
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        if (isAdmin)
            void load();
        else
            setLoading(false);
    }, [isAdmin]);
    async function patch(id, body, successKey) {
        setError('');
        setSuccess('');
        try {
            await request(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
            setSuccess(t(successKey));
            await load();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : t('users.saveError'));
        }
    }
    async function deactivate(id) {
        if (typeof window === 'undefined' || !window.confirm(t('users.confirmDelete')))
            return;
        setError('');
        setSuccess('');
        try {
            await request(`/users/${id}`, { method: 'DELETE' });
            setSuccess(t('users.deleteSuccess'));
            await load();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : t('users.saveError'));
        }
    }
    if (!isAdmin)
        return _jsx(PermissionState, {});
    const receptionistCount = users.filter((item) => item.role === 'RECEPTIONIST').length;
    return (_jsxs("section", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-4", children: [_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("h2", { className: "text-2xl font-bold text-white", children: t('users.title') }), _jsxs("span", { className: "inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-bold text-slate-300", children: [t('usage.receptionistsLabel'), ": ", receptionistCount] })] }), _jsx("p", { className: "mt-1 text-sm text-slate-400", children: t('users.sectionLabel') })] }), _jsxs("button", { type: "button", onClick: () => setAdding((value) => !value), className: "inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500", children: [adding ? _jsx(X, { className: "h-4 w-4" }) : _jsx(Plus, { className: "h-4 w-4" }), adding ? t('actions.cancel') : t('users.add')] })] }), error && _jsx(ErrorState, { message: error, onRetry: () => void load() }), success && _jsx("p", { role: "status", className: "rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200", children: success }), adding && (_jsx(AddUserForm, { onDone: () => {
                    setAdding(false);
                    setSuccess(t('users.saveSuccess'));
                    void load();
                }, onError: (message) => setError(message) })), loading ? (_jsx(LoadingState, {})) : users.length === 0 ? (_jsx(EmptyState, { message: t('users.empty') })) : (_jsx("div", { className: "overflow-x-auto rounded-xl border border-slate-800 bg-slate-900", children: _jsxs("table", { className: "w-full min-w-[760px] text-start text-sm", children: [_jsx("thead", { className: "bg-slate-950 text-slate-400", children: _jsxs("tr", { children: [_jsx("th", { scope: "col", className: "px-4 py-3 text-start", children: t('users.fullName') }), _jsx("th", { scope: "col", className: "px-4 py-3 text-start", children: t('users.username') }), _jsx("th", { scope: "col", className: "px-4 py-3 text-start", children: t('users.role') }), _jsx("th", { scope: "col", className: "px-4 py-3 text-start", children: t('users.phone') }), _jsx("th", { scope: "col", className: "px-4 py-3 text-start", children: t('users.language') }), _jsx("th", { scope: "col", className: "px-4 py-3 text-start", children: t('users.active') }), _jsx("th", { scope: "col", className: "px-4 py-3 text-start", children: t('management.actions') })] }) }), _jsx("tbody", { children: users.map((item) => {
                                const isSelf = item.id === currentUser?.id;
                                return (_jsx(UserRowView, { user: item, isSelf: isSelf, onRole: (role) => void patch(item.id, { role }, 'users.saveSuccess'), onActive: (active) => (active ? void patch(item.id, { isActive: true }, 'users.saveSuccess') : void deactivate(item.id)), onReset: (password) => void patch(item.id, { password }, 'users.saveSuccess') }, item.id));
                            }) })] }) }))] }));
}
function AddUserForm({ onDone, onError }) {
    const { t } = useTranslation();
    const [values, setValues] = useState({ username: '', password: '', fullName: '', role: 'RECEPTIONIST', phoneNumber: '' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const change = (key, value) => setValues((current) => ({ ...current, [key]: value }));
    async function submit(event) {
        event.preventDefault();
        if (saving)
            return;
        if (values.password.length < 8) {
            setError(t('changePassword.minLength'));
            return;
        }
        if (values.phoneNumber && !EGYPTIAN_MOBILE.test(values.phoneNumber)) {
            setError(t('errors.INVALID_PHONE', { defaultValue: t('students.phoneError') }));
            return;
        }
        setSaving(true);
        setError('');
        try {
            await request('/users', {
                method: 'POST',
                body: JSON.stringify({ ...values, phoneNumber: values.phoneNumber || null, preferredLanguage: 'ar' }),
            });
            onDone();
        }
        catch (err) {
            const message = err instanceof Error ? err.message : t('users.saveError');
            setError(message);
            onError(message);
        }
        finally {
            setSaving(false);
        }
    }
    const fields = [
        { key: 'username', label: t('users.username') },
        { key: 'password', label: t('users.password'), type: 'password' },
        { key: 'fullName', label: t('users.fullName') },
        { key: 'phoneNumber', label: t('users.phone'), type: 'tel' },
    ];
    return (_jsxs("form", { onSubmit: submit, className: "rounded-xl border border-emerald-500/20 bg-slate-900 p-5", children: [_jsxs("h3", { className: "mb-4 flex items-center gap-2 font-bold text-white", children: [_jsx(UserCog, { className: "h-5 w-5 text-emerald-400" }), t('users.add')] }), _jsxs("div", { className: "grid gap-4 sm:grid-cols-2 xl:grid-cols-3", children: [fields.map(({ key, label, type }) => (_jsxs("label", { className: "text-sm font-semibold text-slate-300", children: [label, _jsx("input", { required: key !== 'phoneNumber', type: type || 'text', value: values[key], onChange: (event) => change(key, event.target.value), className: "mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none focus:border-emerald-500" })] }, key))), _jsxs("label", { className: "text-sm font-semibold text-slate-300", children: [t('users.role'), _jsxs("select", { value: values.role, onChange: (event) => change('role', event.target.value), className: "mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none focus:border-emerald-500", children: [_jsx("option", { value: "ADMIN", children: t('users.roles.admin') }), _jsx("option", { value: "RECEPTIONIST", children: t('users.roles.receptionist') })] })] })] }), error && _jsx(ErrorState, { message: error }), _jsxs("button", { disabled: saving, className: "mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold disabled:opacity-60", children: [_jsx(Save, { className: "h-4 w-4" }), saving ? t('ui.processing') : t('management.save')] })] }));
}
function UserRowView({ user, isSelf, onRole, onActive, onReset }) {
    const { t } = useTranslation();
    const [resetting, setResetting] = useState(false);
    const [password, setPassword] = useState('');
    const languageLabel = user.preferredLanguage === 'en' ? 'English' : 'عربي';
    return (_jsxs("tr", { className: "border-t border-slate-800 bg-slate-950 last:border-b-0", children: [_jsxs("td", { className: "px-4 py-3", children: [_jsx("p", { className: "font-bold text-white", children: user.fullName }), _jsx("p", { className: "text-xs text-slate-500", children: formatDate(user.createdAt, 'ar') })] }), _jsx("td", { className: "px-4 py-3 font-mono text-xs text-slate-300", children: user.username }), _jsx("td", { className: "px-4 py-3", children: isSelf ? (_jsx("span", { className: "text-xs font-bold text-slate-300", children: t(`users.roles.${user.role}`) })) : (_jsxs("select", { value: user.role, onChange: (event) => onRole(event.target.value), className: "rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white outline-none focus:border-emerald-500", children: [_jsx("option", { value: "ADMIN", children: t('users.roles.admin') }), _jsx("option", { value: "RECEPTIONIST", children: t('users.roles.receptionist') })] })) }), _jsx("td", { className: "px-4 py-3 text-xs text-slate-400", dir: "ltr", children: user.phoneNumber || '—' }), _jsx("td", { className: "px-4 py-3 text-xs text-slate-400", children: languageLabel }), _jsx("td", { className: "px-4 py-3", children: _jsx("span", { className: `rounded-full px-2 py-1 text-xs font-bold ${user.isActive ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-800 text-slate-400'}`, children: user.isActive ? t('status.active') : t('status.inactive') }) }), _jsxs("td", { className: "px-4 py-3", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsxs("button", { type: "button", onClick: () => setResetting((value) => !value), className: "inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/10", "aria-label": t('users.resetPassword'), children: [_jsx(KeyRound, { className: "h-3.5 w-3.5" }), t('users.resetPassword')] }), _jsx("button", { type: "button", disabled: isSelf, onClick: () => onActive(!user.isActive), className: "inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40", "aria-label": t(user.isActive ? 'users.deactivate' : 'users.activate'), children: user.isActive ? t('users.deactivate') : t('users.activate') })] }), resetting && (_jsxs("div", { className: "mt-2 flex items-center gap-2", children: [_jsx("input", { type: "password", minLength: 8, value: password, onChange: (event) => setPassword(event.target.value), placeholder: t('users.password'), className: "w-40 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white outline-none focus:border-amber-500" }), _jsx("button", { type: "button", disabled: password.length < 8, onClick: () => { onReset(password); setPassword(''); setResetting(false); }, className: "rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold disabled:opacity-40", children: t('actions.confirm') })] }))] })] }));
}
