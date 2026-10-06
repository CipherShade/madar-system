import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, LogOut, RefreshCw } from 'lucide-react';
import { notify } from '../../components/ui/kit';
import { api } from '../../lib/api';
import { OverviewSection } from './sections/OverviewSection';
import { CentersSection } from './sections/CentersSection';
import { UsersSection } from './sections/UsersSection';
import { SubscriptionsSection } from './sections/SubscriptionsSection';
import { UsageSection } from './sections/UsageSection';
import { RevenueSection } from './sections/RevenueSection';
import { NotificationsSection } from './sections/NotificationsSection';
import { FeatureFlagsSection } from './sections/FeatureFlagsSection';
import { HealthSection } from './sections/HealthSection';
import { AuditSection } from './sections/AuditSection';
import { SettingsSection } from './sections/SettingsSection';
import { DataSection } from './sections/DataSection';
import { SecuritySection } from './sections/SecuritySection';
import { SupportSection } from './sections/SupportSection';
import { AccountSection } from './sections/AccountSection';
import { DEFAULT_SECTION, SECTIONS, SECTION_GROUPS } from './sections/registry';
const SECTION_KEY = 'madar.superadmin.section';
function ExtendTrialModal({ tenant, onConfirm, onClose, }) {
    const { t } = useTranslation();
    const [days, setDays] = useState(7);
    const [loading, setLoading] = useState(false);
    const handleSubmit = async () => {
        setLoading(true);
        try {
            await onConfirm(days);
            onClose();
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsx("div", { className: "modal-backdrop", onClick: onClose, role: "dialog", "aria-modal": "true", "aria-label": t('superAdmin.centers.extendTrial'), children: _jsxs("div", { className: "modal-box", style: { maxWidth: 420 }, onClick: (event) => event.stopPropagation(), children: [_jsx("h3", { className: "page-title", style: { fontSize: 17, marginBottom: 12 }, children: t('superAdmin.centers.extendTrial') }), _jsxs("p", { className: "page-sub", style: { marginBottom: 20 }, children: [tenant.name, tenant.isTrialActive && (_jsx("span", { style: { display: 'block', marginTop: 4, fontSize: 13 }, children: t('superAdmin.centers.trialDaysRemaining', { days: tenant.trialDaysRemaining }) }))] }), _jsx("label", { className: "form-label", htmlFor: "sa-extend-days", children: t('superAdmin.centers.extendDaysLabel') }), _jsx("input", { id: "sa-extend-days", type: "number", className: "form-input", min: 1, max: 365, value: days, onChange: (event) => setDays(Math.max(1, Math.min(365, Number(event.target.value)))), style: { marginBottom: 20 } }), _jsxs("div", { style: { display: 'flex', gap: 10, justifyContent: 'flex-end' }, children: [_jsx("button", { className: "btn btn--ghost", onClick: onClose, disabled: loading, children: t('actions.cancel') }), _jsx("button", { className: "btn btn--primary", onClick: handleSubmit, disabled: loading, children: loading ? t('superAdmin.common.busy') : t('superAdmin.centers.extendConfirm', { days }) })] })] }) }));
}
function ViewAsModal({ tenant, onConfirm, onClose, }) {
    const { t } = useTranslation();
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const handleSubmit = async () => {
        if (!reason.trim()) {
            setError(t('superAdmin.viewAs.reasonRequired'));
            return;
        }
        setLoading(true);
        setError(null);
        try {
            await onConfirm(reason.trim());
            onClose();
        }
        catch {
            setError(t('superAdmin.viewAs.startError'));
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsx("div", { className: "modal-backdrop", onClick: onClose, role: "dialog", "aria-modal": "true", "aria-label": t('superAdmin.viewAs.modalTitle'), children: _jsxs("div", { className: "modal-box", style: { maxWidth: 460 }, onClick: (event) => event.stopPropagation(), children: [_jsx("h3", { className: "page-title", style: { fontSize: 17, marginBottom: 8 }, children: t('superAdmin.viewAs.modalTitle') }), _jsx("p", { className: "page-sub", style: { marginBottom: 6 }, children: _jsx("strong", { children: tenant.name }) }), _jsx("p", { className: "page-sub", style: { marginBottom: 20, fontSize: 13 }, children: t('superAdmin.viewAs.modalSubtitle') }), _jsx("label", { className: "form-label", htmlFor: "sa-viewas-reason", children: t('superAdmin.viewAs.reasonLabel') }), _jsx("input", { id: "sa-viewas-reason", type: "text", className: "form-input", placeholder: t('superAdmin.viewAs.reasonPlaceholder'), value: reason, onChange: (event) => { setReason(event.target.value); setError(null); }, style: { marginBottom: error ? 6 : 20 } }), error && (_jsx("p", { role: "alert", style: { color: 'var(--color-danger, #b91c1c)', fontSize: 13, marginBottom: 16 }, children: error })), _jsx("p", { className: "page-sub", style: { marginBottom: 16, fontSize: 12 }, children: t('superAdmin.viewAs.previewHint') }), _jsxs("div", { style: { display: 'flex', gap: 10, justifyContent: 'flex-end' }, children: [_jsx("button", { className: "btn btn--ghost", onClick: onClose, disabled: loading, children: t('actions.cancel') }), _jsxs("button", { className: "btn btn--primary", onClick: handleSubmit, disabled: loading, style: { gap: 6 }, children: [_jsx(Eye, { className: "h-3 w-3" }), loading ? t('superAdmin.viewAs.starting') : t('superAdmin.viewAs.start')] })] })] }) }));
}
export function SuperAdminPage() {
    const { t } = useTranslation();
    const [activeSection, setActiveSection] = useState(() => {
        if (typeof window === 'undefined')
            return DEFAULT_SECTION;
        const stored = window.sessionStorage.getItem(SECTION_KEY);
        return SECTIONS.some((section) => section.id === stored) ? stored : DEFAULT_SECTION;
    });
    const [refreshToken, setRefreshToken] = useState(0);
    const [extendTarget, setExtendTarget] = useState(null);
    const [viewAsTarget, setViewAsTarget] = useState(null);
    const [viewAs, setViewAs] = useState(null);
    const [viewAsBusy, setViewAsBusy] = useState(false);
    const [preview, setPreview] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const select = useCallback((section) => {
        setActiveSection(section);
        try {
            window.sessionStorage.setItem(SECTION_KEY, section);
        }
        catch {
            /* storage is optional */
        }
    }, []);
    const handleRefresh = useCallback(() => setRefreshToken((value) => value + 1), []);
    useEffect(() => {
        if (!viewAs)
            return;
        const tick = () => {
            if (new Date(viewAs.expiresAt).getTime() <= Date.now()) {
                setViewAs(null);
                setPreview(null);
                notify(t('superAdmin.viewAs.expired'), 'error');
            }
        };
        const timer = window.setInterval(tick, 5000);
        return () => window.clearInterval(timer);
    }, [viewAs, t]);
    const handleExtendTrial = async (tenant, days) => {
        try {
            await api(`/admin/tenants/${tenant.id}/extend-trial`, {
                method: 'PATCH',
                body: JSON.stringify({ days }),
            });
            notify(t('superAdmin.centers.extended', { name: tenant.name, days }), 'success');
            handleRefresh();
        }
        catch {
            notify(t('superAdmin.centers.extendError'), 'error');
        }
    };
    const handleStartViewAs = async (tenant, reason) => {
        const data = await api(`/admin/tenants/${tenant.id}/view-as`, { method: 'POST', body: JSON.stringify({ reason }) });
        setViewAs({ sessionId: data.sessionId, token: data.token, expiresAt: data.expiresAt, tenantName: data.tenant.name });
        select('centers');
    };
    const handleEndViewAs = async () => {
        if (!viewAs)
            return;
        setViewAsBusy(true);
        try {
            await api('/admin/view-as/return', {
                method: 'POST',
                body: JSON.stringify({ sessionId: viewAs.sessionId }),
            });
            setViewAs(null);
            setPreview(null);
            notify(t('superAdmin.viewAs.return'), 'success');
        }
        catch {
            notify(t('superAdmin.viewAs.returnError'), 'error');
        }
        finally {
            setViewAsBusy(false);
        }
    };
    const loadCenterPreview = async () => {
        if (!viewAs)
            return;
        setPreviewLoading(true);
        try {
            const data = await api('/students?limit=5&page=1', {
                headers: { Authorization: `Bearer ${viewAs.token}` },
            });
            setPreview({
                students: data.students ?? [],
                total: data.pagination?.total ?? data.students?.length ?? 0,
            });
        }
        catch {
            notify(t('superAdmin.viewAs.previewLoadError'), 'error');
        }
        finally {
            setPreviewLoading(false);
        }
    };
    const viewAsMinutes = viewAs ? Math.max(0, Math.ceil((new Date(viewAs.expiresAt).getTime() - Date.now()) / 60000)) : 0;
    const sectionProps = { key: `${activeSection}-${refreshToken}` };
    return (_jsxs("div", { className: "page-container", children: [_jsxs("div", { className: "page-header", children: [_jsxs("div", { children: [_jsx("h1", { className: "page-title", children: t('superAdmin.shell.title') }), _jsx("p", { className: "page-sub", children: t('superAdmin.shell.subtitle') })] }), _jsx("button", { className: "btn btn--ghost", onClick: handleRefresh, "aria-label": t('common.refresh'), title: t('common.refresh'), children: _jsx(RefreshCw, { className: "h-4 w-4" }) })] }), viewAs && (_jsxs("div", { role: "status", style: {
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: 12,
                    padding: '12px 16px',
                    marginBottom: 20,
                    color: '#1e3a8a',
                    display: 'flex',
                    gap: 12,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                }, children: [_jsx(Eye, { className: "h-4 w-4", "aria-hidden": "true" }), _jsxs("div", { style: { flex: 1, minWidth: 220 }, children: [_jsx("strong", { children: t('superAdmin.viewAs.activeTitle', { name: viewAs.tenantName }) }), _jsxs("span", { style: { display: 'block', fontSize: 12, marginTop: 2 }, children: [t('superAdmin.viewAs.expiresIn', { minutes: viewAsMinutes }), " \u2014 ", t('superAdmin.viewAs.previewHint')] })] }), _jsxs("button", { className: "btn btn--ghost", style: { fontSize: 12, padding: '4px 12px', gap: 4 }, onClick: () => void loadCenterPreview(), disabled: previewLoading, "aria-label": t('superAdmin.viewAs.previewLoad'), children: [previewLoading ? _jsx(RefreshCw, { className: "h-3 w-3" }) : _jsx(Eye, { className: "h-3 w-3" }), t('superAdmin.viewAs.previewLoad')] }), _jsxs("button", { className: "btn btn--danger", style: { fontSize: 12, padding: '4px 12px', gap: 4 }, onClick: () => void handleEndViewAs(), disabled: viewAsBusy, "aria-label": t('superAdmin.viewAs.return'), children: [_jsx(LogOut, { className: "h-3 w-3" }), viewAsBusy ? t('superAdmin.viewAs.returning') : t('superAdmin.viewAs.return')] })] })), viewAs && preview && (_jsxs("div", { className: "table-wrapper", role: "region", "aria-label": t('superAdmin.viewAs.previewTitle'), style: { marginBottom: 20 }, children: [_jsxs("div", { style: { padding: '10px 16px', borderBottom: '1px solid var(--border-color, rgba(0,0,0,0.08))' }, children: [_jsx("strong", { children: t('superAdmin.viewAs.previewTitle') }), _jsxs("span", { className: "page-sub", style: { display: 'block', fontSize: 12 }, children: [t('superAdmin.viewAs.previewSubtitle'), " \u00B7 ", t('superAdmin.viewAs.studentsCount'), ":", ' ', preview.total.toLocaleString('ar-EG')] })] }), preview.students.length === 0 ? (_jsx("div", { style: { padding: 24, textAlign: 'center' }, children: _jsx("span", { className: "page-sub", children: t('superAdmin.viewAs.previewEmpty') }) })) : (_jsxs("table", { className: "data-table", "aria-label": t('superAdmin.viewAs.previewTitle'), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: t('students.table.code') }), _jsx("th", { scope: "col", children: t('students.table.name') })] }) }), _jsx("tbody", { children: preview.students.map((student) => (_jsxs("tr", { children: [_jsx("td", { children: _jsx("code", { style: { fontSize: 12 }, children: student.studentCode }) }), _jsx("td", { children: student.fullName })] }, student.id))) })] }))] })), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: 'minmax(210px, 250px) 1fr', gap: 20, alignItems: 'start' }, children: [_jsx("nav", { "aria-label": t('superAdmin.shell.navLabel'), className: "table-wrapper", style: { padding: 12, position: 'sticky', top: 16 }, children: SECTION_GROUPS.map((group) => (_jsxs("div", { style: { marginBottom: 12 }, children: [_jsx("strong", { style: {
                                        display: 'block',
                                        fontSize: 11,
                                        letterSpacing: 0.3,
                                        color: 'var(--color-muted, #64748b)',
                                        padding: '4px 8px',
                                    }, children: t(group.labelKey) }), SECTIONS.filter((section) => section.group === group.id).map((section) => {
                                    const Icon = section.icon;
                                    const isActive = section.id === activeSection;
                                    return (_jsxs("button", { type: "button", onClick: () => select(section.id), "aria-current": isActive ? 'page' : undefined, style: {
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            width: '100%',
                                            textAlign: 'start',
                                            padding: '7px 8px',
                                            marginBottom: 2,
                                            borderRadius: 8,
                                            fontSize: 13,
                                            cursor: 'pointer',
                                            border: isActive ? '1px solid var(--color-primary, #0f766e)' : '1px solid transparent',
                                            background: isActive ? 'var(--color-primary-soft, rgba(15,118,110,0.1))' : 'transparent',
                                            color: 'inherit',
                                            fontWeight: isActive ? 700 : 400,
                                        }, children: [_jsx(Icon, { className: "h-3 w-3", "aria-hidden": "true" }), _jsx("span", { children: t(section.labelKey) })] }, section.id));
                                })] }, group.id))) }), _jsxs("main", { style: { minWidth: 0 }, children: [activeSection === 'overview' && _jsx(OverviewSection, { ...sectionProps, onNavigate: select }), activeSection === 'centers' && (_jsx(CentersSection, { ...sectionProps, onExtendTrial: setExtendTarget, onViewAs: setViewAsTarget })), activeSection === 'users' && _jsx(UsersSection, { ...sectionProps }), activeSection === 'subscriptions' && _jsx(SubscriptionsSection, { ...sectionProps }), activeSection === 'usage' && _jsx(UsageSection, { ...sectionProps }), activeSection === 'revenue' && _jsx(RevenueSection, { ...sectionProps }), activeSection === 'notifications' && _jsx(NotificationsSection, { ...sectionProps }), activeSection === 'featureFlags' && _jsx(FeatureFlagsSection, { ...sectionProps }), activeSection === 'health' && _jsx(HealthSection, { ...sectionProps }), activeSection === 'audit' && _jsx(AuditSection, { ...sectionProps }), activeSection === 'settings' && _jsx(SettingsSection, { ...sectionProps }), activeSection === 'data' && _jsx(DataSection, { ...sectionProps }), activeSection === 'security' && _jsx(SecuritySection, { ...sectionProps }), activeSection === 'support' && _jsx(SupportSection, { ...sectionProps }), activeSection === 'account' && _jsx(AccountSection, { ...sectionProps })] })] }), extendTarget && (_jsx(ExtendTrialModal, { tenant: extendTarget, onConfirm: (days) => handleExtendTrial(extendTarget, days), onClose: () => setExtendTarget(null) })), viewAsTarget && (_jsx(ViewAsModal, { tenant: viewAsTarget, onConfirm: (reason) => handleStartViewAs(viewAsTarget, reason), onClose: () => setViewAsTarget(null) }))] }));
}
