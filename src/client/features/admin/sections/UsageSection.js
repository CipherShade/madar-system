import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Pill } from '../../../components/ui/kit';
import { api } from '../../../lib/api';
import { EmptyBlock, ErrorBlock, FilterSelect, LoadingBlock, Pagination, SectionHeader, SectionTable } from './primitives';
import { formatDate, formatNumber } from './format';
const LIMIT = 25;
const METRIC_LABEL_KEY = {
    USERS: 'superAdmin.usage.metric.USERS',
    RECEPTIONISTS: 'superAdmin.usage.metric.RECEPTIONISTS',
    STUDENTS: 'superAdmin.usage.metric.STUDENTS',
    VISITS: 'superAdmin.usage.metric.VISITS',
    BRANCHES: 'superAdmin.usage.metric.BRANCHES',
};
function UsageBars({ row }) {
    const { t } = useTranslation();
    return (_jsx("div", { style: { display: 'grid', gap: 4, minWidth: 220 }, children: row.metrics.map((metric) => (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }, children: [_jsx("span", { style: { minWidth: 96, color: 'var(--color-muted, #64748b)' }, children: t(METRIC_LABEL_KEY[metric.metric]) }), _jsx("span", { style: { minWidth: 92 }, children: formatNumber(metric.used) })] }, metric.metric))) }));
}
export function UsageSection() {
    const { t } = useTranslation();
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [pages, setPages] = useState(1);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('all');
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const load = async () => {
        setLoading(true);
        setFailed(false);
        try {
            const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
            if (search.trim())
                params.set('search', search.trim());
            if (status !== 'all')
                params.set('status', status);
            const data = await api(`/admin/usage?${params}`);
            setRows(data.rows);
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
    }, [page, search, status]);
    return (_jsxs("div", { children: [_jsx(SectionHeader, { titleKey: "superAdmin.usage.title", subtitleKey: "superAdmin.usage.subtitle", onRefresh: () => void load() }), _jsxs("div", { className: "search-bar", style: { marginBottom: 12 }, children: [_jsx(Search, { className: "search-icon h-4 w-4", "aria-hidden": "true" }), _jsx("input", { id: "sa-usage-search", type: "search", className: "search-input", placeholder: t('superAdmin.usage.searchPlaceholder'), value: search, onChange: (event) => { setPage(1); setSearch(event.target.value); }, "aria-label": t('superAdmin.usage.searchLabel') })] }), _jsx("div", { style: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 16 }, children: _jsx(FilterSelect, { id: "sa-usage-filter-status", labelKey: "superAdmin.usage.filterStatus", value: status, onChange: (value) => { setPage(1); setStatus(value); }, options: [
                        { value: 'all', label: t('superAdmin.usage.allStatuses') },
                        { value: 'active', label: t('superAdmin.common.active') },
                        { value: 'suspended', label: t('superAdmin.common.suspended') },
                    ] }) }), loading ? (_jsx(LoadingBlock, { labelKey: "superAdmin.common.loading" })) : failed ? (_jsx(ErrorBlock, { labelKey: "superAdmin.usage.loadError", onRetry: () => void load() })) : rows.length === 0 ? (_jsx(EmptyBlock, { labelKey: "superAdmin.usage.empty" })) : (_jsx(SectionTable, { labelKey: "superAdmin.usage.table", headers: [
                    'superAdmin.usage.col.center',
                    'superAdmin.usage.col.status',
                    'superAdmin.usage.col.counts',
                    'superAdmin.usage.col.bars',
                    'superAdmin.usage.col.period',
                ], colSpan: 5, children: rows.map((row) => (_jsxs("tr", { children: [_jsxs("td", { children: [_jsx("strong", { children: row.name }), _jsx("br", {}), _jsx("span", { className: "page-sub", style: { fontSize: 12 }, children: row.slug })] }), _jsx("td", { children: _jsx(Pill, { tone: row.subscriptionStatus === 'ACTIVE' ? 'success' : 'muted', children: t(`superAdmin.subscriptions.status.${row.subscriptionStatus}`, row.subscriptionStatus) }) }), _jsx("td", { style: { fontSize: 12 }, children: t('superAdmin.usage.countsLine', {
                                users: formatNumber(row.userCount),
                                receptionists: formatNumber(row.receptionistCount),
                                students: formatNumber(row.studentCount),
                                visits: formatNumber(row.visitCount),
                            }) }), _jsx("td", { children: _jsx(UsageBars, { row: row }) }), _jsx("td", { style: { fontSize: 12 }, children: formatDate(row.periodStart) })] }, row.id))) })), _jsx(Pagination, { page: page, pages: pages, total: total, onChange: setPage })] }));
}
