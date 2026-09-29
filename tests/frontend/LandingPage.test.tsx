import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../src/client/locales/i18n';
import { LandingPage } from '@client/features/landing/LandingPage';
import { MADAR_OFFER } from '../../src/shared/constants/offers';

function renderLanding() {
  const onNavigateSignup = vi.fn();
  const onNavigateLogin = vi.fn();
  return { ...render(<LandingPage onNavigateSignup={onNavigateSignup} onNavigateLogin={onNavigateLogin} />), onNavigateSignup, onNavigateLogin };
}

describe('LandingPage', () => {
  beforeEach(async () => { await i18n.changeLanguage('ar'); });

  it('renders the Arabic offer in RTL with one core Madar plan', () => {
    const { container } = renderLanding();
    expect(container.querySelector('.madar-landing')).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('دير السنتر بتاعك بسهولة وبسرعة.');
    expect(document.querySelectorAll('.lp-plan-main')).toHaveLength(1);
    expect(document.querySelectorAll('.lp-plan-sub')).toHaveLength(0);
    expect(screen.getAllByRole('heading', { name: MADAR_OFFER.nameAr })).toHaveLength(1);
    expect(container.textContent).toContain('١٬١٩٩');
    expect(container.textContent).toContain('١٬٩٩٩');
  });

  it('selects optional add-ons and calculates the displayed total', async () => {
    const user = userEvent.setup();
    renderLanding();
    expect(screen.getAllByText('١٬١٩٩ جنيه/شهر').length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole('button', { name: 'أضف إلى اشتراكك' })[0]);
    expect(screen.getAllByText('١٬٤٩٩ جنيه/شهر').length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole('button', { name: 'أضف إلى اشتراكك' })[0]);
    expect(screen.getAllByText('٠ جنيه لأول مرة').length).toBeGreaterThan(0);
  });

  it('routes public calls to signup and login', async () => {
    const user = userEvent.setup();
    const { onNavigateSignup, onNavigateLogin } = renderLanding();
    await user.click(screen.getAllByRole('button', { name: new RegExp(i18n.t('landing:cta.primary')) })[0]);
    await user.click(screen.getByRole('button', { name: new RegExp(i18n.t('landing:cta.toLogin')) }));
    expect(onNavigateSignup).toHaveBeenCalledTimes(1);
    expect(onNavigateLogin).toHaveBeenCalledTimes(1);
  });

  it('switches direction and offer copy to English', async () => {
    const user = userEvent.setup();
    const { container } = renderLanding();
    await user.click(screen.getAllByRole('button', { name: 'English' })[0]);
    expect(container.querySelector('.madar-landing')).toHaveAttribute('dir', 'ltr');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Run your center easily and quickly.');
  });
});
