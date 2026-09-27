import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, LogOut, RefreshCw } from 'lucide-react';
import { notify } from '../../components/ui/kit';
import { api } from '../../lib/api';
import { OverviewSection } from './sections/OverviewSection';
import { CentersSection } from './sections/CentersSection';
import { UsersSection } from './sections/UsersSection';
import { SubscriptionsSection } from './sections/SubscriptionsSection';
import { PlansSection } from './sections/PlansSection';
import { UsageSection } from './sections/UsageSection';
import { RevenueSection } from './sections/RevenueSection';
import { NotificationsSection } from './sections/NotificationsSection';
import { FeatureFlagsSection } from './sections/FeatureFlagsSection';
import { HealthSection } from './sections/HealthSection';
import { AuditSection } from './sections/AuditSection';
import { SettingsSection } from './sections/SettingsSection';
import { DataSection } from './sections/DataSection';
import { SecuritySection } from './sections/SecuritySection';
import { SupportSection } from './sections/SupportSection';
import { AccountSection } from './sections/AccountSection';
import { DEFAULT_SECTION, SECTIONS, SECTION_GROUPS, type SectionId } from './sections/registry';
import type { CenterPreview, TenantRow, ViewAsSession } from './sections/types';

const SECTION_KEY = 'madar.superadmin.section';

function ExtendTrialModal({
  tenant,
  onConfirm,
  onClose,
}: {
  tenant: TenantRow;
  onConfirm: (days: number) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await onConfirm(days);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={t('superAdmin.centers.extendTrial')}>
      <div className="modal-box" style={{ maxWidth: 420 }} onClick={(event) => event.stopPropagation()}>
        <h3 className="page-title" style={{ fontSize: 17, marginBottom: 12 }}>{t('superAdmin.centers.extendTrial')}</h3>
        <p className="page-sub" style={{ marginBottom: 20 }}>
          {tenant.name}
          {tenant.isTrialActive && (
            <span style={{ display: 'block', marginTop: 4, fontSize: 13 }}>
              {t('superAdmin.centers.trialDaysRemaining', { days: tenant.trialDaysRemaining })}
            </span>
          )}
        </p>
        <label className="form-label" htmlFor="sa-extend-days">{t('superAdmin.centers.extendDaysLabel')}</label>
        <input
          id="sa-extend-days"
          type="number"
          className="form-input"
          min={1}
          max={365}
          value={days}
          onChange={(event) => setDays(Math.max(1, Math.min(365, Number(event.target.value))))}
          style={{ marginBottom: 20 }}
        />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn--ghost" onClick={onClose} disabled={loading}>{t('actions.cancel')}</button>
          <button className="btn btn--primary" onClick={handleSubmit} disabled={loading}>
            {loading ? t('superAdmin.common.busy') : t('superAdmin.centers.extendConfirm', { days })}
          </button>
        </div>
      </div>
    </div>
  );
}

