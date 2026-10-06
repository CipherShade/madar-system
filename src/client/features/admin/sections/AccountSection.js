import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Save, ShieldCheck } from 'lucide-react';
import { Pill, notify } from '../../../components/ui/kit';
import { api } from '../../../lib/api';
import { SectionHeader, LoadingBlock, ErrorBlock, NoticeBlock } from './primitives';
import { formatDateTime, formatNumber } from './format';
export function AccountSection() {
    const { t, i18n } = useTranslation();
    const [user, setUser] = useState(null);
    const [draft, setDraft] = useState({ fullName: '', email: '', phoneNumber: '', preferredLanguage: 'ar' });
    const [passwordDraft, setPasswordDraft] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [passwordError, setPasswordError] = useState(null);
    const [passwordSaved, setPasswordSaved] = useState(false);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [saving, setSaving] = useState(false);
    const [passwordBusy, setPasswordBusy] = useState(false);
    const load = async () => {
        setLoading(true);
        setFailed(false);
        try {
            const data = await api('/admin/account');
            setUser(data.user);
            setDraft({
                fullName: data.user.fullName,
                email: data.user.email ?? '',
                phoneNumber: data.user.phoneNumber ?? '',
                preferredLanguage: data.user.preferredLanguage === 'en' ? 'en' : 'ar',
            });
        }
        catch {
            setFailed(true);
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        void load();
    }, []);
    const save = async () => {
        if (draft.fullName.trim().length < 2) {
            notify(t('superAdmin.account.nameRequired'), 'error');
            return;
        }
        setSaving(true);
        try {
            await api('/admin/account', {
                method: 'PATCH',
                body: JSON.stringify({
                    fullName: draft.fullName.trim(),
                    email: draft.email.trim(),
                    phoneNumber: draft.phoneNumber.trim(),
                    preferredLanguage: draft.preferredLanguage,
                }),
            });
            if (draft.preferredLanguage !== i18n.language)
                void i18n.changeLanguage(draft.preferredLanguage);
            notify(t('superAdmin.account.saved'), 'success');
            void load();
        }
        catch {
            notify(t('superAdmin.account.saveError'), 'error');
        }
        finally {
            setSaving(false);
        }
    };
    const changePassword = async () => {
        setPasswordError(null);
        setPasswordSaved(false);
        if (!passwordDraft.currentPassword) {
            setPasswordError(t('superAdmin.account.currentPasswordRequired'));
            return;
        }
        if (passwordDraft.newPassword.length < 8) {
            setPasswordError(t('superAdmin.account.newPasswordTooShort'));
            return;
        }
        if (passwordDraft.newPassword !== passwordDraft.confirmPassword) {
            setPasswordError(t('superAdmin.account.passwordMismatch'));
            return;
        }
        setPasswordBusy(true);
        try {
            await api('/admin/account/password', {
                method: 'PATCH',
                body: JSON.stringify({ currentPassword: passwordDraft.currentPassword, newPassword: passwordDraft.newPassword }),
            });
            setPasswordDraft({ currentPassword: '', newPassword: '', confirmPassword: '' });
            setPasswordSaved(true);
            notify(t('superAdmin.account.passwordChanged'), 'success');
        }
        catch (error) {
            const code = error.code;
            if (code === 'WRONG_CURRENT_PASSWORD')
                setPasswordError(t('superAdmin.account.wrongCurrentPassword'));
            else if (code === 'PASSWORD_UNCHANGED')
                setPasswordError(t('superAdmin.account.passwordUnchanged'));
            else
                setPasswordError(t('superAdmin.account.passwordError'));
        }
        finally {
            setPasswordBusy(false);
        }
    };
    return (_jsxs("div", { children: [_jsx(SectionHeader, { titleKey: "superAdmin.account.title", subtitleKey: "superAdmin.account.subtitle", onRefresh: () => void load(), actions: _jsxs("button", { className: "btn btn--primary", style: { fontSize: 12 }, onClick: () => void save(), disabled: saving, children: [_jsx(Save, { className: "h-4 w-4" }), t(saving ? 'superAdmin.common.busy' : 'superAdmin.account.save')] }) }), _jsx(NoticeBlock, { labelKey: "superAdmin.account.notice", tone: "info" }), loading ? (_jsx(LoadingBlock, { labelKey: "superAdmin.common.loading" })) : failed || !user ? (_jsx(ErrorBlock, { labelKey: "superAdmin.account.loadError", onRetry: () => void load() })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "table-wrapper", style: { padding: 16, marginBottom: 20 }, children: [_jsxs("div", { style: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }, children: [_jsx(ShieldCheck, { className: "h-5 w-5", "aria-hidden": "true" }), _jsxs("div", { children: [_jsx("strong", { children: user.fullName }), _jsxs("span", { className: "page-sub", style: { display: 'block', fontSize: 12 }, dir: "ltr", children: ["@", user.username] })] }), _jsxs("div", { style: { display: 'flex', gap: 6, marginInlineStart: 'auto', flexWrap: 'wrap' }, children: [_jsx(Pill, { tone: "accent", children: t('superAdmin.account.role') }), _jsx(Pill, { tone: user.isActive ? 'success' : 'danger', children: t(user.isActive ? 'superAdmin.common.active' : 'superAdmin.common.inactive') })] })] }), _jsxs("div", { style: { display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13, marginTop: 14 }, children: [_jsxs("span", { children: [_jsxs("strong", { children: [t('superAdmin.account.auditCount'), ":"] }), " ", formatNumber(user._count.superAdminAuditLogs)] }), _jsxs("span", { children: [_jsxs("strong", { children: [t('superAdmin.account.sessionCount'), ":"] }), " ", formatNumber(user._count.superAdminSessions)] }), _jsxs("span", { children: [_jsxs("strong", { children: [t('superAdmin.account.memberSince'), ":"] }), " ", formatDateTime(user.createdAt)] }), _jsxs("span", { children: [_jsxs("strong", { children: [t('superAdmin.account.lastUpdated'), ":"] }), " ", formatDateTime(user.updatedAt)] })] })] }), _jsx("div", { className: "table-wrapper", style: { padding: 16 }, children: _jsxs("div", { style: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }, children: [_jsxs("div", { children: [_jsx("label", { className: "form-label", htmlFor: "sa-account-name", children: t('superAdmin.account.fieldName') }), _jsx("input", { id: "sa-account-name", className: "form-input", value: draft.fullName, onChange: (event) => setDraft((prev) => ({ ...prev, fullName: event.target.value })), maxLength: 100 })] }), _jsxs("div", { children: [_jsx("label", { className: "form-label", htmlFor: "sa-account-email", children: t('superAdmin.account.fieldEmail') }), _jsx("input", { id: "sa-account-email", className: "form-input", type: "email", dir: "ltr", value: draft.email, onChange: (event) => setDraft((prev) => ({ ...prev, email: event.target.value })), maxLength: 200 })] }), _jsxs("div", { children: [_jsx("label", { className: "form-label", htmlFor: "sa-account-phone", children: t('superAdmin.account.fieldPhone') }), _jsx("input", { id: "sa-account-phone", className: "form-input", type: "tel", dir: "ltr", placeholder: "01xxxxxxxxx", value: draft.phoneNumber, onChange: (event) => setDraft((prev) => ({ ...prev, phoneNumber: event.target.value })) })] }), _jsxs("div", { children: [_jsx("label", { className: "form-label", htmlFor: "sa-account-lang", children: t('superAdmin.account.fieldLanguage') }), _jsxs("select", { id: "sa-account-lang", className: "form-input", value: draft.preferredLanguage, onChange: (event) => setDraft((prev) => ({ ...prev, preferredLanguage: event.target.value })), children: [_jsx("option", { value: "ar", children: "\u0639\u0631\u0628\u064A" }), _jsx("option", { value: "en", children: "English" })] })] })] }) }), _jsxs("div", { className: "table-wrapper", style: { padding: 16, marginTop: 20 }, children: [_jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }, children: [_jsx(KeyRound, { className: "h-4 w-4", "aria-hidden": "true" }), _jsx("strong", { children: t('superAdmin.account.passwordTitle') })] }), _jsx("p", { className: "page-sub", style: { fontSize: 12, marginBottom: 16 }, children: t('superAdmin.account.passwordSubtitle') }), _jsxs("div", { style: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }, children: [_jsxs("div", { children: [_jsx("label", { className: "form-label", htmlFor: "sa-current-password", children: t('superAdmin.account.currentPassword') }), _jsx("input", { id: "sa-current-password", className: "form-input", type: "password", dir: "ltr", autoComplete: "current-password", value: passwordDraft.currentPassword, onChange: (event) => setPasswordDraft((prev) => ({ ...prev, currentPassword: event.target.value })) })] }), _jsxs("div", { children: [_jsx("label", { className: "form-label", htmlFor: "sa-new-password", children: t('superAdmin.account.newPassword') }), _jsx("input", { id: "sa-new-password", className: "form-input", type: "password", dir: "ltr", autoComplete: "new-password", value: passwordDraft.newPassword, onChange: (event) => setPasswordDraft((prev) => ({ ...prev, newPassword: event.target.value })) })] }), _jsxs("div", { children: [_jsx("label", { className: "form-label", htmlFor: "sa-confirm-password", children: t('superAdmin.account.confirmPassword') }), _jsx("input", { id: "sa-confirm-password", className: "form-input", type: "password", dir: "ltr", autoComplete: "new-password", value: passwordDraft.confirmPassword, onChange: (event) => setPasswordDraft((prev) => ({ ...prev, confirmPassword: event.target.value })) })] })] }), passwordError && (_jsx("p", { role: "alert", style: { color: 'var(--color-danger, #b91c1c)', fontSize: 13, marginTop: 12 }, children: passwordError })), passwordSaved && (_jsx("p", { role: "status", style: { color: 'var(--color-success, #15803d)', fontSize: 13, marginTop: 12 }, children: t('superAdmin.account.passwordChanged') })), _jsx("div", { style: { display: 'flex', justifyContent: 'flex-end', marginTop: 16 }, children: _jsxs("button", { className: "btn btn--primary", style: { fontSize: 12, gap: 6 }, onClick: () => void changePassword(), disabled: passwordBusy, children: [_jsx(KeyRound, { className: "h-4 w-4" }), t(passwordBusy ? 'superAdmin.common.busy' : 'superAdmin.account.changePassword')] }) })] })] }))] }));
}
