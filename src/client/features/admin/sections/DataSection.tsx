import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { notify } from '../../../components/ui/kit';
import { api } from '../../../lib/api';
import { SectionHeader, LoadingBlock, ErrorBlock, SectionTable, NoticeBlock } from './primitives';
import { formatBytes, formatDateTime, formatNumber } from './format';
import type { DataStatus } from './types';

const EXPORTS = [
  { resource: 'tenants', labelKey: 'superAdmin.data.export.tenants' },
  { resource: 'users', labelKey: 'superAdmin.data.export.users' },
] as const;
function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function DataSection() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<DataStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      setStatus(await api<DataStatus>('/admin/data/status'));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const runExport = async (resource: string, labelKey: string) => {
    setExporting(resource);
    try {
      const data = await api<{ rows: Record<string, unknown>[] }>(`/admin/data/export/${resource}?format=json`);
      const stamp = new Date().toISOString().slice(0, 10);
      download(`madar-${resource}-${stamp}.json`, JSON.stringify(data.rows, null, 2), 'application/json');
      notify(t('superAdmin.data.exportDone', { resource: t(labelKey), count: data.rows.length }), 'success');
      void load();
    } catch {
      notify(t('superAdmin.data.exportError'), 'error');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div>
      <SectionHeader titleKey="superAdmin.data.title" subtitleKey="superAdmin.data.subtitle" onRefresh={() => void load()} />
      <NoticeBlock labelKey="superAdmin.data.auditNotice" tone="info" />

      {loading ? (
        <LoadingBlock labelKey="superAdmin.common.loading" />
      ) : failed || !status ? (
        <ErrorBlock labelKey="superAdmin.data.loadError" onRetry={() => void load()} />
      ) : (
        <>
          <div className="table-wrapper" style={{ padding: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', fontSize: 13 }}>
              <span>
                <strong>{t('superAdmin.data.dbSize')}:</strong> {formatBytes(status.databaseSizeBytes ?? 0)}
              </span>
              <span>
                <strong>{t('superAdmin.data.migrationsApplied')}:</strong> {formatNumber(status.migrations?.applied ?? 0)}
              </span>
              <span>
                <strong>{t('superAdmin.data.migrationsFailed')}:</strong> {formatNumber(status.migrations?.failed ?? 0)}
              </span>
            </div>
            <p className="page-sub" style={{ fontSize: 12, marginTop: 10 }}>{status.automatedBackupNote}</p>
          </div>

          <h3 className="page-title" style={{ fontSize: 15, marginBottom: 12 }}>{t('superAdmin.data.rowCounts')}</h3>
          <SectionTable
            labelKey="superAdmin.data.rowCounts"
            headers={['superAdmin.data.col.table', 'superAdmin.data.col.rows']}
            colSpan={2}
          >
            {Object.entries(status.counts).map(([table, count]) => (
              <tr key={table}>
                <td><code style={{ fontSize: 12 }}>{table}</code></td>
                <td>{formatNumber(count)}</td>
              </tr>
            ))}
          </SectionTable>

          <h3 className="page-title" style={{ fontSize: 15, margin: '24px 0 12px' }}>{t('superAdmin.data.exports')}</h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            {EXPORTS.map((item) => (
              <button
                key={item.resource}
                className="btn btn--primary"
                style={{ fontSize: 12 }}
                onClick={() => void runExport(item.resource, item.labelKey)}
                disabled={exporting !== null}
              >
                <Download className="h-4 w-4" />
                {exporting === item.resource ? t('superAdmin.common.busy') : t(item.labelKey)}
              </button>
            ))}
          </div>

          <SectionTable
            labelKey="superAdmin.data.recentExports"
            headers={['superAdmin.audit.col.action', 'superAdmin.common.time', 'superAdmin.data.col.ip']}
            colSpan={3}
            emptyKey="superAdmin.data.noExports"
          >
            {status.recentExports.length === 0 ? undefined : (
              status.recentExports.map((row) => (
                <tr key={row.id}>
                  <td><code style={{ fontSize: 12 }}>{row.action}</code></td>
                  <td style={{ fontSize: 12 }}>{formatDateTime(row.createdAt)}</td>
                  <td style={{ fontSize: 12 }} dir="ltr">{row.ip ?? '—'}</td>
                </tr>
              ))
            )}
          </SectionTable>
        </>
      )}
    </div>
  );
}