function ViewAsModal({
  tenant,
  onConfirm,
  onClose,
}: {
  tenant: TenantRow;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError(t('superAdmin.viewAs.reasonRequired'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch {
      setError(t('superAdmin.viewAs.startError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={t('superAdmin.viewAs.modalTitle')}>
      <div className="modal-box" style={{ maxWidth: 460 }} onClick={(event) => event.stopPropagation()}>
        <h3 className="page-title" style={{ fontSize: 17, marginBottom: 8 }}>{t('superAdmin.viewAs.modalTitle')}</h3>
        <p className="page-sub" style={{ marginBottom: 6 }}><strong>{tenant.name}</strong></p>
        <p className="page-sub" style={{ marginBottom: 20, fontSize: 13 }}>{t('superAdmin.viewAs.modalSubtitle')}</p>
        <label className="form-label" htmlFor="sa-viewas-reason">{t('superAdmin.viewAs.reasonLabel')}</label>
        <input
          id="sa-viewas-reason"
          type="text"
          className="form-input"
          placeholder={t('superAdmin.viewAs.reasonPlaceholder')}
          value={reason}
          onChange={(event) => { setReason(event.target.value); setError(null); }}
          style={{ marginBottom: error ? 6 : 20 }}
        />
        {error && (
          <p role="alert" style={{ color: 'var(--color-danger, #b91c1c)', fontSize: 13, marginBottom: 16 }}>{error}</p>
        )}
        <p className="page-sub" style={{ marginBottom: 16, fontSize: 12 }}>{t('superAdmin.viewAs.previewHint')}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn--ghost" onClick={onClose} disabled={loading}>{t('actions.cancel')}</button>
          <button className="btn btn--primary" onClick={handleSubmit} disabled={loading} style={{ gap: 6 }}>
            <Eye className="h-3 w-3" />
            {loading ? t('superAdmin.viewAs.starting') : t('superAdmin.viewAs.start')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SuperAdminPage() {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState<SectionId>(() => {
    if (typeof window === 'undefined') return DEFAULT_SECTION;
    const stored = window.sessionStorage.getItem(SECTION_KEY);
    return SECTIONS.some((section) => section.id === stored) ? (stored as SectionId) : DEFAULT_SECTION;
  });
  const [refreshToken, setRefreshToken] = useState(0);
  const [extendTarget, setExtendTarget] = useState<TenantRow | null>(null);
  const [viewAsTarget, setViewAsTarget] = useState<TenantRow | null>(null);
  const [viewAs, setViewAs] = useState<ViewAsSession | null>(null);
  const [viewAsBusy, setViewAsBusy] = useState(false);
  const [preview, setPreview] = useState<CenterPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const select = useCallback((section: SectionId) => {
    setActiveSection(section);
    try {
      window.sessionStorage.setItem(SECTION_KEY, section);
    } catch {
      /* storage is optional */
    }
  }, []);

  const handleRefresh = useCallback(() => setRefreshToken((value) => value + 1), []);

  useEffect(() => {
    if (!viewAs) return;
    const tick = () => {
      if (new Date(viewAs.expiresAt).getTime() <= Date.now()) {
        setViewAs(null);
        setPreview(null);
        notify(t('superAdmin.viewAs.expired'), 'error');
      }
    };
    const timer = window.setInterval(tick, 5000);
    return () => window.clearInterval(timer);
  }, [viewAs, t]);

  const handleExtendTrial = async (tenant: TenantRow, days: number) => {
    try {
      await api<unknown>(`/admin/tenants/${tenant.id}/extend-trial`, {
        method: 'PATCH',
        body: JSON.stringify({ days }),
      });
      notify(t('superAdmin.centers.extended', { name: tenant.name, days }), 'success');
      handleRefresh();
    } catch {
      notify(t('superAdmin.centers.extendError'), 'error');
    }
  };

  const handleStartViewAs = async (tenant: TenantRow, reason: string) => {
    const data = await api<{ sessionId: string; token: string; expiresAt: string; tenant: { id: string; name: string } }>(
      `/admin/tenants/${tenant.id}/view-as`,
      { method: 'POST', body: JSON.stringify({ reason }) },
    );
    setViewAs({ sessionId: data.sessionId, token: data.token, expiresAt: data.expiresAt, tenantName: data.tenant.name });
    select('centers');
  };

  const handleEndViewAs = async () => {
    if (!viewAs) return;
    setViewAsBusy(true);
    try {
      await api<{ sessionId: string }>('/admin/view-as/return', {
        method: 'POST',
        body: JSON.stringify({ sessionId: viewAs.sessionId }),
      });
      setViewAs(null);
      setPreview(null);
      notify(t('superAdmin.viewAs.return'), 'success');
    } catch {
      notify(t('superAdmin.viewAs.returnError'), 'error');
    } finally {
      setViewAsBusy(false);
    }
  };

  const loadCenterPreview = async () => {
    if (!viewAs) return;
    setPreviewLoading(true);
    try {
      const data = await api<{ students: CenterPreview['students']; pagination?: { total?: number } }>('/students?limit=5&page=1', {
        headers: { Authorization: `Bearer ${viewAs.token}` },
      });
      setPreview({
        students: data.students ?? [],
        total: data.pagination?.total ?? data.students?.length ?? 0,
      });
    } catch {
      notify(t('superAdmin.viewAs.previewLoadError'), 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const viewAsMinutes = viewAs ? Math.max(0, Math.ceil((new Date(viewAs.expiresAt).getTime() - Date.now()) / 60000)) : 0;

  const sectionProps = { key: `${activeSection}-${refreshToken}` };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('superAdmin.shell.title')}</h1>
          <p className="page-sub">{t('superAdmin.shell.subtitle')}</p>
        </div>
        <button
          className="btn btn--ghost"
          onClick={handleRefresh}
          aria-label={t('common.refresh')}
          title={t('common.refresh')}
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {viewAs && (
        <div
          role="status"
          style={{
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: 12,
            padding: '12px 16px',
            marginBottom: 20,
            color: '#1e3a8a',
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
          <div style={{ flex: 1, minWidth: 220 }}>
            <strong>{t('superAdmin.viewAs.activeTitle', { name: viewAs.tenantName })}</strong>
            <span style={{ display: 'block', fontSize: 12, marginTop: 2 }}>
              {t('superAdmin.viewAs.expiresIn', { minutes: viewAsMinutes })} — {t('superAdmin.viewAs.previewHint')}
            </span>
          </div>
          <button
            className="btn btn--ghost"
            style={{ fontSize: 12, padding: '4px 12px', gap: 4 }}
            onClick={() => void loadCenterPreview()}
            disabled={previewLoading}
            aria-label={t('superAdmin.viewAs.previewLoad')}
          >
            {previewLoading ? <RefreshCw className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {t('superAdmin.viewAs.previewLoad')}
          </button>
          <button
            className="btn btn--danger"
            style={{ fontSize: 12, padding: '4px 12px', gap: 4 }}
            onClick={() => void handleEndViewAs()}
            disabled={viewAsBusy}
            aria-label={t('superAdmin.viewAs.return')}
          >
            <LogOut className="h-3 w-3" />
            {viewAsBusy ? t('superAdmin.viewAs.returning') : t('superAdmin.viewAs.return')}
          </button>
        </div>
      )}

      {viewAs && preview && (
        <div className="table-wrapper" role="region" aria-label={t('superAdmin.viewAs.previewTitle')} style={{ marginBottom: 20 }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-color, rgba(0,0,0,0.08))' }}>
            <strong>{t('superAdmin.viewAs.previewTitle')}</strong>
            <span className="page-sub" style={{ display: 'block', fontSize: 12 }}>
              {t('superAdmin.viewAs.previewSubtitle')} · {t('superAdmin.viewAs.studentsCount')}:{' '}
              {preview.total.toLocaleString('ar-EG')}
            </span>
          </div>
          {preview.students.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center' }}>
              <span className="page-sub">{t('superAdmin.viewAs.previewEmpty')}</span>
            </div>
          ) : (
            <table className="data-table" aria-label={t('superAdmin.viewAs.previewTitle')}>
              <thead>
                <tr>
                  <th scope="col">{t('students.table.code')}</th>
                  <th scope="col">{t('students.table.name')}</th>
                </tr>
              </thead>
              <tbody>
                {preview.students.map((student) => (
                  <tr key={student.id}>
                    <td><code style={{ fontSize: 12 }}>{student.studentCode}</code></td>
                    <td>{student.fullName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(210px, 250px) 1fr', gap: 20, alignItems: 'start' }}>
        <nav
          aria-label={t('superAdmin.shell.navLabel')}
          className="table-wrapper"
          style={{ padding: 12, position: 'sticky', top: 16 }}
        >
          {SECTION_GROUPS.map((group) => (
            <div key={group.id} style={{ marginBottom: 12 }}>
              <strong
                style={{
                  display: 'block',
                  fontSize: 11,
                  letterSpacing: 0.3,
                  color: 'var(--color-muted, #64748b)',
                  padding: '4px 8px',
                }}
              >
                {t(group.labelKey)}
              </strong>
              {SECTIONS.filter((section) => section.group === group.id).map((section) => {
                const Icon = section.icon;
                const isActive = section.id === activeSection;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => select(section.id)}
                    aria-current={isActive ? 'page' : undefined}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      textAlign: 'start',
                      padding: '7px 8px',
                      marginBottom: 2,
                      borderRadius: 8,
                      fontSize: 13,
                      cursor: 'pointer',
                      border: isActive ? '1px solid var(--color-primary, #0f766e)' : '1px solid transparent',
                      background: isActive ? 'var(--color-primary-soft, rgba(15,118,110,0.1))' : 'transparent',
                      color: 'inherit',
                      fontWeight: isActive ? 700 : 400,
                    }}
                  >
                    <Icon className="h-3 w-3" aria-hidden="true" />
                    <span>{t(section.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <main style={{ minWidth: 0 }}>
          {activeSection === 'overview' && <OverviewSection {...sectionProps} onNavigate={select} />}
          {activeSection === 'centers' && (
            <CentersSection {...sectionProps} onExtendTrial={setExtendTarget} onViewAs={setViewAsTarget} />
          )}
          {activeSection === 'users' && <UsersSection {...sectionProps} />}
          {activeSection === 'subscriptions' && <SubscriptionsSection {...sectionProps} />}
          {activeSection === 'plans' && <PlansSection {...sectionProps} />}
          {activeSection === 'usage' && <UsageSection {...sectionProps} />}
          {activeSection === 'revenue' && <RevenueSection {...sectionProps} />}
          {activeSection === 'notifications' && <NotificationsSection {...sectionProps} />}
          {activeSection === 'featureFlags' && <FeatureFlagsSection {...sectionProps} />}
          {activeSection === 'health' && <HealthSection {...sectionProps} />}
          {activeSection === 'audit' && <AuditSection {...sectionProps} />}
          {activeSection === 'settings' && <SettingsSection {...sectionProps} />}
          {activeSection === 'data' && <DataSection {...sectionProps} />}
          {activeSection === 'security' && <SecuritySection {...sectionProps} />}
          {activeSection === 'support' && <SupportSection {...sectionProps} />}
          {activeSection === 'account' && <AccountSection {...sectionProps} />}
        </main>
      </div>

      {extendTarget && (
        <ExtendTrialModal
          tenant={extendTarget}
          onConfirm={(days) => handleExtendTrial(extendTarget, days)}
          onClose={() => setExtendTarget(null)}
        />
      )}

      {viewAsTarget && (
        <ViewAsModal
          tenant={viewAsTarget}
          onConfirm={(reason) => handleStartViewAs(viewAsTarget, reason)}
          onClose={() => setViewAsTarget(null)}
        />
      )}

    </div>
  );
}
