import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquarePlus, Search } from 'lucide-react';
import { Pill, notify } from '../../../components/ui/kit';
import { api } from '../../../lib/api';
import { SectionHeader, LoadingBlock, ErrorBlock, SectionTable } from './primitives';
import { formatDateTime, shortId } from './format';
const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const LIMIT = 50;
const TONES = {
    OPEN: 'danger',
    IN_PROGRESS: 'warning',
    RESOLVED: 'success',
    CLOSED: 'muted',
};
export function SupportSection() {
    const { t } = useTranslation();
    const [notes, setNotes] = useState([]);
    const [openCount, setOpenCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [statusFilter, setStatusFilter] = useState('');
    const [busyId, setBusyId] = useState(null);
    const [centers, setCenters] = useState([]);
    const [centerId, setCenterId] = useState('');
    const [text, setText] = useState('');
    const [creating, setCreating] = useState(false);
    const load = async () => {
        setLoading(true);
        setFailed(false);
        try {
            const params = new URLSearchParams({ limit: String(LIMIT) });
            if (statusFilter)
                params.set('status', statusFilter);
            const data = await api(`/admin/support-notes?${params}`);
            setNotes(data.notes);
            setOpenCount(data.pagination.openCount);
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
    }, [statusFilter]);
    useEffect(() => {
        let cancelled = false;
        void api('/admin/tenants?page=1&limit=200')
            .then((data) => {
            if (!cancelled)
                setCenters(data.tenants);
        })
            .catch(() => undefined);
        return () => { cancelled = true; };
    }, []);
    const create = async () => {
        if (!centerId || text.trim().length < 2) {
            notify(t('superAdmin.support.formInvalid'), 'error');
            return;
        }
        setCreating(true);
        try {
            await api('/admin/support-notes', {
                method: 'POST',
                body: JSON.stringify({ tenantId: centerId, text: text.trim() }),
            });
            notify(t('superAdmin.support.created'), 'success');
            setText('');
            setCenterId('');
            void load();
        }
        catch {
            notify(t('superAdmin.support.createError'), 'error');
        }
        finally {
            setCreating(false);
        }
    };
    const setStatus = async (note, next) => {
        setBusyId(note.id);
        try {
            await api(`/admin/support-notes/${note.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ status: next }),
            });
            void load();
        }
        catch {
            notify(t('superAdmin.support.updateError'), 'error');
        }
        finally {
            setBusyId(null);
        }
    };
    return (_jsxs("div", { children: [_jsx(SectionHeader, { titleKey: "superAdmin.support.title", subtitleKey: "superAdmin.support.subtitle", onRefresh: () => void load() }), _jsxs("div", { className: "table-wrapper", style: { padding: 16, marginBottom: 20 }, children: [_jsxs("strong", { style: { display: 'block', marginBottom: 12 }, children: [t('superAdmin.support.create'), " \u2014 ", t('superAdmin.support.openCount', { count: openCount })] }), _jsxs("div", { style: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }, children: [_jsxs("div", { children: [_jsx("label", { className: "form-label", htmlFor: "sa-note-center", children: t('superAdmin.support.fieldCenter') }), _jsxs("select", { id: "sa-note-center", className: "form-input", value: centerId, onChange: (event) => setCenterId(event.target.value), children: [_jsx("option", { value: "", children: t('superAdmin.support.chooseCenter') }), centers.map((center) => (_jsx("option", { value: center.id, children: center.name }, center.id)))] })] }), _jsxs("div", { children: [_jsx("label", { className: "form-label", htmlFor: "sa-note-text", children: t('superAdmin.support.fieldText') }), _jsx("input", { id: "sa-note-text", className: "form-input", value: text, onChange: (event) => setText(event.target.value), maxLength: 4000 })] })] }), _jsxs("button", { className: "btn btn--primary", style: { marginTop: 12, fontSize: 12 }, onClick: () => void create(), disabled: creating, children: [_jsx(MessageSquarePlus, { className: "h-4 w-4" }), t(creating ? 'superAdmin.common.busy' : 'superAdmin.support.addNote')] })] }), _jsxs("div", { className: "search-bar", style: { marginBottom: 16 }, children: [_jsx(Search, { className: "search-icon h-4 w-4", "aria-hidden": "true" }), _jsxs("select", { className: "search-input", value: statusFilter, onChange: (event) => setStatusFilter(event.target.value), "aria-label": t('superAdmin.support.filterLabel'), children: [_jsx("option", { value: "", children: t('superAdmin.support.allStatuses') }), STATUSES.map((status) => (_jsx("option", { value: status, children: t(`superAdmin.support.status.${status}`) }, status)))] })] }), loading ? (_jsx(LoadingBlock, { labelKey: "superAdmin.common.loading" })) : failed ? (_jsx(ErrorBlock, { labelKey: "superAdmin.support.loadError", onRetry: () => void load() })) : (_jsx(SectionTable, { labelKey: "superAdmin.support.table", headers: [
                    'superAdmin.support.col.center',
                    'superAdmin.support.col.note',
                    'superAdmin.support.col.status',
                    'superAdmin.support.col.author',
                    'superAdmin.support.col.updated',
                ], colSpan: 5, emptyKey: "superAdmin.support.empty", children: notes.length === 0 ? undefined : (notes.map((note) => {
                    const busy = busyId === note.id;
                    return (_jsxs("tr", { children: [_jsx("td", { children: _jsx("strong", { children: note.tenant.name }) }), _jsx("td", { style: { fontSize: 13 }, children: note.text }), _jsxs("td", { children: [_jsx(Pill, { tone: TONES[note.status] ?? 'muted', children: t(`superAdmin.support.status.${note.status}`, note.status) }), _jsx("div", { style: { display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }, children: STATUSES.map((status) => (_jsx("button", { className: `btn ${status === note.status ? 'btn--primary' : 'btn--ghost'}`, style: { fontSize: 11, padding: '2px 8px' }, onClick: () => void setStatus(note, status), disabled: busy || status === note.status, title: t('superAdmin.support.setStatus', { status: t(`superAdmin.support.status.${status}`) }), children: t(`superAdmin.support.short.${status}`) }, status))) })] }), _jsxs("td", { style: { fontSize: 12 }, children: [note.author.fullName, _jsxs("span", { className: "page-sub", style: { display: 'block', fontSize: 11 }, dir: "ltr", children: ["@", note.author.username] }), _jsx("span", { className: "page-sub", style: { display: 'block', fontSize: 11 }, dir: "ltr", children: shortId(note.id) })] }), _jsx("td", { style: { fontSize: 12 }, children: formatDateTime(note.updatedAt) })] }, note.id));
                })) }))] }));
}
