import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw, Save, Target } from 'lucide-react';
import { Pill, notify } from '../../../components/ui/kit';
import { api } from '../../../lib/api';
import { SectionHeader, LoadingBlock, ErrorBlock, NoticeBlock } from './primitives';
import { formatDateTime } from './format';
import { useCenterOptions } from './hooks';
function TargetingEditor({ flag, onSaved }) {
    const { t } = useTranslation();
    const centers = useCenterOptions();
    const [selectedCenters, setSelectedCenters] = useState(() => ({ ...flag.value.centers }));
    const [busy, setBusy] = useState(false);
    const [expanded, setExpanded] = useState(false);
    useEffect(() => {
        setSelectedCenters({ ...flag.value.centers });
    }, [flag.value.centers]);
    const dirty = JSON.stringify(selectedCenters) !== JSON.stringify(flag.value.centers);
    const save = async () => {
        setBusy(true);
        try {
            await api(`/admin/feature-flags/${flag.key}`, {
                method: 'PUT',
                body: JSON.stringify({ centers: selectedCenters }),
            });
            notify(t('superAdmin.featureFlags.targetingSaved', { name: flag.labelAr }), 'success');
            onSaved();
        }
        catch {
            notify(t('superAdmin.featureFlags.updateError'), 'error');
        }
        finally {
            setBusy(false);
        }
    };
    const clearAll = () => {
        setSelectedCenters({});
    };
    if (!expanded) {
        return (_jsxs("button", { className: "btn btn--ghost", style: { fontSize: 12, padding: '4px 12px', gap: 4 }, onClick: () => setExpanded(true), "aria-label": t('superAdmin.featureFlags.openTargeting', { name: flag.labelAr }), children: [_jsx(Target, { className: "h-3 w-3" }), t('superAdmin.featureFlags.targeting')] }));
    }
    return (_jsxs("div", { style: { flexBasis: '100%', display: 'grid', gap: 14, borderTop: '1px solid var(--border-color, rgba(0,0,0,0.08))', paddingTop: 14 }, children: [_jsxs("div", { children: [_jsx("strong", { style: { fontSize: 13, display: 'block' }, children: t('superAdmin.featureFlags.byCenter') }), centers.length === 0 ? (_jsx("span", { className: "page-sub", style: { fontSize: 12 }, children: t('superAdmin.featureFlags.noCenters') })) : (_jsx("div", { style: { display: 'grid', gap: 6, marginTop: 6, maxHeight: 220, overflowY: 'auto' }, children: centers.map((center) => (_jsxs("label", { style: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }, children: [_jsx("input", { type: "checkbox", checked: selectedCenters[center.id] === true, onChange: (event) => setSelectedCenters((prev) => ({ ...prev, [center.id]: event.target.checked })) }), _jsx("span", { children: center.name })] }, center.id))) }))] }), _jsxs("div", { style: { display: 'flex', gap: 8, flexWrap: 'wrap' }, children: [_jsxs("button", { className: "btn btn--primary", style: { fontSize: 12, padding: '4px 12px', gap: 4 }, onClick: () => void save(), disabled: busy || !dirty, children: [_jsx(Save, { className: "h-3 w-3" }), t(busy ? 'superAdmin.common.busy' : 'superAdmin.featureFlags.saveTargeting')] }), _jsx("button", { className: "btn btn--ghost", style: { fontSize: 12, padding: '4px 12px' }, onClick: clearAll, disabled: busy || Object.keys(selectedCenters).length === 0, children: t('superAdmin.featureFlags.clearTargeting') }), _jsx("button", { className: "btn btn--ghost", style: { fontSize: 12, padding: '4px 12px' }, onClick: () => setExpanded(false), disabled: busy, children: t('actions.close') }), dirty && _jsx("span", { style: { alignSelf: 'center', fontSize: 12, color: 'var(--color-warning, #d97706)' }, children: t('superAdmin.common.unsavedChanges') })] })] }));
}
export function FeatureFlagsSection() {
    const { t } = useTranslation();
    const [flags, setFlags] = useState([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [busyKey, setBusyKey] = useState(null);
    const load = async () => {
        setLoading(true);
        setFailed(false);
        try {
            const data = await api('/admin/feature-flags');
            setFlags(data.flags);
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
    const toggle = async (flag) => {
        setBusyKey(flag.key);
        try {
            await api(`/admin/feature-flags/${flag.key}`, {
                method: 'PUT',
                body: JSON.stringify({ enabled: !flag.value.enabled }),
            });
            void load();
        }
        catch {
            notify(t('superAdmin.featureFlags.updateError'), 'error');
        }
        finally {
            setBusyKey(null);
        }
    };
    const reset = async (flag) => {
        setBusyKey(flag.key);
        try {
            await api(`/admin/feature-flags/${flag.key}`, { method: 'DELETE' });
            notify(t('superAdmin.featureFlags.reset'), 'success');
            void load();
        }
        catch {
            notify(t('superAdmin.featureFlags.resetError'), 'error');
        }
        finally {
            setBusyKey(null);
        }
    };
    return (_jsxs("div", { children: [_jsx(SectionHeader, { titleKey: "superAdmin.featureFlags.title", subtitleKey: "superAdmin.featureFlags.subtitle", onRefresh: () => void load() }), _jsx(NoticeBlock, { labelKey: "superAdmin.featureFlags.targetingNotice", tone: "info" }), loading ? (_jsx(LoadingBlock, { labelKey: "superAdmin.common.loading" })) : failed ? (_jsx(ErrorBlock, { labelKey: "superAdmin.featureFlags.loadError", onRetry: () => void load() })) : (_jsx("div", { style: { display: 'grid', gap: 12 }, children: flags.map((flag) => {
                    const busy = busyKey === flag.key;
                    const perCenter = Object.keys(flag.value.centers).length;
                    return (_jsxs("div", { className: "table-wrapper", style: { padding: 16, display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }, children: [_jsxs("div", { style: { flex: 1, minWidth: 240 }, children: [_jsx("strong", { style: { display: 'block' }, children: flag.labelAr }), _jsx("span", { className: "page-sub", style: { display: 'block', fontSize: 12, marginTop: 2 }, children: flag.descriptionAr }), _jsxs("div", { style: { display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }, children: [_jsx(Pill, { tone: flag.value.enabled ? 'success' : 'muted', children: t(flag.value.enabled ? 'superAdmin.featureFlags.enabled' : 'superAdmin.featureFlags.disabled') }), perCenter > 0 && (_jsx(Pill, { tone: "accent", children: t('superAdmin.featureFlags.perCenterCount', { count: perCenter }) }))] }), flag.updatedAt && (_jsx("span", { className: "page-sub", style: { display: 'block', fontSize: 11, marginTop: 6 }, children: t('superAdmin.featureFlags.lastUpdated', { date: formatDateTime(flag.updatedAt) }) }))] }), _jsxs("div", { style: { display: 'flex', gap: 6, alignItems: 'center' }, children: [_jsx("button", { className: `btn ${flag.value.enabled ? 'btn--danger' : 'btn--primary'}`, style: { fontSize: 12, padding: '4px 12px' }, onClick: () => void toggle(flag), disabled: busy, children: t(flag.value.enabled ? 'superAdmin.featureFlags.disable' : 'superAdmin.featureFlags.enable') }), _jsxs("button", { className: "btn btn--ghost", style: { fontSize: 12, padding: '4px 12px', gap: 4 }, onClick: () => void reset(flag), disabled: busy, "aria-label": t('superAdmin.featureFlags.resetFor', { name: flag.labelAr }), children: [_jsx(RotateCcw, { className: "h-3 w-3" }), t('superAdmin.featureFlags.resetLabel')] })] }), _jsx(TargetingEditor, { flag: flag, onSaved: () => void load() })] }, flag.key));
                }) }))] }));
}
