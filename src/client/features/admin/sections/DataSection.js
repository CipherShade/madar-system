import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { notify } from '../../../components/ui/kit';
import { api } from '../../../lib/api';
import { SectionHeader, LoadingBlock, ErrorBlock, SectionTable, NoticeBlock } from './primitives';
import { formatBytes, formatDateTime, formatNumber } from './format';
const EXPORTS = [
    { resource: 'tenants', labelKey: 'superAdmin.data.export.tenants' },
    { resource: 'users', labelKey: 'superAdmin.data.export.users' },
];
function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}
export function DataSection() {
    const { t } = useTranslation();
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [exporting, setExporting] = useState(null);
    const load = async () => {
        setLoading(true);
        setFailed(false);
        try {
            setStatus(await api('/admin/data/status'));
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
    const runExport = async (resource, labelKey) => {
        setExporting(resource);
        try {
            const data = await api(`/admin/data/export/${resource}?format=json`);
            const stamp = new Date().toISOString().slice(0, 10);
            download(`madar-${resource}-${stamp}.json`, JSON.stringify(data.rows, null, 2), 'application/json');
            notify(t('superAdmin.data.exportDone', { resource: t(labelKey), count: data.rows.length }), 'success');
            void load();
        }
        catch {
            notify(t('superAdmin.data.exportError'), 'error');
        }
        finally {
            setExporting(null);
        }
    };
    return (_jsxs("div", { children: [_jsx(SectionHeader, { titleKey: "superAdmin.data.title", subtitleKey: "superAdmin.data.subtitle", onRefresh: () => void load() }), _jsx(NoticeBlock, { labelKey: "superAdmin.data.auditNotice", tone: "info" }), loading ? (_jsx(LoadingBlock, { labelKey: "superAdmin.common.loading" })) : failed || !status ? (_jsx(ErrorBlock, { labelKey: "superAdmin.data.loadError", onRetry: () => void load() })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "table-wrapper", style: { padding: 16, marginBottom: 20 }, children: [_jsxs("div", { style: { display: 'flex', gap: 28, flexWrap: 'wrap', fontSize: 13 }, children: [_jsxs("span", { children: [_jsxs("strong", { children: [t('superAdmin.data.dbSize'), ":"] }), " ", formatBytes(status.databaseSizeBytes ?? 0)] }), _jsxs("span", { children: [_jsxs("strong", { children: [t('superAdmin.data.migrationsApplied'), ":"] }), " ", formatNumber(status.migrations?.applied ?? 0)] }), _jsxs("span", { children: [_jsxs("strong", { children: [t('superAdmin.data.migrationsFailed'), ":"] }), " ", formatNumber(status.migrations?.failed ?? 0)] })] }), _jsx("p", { className: "page-sub", style: { fontSize: 12, marginTop: 10 }, children: status.automatedBackupNote })] }), _jsx("h3", { className: "page-title", style: { fontSize: 15, marginBottom: 12 }, children: t('superAdmin.data.rowCounts') }), _jsx(SectionTable, { labelKey: "superAdmin.data.rowCounts", headers: ['superAdmin.data.col.table', 'superAdmin.data.col.rows'], colSpan: 2, children: Object.entries(status.counts).map(([table, count]) => (_jsxs("tr", { children: [_jsx("td", { children: _jsx("code", { style: { fontSize: 12 }, children: table }) }), _jsx("td", { children: formatNumber(count) })] }, table))) }), _jsx("h3", { className: "page-title", style: { fontSize: 15, margin: '24px 0 12px' }, children: t('superAdmin.data.exports') }), _jsx("div", { style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }, children: EXPORTS.map((item) => (_jsxs("button", { className: "btn btn--primary", style: { fontSize: 12 }, onClick: () => void runExport(item.resource, item.labelKey), disabled: exporting !== null, children: [_jsx(Download, { className: "h-4 w-4" }), exporting === item.resource ? t('superAdmin.common.busy') : t(item.labelKey)] }, item.resource))) }), _jsx(SectionTable, { labelKey: "superAdmin.data.recentExports", headers: ['superAdmin.audit.col.action', 'superAdmin.common.time', 'superAdmin.data.col.ip'], colSpan: 3, emptyKey: "superAdmin.data.noExports", children: status.recentExports.length === 0 ? undefined : (status.recentExports.map((row) => (_jsxs("tr", { children: [_jsx("td", { children: _jsx("code", { style: { fontSize: 12 }, children: row.action }) }), _jsx("td", { style: { fontSize: 12 }, children: formatDateTime(row.createdAt) }), _jsx("td", { style: { fontSize: 12 }, dir: "ltr", children: row.ip ?? '—' })] }, row.id)))) })] }))] }));
}
