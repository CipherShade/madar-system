import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import i18n from '../../src/client/locales/i18n';
import { OperationsPage } from '@client/features/operations/OperationsPage';
import { formatMoney } from '@client/lib/format';
import { ToastHost } from '@client/components/ui/kit';
import { jsonRes, parseBody, stubFetch } from './testUtils';

describe('SessionActionPage reconciliation (mode="reconciliation")', () => {
  it('reconciles a selected session with assistant count, headcount, and notes', async () => {
    const user = userEvent.setup();
    const reconcileBody = vi.fn();
    stubFetch([
      { match: /\/api\/attendances\/sessions\/active$/, handle: () => jsonRes({ data: { sessions: [{ id: 'ses-1', title: 'فيزياء', currentLobbyCount: 3, sessionPrice: 120, centerFeePerStudent: 15, startTime: '2026-09-06T18:00:00+02:00', teacher: { fullName: 'أ. هشام' }, room: { name: 'قاعة ٣', capacity: 30 } }] } }) },
      { match: /\/api\/sessions\/ses-1\/reconcile$/, handle: (init) => {
        reconcileBody(parseBody(init));
        return jsonRes({ data: { success: true } });
      } },
    ]);
    render(<><ToastHost /><OperationsPage mode="reconciliation" /></>);

    expect(await screen.findByText(i18n.t('operations.reconciliation.title'))).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(i18n.t('operations.reconciliation.session')), 'ses-1');
    expect(screen.getByText((_, el) => el?.tagName.toLowerCase() === 'span' && el.textContent?.includes(i18n.t('operations.reconciliation.lobbyCount')) && el.textContent?.includes('3'))).toBeInTheDocument();

    await user.type(screen.getByLabelText(i18n.t('operations.reconciliation.assistantCount')), '2');
    await user.type(screen.getByLabelText(i18n.t('operations.reconciliation.headcount')), '3');
    await user.type(screen.getByLabelText(i18n.t('operations.reconciliation.notes')), 'الفرق معتمد');
    await user.click(screen.getByRole('button', { name: i18n.t('actions.reconcile') }));

    await waitFor(() => {
      expect(reconcileBody).toHaveBeenCalledWith({ assistantCount: 2, reconciledHeadcount: 3, resolutionNotes: 'الفرق معتمد' });
    });
    expect(await screen.findByText(i18n.t('operations.reconciliation.saved'))).toBeInTheDocument();
  });

  it('keeps the submit button disabled until a session is selected', async () => {
    stubFetch([
      { match: /\/api\/attendances\/sessions\/active$/, handle: () => jsonRes({ data: { sessions: [{ id: 'ses-1', title: 'فيزياء', currentLobbyCount: 3 }] } }) },
    ]);
    render(<><ToastHost /><OperationsPage mode="reconciliation" /></>);
    await screen.findByText('فيزياء (3)');
    expect(screen.getByRole('button', { name: i18n.t('actions.reconcile') })).toBeDisabled();
  });
});

describe('SessionActionPage settlement (mode="settlement")', () => {
  it('settles a selected session with payout method and recipient', async () => {
    const user = userEvent.setup();
    const settleBody = vi.fn();
    stubFetch([
      { match: /\/api\/scheduling\/sessions$/, handle: () => jsonRes({ data: { sessions: [{ id: 'ses-2', title: 'كيمياء ٣ث', currentLobbyCount: 4, sessionPrice: 150, centerFeePerStudent: 20, startTime: '2026-09-06T19:00:00+02:00', teacher: { fullName: 'أ. سامي' }, room: { name: 'قاعة ٤', capacity: 35 } }] } }) },
      { match: /\/api\/sessions\/ses-2\/settle$/, handle: (init) => {
        settleBody(parseBody(init));
        return jsonRes({ data: { success: true } });
      } },
    ]);
    render(<><ToastHost /><OperationsPage mode="settlement" /></>);

    await user.selectOptions(await screen.findByLabelText(i18n.t('operations.settlement.session')), 'ses-2');
    expect(screen.getByText(formatMoney(150, 'ar'))).toBeInTheDocument();
    expect(screen.getByText(formatMoney(20, 'ar'))).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(i18n.t('operations.settlement.payment')), 'VODAFONE_CASH');
    await user.type(screen.getByLabelText(i18n.t('operations.settlement.recipient')), 'محمود عبد الرحمن');
    await user.click(screen.getByRole('button', { name: i18n.t('actions.settlePayout') }));

    await waitFor(() => {
      expect(settleBody).toHaveBeenCalledWith({ payoutMethod: 'VODAFONE_CASH', recipientName: 'محمود عبد الرحمن' });
    });
    expect(await screen.findByText(i18n.t('operations.settlement.saved'))).toBeInTheDocument();
  });

  it('shows the server-computed payout instead of multiplying locally', async () => {
    // The audit finding: the client used to render (sessionPrice - centerFee)
    // * lobbyCount itself. The lobby has 4 and the fee math would give 520, but
    // the server reconciled headcount 2 -> payout 260. Only 260 may appear.
    const user = userEvent.setup();
    stubFetch([
      { match: /\/api\/scheduling\/sessions$/, handle: () => jsonRes({ data: { sessions: [{ id: 'ses-2', title: 'كيمياء ٣ث', currentLobbyCount: 4, sessionPrice: 150, centerFeePerStudent: 20, startTime: '2026-09-06T19:00:00+02:00', teacher: { fullName: 'أ. سامي' }, room: { name: 'قاعة ٤', capacity: 35 } }] } }) },
      { match: /\/api\/sessions\/ses-2\/settlement-preview$/, handle: () => jsonRes({ data: { teacherPayout: 260, headcount: 2, reconciled: false } }) },
    ]);
    render(<><ToastHost /><OperationsPage mode="settlement" /></>);

    await user.selectOptions(await screen.findByLabelText(i18n.t('operations.settlement.session')), 'ses-2');
    expect(await screen.findByText(formatMoney(260, 'ar'))).toBeInTheDocument();
    expect(screen.queryByText(formatMoney(520, 'ar'))).not.toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.queryByText('4')).not.toBeInTheDocument();
  });

  it("keeps the payout a dash when the preview is unavailable, never a local guess", async () => {
    const user = userEvent.setup();
    stubFetch([
      { match: /\/api\/scheduling\/sessions$/, handle: () => jsonRes({ data: { sessions: [{ id: 'ses-2', title: 'كيمياء ٣ث', currentLobbyCount: 4, sessionPrice: 150, centerFeePerStudent: 20, startTime: '2026-09-06T19:00:00+02:00', teacher: { fullName: 'أ. سامي' }, room: { name: 'قاعة ٤', capacity: 35 } }] } }) },
    ]);
    render(<><ToastHost /><OperationsPage mode="settlement" /></>);

    await user.selectOptions(await screen.findByLabelText(i18n.t('operations.settlement.session')), 'ses-2');
    await waitFor(() => {
      expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.queryByText(formatMoney(520, 'ar'))).not.toBeInTheDocument();
  });
});