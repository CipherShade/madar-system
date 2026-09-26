import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BookOpen,
  CalendarClock,
  Check,
  Coins,
  Gauge,
  GraduationCap,
  Languages,
  LogIn,
  MapPin,
  Menu,
  Radio,
  Receipt,
  Search,
  ShieldCheck,
  Timer,
  UserCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import {
  FOUNDING_OFFER,
  GUARANTEE,
  ONBOARDING_VIDEO_URL,
  PRIMARY_OFFER,
  SECONDARY_OFFERS,
  SUPPORT,
  foundingDiscountPercent,
  foundingPeriodLabel,
  type LandingOffer,
} from '../../../shared/constants/offers';
import { money } from '../../lib/api';
import './landing.css';

interface LandingPageProps {
  onNavigateLogin?: () => void;
  onNavigateSignup?: () => void;
}

type Locale = 'ar' | 'en';
type TFunc = (key: string, options?: Record<string, unknown>) => string;

/* ══════════════════════════ helpers ══════════════════════════ */

function formatPrice(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-EG', { maximumFractionDigits: 0 }).format(value);
}

function formatMoney(value: number, locale: Locale): string {
  return money(value, locale === 'ar' ? 'ar-EG' : 'en-EG');
}

/** Reads a translated array of flat records, skipping anything malformed. */
function readRecords(t: TFunc, key: string): Array<Record<string, string>> {
  const value = t(key, { returnObjects: true }) as unknown;
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, string> => typeof item === 'object' && item !== null,
  );
}

