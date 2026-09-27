import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Banner, type BannerTone } from '../../components/ui/kit';

export type TenantLifecycleClient = {
  state: 'AWAITING_APPROVAL' | 'ACTIVE' | 'EXPIRING' | 'GRACE' | 'FROZEN';
  canWrite: boolean;
  readOnly: boolean;
  daysUntilExpiry: number | null;
  freezesAt: string | null;
  reminder: { code: string; severity: 'info' | 'warning' | 'critical'; messageAr: string; messageEn: string } | null;
};

function toneFor(severity: 'info' | 'warning' | 'critical'): BannerTone {
  if (severity === 'critical') return 'error';
  if (severity === 'warning') return 'warning';
  return 'info';
}

/** States where the center is expected to go and pay, so we offer the shortcut. */
const PAYABLE_STATES = new Set(['EXPIRING', 'GRACE', 'FROZEN']);

/**
 * The renewal / grace / frozen notice, shown once on every authenticated page.
 *
 * Fail-silent by design: the server-side write guard is the authority, so a
 * failed read must not crash the shell or imply anything about the account
 * state. The text always comes from the server payload, which is computed by
 * the same resolver the guard uses, so the notice can never contradict reality.
 */
export function LifecycleBanner({ onGoToBilling }: { onGoToBilling: () => void }) {
  const { i18n } = useTranslation();
  const [lifecycle, setLifecycle] = useState<TenantLifecycleClient | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ data?: { lifecycle?: TenantLifecycleClient } }>('/subscriptions/current')
      .then((res) => {
        if (!cancelled && res?.data?.lifecycle) setLifecycle(res.data.lifecycle);
      })
      .catch(() => {
        /* the write guard is the authority; stay quiet here */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!lifecycle?.reminder) return null;

  const isArabic = i18n.language?.startsWith('ar');
  const text = isArabic ? lifecycle.reminder.messageAr : lifecycle.reminder.messageEn;

  return (
    <div className="lifecycle-banner">
      <Banner text={text} tone={toneFor(lifecycle.reminder.severity)} />
      {PAYABLE_STATES.has(lifecycle.state) && (
        <button type="button" className="btn btn--primary btn--sm lifecycle-banner__cta" onClick={onGoToBilling}>
          {isArabic ? 'الذهاب لصفحة الاشتراك' : 'Go to subscription billing'}
        </button>
      )}
    </div>
  );
}
