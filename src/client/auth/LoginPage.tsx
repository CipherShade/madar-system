import type { FormEvent } from 'react';
import { useState } from 'react';
import { KeyRound, LogIn, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';
import { Banner } from '../components/ui/kit';

const CENTER_NAME = import.meta.env.VITE_CENTER_NAME || '';

interface LoginPageProps {
  onNavigateLanding?: () => void;
  onNavigateSignup?: () => void;
}

export function LoginPage({ onNavigateLanding, onNavigateSignup }: LoginPageProps) {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try { await login({ username, password }); } catch { setError(t('auth.invalidCredentials')); } finally { setSubmitting(false); }
  }

  return (
    <main className="login-bg">
      <form onSubmit={submit} className="login-card">
        <div className="login-logo" style={{ cursor: 'pointer' }} onClick={onNavigateLanding}>م</div>
        <p className="login-brand-sub">{t('auth.welcome')} {t('appName')}</p>
        <h1 className="login-title">{CENTER_NAME || t('auth.title')}</h1>
        <p className="login-sub">{t('auth.subtitle')}</p>
        <Banner text={error} tone="error" />
        <div className="form-stack">
          <label className="field">
            <span className="field-label">{t('auth.username')}</span>
            <div className="searchbar">
              <UserRound className="h-4 w-4" aria-hidden="true" />
              <input className="input" autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} />
            </div>
          </label>
          <label className="field">
            <span className="field-label">{t('auth.password')}</span>
            <div className="searchbar">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
          </label>
          <button className="btn btn--primary" style={{ width: '100%', paddingBlock: 11 }} disabled={submitting}>
            <LogIn className="h-4 w-4" aria-hidden="true" />{submitting ? t('auth.signingIn') : t('auth.signIn')}
          </button>
        </div>

        <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--surface, #f8fafc)', borderRadius: 8, border: '1px dashed var(--border)', fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>بيانات الدخول للتجربة (Demo):</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn--outline"
              style={{ flex: 1, fontSize: 12, paddingBlock: 6 }}
              onClick={() => { setUsername('admin'); setPassword('Admin@12345!'); }}
            >
              مدير (admin)
            </button>
            <button
              type="button"
              className="btn btn--outline"
              style={{ flex: 1, fontSize: 12, paddingBlock: 6 }}
              onClick={() => { setUsername('reception1'); setPassword('Desk@12345!'); }}
            >
              استقبال (reception1)
            </button>
            <button
              type="button"
              className="btn btn--outline"
              style={{ flex: 1, fontSize: 12, paddingBlock: 6 }}
              onClick={() => { setUsername('superadmin'); setPassword('Platform@12345!'); }}
            >
              مدير المنصة (superadmin)
            </button>
          </div>
        </div>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: 13, gap: 8, flexWrap: 'wrap' }}>
          {onNavigateLanding && (
            <button type="button" onClick={onNavigateLanding} className="btn-link" style={{ color: 'var(--text-secondary)' }}>
              ← العودة للرئيسية
            </button>
          )}
          {onNavigateSignup && (
            <button type="button" onClick={onNavigateSignup} className="btn-link" style={{ color: 'var(--primary)', fontWeight: 700 }}>
              إنشاء سنتر جديد وتفعيل الاشتراك
            </button>
          )}
        </div>
      </form>
    </main>
  );
}