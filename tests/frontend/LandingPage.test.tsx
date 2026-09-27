import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../src/client/locales/i18n';
import { LandingPage } from '@client/features/landing/LandingPage';
import { getOfferBySlug } from '../../src/shared/constants/offers';

const arabicNumber = (value: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(value);
const englishNumber = (value: number) => new Intl.NumberFormat('en-EG', { maximumFractionDigits: 0 }).format(value);

const operations = getOfferBySlug('operations')!;
const basic = getOfferBySlug('basic')!;
const multiBranch = getOfferBySlug('multi-branch')!;

function renderLanding(props: Partial<React.ComponentProps<typeof LandingPage>> = {}) {
  const onNavigateSignup = vi.fn();
  const onNavigateLogin = vi.fn();
  const utils = render(
    <LandingPage onNavigateSignup={onNavigateSignup} onNavigateLogin={onNavigateLogin} {...props} />,
  );
  return { ...utils, onNavigateSignup, onNavigateLogin };
}

describe('LandingPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ar');
  });

  it('renders the Arabic hero in an RTL document direction', () => {
    const { container } = renderLanding();

    expect(container.querySelector('.madar-landing')).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: new RegExp(i18n.t('landing:cta.primary')) }).length).toBeGreaterThan(0);
  });

  it('presents Operations as the single dominant plan', () => {
    renderLanding();

    const primaryCards = document.querySelectorAll('.lp-plan-main');
    expect(primaryCards).toHaveLength(1);
    const card = primaryCards[0];
    expect(within(card as HTMLElement).getByRole('heading', { name: operations.nameAr })).toBeInTheDocument();

    // The secondary plans are never rendered as primary cards.
    const secondaryCards = document.querySelectorAll('.lp-plan-sub');
    expect(secondaryCards).toHaveLength(2);
    expect(document.querySelectorAll('.lp-plan-main.lp-plan-sub')).toHaveLength(0);
  });

  it('shows the founding price against the real list price for every purchasable offer', () => {
    const { container } = renderLanding();

    for (const offer of [operations, basic]) {
      expect(container.textContent).toContain(arabicNumber(offer.foundingPriceEgp));
      expect(container.textContent).toContain(arabicNumber(offer.listPriceEgp));
    }

    // The list price is rendered struck through, so the saving is explicit.
    const struck = document.querySelectorAll('del');
    expect(struck.length).toBeGreaterThanOrEqual(2);
    const struckText = Array.from(struck).map((node) => node.textContent).join(' ');
    expect(struckText).toContain(arabicNumber(operations.listPriceEgp));
    expect(struckText).toContain(arabicNumber(basic.listPriceEgp));
  });

  it('shows the discounted founding price for Basic', () => {
    const { container } = renderLanding();

    expect(basic.foundingPriceEgp).toBe(349);
    expect(container.textContent).toContain(arabicNumber(349));
    // The list price it is discounted from is still shown struck through.
    expect(container.textContent).toContain(arabicNumber(basic.listPriceEgp));
  });

  it('numbers the plans and labels the second one as the most popular', () => {
    renderLanding();

    expect(basic.nameAr).toBe('الباقة الأولى');
    expect(operations.nameAr).toBe('الباقة التانية');
    expect(multiBranch.nameAr).toBe('الباقة التالتة');

    expect(basic.badgeAr).toBe('الأساسية');
    expect(operations.badgeAr).toBe('الأكثر استخداماً');
    expect(operations.highlightAr).toBe('قيمة مقابل سعر');

    const primaryCard = document.querySelector('.lp-plan-main') as HTMLElement;
    expect(within(primaryCard).getByText('الأكثر استخداماً')).toBeInTheDocument();
    expect(within(primaryCard).getByText('قيمة مقابل سعر')).toBeInTheDocument();
  });

  it('offers the one-step payments feature in every plan', () => {
    renderLanding();

    const feature = 'المدفوعات: كاش، فودافون كاش، وإنستاباي في خطوة واحدة';
    for (const offer of [operations, basic, multiBranch]) {
      expect(offer.featuresAr, `${offer.slug} must include the payments feature`).toContain(feature);
    }
    for (const offer of [operations, basic, multiBranch]) {
      expect(offer.featuresEn, `${offer.slug} must include the payments feature`).toContain(
        'Payments in one step: cash, Vodafone Cash and InstaPay',
      );
    }

    // Rendered on all three cards, not just the primary one.
    const rendered = Array.from(document.querySelectorAll('.lp-plan-features li')).map((li) =>
      li.textContent?.trim(),
    );
    expect(rendered.filter((text) => text === feature)).toHaveLength(3);
  });

  it('renders Multi-Branch as coming soon with a disabled action', () => {
    renderLanding();

    expect(multiBranch.available).toBe(false);
    expect(screen.getByText(i18n.t('landing:pricing.comingSoon'))).toBeInTheDocument();
    const chooseButtons = screen.getAllByRole('button', {
      name: i18n.t('landing:pricing.choose', { name: multiBranch.nameAr }),
    });
    expect(chooseButtons[0]).toBeDisabled();
  });

  it('routes the primary call to action to signup and the login action to login', async () => {
    const user = userEvent.setup();
    const { onNavigateSignup, onNavigateLogin } = renderLanding();

    await user.click(screen.getAllByRole('button', { name: new RegExp(i18n.t('landing:cta.primary')) })[0]);
    expect(onNavigateSignup).toHaveBeenCalledTimes(1);
    expect(onNavigateLogin).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: new RegExp(i18n.t('landing:cta.toLogin')) }));
    expect(onNavigateLogin).toHaveBeenCalledTimes(1);
  });

  it('falls back to the hash routes when no navigation callbacks are provided', async () => {
    const user = userEvent.setup();
    window.location.hash = '';
    render(<LandingPage />);

    await user.click(screen.getAllByRole('button', { name: new RegExp(i18n.t('landing:cta.primary')) })[0]);
    expect(window.location.hash).toBe('#/signup');

    await user.click(screen.getByRole('button', { name: new RegExp(i18n.t('landing:cta.toLogin')) }));
    expect(window.location.hash).toBe('#/login');
  });

  it('switches the whole page to English and flips the direction to LTR', async () => {
    const user = userEvent.setup();
    const { container } = renderLanding();

    await user.click(screen.getAllByRole('button', { name: 'English' })[0]);

    expect(container.querySelector('.madar-landing')).toHaveAttribute('dir', 'ltr');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      i18n.t('landing:hero.headlineLead', { lng: 'en' }) + i18n.t('landing:hero.headlineAccent', { lng: 'en' }),
    );
    // Prices reformat for the English locale.
    expect(container.textContent).toContain(englishNumber(operations.foundingPriceEgp));
    expect(container.textContent).toContain(englishNumber(operations.listPriceEgp));
  });

  it('resolves every interpolation placeholder instead of printing it literally', () => {
    const { container } = renderLanding();
    const text = container.textContent ?? '';

    // i18next interpolates {{name}}; a single-brace placeholder would ship as a
    // literal "{name}" in production copy.
    expect(text).not.toMatch(/\{[a-zA-Z]+\}/);
    expect(text).not.toContain('{name}');
    expect(text).not.toContain('{price}');
    expect(text).not.toContain('{period}');
    expect(text).not.toContain('{year}');

    // The placeholders that must actually be substituted.
    expect(text).toContain(String(new Date().getFullYear()));
    expect(
      screen.getByRole('button', { name: i18n.t('landing:pricing.choose', { name: basic.nameAr }) }),
    ).toBeInTheDocument();
  });

  it('labels the illustrative lobby visuals instead of passing them off as real data', () => {
    renderLanding();
    expect(screen.getAllByText(i18n.t('landing:visibility.exampleLabel')).length).toBeGreaterThan(0);
  });
});

describe('LandingPage translations', () => {
  it('never uses single-brace placeholders (i18next only resolves {{name}})', () => {
    for (const language of ['ar', 'en'] as const) {
      const flat: string[] = [];
      const walk = (node: unknown) => {
        if (typeof node === 'string') flat.push(node);
        else if (Array.isArray(node)) node.forEach(walk);
        else if (node && typeof node === 'object') Object.values(node).forEach(walk);
      };
      walk(i18n.getResourceBundle(language, 'landing'));

      const offenders = flat.filter((value) => /(^|[^{])\{[a-zA-Z]+\}([^}]|$)/.test(value));
      expect(offenders, `${language}/landing.json has single-brace placeholders`).toEqual([]);
    }
  });
});

