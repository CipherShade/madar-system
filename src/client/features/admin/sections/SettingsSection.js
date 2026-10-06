import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import { Pill, notify } from '../../../components/ui/kit';
import { api } from '../../../lib/api';
import { SectionHeader, LoadingBlock, ErrorBlock } from './primitives';
import { formatDateTime } from './format';
function serialize(kind, value) {
    if (kind === 'number')
        return Number(value);
    if (kind === 'boolean')
        return value === true;
    if (kind === 'json') {
        try {
            return JSON.parse(String(value));
        }
        catch {
            throw new Error('invalid-json');
        }
    }
    return String(value);
}
export function SettingsSection() {
    const { t } = useTranslation();
    const [settings, setSettings] = useState([]);
    const [drafts, setDrafts] = useState({});
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [saving, setSaving] = useState(false);
    const load = async () => {
        setLoading(true);
        setFailed(false);
        try {
            const data = await api('/admin/settings');
            setSettings(data.settings);
            const next = {};
            for (const setting of data.settings) {
                next[setting.key] = setting.kind === 'boolean'
                    ? setting.value === true
                    : setting.kind === 'json'
                        ? JSON.stringify(setting.value, null, 2)
                        : String(setting.value ?? '');
            }
            setDrafts(next);
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
    const save = async () => {
        const payload = {};
        for (const setting of settings) {
            const draft = drafts[setting.key];
            if (draft === undefined)
                continue;
            try {
                payload[setting.key] = serialize(setting.kind, draft);
            }
            catch {
                notify(t('superAdmin.settings.invalidJson', { key: setting.key }), 'error');
                return;
            }
        }
        if (Object.keys(payload).length === 0) {
            notify(t('superAdmin.settings.nothingToSave'), 'error');
            return;
        }
        setSaving(true);
        try {
            await api('/admin/settings', { method: 'PUT', body: JSON.stringify({ settings: payload }) });
            notify(t('superAdmin.settings.saved'), 'success');
            void load();
        }
        catch {
            notify(t('superAdmin.settings.saveError'), 'error');
        }
        finally {
            setSaving(false);
        }
    };
    const labelFor = (key) => {
        const suffix = key.replace('platform.', '');
        return t(`superAdmin.settings.keys.${suffix}`, suffix);
    };
    return (_jsxs("div", { children: [_jsx(SectionHeader, { titleKey: "superAdmin.settings.title", subtitleKey: "superAdmin.settings.subtitle", onRefresh: () => void load(), actions: _jsxs("button", { className: "btn btn--primary", style: { fontSize: 12 }, onClick: () => void save(), disabled: saving, children: [_jsx(Save, { className: "h-4 w-4" }), t(saving ? 'superAdmin.common.busy' : 'superAdmin.settings.save')] }) }), loading ? (_jsx(LoadingBlock, { labelKey: "superAdmin.common.loading" })) : failed ? (_jsx(ErrorBlock, { labelKey: "superAdmin.settings.loadError", onRetry: () => void load() })) : (_jsx("div", { style: { display: 'grid', gap: 12 }, children: settings.map((setting) => {
                    const draft = drafts[setting.key];
                    return (_jsxs("div", { className: "table-wrapper", style: { padding: 16 }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }, children: [_jsxs("div", { children: [_jsx("label", { className: "form-label", htmlFor: `sa-setting-${setting.key}`, style: { marginBottom: 2 }, children: labelFor(setting.key) }), _jsx("code", { dir: "ltr", style: { fontSize: 11, color: 'var(--color-muted, #64748b)' }, children: setting.key })] }), _jsxs("div", { style: { display: 'flex', gap: 6, alignItems: 'center' }, children: [_jsx(Pill, { tone: "muted", children: setting.kind }), setting.isDefault && _jsx(Pill, { tone: "muted", children: t('superAdmin.settings.isDefault') })] })] }), setting.kind === 'boolean' ? (_jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }, children: [_jsx("input", { id: `sa-setting-${setting.key}`, type: "checkbox", checked: draft === true, onChange: (event) => setDrafts((prev) => ({ ...prev, [setting.key]: event.target.checked })) }), t('superAdmin.settings.enabled')] })) : setting.kind === 'json' ? (_jsx("textarea", { id: `sa-setting-${setting.key}`, className: "form-input", dir: "ltr", rows: 5, value: typeof draft === 'string' ? draft : '', onChange: (event) => setDrafts((prev) => ({ ...prev, [setting.key]: event.target.value })) })) : (_jsx("input", { id: `sa-setting-${setting.key}`, className: "form-input", type: setting.kind === 'number' ? 'number' : 'text', value: typeof draft === 'string' ? draft : '', onChange: (event) => setDrafts((prev) => ({ ...prev, [setting.key]: event.target.value })) })), setting.updatedAt && (_jsxs("span", { className: "page-sub", style: { display: 'block', fontSize: 11, marginTop: 6 }, children: [t('superAdmin.settings.lastUpdated', { date: formatDateTime(setting.updatedAt) }), setting.updatedBy ? ` — ${setting.updatedBy.fullName}` : ''] }))] }, setting.key));
                }) }))] }));
}
