import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  GRACE_PERIOD_DAYS,
  RENEWAL_REMINDER_DAYS,
  addEgyptDays,
  cairoDaysBetween,
  computeFreezeInstant,
  resolveTenantLifecycle,
  startOfEgyptDay,
} from '../src/server/lib/tenantLifecycle.js';
import { SubscriptionStatus } from '../src/shared/constants/index.js';

const sub = (status: string, periodStart: string, periodEnd: string) => ({ status, periodStart, periodEnd });

// 2026-09-27 is the "today" every case below is written relative to.
const NOW = new Date('2026-09-27T12:00:00.000Z');
const iso = (d: Date) => d.toISOString();

/** Renders an instant on the GMT+3 business clock the product is defined on. */
const gmt3 = (d: Date) => new Date(d.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 16);

describe('CAIRO DAY BOUNDARIES', () => {
  test('the same Egypt calendar day is 0 days apart, whatever the UTC hour', () => {
    // 22:00 UTC is already the next day in Cairo (UTC+3).
    assert.equal(cairoDaysBetween(new Date('2026-09-27T21:00:00Z'), new Date('2026-09-27T23:00:00Z')), 0);
    assert.equal(cairoDaysBetween(new Date('2026-09-27T20:59:00Z'), new Date('2026-09-27T21:01:00Z')), 1);
  });

  test('a period ending late tonight still reports 0 days left', () => {
    // 20:00Z is 23:00 in Cairo — still the same calendar day as NOW.
    assert.equal(cairoDaysBetween(NOW, new Date('2026-09-27T20:00:00Z')), 0);
    // 21:00Z is 00:00 next day in Cairo, so it is 1, not 0.
    assert.equal(cairoDaysBetween(NOW, new Date('2026-09-27T21:00:00Z')), 1);
  });

  test('days are counted going backwards too', () => {
    assert.equal(cairoDaysBetween(new Date('2026-09-27T12:00:00Z'), new Date('2026-09-20T12:00:00Z')), -7);
  });
});

describe('FREEZE BOUNDARY: a freeze always lands at 12:00 AM GMT+3', () => {
  test('a period that ends at 00:00 GMT+3 freezes 8 days later at 00:00 GMT+3', () => {
    // Period ends 2026-09-21 00:00 GMT+3 = 2026-09-20T21:00:00Z.
    const freeze = computeFreezeInstant(new Date('2026-09-20T21:00:00Z'));
    assert.equal(gmt3(freeze), '2026-09-29T00:00');
  });

  test('a period that ends one minute before midnight freezes on the same day-of-month shift', () => {
    // 2026-09-21 00:59 GMT+3 — still the 21st, so the grace days run 22..28.
    const freeze = computeFreezeInstant(new Date('2026-09-20T21:59:00Z'));
    assert.equal(gmt3(freeze), '2026-09-29T00:00');
  });

  test('the boundary is exactly midnight, never UTC midnight', () => {
    // The previous implementation built dates at 00:00 UTC, which is 03:00 on
    // the business clock. Assert the instant is 21:00Z, not 00:00Z.
    const freeze = computeFreezeInstant(new Date('2026-09-20T21:00:00Z'));
    assert.equal(freeze.toISOString(), '2026-09-28T21:00:00.000Z');
  });

  test('the boundary does not drift with daylight saving', () => {
    // Egypt observes DST, but the business day is a fixed GMT+3 clock, so a
    // January freeze must land on exactly the same wall-clock time as a
    // September one. A DST-aware implementation would shift this by an hour.
    const winter = computeFreezeInstant(new Date('2026-01-15T21:00:00Z'));
    assert.equal(gmt3(winter), '2026-01-24T00:00');
  });

  test('a freeze instant is always the start of a business day', () => {
    for (const end of ['2026-03-01T21:00:00Z', '2026-07-15T21:00:00Z', '2026-12-31T21:00:00Z']) {
      assert.match(gmt3(computeFreezeInstant(new Date(end))), /T00:00$/, `not midnight for ${end}`);
    }
  });
});

