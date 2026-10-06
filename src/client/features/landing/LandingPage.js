import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, BadgeCheck, BarChart3, Bot, BookOpen, CalendarClock, Check, Coins, Gauge, GraduationCap, Languages, LogIn, MapPin, Menu, Radio, Receipt, Search, ShieldCheck, Timer, UserCheck, Users, Wallet, X, } from 'lucide-react';
import { FOUNDING_OFFER, GUARANTEE, ONBOARDING_VIDEO_URL, MADAR_OFFER, SUPPORT, foundingDiscountPercent, } from '../../../shared/constants/offers';
import { money } from '../../lib/api';
import './landing.css';
/* ══════════════════════════ helpers ══════════════════════════ */
function formatPrice(value, locale) {
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-EG', { maximumFractionDigits: 0 }).format(value);
}
function formatMoney(value, locale) {
    return money(value, locale === 'ar' ? 'ar-EG' : 'en-EG');
}
/** Reads a translated array of flat records, skipping anything malformed. */
function readRecords(t, key) {
    const value = t(key, { returnObjects: true });
    if (!Array.isArray(value))
        return [];
    return value.filter((item) => typeof item === 'object' && item !== null);
}
function readStrings(t, key) {
    const value = t(key, { returnObjects: true });
    if (!Array.isArray(value))
        return [];
    return value.filter((item) => typeof item === 'string');
}
function Section({ className = '', id, children, }) {
    return (_jsx("section", { className: className, id: id, children: children }));
}
/**
 * Mirrors the real `/attendances/sessions/active` payload: title, teacher,
 * subject, room, and the live headcount against room capacity. Values are
 * illustrative — the frame is labelled as an example in the UI.
 */
