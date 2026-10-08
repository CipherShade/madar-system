import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '../../src/client/locales/i18n';
import { LifecycleBanner } from '@client/features/billing/LifecycleBanner';
import { jsonRes, stubFetch } from './testUtils';

/**
 * Regression cover for the invisible renewal banner.
 *
 * `api()` already unwraps the response envelope's `data`, but the banner read
 * `res.data.lifecycle` — one level too deep — so `lifecycle` was always
 * undefined and a center in grace or frozen was never told to renew.
 */
describe('LifecycleBanner', () => {
  const lifecycle = {
    state: 'GRACE',
    canWrite: true,
    readOnly: false,
    daysUntilExpiry: -2,
    freezesAt: null,
    reminder: {
      code: 'GRACE',
      severity: 'warning',
      messageAr: 'اشتراكك في فترة سماح، جدد الآن.',
      messageEn: 'Your subscription is in grace. Renew now.',
    },
  };

  it('shows the server reminder that api() returned at the top level', async () => {
    stubFetch([{ match: /\/api\/subscriptions\/current/, handle: () => jsonRes({ data: { lifecycle } }) }]);
    render(<LifecycleBanner onGoToBilling={() => {}} />);
    expect(await screen.findByText(lifecycle.reminder.messageAr)).toBeInTheDocument();
  });

  it('offers the billing shortcut for a payable state and invokes it', async () => {
    const onGoToBilling = vi.fn();
    stubFetch([{ match: /\/api\/subscriptions\/current/, handle: () => jsonRes({ data: { lifecycle } }) }]);
    const user = userEvent.setup();
    render(<LifecycleBanner onGoToBilling={onGoToBilling} />);

    const cta = await screen.findByRole('button', { name: /(الاشتراك|subscription billing)/i });
    await user.click(cta);
    expect(onGoToBilling).toHaveBeenCalledOnce();
  });

  it('stays silent when the server sends no reminder', async () => {
    const mockFetch = stubFetch([
      { match: /\/api\/subscriptions\/current/, handle: () => jsonRes({ data: { lifecycle: { ...lifecycle, reminder: null } } }) },
    ]);
    const { container } = render(<LifecycleBanner onGoToBilling={() => {}} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(container.querySelector('.lifecycle-banner')).toBeNull();
  });
});