describe('SUBSCRIPTION PERIODS sit on the same business-day clock', () => {
  test('a payment approved at 2pm still starts the period at midnight', () => {
    // 14:00 GMT+3 on the 27th.
    assert.equal(startOfEgyptDay(new Date('2026-09-27T11:00:00Z')).toISOString(), '2026-09-26T21:00:00.000Z');
  });

  test('a payment approved at 11:59pm snaps to that same midnight, not the next', () => {
    // 23:59 GMT+3 on the 27th is 20:59Z — still the 27th.
    assert.equal(startOfEgyptDay(new Date('2026-09-27T20:59:00Z')).toISOString(), '2026-09-26T21:00:00.000Z');
    // 00:00 GMT+3 on the 28th is 21:00Z — the next day.
    assert.equal(startOfEgyptDay(new Date('2026-09-27T21:00:00Z')).toISOString(), '2026-09-27T21:00:00.000Z');
  });

  test('a 30-day period ends at midnight exactly 30 business days later', () => {
    const start = startOfEgyptDay(new Date('2026-09-27T11:00:00Z'));
    const end = addEgyptDays(start, 30);
    assert.equal(gmt3(end), '2026-10-27T00:00');
    assert.equal(cairoDaysBetween(start, end), 30);
  });

  test('a period boundary is never mid-day, in any month', () => {
    for (const at of ['2026-02-10T05:00:00Z', '2026-04-22T18:00:00Z', '2026-11-05T23:00:00Z']) {
      const end = addEgyptDays(startOfEgyptDay(new Date(at)), 30);
      assert.match(gmt3(end), /T00:00$/, `period end not at midnight for ${at}`);
    }
  });

  test('a verified period is immediately live, with no gap at the boundary', () => {
    const periodStart = startOfEgyptDay(new Date('2026-09-27T11:00:00Z'));
    const periodEnd = addEgyptDays(periodStart, 30);
    const rows = [sub(SubscriptionStatus.ACTIVE, periodStart.toISOString(), periodEnd.toISOString())];

    const atApproval = resolveTenantLifecycle(rows, new Date('2026-09-27T11:00:00Z'));
    assert.equal(atApproval.state, 'ACTIVE');
    assert.equal(atApproval.canWrite, true);

    // One millisecond before the period ends it is still fully usable.
    const lastMoment = resolveTenantLifecycle(rows, new Date(periodEnd.getTime() - 1));
    assert.equal(lastMoment.canWrite, true);
  });
});

