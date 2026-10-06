import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Fragment, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarPlus, ChevronDown, ChevronUp, Eye, Plus, Search, ShieldCheck, ShieldOff, X } from 'lucide-react';
import { Pill, notify } from '../../../components/ui/kit';
import { api, money } from '../../../lib/api';
import { ErrorBlock, FilterSelect, LoadingBlock, Pagination, SectionHeader, SectionTable, TemporaryPasswordNotice } from './primitives';
import { formatDate, formatDateTime, formatNumber } from './format';
const LIMIT = 20;
const EMPTY_FILTERS = {
    search: '',
    status: 'all',
    paymentStatus: 'all',
    sort: 'newest',
};
function NewCenterModal({ onClose, onCreated }) {
    const { t } = useTranslation();
    const [name, setName] = useState('');
    const [ownerName, setOwnerName] = useState('');
    const [ownerPhone, setOwnerPhone] = useState('');
    const [username, setUsername] = useState('');
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const submit = async () => {
        if (name.trim().length < 2 || ownerName.trim().length < 2 || username.trim().length < 3 || !/^(010|011|012|015)[0-9]{8}$/.test(ownerPhone.trim())) {
            notify(t('superAdmin.centers.createFormInvalid'), 'error');
            return;
        }
        setBusy(true);
        try {
            const data = await api('/admin/tenants', {
                method: 'POST',
                body: JSON.stringify({
                    name: name.trim(),
                    ownerName: ownerName.trim(),
                    ownerPhone: ownerPhone.trim(),
                    username: username.trim(),
                    ...(reason.trim() ? { reason: reason.trim() } : {}),
                }),
            });
            notify(t('superAdmin.centers.created', { name: name.trim() }), 'success');
            onCreated(data.temporaryPassword);
            onClose();
        }
        catch {
            notify(t('superAdmin.centers.createError'), 'error');
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsx("div", { className: "modal-backdrop", onClick: onClose, role: "dialog", "aria-modal": "true", "aria-label": t('superAdmin.centers.create'), children: _jsxs("div", { className: "modal-box", style: { maxWidth: 560 }, onClick: (event) => event.stopPropagation(), children: [_jsx("h3", { className: "page-title", style: { fontSize: 17, marginBottom: 16 }, children: t('superAdmin.centers.create') }), _jsxs("div", { style: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }, children: [_jsxs("div", { children: [_jsx("label", { className: "form-label", htmlFor: "sa-center-name", children: t('superAdmin.centers.fieldName') }), _jsx("input", { id: "sa-center-name", className: "form-input", value: name, onChange: (event) => setName(event.target.value), maxLength: 100 })] }), _jsxs("div", { children: [_jsx("label", { className: "form-label", htmlFor: "sa-center-owner-name", children: t('superAdmin.centers.fieldOwnerName') }), _jsx("input", { id: "sa-center-owner-name", className: "form-input", value: ownerName, onChange: (event) => setOwnerName(event.target.value), maxLength: 100 })] }), _jsxs("div", { children: [_jsx("label", { className: "form-label", htmlFor: "sa-center-owner-phone", children: t('superAdmin.centers.fieldOwnerPhone') }), _jsx("input", { id: "sa-center-owner-phone", className: "form-input", type: "tel", dir: "ltr", placeholder: "01xxxxxxxxx", value: ownerPhone, onChange: (event) => setOwnerPhone(event.target.value) })] }), _jsxs("div", { children: [_jsx("label", { className: "form-label", htmlFor: "sa-center-username", children: t('superAdmin.centers.fieldUsername') }), _jsx("input", { id: "sa-center-username", className: "form-input", dir: "ltr", value: username, onChange: (event) => setUsername(event.target.value), maxLength: 50 })] }), _jsxs("div", { children: [_jsx("label", { className: "form-label", htmlFor: "sa-center-reason", children: t('superAdmin.centers.fieldReason') }), _jsx("input", { id: "sa-center-reason", className: "form-input", value: reason, onChange: (event) => setReason(event.target.value), maxLength: 500 })] })] }), _jsx("p", { className: "page-sub", style: { fontSize: 12, marginTop: 12 }, children: t('superAdmin.centers.createNotice') }), _jsxs("div", { style: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }, children: [_jsx("button", { className: "btn btn--ghost", onClick: onClose, disabled: busy, children: t('actions.cancel') }), _jsxs("button", { className: "btn btn--primary", style: { gap: 6 }, onClick: () => void submit(), disabled: busy, children: [_jsx(Plus, { className: "h-4 w-4" }), t(busy ? 'superAdmin.common.busy' : 'superAdmin.centers.create')] })] })] }) }));
}
function CenterDetailModal({ id, onClose }) {
    const { t } = useTranslation();
    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        void api(`/admin/tenants/${id}`)
            .then((data) => {
            if (!cancelled)
                setDetail(data);
        })
            .catch(() => {
            if (!cancelled)
                setFailed(true);
        })
            .finally(() => {
            if (!cancelled)
                setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [id]);
    return (_jsx("div", { className: "modal-backdrop", onClick: onClose, role: "dialog", "aria-modal": "true", "aria-label": t('superAdmin.centers.detailTitle'), children: _jsxs("div", { className: "modal-box", style: { maxWidth: 780, maxHeight: '88vh', overflowY: 'auto' }, onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }, children: [_jsx("h3", { className: "page-title", style: { fontSize: 17, flex: 1 }, children: t('superAdmin.centers.detailTitle') }), _jsx("button", { className: "btn btn--ghost", onClick: onClose, "aria-label": t('actions.close'), style: { padding: '4px 8px' }, children: _jsx(X, { className: "h-4 w-4" }) })] }), loading ? (_jsx(LoadingBlock, { labelKey: "superAdmin.common.loading" })) : failed || !detail ? (_jsx(ErrorBlock, { labelKey: "superAdmin.centers.detailLoadError" })) : (_jsxs("div", { style: { display: 'grid', gap: 20 }, children: [_jsxs("div", { children: [_jsx("strong", { style: { fontSize: 16 }, children: detail.tenant.name }), _jsx("span", { className: "page-sub", style: { display: 'block', fontSize: 12, marginTop: 2 }, dir: "ltr", children: detail.tenant.slug }), _jsxs("div", { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }, children: [_jsx(Pill, { tone: detail.tenant.isActive ? 'success' : 'danger', children: t(detail.tenant.isActive ? 'superAdmin.common.active' : 'superAdmin.common.suspended') }), _jsx(Pill, { tone: "muted", children: t(`superAdmin.subscriptions.status.${detail.subscriptions[0]?.status ?? 'none'}`, detail.subscriptions[0]?.status ?? '—') })] })] }), _jsxs("div", { style: { display: 'grid', gap: 4, fontSize: 13 }, children: [_jsxs("div", { children: [t('superAdmin.centers.detail.owner'), ": ", detail.tenant.ownerName ?? '—', " ", detail.tenant.ownerPhone ? _jsx("span", { dir: "ltr", children: detail.tenant.ownerPhone }) : null] }), _jsxs("div", { children: [t('superAdmin.centers.detail.renewal'), ": ", formatDate(detail.tenant.renewalDate), " \u00B7 ", t('superAdmin.centers.detail.price'), ": ", money(detail.tenant.priceMonthly)] }), _jsxs("div", { children: [t('superAdmin.centers.detail.counts'), ": ", t('superAdmin.centers.col.users'), " ", formatNumber(detail.tenant.userCount), " \u00B7 ", t('superAdmin.centers.col.students'), " ", formatNumber(detail.tenant.studentCount), " \u00B7 ", t('superAdmin.centers.detail.teachers'), " ", formatNumber(detail.tenant.teacherCount), " \u00B7 ", t('superAdmin.centers.detail.sessions'), " ", formatNumber(detail.tenant.sessionCount), " \u00B7 ", t('superAdmin.centers.detail.rooms'), " ", formatNumber(detail.tenant.roomCount)] }), _jsxs("div", { children: [t('superAdmin.centers.detail.balances'), ": ", t('superAdmin.subscriptions.adjustment.DISCOUNT'), " ", money(Number(detail.tenant.discountBalance)), " \u00B7 ", t('superAdmin.subscriptions.adjustment.CREDIT'), " ", money(Number(detail.tenant.creditBalance))] })] }), detail.usage && (_jsxs("div", { children: [_jsx("h4", { className: "page-title", style: { fontSize: 14, marginBottom: 8 }, children: t('superAdmin.centers.detail.usage') }), _jsx("div", { style: { display: 'grid', gap: 4, fontSize: 12 }, children: detail.usage.metrics.map((metric) => (_jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx("span", { style: { minWidth: 110, color: 'var(--color-muted, #64748b)' }, children: t(`superAdmin.usage.metric.${metric.metric}`) }), _jsx("span", { children: formatNumber(metric.used) })] }, metric.metric))) })] })), _jsxs("div", { children: [_jsx("h4", { className: "page-title", style: { fontSize: 14, marginBottom: 8 }, children: t('superAdmin.centers.detail.users') }), detail.users.length === 0 ? (_jsx("span", { className: "page-sub", style: { fontSize: 12 }, children: t('superAdmin.users.empty') })) : (_jsx("div", { style: { display: 'grid', gap: 4 }, children: detail.users.map((user) => (_jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, flexWrap: 'wrap' }, children: [_jsx("strong", { children: user.fullName }), _jsxs("span", { className: "page-sub", dir: "ltr", children: ["@", user.username] }), _jsx(Pill, { tone: "accent", children: t(`superAdmin.users.role.${user.role}`, user.role) }), _jsx(Pill, { tone: user.isActive ? 'success' : 'danger', children: t(user.isActive ? 'superAdmin.common.active' : 'superAdmin.common.inactive') }), _jsxs("span", { className: "page-sub", children: [t('superAdmin.users.lastLogin'), ": ", formatDateTime(user.lastLoginAt)] })] }, user.id))) }))] }), detail.subscriptions.length > 0 && (_jsxs("div", { children: [_jsx("h4", { className: "page-title", style: { fontSize: 14, marginBottom: 8 }, children: t('superAdmin.centers.detail.subscriptions') }), _jsx("div", { style: { display: 'grid', gap: 4, fontSize: 12 }, children: detail.subscriptions.slice(0, 6).map((subscription) => (_jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }, children: [_jsx(Pill, { tone: "muted", children: t(`superAdmin.subscriptions.status.${subscription.status}`, subscription.status) }), _jsx("strong", { children: money(Number(subscription.amount)) }), _jsxs("span", { className: "page-sub", children: [formatDate(subscription.periodStart), " \u2192 ", formatDate(subscription.periodEnd)] })] }, subscription.id))) })] })), detail.adjustments.length > 0 && (_jsxs("div", { children: [_jsx("h4", { className: "page-title", style: { fontSize: 14, marginBottom: 8 }, children: t('superAdmin.centers.detail.adjustments') }), _jsx("div", { style: { display: 'grid', gap: 4, fontSize: 12 }, children: detail.adjustments.slice(0, 6).map((adjustment) => (_jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }, children: [_jsx(Pill, { tone: "accent", children: t(`superAdmin.subscriptions.adjustment.${adjustment.type}`, adjustment.type) }), _jsx("strong", { children: money(Number(adjustment.amount)) }), _jsx("span", { className: "page-sub", children: adjustment.reason ?? '—' }), _jsx("span", { className: "page-sub", children: formatDate(adjustment.createdAt) })] }, adjustment.id))) })] })), detail.healthAlerts.length > 0 && (_jsxs("div", { children: [_jsx("h4", { className: "page-title", style: { fontSize: 14, marginBottom: 8 }, children: t('superAdmin.centers.detail.alerts') }), _jsx("div", { style: { display: 'grid', gap: 4, fontSize: 12 }, children: detail.healthAlerts.map((alert) => (_jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }, children: [_jsx(Pill, { tone: alert.level === 'CRITICAL' ? 'danger' : 'warning', children: t(`superAdmin.common.level.${alert.level}`, alert.level) }), _jsx("span", { children: alert.message }), _jsx("span", { className: "page-sub", children: formatDate(alert.createdAt) })] }, alert.id))) })] })), detail.supportNotes.length > 0 && (_jsxs("div", { children: [_jsx("h4", { className: "page-title", style: { fontSize: 14, marginBottom: 8 }, children: t('superAdmin.centers.detail.supportNotes') }), _jsx("div", { style: { display: 'grid', gap: 4, fontSize: 12 }, children: detail.supportNotes.slice(0, 5).map((note) => (_jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }, children: [_jsx(Pill, { tone: "muted", children: t(`superAdmin.support.short.${note.status}`, note.status) }), _jsx("span", { children: note.text })] }, note.id))) })] })), detail.recentAudit.length > 0 && (_jsxs("div", { children: [_jsx("h4", { className: "page-title", style: { fontSize: 14, marginBottom: 8 }, children: t('superAdmin.centers.detail.audit') }), _jsx("div", { style: { display: 'grid', gap: 4, fontSize: 12 }, children: detail.recentAudit.slice(0, 8).map((entry) => (_jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }, children: [_jsx("code", { children: entry.action }), _jsx("span", { className: "page-sub", children: entry.actor?.fullName ?? '—' }), _jsx("span", { className: "page-sub", children: formatDateTime(entry.createdAt) })] }, entry.id))) })] }))] }))] }) }));
}
export function CentersSection({ onExtendTrial, onViewAs }) {
    const { t } = useTranslation();
    const [tenants, setTenants] = useState([]);
    const [total, setTotal] = useState(0);
    const [pages, setPages] = useState(1);
    const [page, setPage] = useState(1);
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [expandedId, setExpandedId] = useState(null);
    const [busyId, setBusyId] = useState(null);
    const [creating, setCreating] = useState(false);
    const [detailId, setDetailId] = useState(null);
    const [tempPassword, setTempPassword] = useState(null);
    const load = async () => {
        setLoading(true);
        setFailed(false);
        try {
            const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
            if (filters.search.trim())
                params.set('search', filters.search.trim());
            if (filters.status !== 'all')
                params.set('status', filters.status);
            if (filters.paymentStatus !== 'all')
                params.set('paymentStatus', filters.paymentStatus);
            if (filters.sort !== 'newest')
                params.set('sort', filters.sort);
            const data = await api(`/admin/tenants?${params}`);
            setTenants(data.tenants);
            setTotal(data.pagination.total);
            setPages(data.pagination.pages);
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
    }, [page, filters]);
    const updateFilter = (patch) => {
        setPage(1);
        setFilters((prev) => ({ ...prev, ...patch }));
    };
    const handleSuspend = async (tenant) => {
        const nextActive = !tenant.isActive;
        setBusyId(tenant.id);
        try {
            await api(`/admin/tenants/${tenant.id}/suspend`, {
                method: 'PATCH',
                body: JSON.stringify({ isActive: nextActive }),
            });
            notify(t(nextActive ? 'superAdmin.centers.reactivated' : 'superAdmin.centers.suspended', { name: tenant.name }), 'success');
            void load();
        }
        catch {
            notify(t('superAdmin.centers.suspendError'), 'error');
        }
        finally {
            setBusyId(null);
        }
    };
    return (_jsxs("div", { children: [_jsx(SectionHeader, { titleKey: "superAdmin.centers.title", subtitleKey: "superAdmin.centers.subtitle", onRefresh: () => void load(), actions: _jsxs("button", { className: "btn btn--primary", style: { fontSize: 12, gap: 6 }, onClick: () => setCreating(true), children: [_jsx(Plus, { className: "h-4 w-4" }), t('superAdmin.centers.create')] }) }), _jsxs("div", { className: "search-bar", style: { marginBottom: 12 }, children: [_jsx(Search, { className: "search-icon h-4 w-4", "aria-hidden": "true" }), _jsx("input", { id: "sa-center-search", type: "search", className: "search-input", placeholder: t('superAdmin.centers.searchPlaceholder'), value: filters.search, onChange: (event) => updateFilter({ search: event.target.value }), "aria-label": t('superAdmin.centers.searchLabel') })] }), _jsxs("div", { style: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 16 }, children: [_jsx(FilterSelect, { id: "sa-center-filter-status", labelKey: "superAdmin.centers.filterStatus", value: filters.status, onChange: (value) => updateFilter({ status: value }), options: [
                            { value: 'all', label: t('superAdmin.users.allStatuses') },
                            { value: 'active', label: t('superAdmin.common.active') },
                            { value: 'suspended', label: t('superAdmin.common.suspended') },
                            { value: 'trial', label: t('superAdmin.centers.filterTrial') },
                        ] }), _jsx(FilterSelect, { id: "sa-center-filter-payment", labelKey: "superAdmin.centers.filterPayment", value: filters.paymentStatus, onChange: (value) => updateFilter({ paymentStatus: value }), options: [
                            { value: 'all', label: t('superAdmin.centers.allPayments') },
                            { value: 'paid', label: t('superAdmin.centers.paymentPaid') },
                            { value: 'due', label: t('superAdmin.centers.paymentDue') },
                            { value: 'none', label: t('superAdmin.centers.paymentNone') },
                        ] }), _jsx(FilterSelect, { id: "sa-center-filter-sort", labelKey: "superAdmin.centers.filterSort", value: filters.sort, onChange: (value) => updateFilter({ sort: value }), options: [
                            { value: 'newest', label: t('superAdmin.centers.sortNewest') },
                            { value: 'oldest', label: t('superAdmin.centers.sortOldest') },
                            { value: 'name', label: t('superAdmin.centers.sortName') },
                        ] })] }), loading ? (_jsx(LoadingBlock, { labelKey: "superAdmin.common.loading" })) : failed ? (_jsx(ErrorBlock, { labelKey: "superAdmin.centers.loadError", onRetry: () => void load() })) : tenants.length === 0 ? (_jsx("span", { className: "page-sub", children: t('superAdmin.centers.empty') })) : (_jsxs(_Fragment, { children: [_jsx(SectionTable, { labelKey: "superAdmin.centers.table", headers: [
                            'superAdmin.centers.col.center',
                            'superAdmin.centers.col.plan',
                            'superAdmin.centers.col.status',
                            'superAdmin.centers.col.renewal',
                            'superAdmin.centers.col.usage',
                            'superAdmin.centers.col.size',
                            'superAdmin.common.actions',
                        ], colSpan: 7, emptyKey: "superAdmin.centers.empty", children: _jsx(_Fragment, { children: tenants.map((tenant) => {
                                const isExpanded = expandedId === tenant.id;
                                return (_jsxs(Fragment, { children: [_jsxs("tr", { style: { opacity: tenant.isActive ? 1 : 0.55 }, children: [_jsxs("td", { children: [_jsx("button", { className: "btn btn--ghost", style: { padding: '2px 6px', gap: 4 }, onClick: () => setExpandedId(isExpanded ? null : tenant.id), "aria-label": t(isExpanded ? 'superAdmin.centers.hideDetails' : 'superAdmin.centers.showDetails'), title: t(isExpanded ? 'superAdmin.centers.hideDetails' : 'superAdmin.centers.showDetails'), children: isExpanded ? _jsx(ChevronUp, { className: "h-3 w-3" }) : _jsx(ChevronDown, { className: "h-3 w-3" }) }), _jsx("strong", { children: tenant.name }), _jsx("br", {}), _jsx("span", { className: "page-sub", style: { fontSize: 12 }, children: tenant.slug }), tenant.owner && (_jsxs(_Fragment, { children: [_jsx("br", {}), _jsx("span", { className: "page-sub", style: { fontSize: 11 }, children: tenant.owner.name })] }))] }), _jsxs("td", { children: [_jsx("span", { style: { fontSize: 11 }, children: money(tenant.priceMonthly) }), tenant.isTrialActive && (_jsx("span", { style: { display: 'block', fontSize: 11, marginTop: 4, color: 'var(--color-warning, #d97706)' }, children: t('superAdmin.centers.trialDaysRemaining', { days: tenant.trialDaysRemaining }) }))] }), _jsx("td", { children: _jsxs("div", { style: { display: 'grid', gap: 4 }, children: [_jsx(Pill, { tone: tenant.isActive ? 'success' : 'danger', children: t(tenant.isActive ? 'superAdmin.common.active' : 'superAdmin.common.suspended') }), _jsx(Pill, { tone: tenant.paymentStatus === 'paid' ? 'success' : tenant.paymentStatus === 'due' ? 'warning' : 'muted', children: t(`superAdmin.centers.paymentState.${tenant.paymentStatus}`, tenant.paymentStatus) })] }) }), _jsx("td", { style: { fontSize: 12 }, children: formatDate(tenant.renewalDate) }), _jsx("td", { children: _jsx("span", { style: { fontSize: 11 }, children: t('superAdmin.centers.visitsUsage', {
                                                            visits: formatNumber(tenant.visitsThisPeriod),
                                                        }) }) }), _jsx("td", { style: { fontSize: 12 }, children: t('superAdmin.centers.sizeLine', {
                                                        users: formatNumber(tenant.userCount),
                                                        students: formatNumber(tenant.studentCount),
                                                    }) }), _jsx("td", { children: _jsxs("div", { style: { display: 'flex', gap: 6, flexWrap: 'wrap' }, children: [_jsx("button", { className: "btn btn--ghost", style: { fontSize: 12, padding: '4px 10px', gap: 4 }, onClick: () => setDetailId(tenant.id), "aria-label": t('superAdmin.centers.viewDetails', { name: tenant.name }), children: t('superAdmin.centers.details') }), onExtendTrial && (_jsxs("button", { className: "btn btn--ghost", style: { fontSize: 12, padding: '4px 10px', gap: 4 }, onClick: () => onExtendTrial(tenant), title: t('superAdmin.centers.extendTrial'), "aria-label": t('superAdmin.centers.extendTrialFor', { name: tenant.name }), children: [_jsx(CalendarPlus, { className: "h-3 w-3" }), t('superAdmin.centers.extend')] })), onViewAs && (_jsxs("button", { className: "btn btn--ghost", style: { fontSize: 12, padding: '4px 10px', gap: 4 }, onClick: () => onViewAs(tenant), title: t('superAdmin.viewAs.action'), "aria-label": t('superAdmin.viewAs.actionFor', { name: tenant.name }), children: [_jsx(Eye, { className: "h-3 w-3" }), t('superAdmin.viewAs.action')] })), _jsx("button", { className: `btn ${tenant.isActive ? 'btn--danger' : 'btn--primary'}`, style: { fontSize: 12, padding: '4px 10px' }, onClick: () => void handleSuspend(tenant), disabled: busyId === tenant.id, title: t(tenant.isActive ? 'superAdmin.centers.suspendAction' : 'superAdmin.centers.reactivateAction'), children: tenant.isActive ? _jsxs(_Fragment, { children: [_jsx(ShieldOff, { className: "h-3 w-3" }), " ", t('superAdmin.centers.suspend')] }) : _jsxs(_Fragment, { children: [_jsx(ShieldCheck, { className: "h-3 w-3" }), " ", t('superAdmin.centers.reactivate')] }) })] }) })] }), isExpanded && (_jsx("tr", { className: "expanded-row", children: _jsx("td", { colSpan: 7, style: { padding: '8px 24px 16px', background: 'var(--bg-surface-alt, rgba(0,0,0,0.04))' }, children: _jsxs("div", { style: { display: 'flex', gap: 28, flexWrap: 'wrap', fontSize: 13 }, children: [_jsxs("span", { children: [_jsxs("strong", { children: [t('superAdmin.centers.detail.sessions'), ":"] }), " ", formatNumber(tenant.sessionCount)] }), tenant.trialEndsAt && (_jsxs("span", { children: [_jsxs("strong", { children: [t('superAdmin.centers.detail.trialEnds'), ":"] }), " ", formatDate(tenant.trialEndsAt)] })), _jsxs("span", { children: [_jsx("strong", { children: "Slug:" }), " ", _jsx("code", { children: tenant.slug })] })] }) }) }))] }, tenant.id));
                            }) }) }), _jsx(Pagination, { page: page, pages: pages, total: total, onChange: setPage })] })), creating && (_jsx(NewCenterModal, { onClose: () => setCreating(false), onCreated: (password) => {
                    if (password)
                        setTempPassword(password);
                    void load();
                } })), detailId && _jsx(CenterDetailModal, { id: detailId, onClose: () => setDetailId(null) }), tempPassword && (_jsx("div", { className: "modal-backdrop", onClick: () => setTempPassword(null), role: "dialog", "aria-modal": "true", "aria-label": t('superAdmin.users.passwordShownOnce'), children: _jsxs("div", { className: "modal-box", style: { maxWidth: 460 }, onClick: (event) => event.stopPropagation(), children: [_jsx("h3", { className: "page-title", style: { fontSize: 17, marginBottom: 12 }, children: t('superAdmin.users.passwordShownOnce') }), _jsx(TemporaryPasswordNotice, { value: tempPassword }), _jsx("div", { style: { display: 'flex', justifyContent: 'flex-end', marginTop: 18 }, children: _jsx("button", { className: "btn btn--primary", onClick: () => setTempPassword(null), children: t('actions.close') }) })] }) }))] }));
}
