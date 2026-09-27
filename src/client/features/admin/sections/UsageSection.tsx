import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gauge, Plus, Search, Trash2 } from 'lucide-react';
import { Pill, notify } from '../../../components/ui/kit';
import { api } from '../../../lib/api';
import { EmptyBlock, ErrorBlock, FilterSelect, LoadingBlock, NoticeBlock, Pagination, SectionHeader, SectionTable } from './primitives';
import { formatDate, formatDateTime, formatNumber } from './format';
import { useCenterOptions } from './hooks';
import { planPill } from './plan';
import type { CenterOption, UsageMetricName, UsageOverride, UsageRow } from './types';

const LIMIT = 25;

const LEVEL_TONE: Record<string, 'success' | 'warning' | 'danger' | 'muted'> = {
  none: 'muted',
  ok: 'success',
  warning: 'warning',
  strong: 'warning',
  over: 'danger',
};

const METRIC_LABEL_KEY: Record<UsageMetricName, string> = {
  USERS: 'superAdmin.usage.metric.USERS',
  RECEPTIONISTS: 'superAdmin.usage.metric.RECEPTIONISTS',
  STUDENTS: 'superAdmin.usage.metric.STUDENTS',
  VISITS: 'superAdmin.usage.metric.VISITS',
  BRANCHES: 'superAdmin.usage.metric.BRANCHES',
};

function UsageBars({ row }: { row: UsageRow }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'grid', gap: 4, minWidth: 220 }}>
      {row.metrics.map((metric) => (
        <div key={metric.metric} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span style={{ minWidth: 96, color: 'var(--color-muted, #64748b)' }}>{t(METRIC_LABEL_KEY[metric.metric])}</span>
          <span style={{ minWidth: 92 }}>
            {formatNumber(metric.used)} / {metric.limit === null ? t('superAdmin.usage.unlimited') : formatNumber(metric.limit)}
          </span>
          <span
            style={{
              flex: 1,
              minWidth: 60,
              height: 6,
              borderRadius: 4,
              background: 'var(--border-color, rgba(0,0,0,0.08))',
              overflow: 'hidden',
            }}
          >
            <span
              style={{
                display: 'block',
                height: '100%',
                width: `${Math.min(100, metric.percent ?? 0)}%`,
                background:
                  metric.level === 'over' ? 'var(--color-danger, #b91c1c)'
                    : metric.level === 'strong' || metric.level === 'warning' ? 'var(--color-warning, #d97706)'
                      : 'var(--color-primary, #0f766e)',
              }}
            />
          </span>
          <span style={{ minWidth: 40, textAlign: 'end', color: 'var(--color-muted, #64748b)' }}>
            {metric.percent === null ? '—' : `${metric.percent}%`}
          </span>
        </div>
      ))}
    </div>
  );
}