const SESSION_MOCKS = [
    { title: 'رياضيات · ثالثة ثانوي', teacher: 'أ. أحمد', subject: 'رياضيات', room: 'قاعة 2', time: '04:00', attended: 18, capacity: 24, state: 'live' },
    { title: 'فيزياء · ثانية ثانوي', teacher: 'أ. محمود', subject: 'فيزياء', room: 'قاعة 1', time: '04:30', attended: 12, capacity: 16, state: 'live' },
    { title: 'كيمياء · ثالثة ثانوي', teacher: 'أ. سارة', subject: 'كيمياء', room: 'قاعة 3', time: '06:00', attended: 0, capacity: 20, state: 'soon' },
];
function LobbyFrame({ locale, compact = false }) {
    const { t } = useTranslation('landing');
    const isArabic = locale === 'ar';
    return (_jsxs("div", { className: "lp-frame", children: [_jsxs("div", { className: "lp-frame-bar", children: [_jsxs("span", { className: "lp-frame-dots", "aria-hidden": "true", children: [_jsx("i", {}), _jsx("i", {}), _jsx("i", {})] }), _jsxs("span", { className: "lp-frame-title", children: ["\u0645\u064E\u062F\u0627\u0631 \u00B7 ", t('product.sessions')] }), _jsx("span", { className: "lp-frame-tag", children: t('visibility.exampleLabel') })] }), _jsxs("div", { className: "lp-app", children: [_jsxs("div", { className: "lp-app-head", children: [_jsxs("span", { children: [_jsx("b", { children: t('product.sessions') }), _jsx("small", { children: isArabic ? 'الحصص الشغالة دلوقتي واللي جاية' : 'Running now and coming up' })] }), _jsx("span", { className: "lp-pill lp-pill--live", children: t('product.upcoming') })] }), _jsxs("div", { className: "lp-app-grid", children: [_jsx("div", { children: SESSION_MOCKS.map((session) => (_jsxs("div", { className: `lp-session${session.state === 'live' ? ' is-active' : ' is-soon'}`, children: [_jsxs("div", { className: "lp-session-top", children: [_jsx("span", { className: "lp-session-title", children: session.title }), _jsxs("span", { className: `lp-pill${session.state === 'soon' ? ' lp-pill--muted' : ''}`, children: [session.attended, "/", session.capacity] })] }), _jsxs("div", { className: "lp-session-meta", children: [_jsxs("span", { children: [_jsx(GraduationCap, { className: "h-3 w-3", "aria-hidden": "true" }), session.teacher, " \u00B7 ", session.subject] }), _jsxs("span", { children: [_jsx(Timer, { className: "h-3 w-3", "aria-hidden": "true" }), session.time] }), _jsxs("span", { children: [_jsx(MapPin, { className: "h-3 w-3", "aria-hidden": "true" }), session.room] })] }), _jsxs("div", { className: "lp-session-foot", children: [_jsxs("span", { children: [t('product.attended'), ": ", _jsx("b", { children: session.attended }), " / ", session.capacity] }), session.state === 'live' ? (_jsx("span", { className: "lp-pill", children: t('product.live') })) : (_jsx("span", { className: "lp-pill lp-pill--amber", children: t('product.upcoming') }))] }), _jsx("div", { className: "lp-bar", children: _jsx("i", { style: {
                                                    width: `${session.capacity ? (session.attended / session.capacity) * 100 : 0}%`,
                                                } }) })] }, session.title))) }), _jsxs("div", { children: [_jsxs("div", { className: "lp-panel", children: [_jsxs("div", { className: "lp-panel-title", children: [_jsx(Search, { className: "h-3.5 w-3.5", style: { color: 'var(--app-primary)' }, "aria-hidden": "true" }), t('product.search')] }), _jsxs("div", { className: "lp-search", children: [_jsx(Search, { className: "h-3 w-3", "aria-hidden": "true" }), _jsx("span", { children: isArabic ? 'أحمد محمود' : 'Ahmed Mahmoud' })] }), _jsxs("div", { className: "lp-student", children: [_jsx("span", { className: "lp-avatar", "aria-hidden": "true", children: "\u0623" }), _jsxs("span", { className: "lp-student-meta", children: [_jsx("b", { children: isArabic ? 'أحمد محمود السيد' : 'Ahmed Mahmoud El-Sayed' }), _jsxs("small", { children: ["1042 \u00B7 ", isArabic ? 'ثالثة ثانوي' : 'Grade 12'] })] }), _jsx("span", { className: "lp-checkin-btn", children: t('product.checkIn') })] }), _jsxs("div", { className: "lp-methods", children: [_jsx("span", { className: "lp-method is-active", children: t('product.cash') }), _jsx("span", { className: "lp-method", children: t('product.vodafoneCash') }), _jsx("span", { className: "lp-method", children: t('product.instapay') })] })] }), !compact && (_jsxs("div", { className: "lp-feed", children: [_jsxs("div", { className: "lp-panel-title", children: [_jsx(Gauge, { className: "h-3.5 w-3.5", style: { color: 'var(--app-primary)' }, "aria-hidden": "true" }), t('product.drawer')] }), _jsxs("div", { className: "lp-feed-item", children: [_jsx(Wallet, { className: "h-3 w-3", "aria-hidden": "true" }), _jsx("b", { children: formatMoney(3110, locale) })] }), _jsxs("div", { className: "lp-feed-item", children: [_jsx(Receipt, { className: "h-3 w-3", "aria-hidden": "true" }), _jsx("span", { children: t('product.collected') }), _jsx("b", { children: formatMoney(6200, locale) })] }), _jsxs("div", { className: "lp-feed-item", children: [_jsx(UserCheck, { className: "h-3 w-3", "aria-hidden": "true" }), _jsx("span", { children: t('product.attended') }), _jsx("b", { children: "30" })] })] }))] })] })] })] }));
}
/* ══════════════════════════ OFFER ══════════════════════════ */
function PrimaryOffer({ offer, locale, arrow, onChoose, }) {
    const { t } = useTranslation('landing');
    const discount = foundingDiscountPercent(offer);
    const badge = locale === 'ar' ? offer.badgeAr : offer.badgeEn;
    const highlight = locale === 'ar' ? offer.highlightAr : offer.highlightEn;
    return (_jsxs("article", { className: "lp-plan-main", children: [_jsxs("div", { children: [_jsxs("div", { className: "lp-plan-heading", children: [_jsx("h3", { children: locale === 'ar' ? offer.nameAr : offer.nameEn }), badge && _jsx("span", { className: "lp-plan-badge", children: badge })] }), highlight && _jsx("p", { className: "lp-plan-highlight", children: highlight }), _jsx("p", { className: "lp-plan-tagline", children: locale === 'ar' ? offer.taglineAr : offer.taglineEn }), _jsxs("div", { style: { marginTop: 26 }, children: [_jsx("span", { className: "lp-plan-eyebrow", children: t('pricing.foundingPriceLabel') }), _jsxs("div", { className: "lp-plan-price", children: [_jsx("b", { children: formatPrice(offer.foundingPriceEgp, locale) }), _jsx("span", { children: t('pricing.perMonth') })] }), _jsxs("div", { className: "lp-plan-was", children: [_jsxs("del", { children: [t('pricing.listPriceLabel'), ": ", formatPrice(offer.listPriceEgp, locale)] }), discount !== null && _jsxs("span", { children: ["\u2212", discount, "%"] })] }), _jsxs("span", { className: "lp-plan-period", children: [_jsx(CalendarClock, { className: "h-3.5 w-3.5", "aria-hidden": "true" }), locale === 'ar' ? FOUNDING_OFFER.badgeAr : FOUNDING_OFFER.badgeEn] })] }), _jsx("div", { className: "lp-plan-cta", children: _jsxs("button", { type: "button", onClick: onChoose, className: "lp-btn lp-btn-white lp-btn-lg lp-btn-block", children: [t('cta.primary'), arrow] }) })] }), _jsx("ul", { className: "lp-plan-features", children: (locale === 'ar' ? offer.featuresAr : offer.featuresEn).map((feature) => (_jsxs("li", { children: [_jsx(Check, { className: "h-4 w-4", "aria-hidden": "true" }), _jsx("span", { children: feature })] }, feature))) })] }));
}
/* ══════════════════════════ PAGE ══════════════════════════ */
export function LandingPage({ onNavigateLogin, onNavigateSignup }) {
    const { t } = useTranslation('landing');
    const { t: tCommon } = useTranslation('common');
    const { i18n } = useTranslation();
    const isArabic = i18n.language === 'ar';
    const locale = isArabic ? 'ar' : 'en';
    const ArrowIcon = isArabic ? ArrowLeft : ArrowRight;
    const arrow = _jsx(ArrowIcon, { className: "h-4 w-4", "aria-hidden": "true" });
    const [menuOpen, setMenuOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const rootRef = useRef(null);
    // Section reveal — skipped entirely for reduced-motion users.
    const reduceMotion = useMemo(() => typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
    useEffect(() => {
        const root = rootRef.current;
        if (!root)
            return;
        const targets = Array.from(root.querySelectorAll('.lp-reveal'));
        if (targets.length === 0)
            return;
        if (reduceMotion || typeof IntersectionObserver === 'undefined') {
            targets.forEach((node) => node.classList.add('is-in'));
            return;
        }
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting)
                    return;
                entry.target.classList.add('is-in');
                observer.unobserve(entry.target);
            });
        }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
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
        if (onNavigateSignup)
            onNavigateSignup();
        else
            window.location.hash = '#/signup';
    }, [onNavigateSignup]);
    const goLogin = useCallback(() => {
        if (onNavigateLogin)
            onNavigateLogin();
        else
            window.location.hash = '#/login';
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
    const valueKinds = ['system', 'video', 'support', 'data'];
    const valueItems = readRecords(t, 'value.items').map((item, index) => ({
        title: item.title ?? '',
        body: item.body ?? '',
        kind: valueKinds[index % valueKinds.length],
    }));
    const [inventorySelected, setInventorySelected] = useState(false);
    const [migrationSelected, setMigrationSelected] = useState(false);
    const foundingPrice = formatPrice(MADAR_OFFER.foundingPriceEgp, locale);
    const savePercent = foundingDiscountPercent(MADAR_OFFER);
    const hasSupportChannel = Boolean(SUPPORT.phone || SUPPORT.whatsapp || SUPPORT.email);
    return (_jsxs("div", { className: "madar-landing", dir: isArabic ? 'rtl' : 'ltr', ref: rootRef, children: [_jsx("header", { className: `lp-nav${scrolled ? ' is-scrolled' : ''}${menuOpen ? ' is-open' : ''}`, children: _jsx("div", { className: "lp-wrap", children: _jsxs("div", { className: "lp-nav-inner", children: [_jsxs("a", { href: "#top", className: "lp-logo", onClick: closeMenu, children: [_jsx("span", { className: "lp-logo-mark", "aria-hidden": "true", children: "\u0645" }), _jsx("span", { className: "lp-logo-name", children: "\u0645\u064E\u062F\u0627\u0631" })] }), _jsxs("nav", { className: "lp-nav-links", children: [_jsx("a", { href: "#system", onClick: closeMenu, children: t('nav.features') }), _jsx("a", { href: "#visibility", onClick: closeMenu, children: t('nav.how') }), _jsx("a", { href: "#pricing", onClick: closeMenu, children: t('nav.pricing') }), _jsx("a", { href: "#guarantee", onClick: closeMenu, children: t('nav.questions') })] }), _jsxs("div", { className: "lp-nav-actions", children: [_jsxs("button", { type: "button", className: "lp-nav-lang", onClick: toggleLanguage, "aria-label": tCommon('actions.switchLanguage'), children: [_jsx(Languages, { className: "h-4 w-4", "aria-hidden": "true" }), isArabic ? 'English' : 'العربية'] }), _jsxs("button", { type: "button", onClick: goLogin, className: "lp-btn lp-btn-quiet lp-btn-sm", children: [_jsx(LogIn, { className: "h-4 w-4", "aria-hidden": "true" }), t('nav.login')] }), _jsx("button", { type: "button", onClick: goSignup, className: "lp-btn lp-btn-primary lp-btn-sm", children: t('nav.cta') })] }), _jsx("button", { type: "button", className: "lp-nav-toggle", onClick: () => setMenuOpen((open) => !open), "aria-label": t('nav.menu'), "aria-expanded": menuOpen, children: menuOpen ? _jsx(X, { className: "h-5 w-5" }) : _jsx(Menu, { className: "h-5 w-5" }) })] }) }) }), _jsx("section", { className: "lp-hero", id: "top", children: _jsxs("div", { className: "lp-wrap lp-hero-grid", children: [_jsxs("div", { className: "lp-reveal", children: [_jsx("span", { className: "lp-badge", children: t('hero.kicker') }), _jsxs("h1", { children: [t('hero.headlineLead'), ' ', _jsx("em", { children: t('hero.headlineAccent') })] }), _jsx("p", { className: "lp-hero-sub", children: t('hero.sub') }), _jsxs("div", { className: "lp-hero-actions", children: [_jsxs("button", { type: "button", onClick: goSignup, className: "lp-btn lp-btn-primary lp-btn-lg", children: [t('cta.primary'), arrow] }), _jsx("a", { href: "#visibility", className: "lp-btn lp-btn-ghost lp-btn-lg", children: t('cta.secondary') })] }), _jsxs("p", { className: "lp-hero-assure", children: [_jsx(Check, { className: "h-4 w-4", "aria-hidden": "true" }), t('hero.assure', { price: foundingPrice })] })] }), _jsxs("div", { className: "lp-reveal", children: [_jsx(LobbyFrame, { locale: locale, compact: true }), _jsx("p", { className: "lp-caption", children: t('hero.visualCaption') })] })] }) }), _jsx(Section, { className: "lp-section lp-section--tint", id: "problem", children: _jsxs("div", { className: "lp-wrap", children: [_jsxs("div", { className: "lp-sec-head lp-sec-head--center lp-reveal", children: [_jsx("span", { className: "lp-kicker", children: t('problem.kicker') }), _jsx("h2", { children: t('problem.title') }), _jsx("p", { children: t('problem.sub') })] }), _jsxs("div", { className: "lp-transform lp-reveal", children: [_jsxs("div", { className: "lp-transform-col lp-transform-col--ask", children: [_jsx("h3", { children: t('problem.askTitle') }), _jsx("ul", { className: "lp-qlist lp-qlist--ask", children: questions.map((question) => (_jsxs("li", { children: [_jsx(Users, { className: "h-4 w-4", "aria-hidden": "true" }), _jsx("span", { children: question })] }, question))) })] }), _jsx("div", { className: "lp-transform-arrow", "aria-hidden": "true", children: _jsx(ArrowIcon, { className: "h-5 w-5" }) }), _jsxs("div", { className: "lp-transform-col lp-transform-col--see", children: [_jsx("h3", { children: t('problem.seeTitle') }), _jsx("ul", { className: "lp-qlist lp-qlist--see", children: answers.map((answer) => (_jsxs("li", { children: [_jsx(Check, { className: "h-4 w-4", "aria-hidden": "true" }), _jsx("span", { children: answer })] }, answer))) })] })] })] }) }), _jsx(Section, { className: "lp-section", id: "visibility", children: _jsxs("div", { className: "lp-wrap lp-vis-grid", children: [_jsxs("div", { className: "lp-reveal", children: [_jsx("span", { className: "lp-kicker", children: t('visibility.kicker') }), _jsx("h2", { children: t('visibility.title') }), _jsx("p", { style: { marginTop: 14, color: 'var(--lp-ink-2)', fontSize: '1.08rem' }, children: t('visibility.sub') }), _jsx("div", { className: "lp-vis-points", children: visibilityPoints.map((point) => (_jsxs("div", { className: "lp-vis-point", children: [_jsx("span", { className: "lp-vis-ico", "aria-hidden": "true", children: _jsx(point.Icon, { className: "h-4 w-4" }) }), _jsxs("span", { children: [_jsx("b", { children: point.title }), _jsx("small", { children: point.body })] })] }, point.title))) })] }), _jsxs("div", { className: "lp-reveal", children: [_jsx(LobbyFrame, { locale: locale }), _jsx("p", { className: "lp-caption", children: t('visibility.featuresLabel') })] })] }) }), _jsx(Section, { className: "lp-section lp-section--tint", id: "system", children: _jsxs("div", { className: "lp-wrap", children: [_jsxs("div", { className: "lp-sec-head lp-sec-head--center lp-reveal", children: [_jsx("span", { className: "lp-kicker", children: t('system.kicker') }), _jsx("h2", { children: t('system.title') }), _jsx("p", { children: t('system.sub') })] }), _jsx("div", { className: "lp-modules lp-reveal", children: moduleCards.map((module) => (_jsxs("article", { className: "lp-module", children: [_jsx("span", { className: "lp-vis-ico", "aria-hidden": "true", style: { marginBottom: 12 }, children: _jsx(module.Icon, { className: "h-4 w-4" }) }), _jsx("b", { children: module.title }), _jsx("small", { children: module.body })] }, module.key))) }), _jsx("div", { className: "lp-flow lp-reveal", children: flow.map((step, index) => (_jsxs("span", { style: { display: 'contents' }, children: [index > 0 && _jsx(ArrowIcon, { className: "lp-flow-arrow h-4 w-4", "aria-hidden": "true" }), _jsxs("span", { className: "lp-flow-step", children: [_jsx(Radio, { className: "h-3.5 w-3.5", "aria-hidden": "true" }), step] })] }, step))) })] }) }), _jsx(Section, { className: "lp-section", id: "value", children: _jsxs("div", { className: "lp-wrap lp-value-grid", children: [_jsxs("div", { className: "lp-reveal", children: [_jsx("span", { className: "lp-kicker", children: t('value.kicker') }), _jsx("h2", { children: t('value.title') }), hasSupportChannel ? (_jsxs("p", { className: "lp-support-line", style: { marginTop: 16 }, children: [_jsx(ShieldCheck, { className: "h-4 w-4", "aria-hidden": "true" }), [SUPPORT.phone, SUPPORT.whatsapp, SUPPORT.email].filter(Boolean).join(' · ')] })) : (_jsx("p", { className: "lp-placeholder", children: t('value.supportUnconfigured') }))] }), _jsx("div", { className: "lp-value-list lp-reveal", children: valueItems.map((item, index) => (_jsxs("article", { className: "lp-value-item", children: [_jsx("span", { className: "lp-value-n", "aria-hidden": "true", children: index + 1 }), _jsxs("span", { children: [_jsx("b", { children: item.title }), _jsx("p", { children: item.body }), item.kind === 'video' && !ONBOARDING_VIDEO_URL && (_jsx("p", { className: "lp-placeholder", children: t('value.videoUnconfigured') }))] })] }, item.title))) })] }) }), _jsx(Section, { className: "lp-section lp-section--tint", id: "pricing", children: _jsxs("div", { className: "lp-wrap", children: [_jsxs("div", { className: "lp-sec-head lp-sec-head--center lp-reveal", children: [_jsx("span", { className: "lp-kicker", children: t('pricing.kicker') }), _jsx("h2", { children: t('pricing.title') }), _jsx("p", { children: t('pricing.sub') })] }), FOUNDING_OFFER.enabled && (_jsxs("p", { className: "lp-price-lead lp-reveal", children: [_jsx(BadgeCheck, { className: "h-5 w-5", "aria-hidden": "true" }), _jsx("span", { children: t('pricing.foundingNote', { price: foundingPrice }) }), savePercent !== null && _jsxs("b", { children: ["\u2212", savePercent, "%"] })] })), _jsx("div", { className: "lp-reveal", children: _jsx(PrimaryOffer, { offer: MADAR_OFFER, locale: locale, arrow: arrow, onChoose: goSignup }) }), _jsxs("div", { className: "lp-reveal", children: [_jsxs("div", { className: "lp-addons-head", children: [_jsx("span", { className: "lp-kicker", children: t('addons.kicker') }), _jsx("h3", { children: t('addons.title') }), _jsx("p", { children: t('addons.sub') })] }), _jsxs("div", { className: "lp-addon-grid", children: [_jsxs("article", { className: `lp-addon${inventorySelected ? ' is-selected' : ''}`, children: [_jsx(BookOpen, { className: "lp-addon-icon h-5 w-5", "aria-hidden": "true" }), _jsx("h4", { children: t('addons.inventory.title') }), _jsx("b", { className: "lp-addon-price", children: t('addons.inventory.price') }), _jsx("p", { children: t('addons.inventory.description') }), _jsx("ul", { children: readStrings(t, 'addons.inventory.features').map((feature) => _jsxs("li", { children: [_jsx(Check, { className: "h-4 w-4" }), feature] }, feature)) }), _jsx("button", { type: "button", className: "lp-btn lp-btn-ghost lp-btn-block", onClick: () => setInventorySelected((selected) => !selected), children: inventorySelected ? t('addons.selected') : t('addons.add') })] }), _jsxs("article", { className: `lp-addon${migrationSelected ? ' is-selected' : ''}`, children: [_jsx(Bot, { className: "lp-addon-icon h-5 w-5", "aria-hidden": "true" }), _jsx("h4", { children: t('addons.migration.title') }), _jsx("b", { className: "lp-addon-price", children: t('addons.migration.price') }), _jsx("p", { children: t('addons.migration.description') }), _jsx("small", { children: t('addons.migration.detail') }), _jsx("strong", { className: "lp-addon-free", children: t('addons.migration.free') }), _jsx("button", { type: "button", className: "lp-btn lp-btn-ghost lp-btn-block", onClick: () => setMigrationSelected((selected) => !selected), children: migrationSelected ? t('addons.selected') : t('addons.add') })] })] }), _jsxs("div", { className: "lp-total", "aria-live": "polite", children: [_jsx("span", { children: t('addons.summary.madar') }), _jsx("b", { children: t('addons.summary.base') }), inventorySelected && _jsxs(_Fragment, { children: [_jsx("span", { children: t('addons.summary.inventory') }), _jsx("b", { children: t('addons.summary.inventoryPrice') })] }), migrationSelected && _jsxs(_Fragment, { children: [_jsx("span", { children: t('addons.summary.migration') }), _jsx("b", { children: t('addons.summary.migrationPrice') })] }), _jsx("strong", { children: t('addons.summary.total') }), _jsx("strong", { children: t(inventorySelected ? 'addons.summary.totalWithInventory' : 'addons.summary.totalBase') })] })] })] }) }), GUARANTEE.enabled && (_jsx(Section, { className: "lp-section", id: "guarantee", children: _jsx("div", { className: "lp-wrap", children: _jsxs("div", { className: "lp-guarantee lp-reveal", children: [_jsxs("div", { className: "lp-guarantee-badge", "aria-hidden": "true", children: [_jsx("b", { children: GUARANTEE.windowDays }), _jsx("small", { children: isArabic ? 'يوم' : 'days' })] }), _jsxs("div", { children: [_jsx("span", { className: "lp-kicker", children: t('guarantee.kicker') }), _jsx("h3", { children: t('guarantee.title') }), _jsx("p", { children: isArabic ? GUARANTEE.headlineAr : GUARANTEE.headlineEn }), _jsxs("div", { className: "lp-terms", children: [_jsx(ShieldCheck, { className: "h-4 w-4", "aria-hidden": "true" }), GUARANTEE.termsUrl ? (_jsx("a", { href: GUARANTEE.termsUrl, target: "_blank", rel: "noreferrer noopener", children: t('guarantee.termsLink') })) : (_jsx("span", { children: t('guarantee.termsMissing') }))] })] })] }) }) })), _jsx(Section, { className: "lp-section lp-section--tint", id: "how", children: _jsxs("div", { className: "lp-wrap", children: [_jsxs("div", { className: "lp-sec-head lp-sec-head--center lp-reveal", children: [_jsx("span", { className: "lp-kicker", children: t('how.kicker') }), _jsx("h2", { children: t('how.title') })] }), _jsx("div", { className: "lp-steps lp-reveal", children: steps.map((step, index) => (_jsxs("article", { className: "lp-step", children: [_jsx("span", { className: "lp-step-n", "aria-hidden": "true", children: index + 1 }), _jsx("b", { children: step.title }), _jsx("p", { children: step.body })] }, step.title))) })] }) }), _jsx("section", { className: "lp-final", children: _jsxs("div", { className: "lp-wrap lp-reveal", children: [_jsx("h2", { children: t('final.title') }), _jsx("p", { children: t('final.sub') }), _jsxs("div", { className: "lp-final-actions", children: [_jsxs("button", { type: "button", onClick: goSignup, className: "lp-btn lp-btn-white lp-btn-lg", children: [t('cta.primary'), arrow] }), _jsx("button", { type: "button", onClick: goLogin, className: "lp-btn lp-btn-outline-white lp-btn-lg", children: t('cta.toLogin') })] }), _jsxs("p", { className: "lp-final-note", children: [_jsx(Check, { className: "h-4 w-4", "aria-hidden": "true" }), t('final.note')] })] }) }), _jsx("footer", { className: "lp-footer", children: _jsxs("div", { className: "lp-wrap", children: [_jsxs("div", { className: "lp-footer-grid", children: [_jsxs("div", { children: [_jsxs("span", { className: "lp-logo", children: [_jsx("span", { className: "lp-logo-mark", "aria-hidden": "true", children: "\u0645" }), _jsx("span", { className: "lp-logo-name", children: "\u0645\u064E\u062F\u0627\u0631" })] }), _jsx("p", { children: t('footer.about') })] }), _jsxs("div", { className: "lp-footer-col", children: [_jsx("b", { children: t('footer.links') }), _jsx("a", { href: "#system", children: t('nav.features') }), _jsx("a", { href: "#pricing", children: t('nav.pricing') }), _jsx("a", { href: "#guarantee", children: t('nav.questions') })] }), _jsxs("div", { className: "lp-footer-col", children: [_jsx("b", { children: t('footer.account') }), _jsx("button", { type: "button", onClick: goLogin, children: t('nav.login') }), _jsx("button", { type: "button", onClick: goSignup, style: { color: 'var(--lp-deep)', fontWeight: 800 }, children: t('nav.cta') })] })] }), _jsxs("div", { className: "lp-footer-bottom", children: [_jsx("span", { children: t('footer.copyright', { year: new Date().getFullYear() }) }), _jsxs("button", { type: "button", className: "lp-nav-lang", onClick: toggleLanguage, children: [_jsx(Languages, { className: "h-4 w-4", "aria-hidden": "true" }), isArabic ? 'English' : 'العربية'] })] })] }) })] }));
}