describe('LIFECYCLE: awaiting approval', () => {
  test('a brand new center with no subscription history is read-only', () => {
    const l = resolveTenantLifecycle([], NOW);
    assert.equal(l.state, 'AWAITING_APPROVAL');
    assert.equal(l.canWrite, false);
    assert.equal(l.readOnly, true);
    assert.equal(l.reminder?.code, 'AWAITING_APPROVAL');
  });

  test('a center whose only subscription is still PENDING is still read-only', () => {
    const l = resolveTenantLifecycle([sub(SubscriptionStatus.PENDING, '2026-09-27T00:00:00Z', '2026-10-27T00:00:00Z')], NOW);
    assert.equal(l.state, 'AWAITING_APPROVAL');
    assert.equal(l.canWrite, false);
  });

  test('a rejected payment leaves the center read-only', () => {
    const l = resolveTenantLifecycle([sub(SubscriptionStatus.CANCELED, '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z')], NOW);
    assert.equal(l.state, 'AWAITING_APPROVAL');
    assert.equal(l.canWrite, false);
  });

  test('a rejection never buys a grace period, even though its period has already ended', () => {
    // `/reject` stamps periodEnd with the current time, so a rejected row looks
    // exactly like a lapsed paid period unless grace is gated on ACTIVE. If it
    // were not, a rejected payment would hand the owner 7 days of working
    // product for free.
    const l = resolveTenantLifecycle([sub(SubscriptionStatus.CANCELED, '2026-09-27T00:00:00Z', '2026-09-27T00:00:00Z')], NOW);
    assert.equal(l.state, 'AWAITING_APPROVAL');
    assert.equal(l.canWrite, false);
    assert.equal(l.reminder?.code, 'AWAITING_APPROVAL');
  });

  test('an expired PENDING row is not a lapsed paid period either', () => {
    const l = resolveTenantLifecycle([sub(SubscriptionStatus.PENDING, '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z')], NOW);
    assert.equal(l.state, 'AWAITING_APPROVAL');
    assert.equal(l.canWrite, false);
  });

  test('only the paid history drives grace, even alongside a rejected attempt', () => {
    // Paid and lapsed, then a second, rejected renewal attempt.
    const l = resolveTenantLifecycle(
      [
        sub(SubscriptionStatus.CANCELED, '2026-09-27T00:00:00Z', '2026-09-27T00:00:00Z'),
        sub(SubscriptionStatus.ACTIVE, '2026-08-20T00:00:00Z', '2026-09-20T00:00:00Z'),
      ],
      NOW,
    );
    assert.equal(l.state, 'GRACE');
    assert.equal(l.canWrite, true, 'the genuinely paid period still owes the owner its grace days');
  });

  test('a PENDING subscription never grants access, even with a future end date', () => {
    // This is the exact shape of the original bug: a future-dated period that
    // was never verified must not unlock writes.
    const l = resolveTenantLifecycle([sub(SubscriptionStatus.PENDING, '2026-09-27T00:00:00Z', '2027-09-27T00:00:00Z')], NOW);
    assert.equal(l.canWrite, false);
    assert.equal(l.state, 'AWAITING_APPROVAL');
  });
});

describe('LIFECYCLE: active', () => {
  const active = (end: string) => [sub(SubscriptionStatus.ACTIVE, '2026-09-01T00:00:00Z', end)];

  test('a paid center well before expiry is fully active with no reminder', () => {
    const l = resolveTenantLifecycle(active('2026-10-20T00:00:00Z'), NOW);
    assert.equal(l.state, 'ACTIVE');
    assert.equal(l.canWrite, true);
    assert.equal(l.readOnly, false);
    assert.equal(l.reminder, null);
    assert.equal(l.daysUntilExpiry, 23);
  });

  test('the renewal reminder starts exactly 3 days out, not before', () => {
    assert.equal(resolveTenantLifecycle(active('2026-10-01T00:00:00Z'), NOW).state, 'ACTIVE'); // 4 days
    assert.equal(resolveTenantLifecycle(active('2026-09-30T00:00:00Z'), NOW).state, 'EXPIRING'); // 3 days
    assert.equal(resolveTenantLifecycle(active('2026-09-29T00:00:00Z'), NOW).state, 'EXPIRING'); // 2 days
    assert.equal(RENEWAL_REMINDER_DAYS, 3);
  });

  test('an expiring center can still work — this is a warning, not a block', () => {
    const l = resolveTenantLifecycle(active('2026-09-28T00:00:00Z'), NOW);
    assert.equal(l.state, 'EXPIRING');
    assert.equal(l.canWrite, true);
    assert.equal(l.reminder?.code, 'RENEWAL_DUE');
    assert.equal(l.reminder?.severity, 'warning');
  });

  test('expiring on the last day still reads as 0 days, not negative', () => {
    // 20:00Z is 23:00 in Cairo, still the same day as NOW.
    const l = resolveTenantLifecycle(active('2026-09-27T20:00:00Z'), NOW);
    assert.equal(l.daysUntilExpiry, 0);
    assert.match(l.reminder!.messageEn, /0 day/);
  });

  test('freezesAt is always period end + the 7 grace days, day-aligned', () => {
    // Expires 2026-10-20 on the business clock (03:00 GMT+3) → grace on the
    // 21st..27th → freezes 2026-10-28 00:00 GMT+3, which is 21:00Z on the 27th.
    const l = resolveTenantLifecycle(active('2026-10-20T00:00:00Z'), NOW);
    assert.equal(gmt3(new Date(l.freezesAt!)), '2026-10-28T00:00');
    assert.equal(l.freezesAt, '2026-10-27T21:00:00.000Z');
    assert.equal(GRACE_PERIOD_DAYS, 7);
  });
});

