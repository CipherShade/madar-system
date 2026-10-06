import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Send, Archive } from 'lucide-react';
import { Pill, notify } from '../../../components/ui/kit';
import { api } from '../../../lib/api';
import { SectionHeader, LoadingBlock, ErrorBlock, SectionTable } from './primitives';
import { formatDateTime } from './format';
export function NotificationsSection() {
    const { t } = useTranslation();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [creating, setCreating] = useState(false);
    const [titleAr, setTitleAr] = useState('');
    const [bodyAr, setBodyAr] = useState('');
    const [audience, setAudience] = useState('ALL_CENTERS');
    const [audienceIds, setAudienceIds] = useState('');
    const [publishNow, setPublishNow] = useState(false);
    const load = async () => {
        setLoading(true);
        setFailed(false);
        try {
            const data = await api('/admin/notifications');
            setItems(data.notifications);
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
    const ids = audienceIds.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean);
    const submit = async () => {
        if (audience !== 'ALL_CENTERS' && ids.length === 0) {
            notify(t('superAdmin.notifications.audienceRequired'), 'error');
            return;
        }
        setCreating(true);
        try {
            await api('/admin/notifications', {
                method: 'POST',
                body: JSON.stringify({
                    titleAr: titleAr.trim(),
                    bodyAr: bodyAr.trim(),
                    audience,
                    ...(ids.length > 0 ? { audienceIds: ids } : {}),
                    publishNow,
                }),
            });
            notify(t('superAdmin.notifications.created'), 'success');
            setTitleAr('');
            setBodyAr('');
            setAudienceIds('');
            setPublishNow(false);
            void load();
        }
        catch {
            notify(t('superAdmin.notifications.createError'), 'error');
        }
        finally {
            setCreating(false);
        }
    };
    const act = async (item, action) => {
        setBusyId(item.id);
        try {
            await api(`/admin/notifications/${item.id}/${action}`, { method: 'POST' });
            notify(t(`superAdmin.notifications.${action}ed`), 'success');
            void load();
        }
        catch {
            notify(t(`superAdmin.notifications.${action}Error`), 'error');
        }
        finally {
            setBusyId(null);
        }
    };
    return (_jsxs("div", { children: [_jsx(SectionHeader, { titleKey: "superAdmin.notifications.title", subtitleKey: "superAdmin.notifications.subtitle", onRefresh: () => void load() }), _jsxs("div", { className: "table-wrapper", style: { marginBottom: 20, padding: 16 }, children: [_jsx("strong", { style: { display: 'block', marginBottom: 12 }, children: t('superAdmin.notifications.compose') }), _jsxs("div", { style: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }, children: [_jsxs("div", { children: [_jsx("label", { className: "form-label", htmlFor: "sa-notif-title", children: t('superAdmin.notifications.fieldTitle') }), _jsx("input", { id: "sa-notif-title", className: "form-input", value: titleAr, onChange: (event) => setTitleAr(event.target.value), maxLength: 200 })] }), _jsxs("div", { children: [_jsx("label", { className: "form-label", htmlFor: "sa-notif-audience", children: t('superAdmin.notifications.fieldAudience') }), _jsx("select", { id: "sa-notif-audience", className: "form-input", value: audience, onChange: (event) => setAudience(event.target.value), children: ['ALL_CENTERS', 'PLAN', 'CENTER', 'USER'].map((option) => (_jsx("option", { value: option, children: t(`superAdmin.notifications.audience.${option}`) }, option))) })] }), audience !== 'ALL_CENTERS' && (_jsxs("div", { children: [_jsx("label", { className: "form-label", htmlFor: "sa-notif-ids", children: t('superAdmin.notifications.fieldTargets') }), _jsx("input", { id: "sa-notif-ids", className: "form-input", value: audienceIds, onChange: (event) => setAudienceIds(event.target.value), placeholder: t('superAdmin.notifications.targetsPlaceholder') })] }))] }), _jsxs("div", { style: { marginTop: 12 }, children: [_jsx("label", { className: "form-label", htmlFor: "sa-notif-body", children: t('superAdmin.notifications.fieldBody') }), _jsx("textarea", { id: "sa-notif-body", className: "form-input", rows: 3, value: bodyAr, onChange: (event) => setBodyAr(event.target.value), maxLength: 2000 })] }), _jsxs("div", { style: { marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }, children: [_jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }, children: [_jsx("input", { type: "checkbox", checked: publishNow, onChange: (event) => setPublishNow(event.target.checked) }), t('superAdmin.notifications.publishNow')] }), _jsxs("button", { className: "btn btn--primary", onClick: () => void submit(), disabled: creating || titleAr.trim().length < 2 || bodyAr.trim().length < 2, children: [_jsx(Plus, { className: "h-4 w-4" }), t(creating ? 'superAdmin.common.busy' : 'superAdmin.notifications.create')] })] })] }), loading ? (_jsx(LoadingBlock, { labelKey: "superAdmin.common.loading" })) : failed ? (_jsx(ErrorBlock, { labelKey: "superAdmin.notifications.loadError", onRetry: () => void load() })) : (_jsx(SectionTable, { labelKey: "superAdmin.notifications.table", headers: [
                    'superAdmin.notifications.col.title',
                    'superAdmin.notifications.col.audience',
                    'superAdmin.notifications.col.status',
                    'superAdmin.notifications.col.sentAt',
                    'superAdmin.common.actions',
                ], colSpan: 5, emptyKey: "superAdmin.notifications.empty", children: items.length === 0 ? undefined : (items.map((item) => {
                    const busy = busyId === item.id;
                    return (_jsxs("tr", { children: [_jsxs("td", { children: [_jsx("strong", { children: item.titleAr }), _jsx("br", {}), _jsx("span", { className: "page-sub", style: { fontSize: 12 }, children: item.bodyAr })] }), _jsxs("td", { children: [t(`superAdmin.notifications.audience.${item.audience}`, item.audience), item.audienceIds.length > 0 && (_jsx("span", { className: "page-sub", style: { display: 'block', fontSize: 11 }, children: t('superAdmin.notifications.targetCount', { count: item.audienceIds.length }) }))] }), _jsx("td", { children: _jsx(Pill, { tone: item.status === 'ACTIVE' ? 'success' : item.status === 'DRAFT' ? 'warning' : 'muted', children: t(`superAdmin.notifications.status.${item.status}`, item.status) }) }), _jsx("td", { style: { fontSize: 12 }, children: formatDateTime(item.sentAt) }), _jsx("td", { children: _jsxs("div", { style: { display: 'flex', gap: 6, flexWrap: 'wrap' }, children: [item.status !== 'ACTIVE' && (_jsxs("button", { className: "btn btn--primary", style: { fontSize: 12, padding: '4px 12px', gap: 4 }, onClick: () => void act(item, 'send'), disabled: busy, children: [_jsx(Send, { className: "h-3 w-3" }), t('superAdmin.notifications.send')] })), item.status !== 'ARCHIVED' && (_jsxs("button", { className: "btn btn--ghost", style: { fontSize: 12, padding: '4px 12px', gap: 4 }, onClick: () => void act(item, 'archive'), disabled: busy, children: [_jsx(Archive, { className: "h-3 w-3" }), t('superAdmin.notifications.archive')] }))] }) })] }, item.id));
                })) }))] }));
}
