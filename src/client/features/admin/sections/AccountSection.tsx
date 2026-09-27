import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Save, ShieldCheck } from 'lucide-react';
import { Pill, notify } from '../../../components/ui/kit';
import { api } from '../../../lib/api';
import { SectionHeader, LoadingBlock, ErrorBlock, NoticeBlock } from './primitives';
import { formatDateTime, formatNumber } from './format';
import type { AccountUser } from './types';

type Draft = { fullName: string; email: string; phoneNumber: string; preferredLanguage: 'ar' | 'en' };
type PasswordDraft = { currentPassword: string; newPassword: string; confirmPassword: string };

export function AccountSection() {
  const { t, i18n } = useTranslation();
  const [user, setUser] = useState<AccountUser | null>(null);
  const [draft, setDraft] = useState<Draft>({ fullName: '', email: '', phoneNumber: '', preferredLanguage: 'ar' });
  const [passwordDraft, setPasswordDraft] = useState<PasswordDraft>({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const data = await api<{ user: AccountUser }>('/admin/account');
      setUser(data.user);
      setDraft({
        fullName: data.user.fullName,
        email: data.user.email ?? '',
        phoneNumber: data.user.phoneNumber ?? '',
        preferredLanguage: data.user.preferredLanguage === 'en' ? 'en' : 'ar',
      });
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
    if (draft.fullName.trim().length < 2) {
      notify(t('superAdmin.account.nameRequired'), 'error');
      return;
    }
    setSaving(true);
    try {
      await api<unknown>('/admin/account', {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: draft.fullName.trim(),
          email: draft.email.trim(),
          phoneNumber: draft.phoneNumber.trim(),
          preferredLanguage: draft.preferredLanguage,
        }),
      });
      if (draft.preferredLanguage !== i18n.language) void i18n.changeLanguage(draft.preferredLanguage);
      notify(t('superAdmin.account.saved'), 'success');
      void load();
    } catch {
      notify(t('superAdmin.account.saveError'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    setPasswordError(null);
    setPasswordSaved(false);
    if (!passwordDraft.currentPassword) {
      setPasswordError(t('superAdmin.account.currentPasswordRequired'));
      return;
    }
    if (passwordDraft.newPassword.length < 8) {
      setPasswordError(t('superAdmin.account.newPasswordTooShort'));
      return;
    }
    if (passwordDraft.newPassword !== passwordDraft.confirmPassword) {
      setPasswordError(t('superAdmin.account.passwordMismatch'));
      return;
    }
    setPasswordBusy(true);
    try {
      await api<unknown>('/admin/account/password', {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword: passwordDraft.currentPassword, newPassword: passwordDraft.newPassword }),
      });
      setPasswordDraft({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordSaved(true);
      notify(t('superAdmin.account.passwordChanged'), 'success');
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'WRONG_CURRENT_PASSWORD') setPasswordError(t('superAdmin.account.wrongCurrentPassword'));
      else if (code === 'PASSWORD_UNCHANGED') setPasswordError(t('superAdmin.account.passwordUnchanged'));
      else setPasswordError(t('superAdmin.account.passwordError'));
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
    <div>
      <SectionHeader
        titleKey="superAdmin.account.title"
        subtitleKey="superAdmin.account.subtitle"
        onRefresh={() => void load()}
        actions={
          <button className="btn btn--primary" style={{ fontSize: 12 }} onClick={() => void save()} disabled={saving}>
            <Save className="h-4 w-4" />
            {t(saving ? 'superAdmin.common.busy' : 'superAdmin.account.save')}
          </button>
        }
      />
      <NoticeBlock labelKey="superAdmin.account.notice" tone="info" />

      {loading ? (
        <LoadingBlock labelKey="superAdmin.common.loading" />
      ) : failed || !user ? (
        <ErrorBlock labelKey="superAdmin.account.loadError" onRetry={() => void load()} />
      ) : (
        <>
          <div className="table-wrapper" style={{ padding: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              <div>
                <strong>{user.fullName}</strong>
                <span className="page-sub" style={{ display: 'block', fontSize: 12 }} dir="ltr">@{user.username}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, marginInlineStart: 'auto', flexWrap: 'wrap' }}>
                <Pill tone="accent">{t('superAdmin.account.role')}</Pill>
                <Pill tone={user.isActive ? 'success' : 'danger'}>
                  {t(user.isActive ? 'superAdmin.common.active' : 'superAdmin.common.inactive')}
                </Pill>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13, marginTop: 14 }}>
              <span>
                <strong>{t('superAdmin.account.auditCount')}:</strong> {formatNumber(user._count.superAdminAuditLogs)}
              </span>
              <span>
                <strong>{t('superAdmin.account.sessionCount')}:</strong> {formatNumber(user._count.superAdminSessions)}
              </span>
              <span>
                <strong>{t('superAdmin.account.memberSince')}:</strong> {formatDateTime(user.createdAt)}
              </span>
              <span>
                <strong>{t('superAdmin.account.lastUpdated')}:</strong> {formatDateTime(user.updatedAt)}
              </span>
            </div>
          </div>

          <div className="table-wrapper" style={{ padding: 16 }}>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <div>
                <label className="form-label" htmlFor="sa-account-name">{t('superAdmin.account.fieldName')}</label>
                <input
                  id="sa-account-name"
                  className="form-input"
                  value={draft.fullName}
                  onChange={(event) => setDraft((prev) => ({ ...prev, fullName: event.target.value }))}
                  maxLength={100}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="sa-account-email">{t('superAdmin.account.fieldEmail')}</label>
                <input
                  id="sa-account-email"
                  className="form-input"
                  type="email"
                  dir="ltr"
                  value={draft.email}
                  onChange={(event) => setDraft((prev) => ({ ...prev, email: event.target.value }))}
                  maxLength={200}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="sa-account-phone">{t('superAdmin.account.fieldPhone')}</label>
                <input
                  id="sa-account-phone"
                  className="form-input"
                  type="tel"
                  dir="ltr"
                  placeholder="01xxxxxxxxx"
                  value={draft.phoneNumber}
                  onChange={(event) => setDraft((prev) => ({ ...prev, phoneNumber: event.target.value }))}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="sa-account-lang">{t('superAdmin.account.fieldLanguage')}</label>
                <select
                  id="sa-account-lang"
                  className="form-input"
                  value={draft.preferredLanguage}
                  onChange={(event) => setDraft((prev) => ({ ...prev, preferredLanguage: event.target.value as 'ar' | 'en' }))}
                >
                  <option value="ar">عربي</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>
          </div>

          <div className="table-wrapper" style={{ padding: 16, marginTop: 20 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              <strong>{t('superAdmin.account.passwordTitle')}</strong>
            </div>
            <p className="page-sub" style={{ fontSize: 12, marginBottom: 16 }}>{t('superAdmin.account.passwordSubtitle')}</p>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <div>
                <label className="form-label" htmlFor="sa-current-password">{t('superAdmin.account.currentPassword')}</label>
                <input
                  id="sa-current-password"
                  className="form-input"
                  type="password"
                  dir="ltr"
                  autoComplete="current-password"
                  value={passwordDraft.currentPassword}
                  onChange={(event) => setPasswordDraft((prev) => ({ ...prev, currentPassword: event.target.value }))}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="sa-new-password">{t('superAdmin.account.newPassword')}</label>
                <input
                  id="sa-new-password"
                  className="form-input"
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  value={passwordDraft.newPassword}
                  onChange={(event) => setPasswordDraft((prev) => ({ ...prev, newPassword: event.target.value }))}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="sa-confirm-password">{t('superAdmin.account.confirmPassword')}</label>
                <input
                  id="sa-confirm-password"
                  className="form-input"
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  value={passwordDraft.confirmPassword}
                  onChange={(event) => setPasswordDraft((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                />
              </div>
            </div>
            {passwordError && (
              <p role="alert" style={{ color: 'var(--color-danger, #b91c1c)', fontSize: 13, marginTop: 12 }}>{passwordError}</p>
            )}
            {passwordSaved && (
              <p role="status" style={{ color: 'var(--color-success, #15803d)', fontSize: 13, marginTop: 12 }}>{t('superAdmin.account.passwordChanged')}</p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn--primary" style={{ fontSize: 12, gap: 6 }} onClick={() => void changePassword()} disabled={passwordBusy}>
                <KeyRound className="h-4 w-4" />
                {t(passwordBusy ? 'superAdmin.common.busy' : 'superAdmin.account.changePassword')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
