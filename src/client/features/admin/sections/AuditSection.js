import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { api } from '../../../lib/api';
import { SectionHeader, LoadingBlock, ErrorBlock, SectionTable } from './primitives';
import { formatDateTime, shortId } from './format';
const LIMIT = 50;
export function AuditSection() {
    const { t } = useTranslation();
    const [entries, setEntries] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [action, setAction] = useState('');
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const pages = Math.max(1, Math.ceil(total / LIMIT));
    const load = async () => {
        setLoading(true);
        setFailed(false);
        try {
            const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
            if (action.trim())
                params.set('action', action.trim());
            const data = await api(`/admin/super-audit?${params}`);
            setEntries(data.logs);
            setTotal(data.pagination.total);
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
    }, [page, action]);
    return (_jsxs("div", { children: [_jsx(SectionHeader, { titleKey: "superAdmin.audit.title", subtitleKey: "superAdmin.audit.subtitle", onRefresh: () => void load() }), _jsxs("div", { className: "search-bar", style: { marginBottom: 16 }, children: [_jsx(Search, { className: "search-icon h-4 w-4", "aria-hidden": "true" }), _jsx("input", { id: "sa-audit-action", type: "search", className: "search-input", placeholder: t('superAdmin.audit.filterPlaceholder'), value: action, onChange: (event) => {
                            setAction(event.target.value);
                            setPage(1);
                        }, "aria-label": t('superAdmin.audit.filterLabel') })] }), loading ? (_jsx(LoadingBlock, { labelKey: "superAdmin.common.loading" })) : failed ? (_jsx(ErrorBlock, { labelKey: "superAdmin.audit.loadError", onRetry: () => void load() })) : (_jsxs(_Fragment, { children: [_jsx(SectionTable, { labelKey: "superAdmin.audit.table", headers: [
                            'superAdmin.audit.col.action',
                            'superAdmin.audit.col.actor',
                            'superAdmin.audit.col.tenant',
                            'superAdmin.audit.col.entity',
                            'superAdmin.audit.col.reason',
                            'superAdmin.common.time',
                        ], colSpan: 6, emptyKey: "superAdmin.audit.empty", children: entries.length === 0 ? undefined : (entries.map((entry) => (_jsxs("tr", { children: [_jsx("td", { children: _jsx("code", { style: { fontSize: 12 }, children: entry.action }) }), _jsx("td", { children: entry.actor ? (_jsxs(_Fragment, { children: [_jsx("span", { children: entry.actor.fullName }), _jsxs("span", { className: "page-sub", style: { display: 'block', fontSize: 11 }, children: ["@", entry.actor.username] })] })) : (_jsx("span", { className: "page-sub", children: "\u2014" })) }), _jsx("td", { style: { fontSize: 13 }, children: entry.tenant?.name ?? _jsx("span", { className: "page-sub", children: "\u2014" }) }), _jsxs("td", { style: { fontSize: 12 }, children: [entry.entityType ?? '—', entry.entityId && (_jsx("span", { className: "page-sub", style: { display: 'block' }, dir: "ltr", children: shortId(entry.entityId) }))] }), _jsx("td", { style: { fontSize: 12 }, children: entry.reason ?? _jsx("span", { className: "page-sub", children: "\u2014" }) }), _jsx("td", { style: { fontSize: 12 }, children: formatDateTime(entry.createdAt) })] }, entry.id)))) }), pages > 1 && (_jsxs("div", { className: "pagination", style: { marginTop: 16 }, children: [_jsx("button", { className: "btn btn--ghost", disabled: page <= 1, onClick: () => setPage((p) => p - 1), "aria-label": t('common.previous'), children: t('common.previous') }), _jsx("span", { className: "page-sub", style: { padding: '0 12px' }, children: t('common.pageOf', { page, pages }) }), _jsx("button", { className: "btn btn--ghost", disabled: page >= pages, onClick: () => setPage((p) => p + 1), "aria-label": t('common.next'), children: t('common.next') })] }))] }))] }));
}
