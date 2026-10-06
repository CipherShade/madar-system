import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { Pill } from '../../../components/ui/kit';
import { api } from '../../../lib/api';
import { SectionHeader, LoadingBlock, ErrorBlock, SectionTable, NoticeBlock } from './primitives';
import { formatDateTime, shortId } from './format';
function useSecurityData() {
    const [logs, setLogs] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const load = async () => {
        setLoading(true);
        setFailed(false);
        try {
            const [history, active] = await Promise.all([
                api('/admin/security/history?limit=100'),
                api('/admin/security/sessions'),
            ]);
            setLogs(history.logs);
            setSessions(active.sessions);
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
    return { logs, sessions, loading, failed, load };
}
export function SecuritySection() {
    const { t } = useTranslation();
    const { logs, sessions, loading, failed, load } = useSecurityData();
    const [busyId, setBusyId] = useState(null);
    const revoke = async (id) => {
        setBusyId(id);
        try {
            await api(`/admin/security/sessions/${id}/revoke`, { method: 'POST' });
            void load();
        }
        finally {
            setBusyId(null);
        }
    };
    return (_jsxs("div", { children: [_jsx(SectionHeader, { titleKey: "superAdmin.security.title", subtitleKey: "superAdmin.security.subtitle", onRefresh: () => void load() }), _jsx(NoticeBlock, { labelKey: "superAdmin.security.notice", tone: "info" }), loading ? (_jsx(LoadingBlock, { labelKey: "superAdmin.common.loading" })) : failed ? (_jsx(ErrorBlock, { labelKey: "superAdmin.security.loadError", onRetry: () => void load() })) : (_jsxs(_Fragment, { children: [_jsx("h3", { className: "page-title", style: { fontSize: 15, marginBottom: 10 }, children: t('superAdmin.sessions.title') }), _jsx(NoticeBlock, { labelKey: "superAdmin.sessions.notice", tone: "info" }), _jsx(SectionTable, { labelKey: "superAdmin.sessions.table", headers: [
                            'superAdmin.sessions.col.center',
                            'superAdmin.sessions.col.reason',
                            'superAdmin.sessions.col.started',
                            'superAdmin.sessions.col.state',
                            'superAdmin.common.actions',
                        ], colSpan: 5, emptyKey: "superAdmin.sessions.empty", children: sessions.length === 0 ? undefined : (sessions.map((session) => {
                            const active = !session.endedAt;
                            return (_jsxs("tr", { children: [_jsx("td", { style: { fontSize: 13 }, children: session.impersonatingTenant?.name ?? _jsx("span", { className: "page-sub", children: "\u2014" }) }), _jsx("td", { style: { fontSize: 12 }, children: session.reason ?? _jsx("span", { className: "page-sub", children: "\u2014" }) }), _jsx("td", { style: { fontSize: 12 }, children: formatDateTime(session.startedAt) }), _jsx("td", { children: _jsx(Pill, { tone: active ? 'warning' : 'muted', children: t(active ? 'superAdmin.sessions.active' : 'superAdmin.sessions.ended') }) }), _jsx("td", { children: active && (_jsx("button", { className: "btn btn--danger", style: { fontSize: 12, padding: '4px 10px' }, onClick: () => void revoke(session.id), disabled: busyId === session.id, children: t('superAdmin.sessions.revoke') })) })] }, session.id));
                        })) }), _jsx("h3", { className: "page-title", style: { fontSize: 15, margin: '28px 0 10px' }, children: t('superAdmin.security.historyTitle') }), _jsx(SectionTable, { labelKey: "superAdmin.security.table", headers: [
                            'superAdmin.audit.col.action',
                            'superAdmin.audit.col.tenant',
                            'superAdmin.audit.col.reason',
                            'superAdmin.audit.col.entity',
                            'superAdmin.common.time',
                        ], colSpan: 5, emptyKey: "superAdmin.security.empty", children: logs.length === 0 ? undefined : (logs.map((entry) => (_jsxs("tr", { children: [_jsx("td", { children: _jsxs("div", { style: { display: 'flex', gap: 6, alignItems: 'center' }, children: [_jsx(ShieldCheck, { className: "h-3 w-3", "aria-hidden": "true" }), _jsx("code", { style: { fontSize: 12 }, children: entry.action })] }) }), _jsx("td", { style: { fontSize: 13 }, children: entry.tenant?.name ?? _jsx("span", { className: "page-sub", children: "\u2014" }) }), _jsx("td", { style: { fontSize: 12 }, children: entry.reason ?? _jsx("span", { className: "page-sub", children: "\u2014" }) }), _jsxs("td", { style: { fontSize: 12 }, children: [entry.entityType ?? '—', entry.entityId && _jsx("span", { className: "page-sub", style: { display: 'block' }, dir: "ltr", children: shortId(entry.entityId) })] }), _jsx("td", { style: { fontSize: 12 }, children: formatDateTime(entry.createdAt) })] }, entry.id)))) })] }))] }));
}