function readStrings(t: TFunc, key: string): string[] {
  const value = t(key, { returnObjects: true }) as unknown;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function Section({
  className = '',
  id,
  children,
}: {
  className?: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section className={className} id={id}>
      {children}
    </section>
  );
}

/* ═══════════════════ LOBBY FRAME (real product fields) ═══════════════════ */

type SessionMock = {
  title: string;
  teacher: string;
  subject: string;
  room: string;
  time: string;
  attended: number;
  capacity: number;
  state: 'live' | 'soon';
};

/**
 * Mirrors the real `/attendances/sessions/active` payload: title, teacher,
 * subject, room, and the live headcount against room capacity. Values are
 * illustrative — the frame is labelled as an example in the UI.
 */
const SESSION_MOCKS: SessionMock[] = [
  { title: 'رياضيات · ثالثة ثانوي', teacher: 'أ. أحمد', subject: 'رياضيات', room: 'قاعة 2', time: '04:00', attended: 18, capacity: 24, state: 'live' },
  { title: 'فيزياء · ثانية ثانوي', teacher: 'أ. محمود', subject: 'فيزياء', room: 'قاعة 1', time: '04:30', attended: 12, capacity: 16, state: 'live' },
  { title: 'كيمياء · ثالثة ثانوي', teacher: 'أ. سارة', subject: 'كيمياء', room: 'قاعة 3', time: '06:00', attended: 0, capacity: 20, state: 'soon' },
];

function LobbyFrame({ locale, compact = false }: { locale: Locale; compact?: boolean }) {
  const { t } = useTranslation('landing');
  const isArabic = locale === 'ar';

  return (
    <div className="lp-frame">
      <div className="lp-frame-bar">
        <span className="lp-frame-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="lp-frame-title">مَدار · {t('product.sessions')}</span>
        <span className="lp-frame-tag">{t('visibility.exampleLabel')}</span>
      </div>

      <div className="lp-app">
        <div className="lp-app-head">
          <span>
            <b>{t('product.sessions')}</b>
            <small>
              {isArabic ? 'الحصص الشغالة دلوقتي واللي جاية' : 'Running now and coming up'}
            </small>
          </span>
          <span className="lp-pill lp-pill--live">{t('product.upcoming')}</span>
        </div>

        <div className="lp-app-grid">
          <div>
            {SESSION_MOCKS.map((session) => (
              <div
                key={session.title}
                className={`lp-session${session.state === 'live' ? ' is-active' : ' is-soon'}`}
              >
                <div className="lp-session-top">
                  <span className="lp-session-title">{session.title}</span>
                  <span className={`lp-pill${session.state === 'soon' ? ' lp-pill--muted' : ''}`}>
                    {session.attended}/{session.capacity}
                  </span>
                </div>

                <div className="lp-session-meta">
                  <span>
                    <GraduationCap className="h-3 w-3" aria-hidden="true" />
                    {session.teacher} · {session.subject}
                  </span>
                  <span>
                    <Timer className="h-3 w-3" aria-hidden="true" />
                    {session.time}
                  </span>
                  <span>
                    <MapPin className="h-3 w-3" aria-hidden="true" />
                    {session.room}
                  </span>
                </div>

                <div className="lp-session-foot">
                  <span>
                    {t('product.attended')}: <b>{session.attended}</b> / {session.capacity}
                  </span>
                  {session.state === 'live' ? (
                    <span className="lp-pill">{t('product.live')}</span>
                  ) : (
                    <span className="lp-pill lp-pill--amber">{t('product.upcoming')}</span>
                  )}
                </div>

                <div className="lp-bar">
                  <i
                    style={{
                      width: `${session.capacity ? (session.attended / session.capacity) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div>
            <div className="lp-panel">
              <div className="lp-panel-title">
                <Search className="h-3.5 w-3.5" style={{ color: 'var(--app-primary)' }} aria-hidden="true" />
                {t('product.search')}
              </div>

              <div className="lp-search">
                <Search className="h-3 w-3" aria-hidden="true" />
                <span>{isArabic ? 'أحمد محمود' : 'Ahmed Mahmoud'}</span>
              </div>

              <div className="lp-student">
                <span className="lp-avatar" aria-hidden="true">أ</span>
                <span className="lp-student-meta">
                  <b>{isArabic ? 'أحمد محمود السيد' : 'Ahmed Mahmoud El-Sayed'}</b>
                  <small>1042 · {isArabic ? 'ثالثة ثانوي' : 'Grade 12'}</small>
                </span>
                <span className="lp-checkin-btn">{t('product.checkIn')}</span>
              </div>

              <div className="lp-methods">
                <span className="lp-method is-active">{t('product.cash')}</span>
                <span className="lp-method">{t('product.vodafoneCash')}</span>
                <span className="lp-method">{t('product.instapay')}</span>
              </div>
            </div>

            {!compact && (
              <div className="lp-feed">
                <div className="lp-panel-title">
                  <Gauge className="h-3.5 w-3.5" style={{ color: 'var(--app-primary)' }} aria-hidden="true" />
                  {t('product.drawer')}
                </div>
                <div className="lp-feed-item">
                  <Wallet className="h-3 w-3" aria-hidden="true" />
                  <b>{formatMoney(3110, locale)}</b>
                </div>
                <div className="lp-feed-item">
                  <Receipt className="h-3 w-3" aria-hidden="true" />
                  <span>{t('product.collected')}</span>
                  <b>{formatMoney(6200, locale)}</b>
                </div>
                <div className="lp-feed-item">
                  <UserCheck className="h-3 w-3" aria-hidden="true" />
                  <span>{t('product.attended')}</span>
                  <b>30</b>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════ PLANS ══════════════════════════ */

function PrimaryPlan({
  offer,
  locale,
  arrow,
  onChoose,
}: {
  offer: LandingOffer;
  locale: Locale;
  arrow: ReactNode;
  onChoose: () => void;
}) {
  const { t } = useTranslation('landing');
  const discount = foundingDiscountPercent(offer);
  const badge = locale === 'ar' ? offer.badgeAr : offer.badgeEn;
  const highlight = locale === 'ar' ? offer.highlightAr : offer.highlightEn;

  return (
    <article className="lp-plan-main">
      <div>
        <div className="lp-plan-heading">
          <h3>{locale === 'ar' ? offer.nameAr : offer.nameEn}</h3>
          {badge && <span className="lp-plan-badge">{badge}</span>}
        </div>
        {highlight && <p className="lp-plan-highlight">{highlight}</p>}
        <p className="lp-plan-tagline">{locale === 'ar' ? offer.taglineAr : offer.taglineEn}</p>

        <div style={{ marginTop: 26 }}>
          <span className="lp-plan-eyebrow">{t('pricing.foundingPriceLabel')}</span>
          <div className="lp-plan-price">
            <b>{formatPrice(offer.foundingPriceEgp, locale)}</b>
            <span>{t('pricing.perMonth')}</span>
          </div>
          <div className="lp-plan-was">
            <del>
              {t('pricing.listPriceLabel')}: {formatPrice(offer.listPriceEgp, locale)}
            </del>
            {discount !== null && <span>−{discount}%</span>}
          </div>
          <span className="lp-plan-period">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            {locale === 'ar' ? FOUNDING_OFFER.badgeAr : FOUNDING_OFFER.badgeEn} ·{' '}
            {foundingPeriodLabel(locale)}
          </span>
        </div>

        <div className="lp-plan-cta">
          <button type="button" onClick={onChoose} className="lp-btn lp-btn-white lp-btn-lg lp-btn-block">
            {t('cta.primary')}
            {arrow}
          </button>
        </div>
      </div>

      <ul className="lp-plan-features">
        {(locale === 'ar' ? offer.featuresAr : offer.featuresEn).map((feature) => (
          <li key={feature}>
            <Check className="h-4 w-4" aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function SecondaryPlan({
  offer,
  locale,
  onChoose,
}: {
  offer: LandingOffer;
  locale: Locale;
  onChoose: () => void;
}) {
  const { t } = useTranslation('landing');
  const discount = foundingDiscountPercent(offer);
  const badge = locale === 'ar' ? offer.badgeAr : offer.badgeEn;
  const highlight = locale === 'ar' ? offer.highlightAr : offer.highlightEn;

  return (
    <article className="lp-plan-sub">
      <div className="lp-plan-heading">
        <h3>{locale === 'ar' ? offer.nameAr : offer.nameEn}</h3>
        {badge && <span className="lp-plan-badge">{badge}</span>}
      </div>
      {highlight && <p className="lp-plan-highlight">{highlight}</p>}
      <p className="lp-plan-tagline">{locale === 'ar' ? offer.taglineAr : offer.taglineEn}</p>

      <div style={{ marginTop: 18 }}>
        <div className="lp-plan-price">
          <b>{formatPrice(offer.foundingPriceEgp, locale)}</b>
          <span>{t('pricing.perMonthShort')}</span>
        </div>
        <div className="lp-plan-was">
          <del>{formatPrice(offer.listPriceEgp, locale)}</del>
          {discount !== null && <span>−{discount}%</span>}
        </div>
        <span className="lp-plan-period">
          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
          {foundingPeriodLabel(locale)}
        </span>
      </div>

      {!offer.available && (
        <>
          <span className="lp-soon">{t('pricing.comingSoon')}</span>
          <small>{t('pricing.comingSoonBody')}</small>
        </>
      )}

      <ul className="lp-plan-features">
        {(locale === 'ar' ? offer.featuresAr : offer.featuresEn).map((feature) => (
          <li key={feature}>
            <Check className="h-4 w-4" aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onChoose}
        disabled={!offer.available}
        className="lp-btn lp-btn-ghost lp-btn-block"
      >
        {t('pricing.choose', { name: locale === 'ar' ? offer.nameAr : offer.nameEn })}
      </button>
    </article>
  );
}

/* ══════════════════════════ PAGE ══════════════════════════ */

export function LandingPage({ onNavigateLogin, onNavigateSignup }: LandingPageProps) {
  const { t } = useTranslation('landing');
  const { t: tCommon } = useTranslation('common');
  const { i18n } = useTranslation();

  const isArabic = i18n.language === 'ar';
  const locale: Locale = isArabic ? 'ar' : 'en';
  const ArrowIcon = isArabic ? ArrowLeft : ArrowRight;
  const arrow = <ArrowIcon className="h-4 w-4" aria-hidden="true" />;

  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);

  // Section reveal — skipped entirely for reduced-motion users.
  const reduceMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const targets = Array.from(root.querySelectorAll<HTMLElement>('.lp-reveal'));
    if (targets.length === 0) return;

    if (reduceMotion || typeof IntersectionObserver === 'undefined') {
      targets.forEach((node) => node.classList.add('is-in'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.06 },
    );

    targets.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [reduceMotion]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Collapse the mobile menu when the language changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [i18n.language]);

  const goSignup = useCallback(() => {
    if (onNavigateSignup) onNavigateSignup();
    else window.location.hash = '#/signup';
  }, [onNavigateSignup]);

  const goLogin = useCallback(() => {
    if (onNavigateLogin) onNavigateLogin();
    else window.location.hash = '#/login';
  }, [onNavigateLogin]);

  const closeMenu = () => setMenuOpen(false);
  const toggleLanguage = () => void i18n.changeLanguage(isArabic ? 'en' : 'ar');

  const questions = readStrings(t, 'problem.questions');
  const answers = readStrings(t, 'problem.answers');
  const flow = readStrings(t, 'system.flow');
  const steps = readRecords(t, 'how.steps');

  const visibilityIcons = [Radio, Users, Gauge, Wallet];
  const visibilityPoints = readRecords(t, 'visibility.points').map((point, index) => ({
    title: point.title ?? '',
    body: point.body ?? '',
    Icon: visibilityIcons[index % visibilityIcons.length],
  }));

  const moduleIcons = [Gauge, UserCheck, Users, CalendarClock, BookOpen, Wallet, Coins, BarChart3];
  const moduleCards = readRecords(t, 'system.modules').map((module, index) => ({
    key: module.key ?? String(index),
    title: module.title ?? '',
    body: module.body ?? '',
    Icon: moduleIcons[index % moduleIcons.length],
  }));

  const valueKinds = ['system', 'video', 'support', 'data'] as const;
  const valueItems = readRecords(t, 'value.items').map((item, index) => ({
    title: item.title ?? '',
    body: item.body ?? '',
    kind: valueKinds[index % valueKinds.length],
  }));

  const period = foundingPeriodLabel(locale);
  const foundingPrice = formatPrice(PRIMARY_OFFER.foundingPriceEgp, locale);
  const savePercent = foundingDiscountPercent(PRIMARY_OFFER);
  const hasSupportChannel = Boolean(SUPPORT.phone || SUPPORT.whatsapp || SUPPORT.email);

  return (
    <div className="madar-landing" dir={isArabic ? 'rtl' : 'ltr'} ref={rootRef}>
      {/* ═══════════════════════════ NAV ═══════════════════════════ */}
      <header className={`lp-nav${scrolled ? ' is-scrolled' : ''}${menuOpen ? ' is-open' : ''}`}>
        <div className="lp-wrap">
          <div className="lp-nav-inner">
            <a href="#top" className="lp-logo" onClick={closeMenu}>
              <span className="lp-logo-mark" aria-hidden="true">م</span>
              <span className="lp-logo-name">مَدار</span>
            </a>

            <nav className="lp-nav-links">
              <a href="#system" onClick={closeMenu}>{t('nav.features')}</a>
              <a href="#visibility" onClick={closeMenu}>{t('nav.how')}</a>
              <a href="#pricing" onClick={closeMenu}>{t('nav.pricing')}</a>
              <a href="#guarantee" onClick={closeMenu}>{t('nav.questions')}</a>
            </nav>

            <div className="lp-nav-actions">
              <button
                type="button"
                className="lp-nav-lang"
                onClick={toggleLanguage}
                aria-label={tCommon('actions.switchLanguage')}
              >
                <Languages className="h-4 w-4" aria-hidden="true" />
                {isArabic ? 'English' : 'العربية'}
              </button>
              <button type="button" onClick={goLogin} className="lp-btn lp-btn-quiet lp-btn-sm">
                <LogIn className="h-4 w-4" aria-hidden="true" />
                {t('nav.login')}
              </button>
              <button type="button" onClick={goSignup} className="lp-btn lp-btn-primary lp-btn-sm">
                {t('nav.cta')}
              </button>
            </div>

            <button
              type="button"
              className="lp-nav-toggle"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={t('nav.menu')}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════ HERO ═══════════════════════════ */}
      <section className="lp-hero" id="top">
        <div className="lp-wrap lp-hero-grid">
          <div className="lp-reveal">
            <span className="lp-badge">{t('hero.kicker')}</span>
            <h1>
              {t('hero.headlineLead')}
              <em>{t('hero.headlineAccent')}</em>
            </h1>
            <p className="lp-hero-sub">{t('hero.sub')}</p>

            <div className="lp-hero-actions">
              <button type="button" onClick={goSignup} className="lp-btn lp-btn-primary lp-btn-lg">
                {t('cta.primary')}
                {arrow}
              </button>
              <a href="#visibility" className="lp-btn lp-btn-ghost lp-btn-lg">
                {t('cta.secondary')}
              </a>
            </div>

            <p className="lp-hero-assure">
              <Check className="h-4 w-4" aria-hidden="true" />
              {t('hero.assure', { price: foundingPrice })}
            </p>
          </div>

          <div className="lp-reveal">
            <LobbyFrame locale={locale} compact />
            <p className="lp-caption">{t('hero.visualCaption')}</p>
          </div>
        </div>
      </section>

      {/* ══════════════════ PROBLEM / TRANSFORMATION ══════════════════ */}
      <Section className="lp-section lp-section--tint" id="problem">
        <div className="lp-wrap">
          <div className="lp-sec-head lp-sec-head--center lp-reveal">
            <span className="lp-kicker">{t('problem.kicker')}</span>
            <h2>{t('problem.title')}</h2>
            <p>{t('problem.sub')}</p>
          </div>

          <div className="lp-transform lp-reveal">
            <div className="lp-transform-col lp-transform-col--ask">
              <h3>{t('problem.askTitle')}</h3>
              <ul className="lp-qlist lp-qlist--ask">
                {questions.map((question) => (
                  <li key={question}>
                    <Users className="h-4 w-4" aria-hidden="true" />
                    <span>{question}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="lp-transform-arrow" aria-hidden="true">
              <ArrowIcon className="h-5 w-5" />
            </div>

            <div className="lp-transform-col lp-transform-col--see">
              <h3>{t('problem.seeTitle')}</h3>
              <ul className="lp-qlist lp-qlist--see">
                {answers.map((answer) => (
                  <li key={answer}>
                    <Check className="h-4 w-4" aria-hidden="true" />
                    <span>{answer}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Section>

      {/* ════════════ OPERATIONAL VISIBILITY — THE LOBBY ════════════ */}
      <Section className="lp-section" id="visibility">
        <div className="lp-wrap lp-vis-grid">
          <div className="lp-reveal">
            <span className="lp-kicker">{t('visibility.kicker')}</span>
            <h2>{t('visibility.title')}</h2>
            <p style={{ marginTop: 14, color: 'var(--lp-ink-2)', fontSize: '1.08rem' }}>
              {t('visibility.sub')}
            </p>

            <div className="lp-vis-points">
              {visibilityPoints.map((point) => (
                <div className="lp-vis-point" key={point.title}>
                  <span className="lp-vis-ico" aria-hidden="true">
                    <point.Icon className="h-4 w-4" />
                  </span>
                  <span>
                    <b>{point.title}</b>
                    <small>{point.body}</small>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="lp-reveal">
            <LobbyFrame locale={locale} />
            <p className="lp-caption">{t('visibility.featuresLabel')}</p>
          </div>
        </div>
      </Section>

      {/* ═══════════════════════ CORE SYSTEM ═══════════════════════ */}
      <Section className="lp-section lp-section--tint" id="system">
        <div className="lp-wrap">
          <div className="lp-sec-head lp-sec-head--center lp-reveal">
            <span className="lp-kicker">{t('system.kicker')}</span>
            <h2>{t('system.title')}</h2>
            <p>{t('system.sub')}</p>
          </div>

          <div className="lp-modules lp-reveal">
            {moduleCards.map((module) => (
              <article className="lp-module" key={module.key}>
                <span className="lp-vis-ico" aria-hidden="true" style={{ marginBottom: 12 }}>
                  <module.Icon className="h-4 w-4" />
                </span>
                <b>{module.title}</b>
                <small>{module.body}</small>
              </article>
            ))}
          </div>

          <div className="lp-flow lp-reveal">
            {flow.map((step, index) => (
              <span key={step} style={{ display: 'contents' }}>
                {index > 0 && <ArrowIcon className="lp-flow-arrow h-4 w-4" aria-hidden="true" />}
                <span className="lp-flow-step">
                  <Radio className="h-3.5 w-3.5" aria-hidden="true" />
                  {step}
                </span>
              </span>
            ))}
          </div>
        </div>
      </Section>

      {/* ════════════════════════ VALUE STACK ════════════════════════ */}
      <Section className="lp-section" id="value">
        <div className="lp-wrap lp-value-grid">
          <div className="lp-reveal">
            <span className="lp-kicker">{t('value.kicker')}</span>
            <h2>{t('value.title')}</h2>
            {hasSupportChannel ? (
              <p className="lp-support-line" style={{ marginTop: 16 }}>
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                {[SUPPORT.phone, SUPPORT.whatsapp, SUPPORT.email].filter(Boolean).join(' · ')}
              </p>
            ) : (
              <p className="lp-placeholder">{t('value.supportUnconfigured')}</p>
            )}
          </div>

          <div className="lp-value-list lp-reveal">
            {valueItems.map((item, index) => (
              <article className="lp-value-item" key={item.title}>
                <span className="lp-value-n" aria-hidden="true">
                  {index + 1}
                </span>
                <span>
                  <b>{item.title}</b>
                  <p>{item.body}</p>
                  {item.kind === 'video' && !ONBOARDING_VIDEO_URL && (
                    <p className="lp-placeholder">{t('value.videoUnconfigured')}</p>
                  )}
                </span>
              </article>
            ))}
          </div>
        </div>
      </Section>

      {/* ════════════════════════ PRICING ════════════════════════ */}
      <Section className="lp-section lp-section--tint" id="pricing">
        <div className="lp-wrap">
          <div className="lp-sec-head lp-sec-head--center lp-reveal">
            <span className="lp-kicker">{t('pricing.kicker')}</span>
            <h2>{t('pricing.title')}</h2>
            <p>{t('pricing.sub')}</p>
          </div>

          {FOUNDING_OFFER.enabled && (
            <p className="lp-price-lead lp-reveal">
              <BadgeCheck className="h-5 w-5" aria-hidden="true" />
              <span>{t('pricing.foundingNote', { price: foundingPrice, period })}</span>
              {savePercent !== null && <b>−{savePercent}%</b>}
            </p>
          )}

          <div className="lp-reveal">
            <PrimaryPlan offer={PRIMARY_OFFER} locale={locale} arrow={arrow} onChoose={goSignup} />
          </div>

          <div className="lp-reveal">
            <div style={{ marginTop: 'clamp(28px, 4vw, 44px)' }}>
              <h3 style={{ fontSize: '1.25rem' }}>{t('pricing.otherTitle')}</h3>
              <p style={{ marginTop: 6, color: 'var(--lp-ink-2)' }}>{t('pricing.otherSub')}</p>
            </div>

            <div className="lp-plans-secondary">
              {SECONDARY_OFFERS.map((offer) => (
                <SecondaryPlan key={offer.slug} offer={offer} locale={locale} onChoose={goSignup} />
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ════════════════════════ GUARANTEE ════════════════════════ */}
      {GUARANTEE.enabled && (
        <Section className="lp-section" id="guarantee">
          <div className="lp-wrap">
            <div className="lp-guarantee lp-reveal">
              <div className="lp-guarantee-badge" aria-hidden="true">
                <b>{GUARANTEE.windowDays}</b>
                <small>{isArabic ? 'يوم' : 'days'}</small>
              </div>
              <div>
                <span className="lp-kicker">{t('guarantee.kicker')}</span>
                <h3>{t('guarantee.title')}</h3>
                <p>{isArabic ? GUARANTEE.headlineAr : GUARANTEE.headlineEn}</p>
                <div className="lp-terms">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  {GUARANTEE.termsUrl ? (
                    <a href={GUARANTEE.termsUrl} target="_blank" rel="noreferrer noopener">
                      {t('guarantee.termsLink')}
                    </a>
                  ) : (
                    <span>{t('guarantee.termsMissing')}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* ════════════════════════ HOW IT WORKS ════════════════════════ */}
      <Section className="lp-section lp-section--tint" id="how">
        <div className="lp-wrap">
          <div className="lp-sec-head lp-sec-head--center lp-reveal">
            <span className="lp-kicker">{t('how.kicker')}</span>
            <h2>{t('how.title')}</h2>
          </div>

          <div className="lp-steps lp-reveal">
            {steps.map((step, index) => (
              <article className="lp-step" key={step.title}>
                <span className="lp-step-n" aria-hidden="true">
                  {index + 1}
                </span>
                <b>{step.title}</b>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </Section>

      {/* ════════════════════════ FINAL CTA ════════════════════════ */}
      <section className="lp-final">
        <div className="lp-wrap lp-reveal">
          <h2>{t('final.title')}</h2>
          <p>{t('final.sub')}</p>
          <div className="lp-final-actions">
            <button type="button" onClick={goSignup} className="lp-btn lp-btn-white lp-btn-lg">
              {t('cta.primary')}
              {arrow}
            </button>
            <button type="button" onClick={goLogin} className="lp-btn lp-btn-outline-white lp-btn-lg">
              {t('cta.toLogin')}
            </button>
          </div>
          <p className="lp-final-note">
            <Check className="h-4 w-4" aria-hidden="true" />
            {t('final.note')}
          </p>
        </div>
      </section>

      {/* ════════════════════════ FOOTER ════════════════════════ */}
      <footer className="lp-footer">
        <div className="lp-wrap">
          <div className="lp-footer-grid">
            <div>
              <span className="lp-logo">
                <span className="lp-logo-mark" aria-hidden="true">م</span>
                <span className="lp-logo-name">مَدار</span>
              </span>
              <p>{t('footer.about')}</p>
            </div>

            <div className="lp-footer-col">
              <b>{t('footer.links')}</b>
              <a href="#system">{t('nav.features')}</a>
              <a href="#pricing">{t('nav.pricing')}</a>
              <a href="#guarantee">{t('nav.questions')}</a>
            </div>

            <div className="lp-footer-col">
              <b>{t('footer.account')}</b>
              <button type="button" onClick={goLogin}>{t('nav.login')}</button>
              <button
                type="button"
                onClick={goSignup}
                style={{ color: 'var(--lp-deep)', fontWeight: 800 }}
              >
                {t('nav.cta')}
              </button>
            </div>
          </div>

          <div className="lp-footer-bottom">
            <span>{t('footer.copyright', { year: new Date().getFullYear() })}</span>
            <button type="button" className="lp-nav-lang" onClick={toggleLanguage}>
              <Languages className="h-4 w-4" aria-hidden="true" />
              {isArabic ? 'English' : 'العربية'}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
