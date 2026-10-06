import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, Ban, CircleSlash, CreditCard, Percent, Plus, RefreshCw, Search, Undo2, Wallet } from 'lucide-react';
import { Pill, notify } from '../../../components/ui/kit';
import { api, money } from '../../../lib/api';
import { EmptyBlock, ErrorBlock, FilterSelect, LoadingBlock, Pagination, SectionHeader, SectionTable } from './primitives';
import { formatDate, formatDateTime } from './format';
import { useCenterOptions } from './hooks';
const LIMIT = 20;
const VIEW_STATUS_KEY = {
    active: 'ACTIVE',
    trials: 'TRIALING',
    pending: 'PENDING',
    pastDue: 'PAST_DUE',
    expired: 'EXPIRED',
    cancelled: 'CANCELED',
};
const STATUS_TONE = {
    ACTIVE: 'success',
    TRIALING: 'primary',
    PENDING: 'warning',
    PAST_DUE: 'danger',
    CANCELED: 'muted',
    EXPIRED: 'muted',
};
function ActionModal({ action, subscription, busy, onConfirm, onClose, }) {
    const { t } = useTranslation();
    const [reason, setReason] = useState('');
    const [value, setValue] = useState('');
    const [kind, setKind] = useState('PERCENT');
    const [immediate, setImmediate] = useState(false);
    const titles = {
        cancel: 'superAdmin.subscriptions.action.cancel',
        reactivate: 'superAdmin.subscriptions.action.reactivate',
        discount: 'superAdmin.subscriptions.action.discount',
        credit: 'superAdmin.subscriptions.action.credit',
        refund: 'superAdmin.subscriptions.action.refund',
    };
    const buildBody = () => {
        if (action === 'cancel')
            return { reason: reason.trim(), immediate };
        if (action === 'discount')
            return { kind, value: Number(value), reason: reason.trim() };
        if (action === 'refund')
            return { reason: reason.trim(), ...(value.trim() ? { amount: Number(value) } : {}) };
        if (action === 'credit')
            return { amount: Number(value), reason: reason.trim() };
        return { reason: reason.trim() };
    };
    const isValid = () => {
        if (reason.trim().length < 2)
            return false;
        if (action === 'discount' || action === 'credit' || action === 'refund') {
            if (action === 'refund' && !value.trim())
                return true;
            const parsed = Number(value);
            return Number.isFinite(parsed) && parsed > 0;
        }
        return true;
    };
    return (_jsx("div", { className: "modal-backdrop", onClick: onClose, role: "dialog", "aria-modal": "true", "aria-label": t(titles[action]), children: _jsxs("div", { className: "modal-box", style: { maxWidth: 480 }, onClick: (event) => event.stopPropagation(), children: [_jsx("h3", { className: "page-title", style: { fontSize: 17, marginBottom: 6 }, children: t(titles[action]) }), _jsxs("p", { className: "page-sub", style: { marginBottom: 16, fontSize: 13 }, children: [subscription.tenant?.name, " \u2014 ", money(Number(subscription.amount))] }), action === 'discount' && (_jsxs("div", { style: { display: 'grid', gap: 12, gridTemplateColumns: '150px 1fr', marginBottom: 12 }, children: [_jsxs("div", { children: [_jsx("label", { className: "form-label", htmlFor: "sa-sub-discount-kind", children: t('superAdmin.subscriptions.discountKind') }), _jsxs("select", { id: "sa-sub-discount-kind", className: "form-input", value: kind, onChange: (event) => setKind(event.target.value), children: [_jsx("option", { value: "PERCENT", children: t('superAdmin.subscriptions.discountPercent') }), _jsx("option", { value: "FIXED", children: t('superAdmin.subscriptions.discountFixed') })] })] }), _jsxs("div", { children: [_jsx("label", { className: "form-label", htmlFor: "sa-sub-discount-value", children: t('superAdmin.subscriptions.discountValue') }), _jsx("input", { id: "sa-sub-discount-value", className: "form-input", type: "number", min: 0, step: kind === 'PERCENT' ? 1 : 0.01, value: value, onChange: (event) => setValue(event.target.value) })] })] })), action === 'credit' && (_jsxs("div", { style: { marginBottom: 12 }, children: [_jsx("label", { className: "form-label", htmlFor: "sa-sub-credit-amount", children: t('superAdmin.subscriptions.creditAmount') }), _jsx("input", { id: "sa-sub-credit-amount", className: "form-input", type: "number", min: 0, step: 0.01, value: value, onChange: (event) => setValue(event.target.value) })] })), action === 'refund' && (_jsxs("div", { style: { marginBottom: 12 }, children: [_jsx("label", { className: "form-label", htmlFor: "sa-sub-refund-amount", children: t('superAdmin.subscriptions.refundAmount') }), _jsx("input", { id: "sa-sub-refund-amount", className: "form-input", type: "number", min: 0, step: 0.01, placeholder: money(Number(subscription.amount)), value: value, onChange: (event) => setValue(event.target.value) }), _jsx("p", { className: "page-sub", style: { fontSize: 11, marginTop: 6 }, children: t('superAdmin.subscriptions.refundHint') })] })), action === 'cancel' && (_jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 12 }, children: [_jsx("input", { type: "checkbox", checked: immediate, onChange: (event) => setImmediate(event.target.checked) }), t('superAdmin.subscriptions.cancelImmediate')] })), action === 'discount' && (_jsx("p", { className: "page-sub", style: { fontSize: 12, marginBottom: 12 }, children: t('superAdmin.subscriptions.discountHint') })), action === 'credit' && (_jsx("p", { className: "page-sub", style: { fontSize: 12, marginBottom: 12 }, children: t('superAdmin.subscriptions.creditHint') })), _jsx("label", { className: "form-label", htmlFor: "sa-sub-action-reason", children: t('superAdmin.common.reasonLabel') }), _jsx("input", { id: "sa-sub-action-reason", className: "form-input", value: reason, onChange: (event) => setReason(event.target.value), maxLength: 500 }), _jsxs("div", { style: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }, children: [_jsx("button", { className: "btn btn--ghost", onClick: onClose, disabled: busy, children: t('actions.cancel') }), _jsx("button", { className: "btn btn--primary", disabled: busy || !isValid(), onClick: () => {
                                if (!isValid()) {
                                    notify(t('superAdmin.subscriptions.actionFormInvalid'), 'error');
                                    return;
                                }
                                void onConfirm(buildBody());
                            }, children: t(busy ? 'superAdmin.common.busy' : titles[action]) })] })] }) }));
}
function NewSubscriptionModal({ centers, onClose, onCreated }) {
    const { t } = useTranslation();
    const [centerId, setCenterId] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('INSTAPAY');
    const [paymentReference, setPaymentReference] = useState('');
    const [startImmediately, setStartImmediately] = useState(false);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const submit = async () => {
        if (!centerId) {
            notify(t('superAdmin.subscriptions.createFormInvalid'), 'error');
            return;
        }
        setBusy(true);
        try {
            await api('/admin/subscriptions', {
                method: 'POST',
                body: JSON.stringify({
                    tenantId: centerId,
                    paymentMethod,
                    ...(paymentReference.trim() ? { paymentReference: paymentReference.trim() } : {}),
                    startImmediately,
                    ...(reason.trim() ? { reason: reason.trim() } : {}),
                }),
            });
            notify(t('superAdmin.subscriptions.created'), 'success');
            onCreated();
            onClose();
        }
        catch {
            notify(t('superAdmin.subscriptions.createError'), 'error');
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsx("div", { className: "modal-backdrop", onClick: onClose, role: "dialog", "aria-modal": "true", "aria-label": t('superAdmin.subscriptions.create'), children: _jsxs("div", { className: "modal-box", style: { maxWidth: 520 }, onClick: (event) => event.stopPropagation(), children: [_jsx("h3", { className: "page-title", style: { fontSize: 17, marginBottom: 16 }, children: t('superAdmin.subscriptions.create') }), _jsxs("div", { style: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }, children: [_jsxs("div", { children: [_jsx("label", { className: "form-label", htmlFor: "sa-new-sub-center", children: t('superAdmin.subscriptions.fieldCenter') }), _jsxs("select", { id: "sa-new-sub-center", className: "form-input", value: centerId, onChange: (event) => setCenterId(event.target.value), children: [_jsx("option", { value: "", children: t('superAdmin.subscriptions.chooseCenter') }), centers.map((center) => (_jsx("option", { value: center.id, children: center.name }, center.id)))] })] }), _jsxs("div", { children: [_jsx("label", { className: "form-label", htmlFor: "sa-new-sub-method", children: t('superAdmin.subscriptions.fieldMethod') }), _jsxs("select", { id: "sa-new-sub-method", className: "form-input", value: paymentMethod, onChange: (event) => setPaymentMethod(event.target.value), children: [_jsx("option", { value: "CASH", children: t('superAdmin.subscriptions.method.CASH') }), _jsx("option", { value: "VODAFONE_CASH", children: t('superAdmin.subscriptions.method.VODAFONE_CASH') }), _jsx("option", { value: "INSTAPAY", children: t('superAdmin.subscriptions.method.INSTAPAY') })] })] }), _jsxs("div", { children: [_jsx("label", { className: "form-label", htmlFor: "sa-new-sub-reference", children: t('superAdmin.subscriptions.fieldReference') }), _jsx("input", { id: "sa-new-sub-reference", className: "form-input", dir: "ltr", value: paymentReference, onChange: (event) => setPaymentReference(event.target.value), maxLength: 200 })] })] }), _jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 12 }, children: [_jsx("input", { type: "checkbox", checked: startImmediately, onChange: (event) => setStartImmediately(event.target.checked) }), t('superAdmin.subscriptions.startImmediately')] }), _jsxs("div", { style: { marginTop: 12 }, children: [_jsx("label", { className: "form-label", htmlFor: "sa-new-sub-reason", children: t('superAdmin.subscriptions.fieldReason') }), _jsx("input", { id: "sa-new-sub-reason", className: "form-input", value: reason, onChange: (event) => setReason(event.target.value), maxLength: 500 })] }), _jsxs("div", { style: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }, children: [_jsx("button", { className: "btn btn--ghost", onClick: onClose, disabled: busy, children: t('actions.cancel') }), _jsxs("button", { className: "btn btn--primary", style: { gap: 6 }, onClick: () => void submit(), disabled: busy, children: [_jsx(Plus, { className: "h-4 w-4" }), t(busy ? 'superAdmin.common.busy' : 'superAdmin.subscriptions.create')] })] })] }) }));
}
export function SubscriptionsSection() {
    const { t } = useTranslation();
    const centers = useCenterOptions();
    const [subscriptions, setSubscriptions] = useState([]);
    const [views, setViews] = useState(['active']);
    const [statusCounts, setStatusCounts] = useState({});
    const [view, setView] = useState('all');
    const [centerId, setCenterId] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [creating, setCreating] = useState(false);
    const [pendingAction, setPendingAction] = useState(null);
    const [actionBusy, setActionBusy] = useState(false);
    const [adjustments, setAdjustments] = useState([]);
    const [adjustmentTotals, setAdjustmentTotals] = useState({});
    const [adjustmentType, setAdjustmentType] = useState('all');
    const [staleDays, setStaleDays] = useState(3);
    const load = async () => {
        setLoading(true);
        setFailed(false);
        try {
            const params = new URLSearchParams({ page: String(page), limit: String(LIMIT), view });
            if (centerId)
                params.set('centerId', centerId);
            if (search.trim())
                params.set('search', search.trim());
            const data = await api(`/admin/subscriptions?${params}`);
            setSubscriptions(data.subscriptions);
            setViews(data.views);
            setStatusCounts(data.statusCounts);
            setStaleDays(data.stalePendingAfterDays);
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
    const loadAdjustments = async () => {
        try {
            const params = new URLSearchParams({ limit: '25' });
            if (adjustmentType !== 'all')
                params.set('type', adjustmentType);
            const data = await api(`/admin/billing/adjustments?${params}`);
            setAdjustments(data.adjustments);
            setAdjustmentTotals(data.totals);
        }
        catch {
            setAdjustments([]);
        }
    };
    useEffect(() => {
        void load();
    }, [page, view, centerId, search]);
    useEffect(() => {
        void loadAdjustments();
    }, [adjustmentType]);
    const verifyPayment = async (subscription, action) => {
        setBusyId(subscription.id);
        try {
            await api(`/subscriptions/${subscription.id}/${action}`, { method: 'POST' });
            notify(t(`superAdmin.payments.${action}ed`, { name: subscription.tenant?.name ?? '' }), 'success');
            void load();
        }
        catch {
            notify(t(`superAdmin.payments.${action}Error`), 'error');
        }
        finally {
            setBusyId(null);
        }
    };
    const runAction = async (body) => {
        if (!pendingAction)
            return;
        setActionBusy(true);
        try {
            await api(`/admin/subscriptions/${pendingAction.subscription.id}/${pendingAction.action}`, {
                method: 'POST',
                body: JSON.stringify(body),
            });
            notify(t(`superAdmin.subscriptions.actionDone.${pendingAction.action}`), 'success');
            setPendingAction(null);
            void load();
            void loadAdjustments();
        }
        catch {
            notify(t('superAdmin.subscriptions.actionError'), 'error');
        }
        finally {
            setActionBusy(false);
        }
    };
    const viewOptions = [
        { value: 'all', label: t('superAdmin.subscriptions.view.all') },
        ...views.map((value) => {
            const statusKey = VIEW_STATUS_KEY[value];
            const count = statusKey ? statusCounts[statusKey] : undefined;
            return {
                value,
                label: `${t(`superAdmin.subscriptions.view.${value}`, value)}${count !== undefined ? ` (${count})` : ''}`,
            };
        }),
    ];
    return (_jsxs("div", { children: [_jsx(SectionHeader, { titleKey: "superAdmin.subscriptions.title", subtitleKey: "superAdmin.subscriptions.subtitle", onRefresh: () => { void load(); void loadAdjustments(); }, actions: _jsxs("button", { className: "btn btn--primary", style: { fontSize: 12, gap: 6 }, onClick: () => setCreating(true), children: [_jsx(Plus, { className: "h-4 w-4" }), t('superAdmin.subscriptions.create')] }) }), _jsxs("div", { className: "search-bar", style: { marginBottom: 12 }, children: [_jsx(Search, { className: "search-icon h-4 w-4", "aria-hidden": "true" }), _jsx("input", { id: "sa-sub-search", type: "search", className: "search-input", placeholder: t('superAdmin.subscriptions.searchPlaceholder'), value: search, onChange: (event) => { setPage(1); setSearch(event.target.value); }, "aria-label": t('superAdmin.subscriptions.searchLabel') })] }), _jsxs("div", { style: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginBottom: 16 }, children: [_jsx(FilterSelect, { id: "sa-sub-filter-view", labelKey: "superAdmin.subscriptions.filterView", value: view, onChange: (value) => { setPage(1); setView(value); }, options: viewOptions }), _jsx(FilterSelect, { id: "sa-sub-filter-center", labelKey: "superAdmin.subscriptions.filterCenter", value: centerId, onChange: (value) => { setPage(1); setCenterId(value); }, options: [
                            { value: '', label: t('superAdmin.users.allCenters') },
                            ...centers.map((center) => ({ value: center.id, label: center.name })),
                        ] })] }), loading ? (_jsx(LoadingBlock, { labelKey: "superAdmin.common.loading" })) : failed ? (_jsx(ErrorBlock, { labelKey: "superAdmin.subscriptions.loadError", onRetry: () => void load() })) : subscriptions.length === 0 ? (_jsx(EmptyBlock, { labelKey: "superAdmin.subscriptions.empty" })) : (_jsxs(_Fragment, { children: [_jsx(SectionTable, { labelKey: "superAdmin.subscriptions.table", headers: [
                            'superAdmin.subscriptions.col.center',
                            'superAdmin.subscriptions.col.amount',
                            'superAdmin.subscriptions.col.status',
                            'superAdmin.subscriptions.col.period',
                            'superAdmin.common.actions',
                        ], colSpan: 5, emptyKey: "superAdmin.subscriptions.empty", children: subscriptions.map((subscription) => {
                            const busy = busyId === subscription.id;
                            return (_jsxs("tr", { children: [_jsxs("td", { children: [_jsx("strong", { children: subscription.tenant?.name ?? '—' }), _jsx("br", {}), _jsx("span", { className: "page-sub", style: { fontSize: 12 }, dir: "ltr", children: subscription.paymentReference ?? subscription.tenant?.slug ?? '' })] }), _jsx("td", { children: _jsx("strong", { children: money(Number(subscription.amount)) }) }), _jsx("td", { children: _jsxs("div", { style: { display: 'grid', gap: 4 }, children: [_jsx(Pill, { tone: STATUS_TONE[subscription.status] ?? 'muted', children: t(`superAdmin.subscriptions.status.${subscription.status}`, subscription.status) }), subscription.isStale && (_jsx("span", { style: { fontSize: 11, color: 'var(--color-warning, #d97706)' }, children: t('superAdmin.subscriptions.stale', { days: staleDays }) }))] }) }), _jsxs("td", { style: { fontSize: 12 }, children: [formatDate(subscription.periodStart), " \u2192 ", formatDate(subscription.periodEnd)] }), _jsx("td", { children: _jsxs("div", { style: { display: 'flex', gap: 6, flexWrap: 'wrap' }, children: [subscription.status === 'PENDING' && (_jsxs(_Fragment, { children: [_jsxs("button", { className: "btn btn--primary", style: { fontSize: 12, padding: '4px 10px', gap: 4 }, onClick: () => void verifyPayment(subscription, 'verify'), disabled: busy, children: [_jsx(BadgeCheck, { className: "h-3 w-3" }), t('superAdmin.payments.verify')] }), _jsxs("button", { className: "btn btn--danger", style: { fontSize: 12, padding: '4px 10px', gap: 4 }, onClick: () => void verifyPayment(subscription, 'reject'), disabled: busy, children: [_jsx(Ban, { className: "h-3 w-3" }), t('superAdmin.payments.reject')] })] })), subscription.status === 'CANCELED' && (_jsxs("button", { className: "btn btn--primary", style: { fontSize: 12, padding: '4px 10px', gap: 4 }, onClick: () => setPendingAction({ action: 'reactivate', subscription }), disabled: busy, children: [_jsx(RefreshCw, { className: "h-3 w-3" }), t('superAdmin.subscriptions.action.reactivate')] })), subscription.status !== 'CANCELED' && subscription.status !== 'PENDING' && (_jsxs("button", { className: "btn btn--danger", style: { fontSize: 12, padding: '4px 10px', gap: 4 }, onClick: () => setPendingAction({ action: 'cancel', subscription }), disabled: busy, children: [_jsx(CircleSlash, { className: "h-3 w-3" }), t('superAdmin.subscriptions.action.cancel')] })), subscription.status !== 'ACTIVE' && subscription.status !== 'CANCELED' && (_jsxs("button", { className: "btn btn--ghost", style: { fontSize: 12, padding: '4px 10px', gap: 4 }, onClick: () => setPendingAction({ action: 'discount', subscription }), disabled: busy, children: [_jsx(Percent, { className: "h-3 w-3" }), t('superAdmin.subscriptions.action.discount')] })), _jsxs("button", { className: "btn btn--ghost", style: { fontSize: 12, padding: '4px 10px', gap: 4 }, onClick: () => setPendingAction({ action: 'credit', subscription }), disabled: busy, children: [_jsx(Wallet, { className: "h-3 w-3" }), t('superAdmin.subscriptions.action.credit')] }), _jsxs("button", { className: "btn btn--ghost", style: { fontSize: 12, padding: '4px 10px', gap: 4 }, onClick: () => setPendingAction({ action: 'refund', subscription }), disabled: busy, children: [_jsx(Undo2, { className: "h-3 w-3" }), t('superAdmin.subscriptions.action.refund')] })] }) })] }, subscription.id));
                        }) }), _jsx(Pagination, { page: page, pages: pages, total: total, onChange: setPage })] })), _jsxs("div", { style: { marginTop: 32 }, children: [_jsx(SectionHeader, { titleKey: "superAdmin.subscriptions.ledgerTitle", subtitleKey: "superAdmin.subscriptions.ledgerSubtitle", onRefresh: () => void loadAdjustments() }), _jsx("div", { style: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginBottom: 16 }, children: _jsx(FilterSelect, { id: "sa-adjustment-filter-type", labelKey: "superAdmin.subscriptions.filterAdjustment", value: adjustmentType, onChange: setAdjustmentType, options: [
                                { value: 'all', label: t('superAdmin.subscriptions.allAdjustments') },
                                { value: 'DISCOUNT', label: t('superAdmin.subscriptions.adjustment.DISCOUNT') },
                                { value: 'CREDIT', label: t('superAdmin.subscriptions.adjustment.CREDIT') },
                                { value: 'REFUND', label: t('superAdmin.subscriptions.adjustment.REFUND') },
                            ] }) }), adjustments.length === 0 ? (_jsx(EmptyBlock, { labelKey: "superAdmin.subscriptions.ledgerEmpty" })) : (_jsx(SectionTable, { labelKey: "superAdmin.subscriptions.ledgerTable", headers: [
                            'superAdmin.subscriptions.col.center',
                            'superAdmin.subscriptions.col.adjustment',
                            'superAdmin.subscriptions.col.amount',
                            'superAdmin.subscriptions.col.reason',
                            'superAdmin.subscriptions.col.by',
                            'superAdmin.common.time',
                        ], colSpan: 6, children: adjustments.map((adjustment) => (_jsxs("tr", { children: [_jsx("td", { style: { fontSize: 13 }, children: adjustment.tenant?.name ?? '—' }), _jsx("td", { children: _jsx(Pill, { tone: adjustment.type === 'REFUND' ? 'warning' : adjustment.type === 'DISCOUNT' ? 'accent' : 'primary', children: t(`superAdmin.subscriptions.adjustment.${adjustment.type}`, adjustment.type) }) }), _jsx("td", { children: _jsx("strong", { children: money(Number(adjustment.amount)) }) }), _jsx("td", { style: { fontSize: 12 }, children: adjustment.reason ?? '—' }), _jsx("td", { style: { fontSize: 12 }, children: adjustment.createdBy?.fullName ?? '—' }), _jsx("td", { style: { fontSize: 12 }, children: formatDateTime(adjustment.createdAt) })] }, adjustment.id))) })), _jsxs("p", { className: "page-sub", style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 12 }, children: [_jsx(CreditCard, { className: "h-3 w-3", "aria-hidden": "true" }), t('superAdmin.subscriptions.ledgerTotals', {
                                discount: money(adjustmentTotals.DISCOUNT ?? 0),
                                credit: money(adjustmentTotals.CREDIT ?? 0),
                                refund: money(adjustmentTotals.REFUND ?? 0),
                            })] })] }), creating && (_jsx(NewSubscriptionModal, { centers: centers, onClose: () => setCreating(false), onCreated: () => { void load(); void loadAdjustments(); } })), pendingAction && (_jsx(ActionModal, { action: pendingAction.action, subscription: pendingAction.subscription, busy: actionBusy, onConfirm: runAction, onClose: () => setPendingAction(null) }))] }));
}
