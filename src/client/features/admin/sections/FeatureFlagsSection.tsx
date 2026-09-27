import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw, Save, Target } from 'lucide-react';
import { Pill, notify } from '../../../components/ui/kit';
import { api } from '../../../lib/api';
import { SectionHeader, LoadingBlock, ErrorBlock, NoticeBlock } from './primitives';
import { formatDateTime } from './format';
import { useCenterOptions } from './hooks';
import type { FeatureFlag } from './types';

const PLAN_IDS = ['FREE_TRIAL', 'ESSENTIAL', 'CONTROL', 'MULTI_BRANCH'];

function TargetingEditor({ flag, onSaved }: { flag: FeatureFlag; onSaved: () => void }) {
  const { t } = useTranslation();
  const centers = useCenterOptions();
  const [plans, setPlans] = useState<Record<string, boolean>>(() => ({ ...flag.value.plans }));
  const [selectedCenters, setSelectedCenters] = useState<Record<string, boolean>>(() => ({ ...flag.value.centers }));
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setPlans({ ...flag.value.plans });
    setSelectedCenters({ ...flag.value.centers });
  }, [flag.value.plans, flag.value.centers]);

  const dirty =
    JSON.stringify(plans) !== JSON.stringify(flag.value.plans) ||
    JSON.stringify(selectedCenters) !== JSON.stringify(flag.value.centers);

  const save = async () => {
    setBusy(true);
    try {
      await api<unknown>(`/admin/feature-flags/${flag.key}`, {
        method: 'PUT',
        body: JSON.stringify({ plans, centers: selectedCenters }),
      });
      notify(t('superAdmin.featureFlags.targetingSaved', { name: flag.labelAr }), 'success');
      onSaved();
    } catch {
      notify(t('superAdmin.featureFlags.updateError'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const clearAll = () => {
    setPlans({});
    setSelectedCenters({});
  };

  if (!expanded) {
    return (
      <button
        className="btn btn--ghost"
        style={{ fontSize: 12, padding: '4px 12px', gap: 4 }}
        onClick={() => setExpanded(true)}
        aria-label={t('superAdmin.featureFlags.openTargeting', { name: flag.labelAr })}
      >
        <Target className="h-3 w-3" />
        {t('superAdmin.featureFlags.targeting')}
      </button>
    );
  }

  return (
    <div style={{ flexBasis: '100%', display: 'grid', gap: 14, borderTop: '1px solid var(--border-color, rgba(0,0,0,0.08))', paddingTop: 14 }}>
      <div>
        <strong style={{ fontSize: 13, display: 'block' }}>{t('superAdmin.featureFlags.byPlan')}</strong>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6 }}>
          {PLAN_IDS.map((plan) => (
            <label key={plan} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={plans[plan] === true}
                onChange={(event) => setPlans((prev) => ({ ...prev, [plan]: event.target.checked }))}
              />
              {t(`superAdmin.usage.plan.${plan}`, plan)}
            </label>
          ))}
        </div>
        <span className="page-sub" style={{ display: 'block', fontSize: 11, marginTop: 6 }}>{t('superAdmin.featureFlags.planHint')}</span>
      </div>

      <div>
        <strong style={{ fontSize: 13, display: 'block' }}>{t('superAdmin.featureFlags.byCenter')}</strong>
        {centers.length === 0 ? (
          <span className="page-sub" style={{ fontSize: 12 }}>{t('superAdmin.featureFlags.noCenters')}</span>
        ) : (
          <div style={{ display: 'grid', gap: 6, marginTop: 6, maxHeight: 220, overflowY: 'auto' }}>
            {centers.map((center) => (
              <label key={center.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={selectedCenters[center.id] === true}
                  onChange={(event) => setSelectedCenters((prev) => ({ ...prev, [center.id]: event.target.checked }))}
                />
                <span>{center.name}</span>
                <span className="page-sub" style={{ fontSize: 11 }}>{t(`superAdmin.usage.plan.${center.plan}`, center.plan)}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn--primary" style={{ fontSize: 12, padding: '4px 12px', gap: 4 }} onClick={() => void save()} disabled={busy || !dirty}>
          <Save className="h-3 w-3" />
          {t(busy ? 'superAdmin.common.busy' : 'superAdmin.featureFlags.saveTargeting')}
        </button>
        <button
          className="btn btn--ghost"
          style={{ fontSize: 12, padding: '4px 12px' }}
          onClick={clearAll}
          disabled={busy || Object.keys(plans).length + Object.keys(selectedCenters).length === 0}
        >
          {t('superAdmin.featureFlags.clearTargeting')}
        </button>
        <button
          className="btn btn--ghost"
          style={{ fontSize: 12, padding: '4px 12px' }}
          onClick={() => setExpanded(false)}
          disabled={busy}
        >
          {t('actions.close')}
        </button>
        {dirty && <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--color-warning, #d97706)' }}>{t('superAdmin.common.unsavedChanges')}</span>}
      </div>
    </div>
  );
}

export function FeatureFlagsSection() {
  const { t } = useTranslation();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const data = await api<{ flags: FeatureFlag[] }>('/admin/feature-flags');
      setFlags(data.flags);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const toggle = async (flag: FeatureFlag) => {
    setBusyKey(flag.key);
    try {
      await api<unknown>(`/admin/feature-flags/${flag.key}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !flag.value.enabled }),
      });
      void load();
    } catch {
      notify(t('superAdmin.featureFlags.updateError'), 'error');
    } finally {
      setBusyKey(null);
    }
  };

  const reset = async (flag: FeatureFlag) => {
    setBusyKey(flag.key);
    try {
      await api<unknown>(`/admin/feature-flags/${flag.key}`, { method: 'DELETE' });
      notify(t('superAdmin.featureFlags.reset'), 'success');
      void load();
    } catch {
      notify(t('superAdmin.featureFlags.resetError'), 'error');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div>
      <SectionHeader titleKey="superAdmin.featureFlags.title" subtitleKey="superAdmin.featureFlags.subtitle" onRefresh={() => void load()} />
      <NoticeBlock labelKey="superAdmin.featureFlags.targetingNotice" tone="info" />

      {loading ? (
        <LoadingBlock labelKey="superAdmin.common.loading" />
      ) : failed ? (
        <ErrorBlock labelKey="superAdmin.featureFlags.loadError" onRetry={() => void load()} />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {flags.map((flag) => {
            const busy = busyKey === flag.key;
            const perCenter = Object.keys(flag.value.centers).length;
            const perPlan = Object.keys(flag.value.plans).length;
            return (
              <div
                key={flag.key}
                className="table-wrapper"
                style={{ padding: 16, display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}
              >
                <div style={{ flex: 1, minWidth: 240 }}>
                  <strong style={{ display: 'block' }}>{flag.labelAr}</strong>
                  <span className="page-sub" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>
                    {flag.descriptionAr}
                  </span>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    <Pill tone={flag.value.enabled ? 'success' : 'muted'}>
                      {t(flag.value.enabled ? 'superAdmin.featureFlags.enabled' : 'superAdmin.featureFlags.disabled')}
                    </Pill>
                    {perCenter > 0 && (
                      <Pill tone="accent">
                        {t('superAdmin.featureFlags.perCenterCount', { count: perCenter })}
                      </Pill>
                    )}
                    {perPlan > 0 && (
                      <Pill tone="primary">
                        {t('superAdmin.featureFlags.perPlanCount', { count: perPlan })}
                      </Pill>
                    )}
                  </div>
                  {flag.updatedAt && (
                    <span className="page-sub" style={{ display: 'block', fontSize: 11, marginTop: 6 }}>
                      {t('superAdmin.featureFlags.lastUpdated', { date: formatDateTime(flag.updatedAt) })}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button
                    className={`btn ${flag.value.enabled ? 'btn--danger' : 'btn--primary'}`}
                    style={{ fontSize: 12, padding: '4px 12px' }}
                    onClick={() => void toggle(flag)}
                    disabled={busy}
                  >
                    {t(flag.value.enabled ? 'superAdmin.featureFlags.disable' : 'superAdmin.featureFlags.enable')}
                  </button>
                  <button
                    className="btn btn--ghost"
                    style={{ fontSize: 12, padding: '4px 12px', gap: 4 }}
                    onClick={() => void reset(flag)}
                    disabled={busy}
                    aria-label={t('superAdmin.featureFlags.resetFor', { name: flag.labelAr })}
                  >
                    <RotateCcw className="h-3 w-3" />
                    {t('superAdmin.featureFlags.resetLabel')}
                  </button>
                </div>
                <TargetingEditor flag={flag} onSaved={() => void load()} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
