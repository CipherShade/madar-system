import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Pill } from '../../../components/ui/kit';
import { api } from '../../../lib/api';
import { EmptyBlock, ErrorBlock, FilterSelect, LoadingBlock, Pagination, SectionHeader, SectionTable } from './primitives';
import { formatDate, formatNumber } from './format';
import type { UsageMetricName, UsageRow } from './types';

const LIMIT = 25;

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
          <span style={{ minWidth: 92 }}>{formatNumber(metric.used)}</span>
        </div>
      ))}
    </div>
  );
}

export function UsageSection() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (search.trim()) params.set('search', search.trim());
      if (status !== 'all') params.set('status', status);
      const data = await api<{
        rows: UsageRow[];
        metrics: string[];
        pagination: { total: number; pages: number };
      }>(`/admin/usage?${params}`);
      setRows(data.rows);
      setTotal(data.pagination.total);
      setPages(data.pagination.pages);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [page, search, status]);

  return (
    <div>
      <SectionHeader
        titleKey="superAdmin.usage.title"
        subtitleKey="superAdmin.usage.subtitle"
        onRefresh={() => void load()}
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
            'superAdmin.usage.col.status',
            'superAdmin.usage.col.counts',
            'superAdmin.usage.col.bars',
            'superAdmin.usage.col.period',
          ]}
          colSpan={5}
        >
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <strong>{row.name}</strong>
                <br />
                <span className="page-sub" style={{ fontSize: 12 }}>{row.slug}</span>
              </td>
              <td>
                <Pill tone={row.subscriptionStatus === 'ACTIVE' ? 'success' : 'muted'}>
                  {t(`superAdmin.subscriptions.status.${row.subscriptionStatus}`, row.subscriptionStatus)}
                </Pill>
              </td>
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
            </tr>
          ))}
        </SectionTable>
      )}

      <Pagination page={page} pages={pages} total={total} onChange={setPage} />
    </div>
  );
}