describe('LIFECYCLE: grace then frozen', () => {
  const lapsed = (end: string) => [sub(SubscriptionStatus.ACTIVE, '2026-08-01T00:00:00Z', end)];

  test('the moment the period ends it is grace, and it still works', () => {
    const l = resolveTenantLifecycle(lapsed('2026-09-27T00:00:00Z'), NOW);
    assert.equal(l.state, 'GRACE');
    assert.equal(l.canWrite, true);
    assert.equal(l.readOnly, false);
    assert.equal(l.reminder?.code, 'GRACE_PERIOD');
  });

  test('grace lasts 7 days, and the 7th day still works', () => {
    assert.equal(resolveTenantLifecycle(lapsed('2026-09-21T00:00:00Z'), NOW).state, 'GRACE'); // 6 days in
    assert.equal(resolveTenantLifecycle(lapsed('2026-09-20T00:00:00Z'), NOW).state, 'GRACE'); // 7 days in
  });

  test('day 8 freezes the account and it becomes read-only', () => {
    const l = resolveTenantLifecycle(lapsed('2026-09-19T00:00:00Z'), NOW);
    assert.equal(l.state, 'FROZEN');
    assert.equal(l.canWrite, false);
    assert.equal(l.readOnly, true);
    assert.equal(l.reminder?.code, 'FROZEN');
    assert.equal(l.reminder?.severity, 'critical');
  });

  test('a long-lapsed center stays frozen without inventing a new deadline', () => {
    const l = resolveTenantLifecycle(lapsed('2026-01-01T00:00:00Z'), NOW);
    assert.equal(l.state, 'FROZEN');
    assert.equal(l.canWrite, false);
  });

  test('the grace countdown decreases as the deadline approaches', () => {
    // Lapsed on the 26th → grace is the 27th..Oct 3, so 7 days left today.
    // Lapsed on the 21st → grace is the 22nd..28th, so 2 days left today.
    const sevenLeft = resolveTenantLifecycle(lapsed('2026-09-26T00:00:00Z'), NOW);
    const twoLeft = resolveTenantLifecycle(lapsed('2026-09-21T00:00:00Z'), NOW);
    assert.match(sevenLeft.reminder!.messageEn, /7 day/);
    assert.match(twoLeft.reminder!.messageEn, /2 day/);
    // Both freeze at 00:00 on the business clock, not 00:00 UTC.
    assert.equal(gmt3(new Date(sevenLeft.freezesAt!)), '2026-10-04T00:00');
    assert.equal(gmt3(new Date(twoLeft.freezesAt!)), '2026-09-29T00:00');
  });

  test('the last grace day still works; the next morning is frozen', () => {
    // Expired on the 20th → grace is the 21st..27th, so the 27th is the last day.
    assert.equal(resolveTenantLifecycle(lapsed('2026-09-20T00:00:00Z'), NOW).state, 'GRACE');
    // Expired on the 19th → grace ended on the 26th, so the 27th is frozen.
    assert.equal(resolveTenantLifecycle(lapsed('2026-09-19T00:00:00Z'), NOW).state, 'FROZEN');
  });
});

