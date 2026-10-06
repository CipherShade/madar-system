import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Plus, Search, ShieldOff, ShieldCheck, UserPlus, X } from 'lucide-react';
import { Pill, notify } from '../../../components/ui/kit';
import { api } from '../../../lib/api';
import { EmptyBlock, ErrorBlock, FilterSelect, LoadingBlock, Pagination, SectionHeader, SectionTable, TemporaryPasswordNotice } from './primitives';
import { formatDate, formatDateTime, formatNumber } from './format';
const LIMIT = 20;
const EMPTY_FILTERS = { search: '', role: 'all', status: 'all', centerId: '' };
function ReasonModal({ titleKey, hintKey, confirmKey, busy, onConfirm, onClose, }) {
    const { t } = useTranslation();
    const [reason, setReason] = useState('');
    const [error, setError] = useState(null);
    return (_jsx("div", { className: "modal-backdrop", onClick: onClose, role: "dialog", "aria-modal": "true", "aria-label": t(titleKey), children: _jsxs("div", { className: "modal-box", style: { maxWidth: 460 }, onClick: (event) => event.stopPropagation(), children: [_jsx("h3", { className: "page-title", style: { fontSize: 17, marginBottom: 8 }, children: t(titleKey) }), _jsx("p", { className: "page-sub", style: { marginBottom: 16, fontSize: 13 }, children: t(hintKey) }), _jsx("label", { className: "form-label", htmlFor: "sa-user-reason", children: t('superAdmin.common.reasonLabel') }), _jsx("input", { id: "sa-user-reason", className: "form-input", value: reason, onChange: (event) => { setReason(event.target.value); setError(null); }, maxLength: 500 }), error && _jsx("p", { role: "alert", style: { color: 'var(--color-danger, #b91c1c)', fontSize: 13, marginTop: 8 }, children: error }), _jsxs("div", { style: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }, children: [_jsx("button", { className: "btn btn--ghost", onClick: onClose, disabled: busy, children: t('actions.cancel') }), _jsx("button", { className: "btn btn--danger", disabled: busy, onClick: () => {
                                if (reason.trim().length < 2) {
                                    setError(t('superAdmin.common.reasonRequired'));
                                    return;
                                }
                                void onConfirm(reason.trim());
                            }, children: t(busy ? 'superAdmin.common.busy' : confirmKey) })] })] }) }));
}
function CreateUserModal({ centers, roles, onClose, onCreated, }) {
    const { t } = useTranslation();
    const [centerId, setCenterId] = useState('');
    const [username, setUsername] = useState('');
    const [fullName, setFullName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('RECEPTIONIST');
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const submit = async () => {
        setBusy(true);
        try {
            const data = await api('/admin/users', {
                method: 'POST',
                body: JSON.stringify({
                    centerId,
                    username: username.trim(),
                    fullName: fullName.trim(),
                    role,
                    ...(phoneNumber.trim() ? { phoneNumber: phoneNumber.trim() } : {}),
                    ...(email.trim() ? { email: email.trim() } : {}),
                    ...(reason.trim() ? { reason: reason.trim() } : {}),
                }),
            });
            notify(t('superAdmin.users.created', { name: data.user.fullName }), 'success');
            onCreated({ name: data.user.username, temporaryPassword: data.temporaryPassword });
            onClose();
        }
        catch {
            notify(t('superAdmin.users.createError'), 'error');
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsx("div", { className: "modal-backdrop", onClick: onClose, role: "dialog", "aria-modal": "true", "aria-label": t('superAdmin.users.create'), children: _jsxs("div", { className: "modal-box", style: { maxWidth: 560 }, onClick: (event) => event.stopPropagation(), children: [_jsx("h3", { className: "page-title", style: { fontSize: 17, marginBottom: 16 }, children: t('superAdmin.users.create') }), _jsxs("div", { style: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }, children: [_jsxs("div", { children: [_jsx("label", { className: "form-label", htmlFor: "sa-new-user-center", children: t('superAdmin.users.fieldCenter') }), _jsxs("select", { id: "sa-new-user-center", className: "form-input", value: centerId, onChange: (event) => setCenterId(event.target.value), children: [_jsx("option", { value: "", children: t('superAdmin.users.chooseCenter') }), centers.map((center) => (_jsx("option", { value: center.id, children: center.name }, center.id)))] })] }), _jsxs("div", { children: [_jsx("label", { className: "form-label", htmlFor: "sa-new-user-role", children: t('superAdmin.users.fieldRole') }), _jsx("select", { id: "sa-new-user-role", className: "form-input", value: role, onChange: (event) => setRole(event.target.value), children: roles.map((value) => (_jsx("option", { value: value, children: t(`superAdmin.users.role.${value}`, value) }, value))) })] }), _jsxs("div", { children: [_jsx("label", { className: "form-label", htmlFor: "sa-new-user-name", children: t('superAdmin.users.fieldFullName') }), _jsx("input", { id: "sa-new-user-name", className: "form-input", value: fullName, onChange: (event) => setFullName(event.target.value), maxLength: 100 })] }), _jsxs("div", { children: [_jsx("label", { className: "form-label", htmlFor: "sa-new-user-username", children: t('superAdmin.users.fieldUsername') }), _jsx("input", { id: "sa-new-user-username", className: "form-input", dir: "ltr", value: username, onChange: (event) => setUsername(event.target.value), maxLength: 50 })] }), _jsxs("div", { children: [_jsx("label", { className: "form-label", htmlFor: "sa-new-user-phone", children: t('superAdmin.users.fieldPhone') }), _jsx("input", { id: "sa-new-user-phone", className: "form-input", type: "tel", dir: "ltr", placeholder: "01xxxxxxxxx", value: phoneNumber, onChange: (event) => setPhoneNumber(event.target.value) })] }), _jsxs("div", { children: [_jsx("label", { className: "form-label", htmlFor: "sa-new-user-email", children: t('superAdmin.users.fieldEmail') }), _jsx("input", { id: "sa-new-user-email", className: "form-input", type: "email", dir: "ltr", value: email, onChange: (event) => setEmail(event.target.value), maxLength: 200 })] })] }), _jsxs("div", { style: { marginTop: 12 }, children: [_jsx("label", { className: "form-label", htmlFor: "sa-new-user-reason", children: t('superAdmin.users.fieldReason') }), _jsx("input", { id: "sa-new-user-reason", className: "form-input", value: reason, onChange: (event) => setReason(event.target.value), maxLength: 500 })] }), _jsx("p", { className: "page-sub", style: { fontSize: 12, marginTop: 12 }, children: t('superAdmin.users.passwordAutoNotice') }), _jsxs("div", { style: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }, children: [_jsx("button", { className: "btn btn--ghost", onClick: onClose, disabled: busy, children: t('actions.cancel') }), _jsxs("button", { className: "btn btn--primary", style: { gap: 6 }, disabled: busy, onClick: () => {
                                if (!centerId || username.trim().length < 3 || fullName.trim().length < 2) {
                                    notify(t('superAdmin.users.createFormInvalid'), 'error');
                                    return;
                                }
                                void submit();
                            }, children: [_jsx(UserPlus, { className: "h-4 w-4" }), t(busy ? 'superAdmin.common.busy' : 'superAdmin.users.create')] })] })] }) }));
}
function UserDetailModal({ id, onClose }) {
    const { t } = useTranslation();
    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        void api(`/admin/users/${id}`)
            .then((data) => {
            if (!cancelled)
                setDetail(data.user);
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
    return (_jsx("div", { className: "modal-backdrop", onClick: onClose, role: "dialog", "aria-modal": "true", "aria-label": t('superAdmin.users.detailTitle'), children: _jsxs("div", { className: "modal-box", style: { maxWidth: 640 }, onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }, children: [_jsx("h3", { className: "page-title", style: { fontSize: 17, flex: 1 }, children: t('superAdmin.users.detailTitle') }), _jsx("button", { className: "btn btn--ghost", onClick: onClose, "aria-label": t('actions.close'), style: { padding: '4px 8px' }, children: _jsx(X, { className: "h-4 w-4" }) })] }), loading ? (_jsx(LoadingBlock, { labelKey: "superAdmin.common.loading" })) : failed || !detail ? (_jsx(ErrorBlock, { labelKey: "superAdmin.users.loadError" })) : (_jsxs(_Fragment, { children: [_jsxs("div", { style: { display: 'grid', gap: 6, fontSize: 13, marginBottom: 16 }, children: [_jsxs("div", { children: [_jsx("strong", { children: detail.fullName }), ' ', _jsx(Pill, { tone: "accent", children: t(`superAdmin.users.role.${detail.role}`, detail.role) }), ' ', _jsx(Pill, { tone: detail.isActive ? 'success' : 'danger', children: t(detail.isActive ? 'superAdmin.common.active' : 'superAdmin.common.inactive') })] }), _jsxs("div", { className: "page-sub", dir: "ltr", style: { fontSize: 12 }, children: ["@", detail.username] }), _jsxs("div", { className: "page-sub", style: { fontSize: 12 }, children: [t('superAdmin.users.centerLabel'), ": ", detail.tenant?.name ?? t('superAdmin.users.noCenter'), ' · ', t('superAdmin.users.centerUsersActive', { count: detail.centerUsersActive })] }), _jsxs("div", { className: "page-sub", style: { fontSize: 12 }, children: [t('superAdmin.users.lastLogin'), ": ", formatDateTime(detail.lastLoginAt), " \u00B7 ", t('superAdmin.users.createdAt'), ": ", formatDate(detail.createdAt)] }), _jsxs("div", { className: "page-sub", style: { fontSize: 12 }, children: [t('superAdmin.users.activityCounts'), ": ", formatNumber(detail._count.auditLogs), " / ", formatNumber(detail._count.shiftRegisters), " / ", formatNumber(detail._count.attendances)] })] }), detail.recentActivity.length === 0 ? (_jsx(EmptyBlock, { labelKey: "superAdmin.users.noActivity" })) : (_jsx(SectionTable, { labelKey: "superAdmin.users.activityTable", headers: ['superAdmin.users.col.action', 'superAdmin.users.col.entity', 'superAdmin.common.time'], colSpan: 3, children: detail.recentActivity.map((entry) => (_jsxs("tr", { children: [_jsx("td", { style: { fontSize: 12 }, children: _jsx("code", { children: entry.action }) }), _jsx("td", { style: { fontSize: 12 }, children: entry.entityType ?? '—' }), _jsx("td", { style: { fontSize: 12 }, children: formatDateTime(entry.createdAt) })] }, entry.id))) }))] }))] }) }));
}
export function UsersSection() {
    const { t } = useTranslation();
    const [users, setUsers] = useState([]);
    const [centers, setCenters] = useState([]);
    const [roles, setRoles] = useState(['ADMIN', 'RECEPTIONIST']);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [detailId, setDetailId] = useState(null);
    const [creating, setCreating] = useState(false);
    const [pendingAction, setPendingAction] = useState(null);
    const [actionBusy, setActionBusy] = useState(false);
    const [tempPassword, setTempPassword] = useState(null);
    const load = async () => {
        setLoading(true);
        setFailed(false);
        try {
            const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
            if (filters.search.trim())
                params.set('search', filters.search.trim());
            if (filters.role !== 'all')
                params.set('role', filters.role);
            if (filters.status !== 'all')
                params.set('status', filters.status);
            if (filters.centerId)
                params.set('centerId', filters.centerId);
            const data = await api(`/admin/users?${params}`);
            setUsers(data.users);
            setCenters(data.centers);
            setRoles(data.roles);
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
    const toggleActive = async (user) => {
        setBusyId(user.id);
        try {
            await api(`/admin/users/${user.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ isActive: !user.isActive }),
            });
            notify(t(user.isActive ? 'superAdmin.users.disabled' : 'superAdmin.users.enabled', { name: user.fullName }), 'success');
            void load();
        }
        catch {
            notify(t('superAdmin.users.updateError'), 'error');
        }
        finally {
            setBusyId(null);
        }
    };
    const runPendingAction = async (reason) => {
        if (!pendingAction)
            return;
        setActionBusy(true);
        try {
            if (pendingAction.kind === 'reset') {
                const data = await api(`/admin/users/${pendingAction.user.id}/reset-password`, { method: 'POST', body: JSON.stringify({ reason }) });
                const notice = t('superAdmin.users.passwordHandOver');
                setTempPassword({ username: pendingAction.user.username, password: data.temporaryPassword, notice });
                notify(t('superAdmin.users.passwordReset'), 'success');
            }
            else {
                await api(`/admin/users/${pendingAction.user.id}/revoke-sessions`, {
                    method: 'POST',
                    body: JSON.stringify({ reason }),
                });
                notify(t('superAdmin.users.sessionsRevoked', { name: pendingAction.user.fullName }), 'success');
            }
            setPendingAction(null);
            void load();
        }
        catch {
            notify(t('superAdmin.users.actionError'), 'error');
        }
        finally {
            setActionBusy(false);
        }
    };
    return (_jsxs("div", { children: [_jsx(SectionHeader, { titleKey: "superAdmin.users.title", subtitleKey: "superAdmin.users.subtitle", onRefresh: () => void load(), actions: _jsxs("button", { className: "btn btn--primary", style: { fontSize: 12, gap: 6 }, onClick: () => setCreating(true), children: [_jsx(Plus, { className: "h-4 w-4" }), t('superAdmin.users.create')] }) }), _jsxs("div", { className: "search-bar", style: { marginBottom: 12 }, children: [_jsx(Search, { className: "search-icon h-4 w-4", "aria-hidden": "true" }), _jsx("input", { id: "sa-user-search", type: "search", className: "search-input", placeholder: t('superAdmin.users.searchPlaceholder'), value: filters.search, onChange: (event) => updateFilter({ search: event.target.value }), "aria-label": t('superAdmin.users.searchLabel') })] }), _jsxs("div", { style: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginBottom: 16 }, children: [_jsx(FilterSelect, { id: "sa-user-filter-center", labelKey: "superAdmin.users.filterCenter", value: filters.centerId, onChange: (value) => updateFilter({ centerId: value }), options: [
                            { value: '', label: t('superAdmin.users.allCenters') },
                            ...centers.map((center) => ({ value: center.id, label: center.name })),
                        ] }), _jsx(FilterSelect, { id: "sa-user-filter-role", labelKey: "superAdmin.users.filterRole", value: filters.role, onChange: (value) => updateFilter({ role: value }), options: [
                            { value: 'all', label: t('superAdmin.users.allRoles') },
                            { value: 'ADMIN', label: t('superAdmin.users.role.ADMIN') },
                            { value: 'RECEPTIONIST', label: t('superAdmin.users.role.RECEPTIONIST') },
                            { value: 'SUPER_ADMIN', label: t('superAdmin.users.role.SUPER_ADMIN') },
                        ] }), _jsx(FilterSelect, { id: "sa-user-filter-status", labelKey: "superAdmin.users.filterStatus", value: filters.status, onChange: (value) => updateFilter({ status: value }), options: [
                            { value: 'all', label: t('superAdmin.users.allStatuses') },
                            { value: 'active', label: t('superAdmin.common.active') },
                            { value: 'inactive', label: t('superAdmin.common.inactive') },
                        ] })] }), loading ? (_jsx(LoadingBlock, { labelKey: "superAdmin.common.loading" })) : failed ? (_jsx(ErrorBlock, { labelKey: "superAdmin.users.loadError", onRetry: () => void load() })) : (_jsxs(_Fragment, { children: [_jsx(SectionTable, { labelKey: "superAdmin.users.table", headers: [
                            'superAdmin.users.col.user',
                            'superAdmin.users.col.center',
                            'superAdmin.users.col.role',
                            'superAdmin.users.col.status',
                            'superAdmin.users.col.lastLogin',
                            'superAdmin.common.actions',
                        ], colSpan: 6, emptyKey: "superAdmin.users.empty", children: users.length === 0 ? undefined : (users.map((user) => {
                            const busy = busyId === user.id;
                            return (_jsxs("tr", { style: { opacity: user.isActive ? 1 : 0.6 }, children: [_jsxs("td", { children: [_jsx("strong", { children: user.fullName }), _jsx("br", {}), _jsxs("span", { className: "page-sub", style: { fontSize: 12 }, dir: "ltr", children: ["@", user.username] })] }), _jsx("td", { style: { fontSize: 13 }, children: user.centerName ?? t('superAdmin.users.noCenter') }), _jsx("td", { children: _jsx(Pill, { tone: "accent", children: t(`superAdmin.users.role.${user.role}`, user.role) }) }), _jsx("td", { children: _jsx(Pill, { tone: user.isActive ? 'success' : 'danger', children: t(user.isActive ? 'superAdmin.common.active' : 'superAdmin.common.inactive') }) }), _jsx("td", { style: { fontSize: 12 }, children: formatDateTime(user.lastLoginAt) }), _jsx("td", { children: _jsxs("div", { style: { display: 'flex', gap: 6, flexWrap: 'wrap' }, children: [_jsx("button", { className: "btn btn--ghost", style: { fontSize: 12, padding: '4px 10px' }, onClick: () => setDetailId(user.id), "aria-label": t('superAdmin.users.viewFor', { name: user.fullName }), children: t('superAdmin.users.view') }), _jsxs("button", { className: "btn btn--ghost", style: { fontSize: 12, padding: '4px 10px', gap: 4 }, onClick: () => setPendingAction({ user, kind: 'reset' }), disabled: busy, "aria-label": t('superAdmin.users.resetFor', { name: user.fullName }), children: [_jsx(KeyRound, { className: "h-3 w-3" }), t('superAdmin.users.resetAccess')] }), _jsx("button", { className: `btn ${user.isActive ? 'btn--danger' : 'btn--primary'}`, style: { fontSize: 12, padding: '4px 10px', gap: 4 }, onClick: () => void toggleActive(user), disabled: busy, children: user.isActive ? _jsxs(_Fragment, { children: [_jsx(ShieldOff, { className: "h-3 w-3" }), " ", t('superAdmin.users.disable')] }) : _jsxs(_Fragment, { children: [_jsx(ShieldCheck, { className: "h-3 w-3" }), " ", t('superAdmin.users.enable')] }) })] }) })] }, user.id));
                        })) }), _jsx(Pagination, { page: page, pages: pages, total: total, onChange: setPage })] })), creating && (_jsx(CreateUserModal, { centers: centers, roles: roles, onClose: () => setCreating(false), onCreated: (result) => {
                    if (result.temporaryPassword) {
                        setTempPassword({
                            username: result.name,
                            password: result.temporaryPassword,
                            notice: t('superAdmin.users.passwordHandOver'),
                        });
                    }
                    void load();
                } })), detailId && _jsx(UserDetailModal, { id: detailId, onClose: () => setDetailId(null) }), pendingAction && (_jsx(ReasonModal, { titleKey: pendingAction.kind === 'reset' ? 'superAdmin.users.resetTitle' : 'superAdmin.users.revokeTitle', hintKey: pendingAction.kind === 'reset' ? 'superAdmin.users.resetHint' : 'superAdmin.users.revokeHint', confirmKey: pendingAction.kind === 'reset' ? 'superAdmin.users.resetAccess' : 'superAdmin.users.revokeSessions', busy: actionBusy, onConfirm: runPendingAction, onClose: () => setPendingAction(null) })), tempPassword && (_jsx("div", { className: "modal-backdrop", onClick: () => setTempPassword(null), role: "dialog", "aria-modal": "true", "aria-label": t('superAdmin.users.passwordShownOnce'), children: _jsxs("div", { className: "modal-box", style: { maxWidth: 460 }, onClick: (event) => event.stopPropagation(), children: [_jsxs("h3", { className: "page-title", style: { fontSize: 17, marginBottom: 12 }, dir: "ltr", children: ["@", tempPassword.username] }), _jsx(TemporaryPasswordNotice, { value: tempPassword.password }), _jsx("p", { className: "page-sub", style: { fontSize: 12, marginTop: 12 }, children: tempPassword.notice }), _jsx("div", { style: { display: 'flex', justifyContent: 'flex-end', marginTop: 18 }, children: _jsx("button", { className: "btn btn--primary", onClick: () => setTempPassword(null), children: t('actions.close') }) })] }) }))] }));
}
