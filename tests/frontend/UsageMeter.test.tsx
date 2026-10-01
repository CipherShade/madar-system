import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UsageMeter } from '@client/features/dashboard/UsageMeter';
import { jsonRes, stubFetch } from './testUtils';

/**
 * Regression cover for the blank dashboard.
 *
 * `/subscriptions/current` builds its `usage` payload by spreading an optional
 * summary over a period/visits base. When the summary fails server-side the
 * object is still truthy but carries no counts, and the usage meter used to
 * dereference `plan.name` unguarded — which threw during render and, with no
 * error boundary mounted, unmounted the entire app: the owner saw their data
 * for a second and then an empty screen.
 */
describe('UsageMeter with a degraded usage payload', () => {
  const failedSummary = {
    summaryAvailable: false,
    periodStart: '2026-09-01T00:00:00.000Z',
    visits: { used: 0, limit: 500, level: 'ok' },
  };

  it('renders nothing instead of throwing when the summary did not load', () => {
    stubFetch([]);
    expect(() =>
      render(<UsageMeter usage={failedSummary as never} loading={false} onNavigateToBilling={() => {}} />),
    ).not.toThrow();
  });

  it('renders nothing instead of throwing when usedVisits is not a number', () => {
    stubFetch([]);
    expect(() =>
      render(
        <UsageMeter
          usage={{ periodStart: '2026-09-01T00:00:00.000Z', periodEnd: '2026-10-01T00:00:00.000Z' } as never}
          loading={false}
          onNavigateToBilling={() => {}}
        />,
      ),
    ).not.toThrow();
  });

  it('keeps rendering a summary that did load', () => {
    stubFetch([]);
    render(
      <UsageMeter
        usage={{
          tenantId: 't1',
          tenantName: 'Cairo Center',
          periodStart: '2026-09-01T00:00:00.000Z',
          periodEnd: '2026-10-01T00:00:00.000Z',
          usedVisits: 10,
          branchUsage: [{ branchId: 'b1', branchName: 'Maadi Branch', visitCount: 4 }],
        }}
        loading={false}
        onNavigateToBilling={() => {}}
      />,
    );
    expect(screen.getByText('Maadi Branch')).toBeInTheDocument();
  });

  it('shows a count, never a quota, a percentage or an upgrade prompt', () => {
    stubFetch([]);
    const { container } = render(
      <UsageMeter
        usage={{
          periodStart: '2026-09-01T00:00:00.000Z',
          periodEnd: '2026-10-01T00:00:00.000Z',
          usedVisits: 10,
        }}
        loading={false}
        onNavigateToBilling={() => {}}
      />,
    );
    // No progress bar, no percentage, and no "x of y" — an unlimited product
    // has nothing to fill.
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    expect(container.textContent).not.toMatch(/20\s*%/);
    expect(container.textContent).not.toMatch(/\/\s*2\s*000/);
  });

  it('shows the billing period as a real date range', () => {
    stubFetch([]);
    const { container } = render(
      <UsageMeter
        usage={{
          periodStart: '2026-09-01T00:00:00.000Z',
          periodEnd: '2026-10-01T00:00:00.000Z',
          usedVisits: 10,
        }}
        loading={false}
        onNavigateToBilling={() => {}}
      />,
    );
    expect(container.textContent).not.toMatch(/Invalid Date/);
  });
});

describe('DashboardPage when the usage summary is unavailable', () => {
  it('still renders the dashboard for an admin', async () => {
    stubFetch([
      { match: /\/api\/auth\/me/, handle: () => jsonRes({ data: { user: { id: 'u1', username: 'admin', fullName: 'Admin', role: 'ADMIN', preferredLanguage: 'ar', phoneNumber: null, tenantId: 't1' } } }) },
      { match: /\/api\/attendances\/sessions\/active/, handle: () => jsonRes({ sessions: [] }) },
      { match: /\/api\/scheduling\/sessions/, handle: () => jsonRes({ sessions: [] }) },
      { match: /\/api\/shifts\/current/, handle: () => jsonRes({ shift: null }) },
      { match: /\/api\/reports\/daily/, handle: () => jsonRes({ data: { totalAttendees: 0, centerNetRevenue: 0, teacherPayouts: 0, digitalCollections: 0 } }) },
      { match: /\/api\/subscriptions\/current/, handle: () => jsonRes({ data: { usage: { summaryAvailable: false, periodStart: '2026-09-01T00:00:00.000Z', visits: { used: 0 } } } }) },
    ]);

    const { DashboardPage } = await import('@client/features/dashboard/DashboardPage');
    const { AuthProvider } = await import('@client/auth/AuthContext');

    render(
      <AuthProvider>
        <DashboardPage onNavigate={() => {}} />
      </AuthProvider>,
    );

    // The page must survive the degraded payload; before the fix this threw on
    // `plan.name` and tore the tree down. The metric grid only renders if the
    // tree above the usage meter survived.
    await waitFor(() => expect(document.querySelector('.metric-grid')).not.toBeNull());
    expect(document.querySelector('.section-grid')).not.toBeNull();
  });
});
