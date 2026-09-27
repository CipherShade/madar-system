import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import { Pill, notify } from '../../../components/ui/kit';
import { api } from '../../../lib/api';
import { SectionHeader, LoadingBlock, ErrorBlock } from './primitives';
import { formatDateTime } from './format';
import type { PlatformSetting } from './types';

function serialize(kind: PlatformSetting['kind'], value: string | boolean): unknown {
  if (kind === 'number') return Number(value);
  if (kind === 'boolean') return value === true;
  if (kind === 'json') {
    try {
      return JSON.parse(String(value));
    } catch {
      throw new Error('invalid-json');
    }
  }
  return String(value);
}

export function SettingsSection() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<PlatformSetting[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string | boolean>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const data = await api<{ settings: PlatformSetting[] }>('/admin/settings');
      setSettings(data.settings);
      const next: Record<string, string | boolean> = {};
      for (const setting of data.settings) {
        next[setting.key] = setting.kind === 'boolean'
          ? setting.value === true
          : setting.kind === 'json'
            ? JSON.stringify(setting.value, null, 2)
            : String(setting.value ?? '');
      }
      setDrafts(next);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    const payload: Record<string, unknown> = {};
    for (const setting of settings) {
      const draft = drafts[setting.key];
      if (draft === undefined) continue;
      try {
        payload[setting.key] = serialize(setting.kind, draft);
      } catch {
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
      await api<unknown>('/admin/settings', { method: 'PUT', body: JSON.stringify({ settings: payload }) });
      notify(t('superAdmin.settings.saved'), 'success');
      void load();
    } catch {
      notify(t('superAdmin.settings.saveError'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const labelFor = (key: string) => {
    const suffix = key.replace('platform.', '');
    return t(`superAdmin.settings.keys.${suffix}`, suffix);
  };

  return (
    <div>
      <SectionHeader
        titleKey="superAdmin.settings.title"
        subtitleKey="superAdmin.settings.subtitle"
        onRefresh={() => void load()}
        actions={
          <button className="btn btn--primary" style={{ fontSize: 12 }} onClick={() => void save()} disabled={saving}>
            <Save className="h-4 w-4" />
            {t(saving ? 'superAdmin.common.busy' : 'superAdmin.settings.save')}
          </button>
        }
      />

      {loading ? (
        <LoadingBlock labelKey="superAdmin.common.loading" />
      ) : failed ? (
        <ErrorBlock labelKey="superAdmin.settings.loadError" onRetry={() => void load()} />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {settings.map((setting) => {
            const draft = drafts[setting.key];
            return (
              <div key={setting.key} className="table-wrapper" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                  <div>
                    <label className="form-label" htmlFor={`sa-setting-${setting.key}`} style={{ marginBottom: 2 }}>
                      {labelFor(setting.key)}
                    </label>
                    <code dir="ltr" style={{ fontSize: 11, color: 'var(--color-muted, #64748b)' }}>{setting.key}</code>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Pill tone="muted">{setting.kind}</Pill>
                    {setting.isDefault && <Pill tone="muted">{t('superAdmin.settings.isDefault')}</Pill>}
                  </div>
                </div>

                {setting.kind === 'boolean' ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <input
                      id={`sa-setting-${setting.key}`}
                      type="checkbox"
                      checked={draft === true}
                      onChange={(event) => setDrafts((prev) => ({ ...prev, [setting.key]: event.target.checked }))}
                    />
                    {t('superAdmin.settings.enabled')}
                  </label>
                ) : setting.kind === 'json' ? (
                  <textarea
                    id={`sa-setting-${setting.key}`}
                    className="form-input"
                    dir="ltr"
                    rows={5}
                    value={typeof draft === 'string' ? draft : ''}
                    onChange={(event) => setDrafts((prev) => ({ ...prev, [setting.key]: event.target.value }))}
                  />
                ) : (
                  <input
                    id={`sa-setting-${setting.key}`}
                    className="form-input"
                    type={setting.kind === 'number' ? 'number' : 'text'}
                    value={typeof draft === 'string' ? draft : ''}
                    onChange={(event) => setDrafts((prev) => ({ ...prev, [setting.key]: event.target.value }))}
                  />
                )}

                {setting.updatedAt && (
                  <span className="page-sub" style={{ display: 'block', fontSize: 11, marginTop: 6 }}>
                    {t('superAdmin.settings.lastUpdated', { date: formatDateTime(setting.updatedAt) })}
                    {setting.updatedBy ? ` — ${setting.updatedBy.fullName}` : ''}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