function OverrideForm({ centers, metrics, onCreated }: { centers: CenterOption[]; metrics: string[]; onCreated: () => void }) {
  const { t } = useTranslation();
  const [centerId, setCenterId] = useState('');
  const [metric, setMetric] = useState('VISITS');
  const [extraAmount, setExtraAmount] = useState('0');
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const amount = Number.parseInt(extraAmount, 10);
    if (!centerId || reason.trim().length < 2 || !Number.isFinite(amount) || amount < 0) {
      notify(t('superAdmin.usage.overrideFormInvalid'), 'error');
      return;
    }
    setBusy(true);
    try {
      await api<unknown>('/admin/usage-overrides', {
        method: 'POST',
        body: JSON.stringify({
          tenantId: centerId,
          metric,
          extraAmount: amount,
          reason: reason.trim(),
          ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
        }),
      });
      notify(t('superAdmin.usage.overrideCreated'), 'success');
      setReason('');
      setExpiresAt('');
      onCreated();
    } catch {
      notify(t('superAdmin.usage.overrideCreateError'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="table-wrapper" style={{ padding: 16, marginBottom: 20 }}>
      <strong style={{ display: 'block', marginBottom: 12 }}>{t('superAdmin.usage.overrideCreate')}</strong>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div>
          <label className="form-label" htmlFor="sa-usage-override-center">{t('superAdmin.usage.fieldCenter')}</label>
          <select id="sa-usage-override-center" className="form-input" value={centerId} onChange={(event) => setCenterId(event.target.value)}>
            <option value="">{t('superAdmin.usage.chooseCenter')}</option>
            {centers.map((center) => (
              <option key={center.id} value={center.id}>{center.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor="sa-usage-override-metric">{t('superAdmin.usage.fieldMetric')}</label>
          <select id="sa-usage-override-metric" className="form-input" value={metric} onChange={(event) => setMetric(event.target.value)}>
            {metrics.map((value) => (
              <option key={value} value={value}>{t(`superAdmin.usage.metric.${value}`, value)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor="sa-usage-override-amount">{t('superAdmin.usage.fieldAmount')}</label>
          <input id="sa-usage-override-amount" className="form-input" type="number" min={0} value={extraAmount} onChange={(event) => setExtraAmount(event.target.value)} />
        </div>
        <div>
          <label className="form-label" htmlFor="sa-usage-override-expiry">{t('superAdmin.usage.fieldExpiry')}</label>
          <input id="sa-usage-override-expiry" className="form-input" type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <label className="form-label" htmlFor="sa-usage-override-reason">{t('superAdmin.usage.fieldReason')}</label>
        <input id="sa-usage-override-reason" className="form-input" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
      </div>
      <button className="btn btn--primary" style={{ marginTop: 12, fontSize: 12, gap: 6 }} onClick={() => void submit()} disabled={busy}>
        <Plus className="h-4 w-4" />
        {t(busy ? 'superAdmin.common.busy' : 'superAdmin.usage.overrideGrant')}
      </button>
    </div>
  );
}

export function UsageSection() {
  const { t } = useTranslation();
  const centers = useCenterOptions();
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [metrics, setMetrics] = useState<string[]>(['USERS', 'RECEPTIONISTS', 'STUDENTS', 'VISITS', 'BRANCHES']);
  const [warningPercent, setWarningPercent] = useState(80);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [plan, setPlan] = useState('all');
  const [level, setLevel] = useState('all');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [overrides, setOverrides] = useState<UsageOverride[]>([]);
  const [activeOverrides, setActiveOverrides] = useState(0);
  const [overridesLoading, setOverridesLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (search.trim()) params.set('search', search.trim());
      if (status !== 'all') params.set('status', status);
      if (plan !== 'all') params.set('plan', plan);
      if (level !== 'all') params.set('level', level);
      const data = await api<{
        rows: UsageRow[];
        metrics: string[];
        warningPercent: number;
        pagination: { total: number; pages: number };
      }>(`/admin/usage?${params}`);
      setRows(data.rows);
      setMetrics(data.metrics);
      setWarningPercent(data.warningPercent);
      setTotal(data.pagination.total);
      setPages(data.pagination.pages);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const loadOverrides = async () => {
    setOverridesLoading(true);
    try {
      const data = await api<{ overrides: UsageOverride[]; pagination: { activeCount: number } }>('/admin/usage-overrides?limit=100');
      setOverrides(data.overrides);
      setActiveOverrides(data.pagination.activeCount);
    } catch {
      setOverrides([]);
    } finally {
      setOverridesLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [page, search, status, plan, level]);

  useEffect(() => {
    void loadOverrides();
  }, []);

  const revoke = async (id: string) => {
    setBusyId(id);
    try {
      await api<unknown>(`/admin/usage-overrides/${id}`, { method: 'DELETE' });
      notify(t('superAdmin.usage.overrideRevoked'), 'success');
      void loadOverrides();
      void load();
    } catch {
      notify(t('superAdmin.usage.overrideRevokeError'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <SectionHeader
        titleKey="superAdmin.usage.title"
        subtitleKey="superAdmin.usage.subtitle"
        onRefresh={() => {
          void load();
          void loadOverrides();
        }}
      />

      <div className="search-bar" style={{ marginBottom: 12 }}>
        <Search className="search-icon h-4 w-4" aria-hidden="true" />
        <input
          id="sa-usage-search"
          type="search"
          className="search-input"
          placeholder={t('superAdmin.usage.searchPlaceholder')}
          value={search}
          onChange={(event) => { setPage(1); setSearch(event.target.value); }}
          aria-label={t('superAdmin.usage.searchLabel')}
        />
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 16 }}>
        <FilterSelect
          id="sa-usage-filter-plan"
          labelKey="superAdmin.usage.filterPlan"
          value={plan}
          onChange={(value) => { setPage(1); setPlan(value); }}
          options={[
            { value: 'all', label: t('superAdmin.usage.allPlans') },
            { value: 'FREE_TRIAL', label: t('superAdmin.usage.plan.FREE_TRIAL') },
            { value: 'ESSENTIAL', label: t('superAdmin.usage.plan.ESSENTIAL') },
            { value: 'CONTROL', label: t('superAdmin.usage.plan.CONTROL') },
            { value: 'MULTI_BRANCH', label: t('superAdmin.usage.plan.MULTI_BRANCH') },
          ]}
        />
        <FilterSelect
          id="sa-usage-filter-status"
          labelKey="superAdmin.usage.filterStatus"
          value={status}
          onChange={(value) => { setPage(1); setStatus(value); }}
          options={[
            { value: 'all', label: t('superAdmin.usage.allStatuses') },
            { value: 'active', label: t('superAdmin.common.active') },
            { value: 'suspended', label: t('superAdmin.common.suspended') },
          ]}
        />
        <FilterSelect
          id="sa-usage-filter-level"
          labelKey="superAdmin.usage.filterLevel"
          value={level}
          onChange={(value) => { setPage(1); setLevel(value); }}
          options={[
            { value: 'all', label: t('superAdmin.usage.allLevels') },
            { value: 'warning', label: t('superAdmin.usage.level.warning') },
            { value: 'strong', label: t('superAdmin.usage.level.strong') },
            { value: 'over', label: t('superAdmin.usage.level.over') },
          ]}
        />
      </div>

      {loading ? (
        <LoadingBlock labelKey="superAdmin.common.loading" />
      ) : failed ? (
        <ErrorBlock labelKey="superAdmin.usage.loadError" onRetry={() => void load()} />
      ) : rows.length === 0 ? (
        <EmptyBlock labelKey="superAdmin.usage.empty" />
      ) : (
        <SectionTable
          labelKey="superAdmin.usage.table"
          headers={[
            'superAdmin.usage.col.center',
            'superAdmin.usage.col.plan',
            'superAdmin.usage.col.counts',
            'superAdmin.usage.col.bars',
            'superAdmin.usage.col.period',
            'superAdmin.usage.col.level',
          ]}
          colSpan={6}
        >
          {rows.map((row) => {
            const pill = planPill(row.plan);
            return (
              <tr key={row.id}>
                <td>
                  <strong>{row.name}</strong>
                  <br />
                  <span className="page-sub" style={{ fontSize: 12 }}>{row.slug}</span>
                </td>
                <td><Pill tone={pill.tone}>{pill.label}</Pill></td>
                <td style={{ fontSize: 12 }}>
                  {t('superAdmin.usage.countsLine', {
                    users: formatNumber(row.userCount),
                    receptionists: formatNumber(row.receptionistCount),
                    students: formatNumber(row.studentCount),
                    visits: formatNumber(row.visitCount),
                  })}
                </td>
                <td><UsageBars row={row} /></td>
                <td style={{ fontSize: 12 }}>{formatDate(row.periodStart)}</td>
                <td>
                  <Pill tone={LEVEL_TONE[row.highestLevel] ?? 'muted'}>
                    {t(`superAdmin.usage.level.${row.highestLevel}`, row.highestLevel)}
                  </Pill>
                </td>
              </tr>
            );
          })}
        </SectionTable>
      )}

      <Pagination page={page} pages={pages} total={total} onChange={setPage} />

      <div style={{ marginTop: 32 }}>
        <SectionHeader
          titleKey="superAdmin.usage.overridesTitle"
          subtitleKey="superAdmin.usage.overridesSubtitle"
          onRefresh={() => void loadOverrides()}
        />
        <NoticeBlock labelKey="superAdmin.usage.overrideNotice" tone="info" />
        <OverrideForm centers={centers} metrics={metrics} onCreated={() => { void loadOverrides(); void load(); }} />

        {overridesLoading ? (
          <LoadingBlock labelKey="superAdmin.common.loading" />
        ) : overrides.length === 0 ? (
          <EmptyBlock labelKey="superAdmin.usage.overridesEmpty" />
        ) : (
          <SectionTable
            labelKey="superAdmin.usage.overridesTable"
            headers={[
              'superAdmin.usage.col.center',
              'superAdmin.usage.col.metric',
              'superAdmin.usage.col.amount',
              'superAdmin.usage.col.reason',
              'superAdmin.usage.col.expiry',
              'superAdmin.common.actions',
            ]}
            colSpan={6}
            emptyKey="superAdmin.usage.overridesEmpty"
          >
            {overrides.map((override) => {
              const pill = planPill(override.tenant.plan);
              const expired = override.expiresAt !== null && new Date(override.expiresAt).getTime() <= Date.now();
              return (
                <tr key={override.id} style={{ opacity: expired ? 0.55 : 1 }}>
                  <td>
                    <strong>{override.tenant.name}</strong>
                    <br />
                    <Pill tone={pill.tone}>{pill.label}</Pill>
                  </td>
                  <td><code style={{ fontSize: 12 }}>{override.metric}</code></td>
                  <td>{formatNumber(override.extraAmount)}</td>
                  <td style={{ fontSize: 12 }}>{override.reason ?? '—'}</td>
                  <td style={{ fontSize: 12 }}>
                    {override.expiresAt ? formatDateTime(override.expiresAt) : t('superAdmin.usage.noExpiry')}
                    {expired && <span style={{ display: 'block', fontSize: 11, color: 'var(--color-danger, #b91c1c)' }}>{t('superAdmin.usage.expired')}</span>}
                  </td>
                  <td>
                    <button
                      className="btn btn--danger"
                      style={{ fontSize: 12, padding: '4px 10px', gap: 4 }}
                      onClick={() => void revoke(override.id)}
                      disabled={busyId === override.id}
                      aria-label={t('superAdmin.usage.overrideRevokeFor', { name: override.tenant.name })}
                    >
                      <Trash2 className="h-3 w-3" />
                      {t('superAdmin.usage.overrideRevoke')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </SectionTable>
        )}

        <p className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 12 }}>
          <Gauge className="h-3 w-3" aria-hidden="true" />
          {t('superAdmin.usage.activeOverrides', { count: activeOverrides })} · {t('superAdmin.usage.warningThreshold', { percent: warningPercent })}
        </p>
      </div>
    </div>
  );
}