describe('LIFECYCLE: renewal clears the state immediately', () => {
  test('verifying a new period un-freezes with no wait and no reset', () => {
    // Frozen from an old period, then the owner pays again.
    const l = resolveTenantLifecycle(
      [
        sub(SubscriptionStatus.ACTIVE, '2026-09-27T00:00:00Z', '2026-10-27T00:00:00Z'),
        sub(SubscriptionStatus.ACTIVE, '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z'),
      ],
      NOW,
    );
    assert.equal(l.state, 'ACTIVE');
    assert.equal(l.canWrite, true);
    assert.equal(l.reminder, null);
  });

  test('a renewal made during grace also restores full access', () => {
    const l = resolveTenantLifecycle(
      [
        sub(SubscriptionStatus.ACTIVE, '2026-09-25T00:00:00Z', '2026-10-25T00:00:00Z'),
        sub(SubscriptionStatus.ACTIVE, '2026-08-20T00:00:00Z', '2026-09-20T00:00:00Z'),
      ],
      NOW,
    );
    assert.equal(l.state, 'ACTIVE');
    assert.equal(l.canWrite, true);
  });

  test('the newest live period wins when an old row is left behind', () => {
    const l = resolveTenantLifecycle(
      [
        sub(SubscriptionStatus.ACTIVE, '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z'),
        sub(SubscriptionStatus.ACTIVE, '2026-09-27T00:00:00Z', '2026-12-27T00:00:00Z'),
      ],
      NOW,
    );
    assert.equal(iso(new Date(l.activePeriodStart!)), '2026-09-27T00:00:00.000Z');
  });
});

describe('LIFECYCLE: safety', () => {
  test('an unrecognised status is never treated as access', () => {
    const l = resolveTenantLifecycle([sub('SOMETHING_ELSE', '2026-09-01T00:00:00Z', '2027-09-01T00:00:00Z')], NOW);
    assert.equal(l.canWrite, false);
  });

  test('a period end in the past but not yet 7 days never reports FROZEN', () => {
    const l = resolveTenantLifecycle([sub(SubscriptionStatus.ACTIVE, '2026-09-25T00:00:00Z', '2026-09-26T23:00:00Z')], NOW);
    assert.equal(l.state, 'GRACE');
  });

  test('every state is one of the documented five', () => {
    const cases = [
      resolveTenantLifecycle([], NOW),
      resolveTenantLifecycle([sub(SubscriptionStatus.ACTIVE, '2026-09-01T00:00:00Z', '2026-10-20T00:00:00Z')], NOW),
      resolveTenantLifecycle([sub(SubscriptionStatus.ACTIVE, '2026-09-01T00:00:00Z', '2026-09-28T00:00:00Z')], NOW),
      resolveTenantLifecycle([sub(SubscriptionStatus.ACTIVE, '2026-08-01T00:00:00Z', '2026-09-25T00:00:00Z')], NOW),
      resolveTenantLifecycle([sub(SubscriptionStatus.ACTIVE, '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z')], NOW),
    ];
    assert.deepEqual(cases.map((c) => c.state), ['AWAITING_APPROVAL', 'ACTIVE', 'EXPIRING', 'GRACE', 'FROZEN']);
  });

  test('canWrite and readOnly are always exact opposites', () => {
    const cases = [
      resolveTenantLifecycle([], NOW),
      resolveTenantLifecycle([sub(SubscriptionStatus.ACTIVE, '2026-09-01T00:00:00Z', '2026-10-20T00:00:00Z')], NOW),
      resolveTenantLifecycle([sub(SubscriptionStatus.ACTIVE, '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z')], NOW),
    ];
    for (const c of cases) assert.equal(c.canWrite, !c.readOnly, c.state);
  });

  test('a read-only state always carries a message the user can act on', () => {
    for (const l of [resolveTenantLifecycle([], NOW), resolveTenantLifecycle([sub(SubscriptionStatus.ACTIVE, '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z')], NOW)]) {
      assert.ok(l.reminder, l.state);
      assert.ok(l.reminder!.messageAr.length > 10);
      assert.ok(l.reminder!.messageEn.length > 10);
      assert.match(l.reminder!.messageEn, /renew|approv/i);
    }
  });
});
