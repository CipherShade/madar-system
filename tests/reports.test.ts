import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateDailyReportTotals, dateBounds } from '../src/server/modules/reports/reports.js';

test('calculateDailyReportTotals combines digital collections and preserves report metrics', () => {
  assert.deepEqual(calculateDailyReportTotals({
    attendees: 42,
    centerRevenue: 2100,
    teacherPayouts: 6300,
    vodafoneCash: 450.5,
    instapay: 799.5,
  }), {
    totalAttendees: 42,
    centerNetRevenue: 2100,
    teacherPayouts: 6300,
    digitalCollections: 1250,
    digitalCollectionsByMethod: { vodafoneCash: 450.5, instapay: 799.5 },
  });
});

test('calculateDailyReportTotals handles empty/zero collections', () => {
  assert.deepEqual(calculateDailyReportTotals({
    attendees: 0,
    centerRevenue: 0,
    teacherPayouts: 0,
    vodafoneCash: 0,
    instapay: 0,
  }), {
    totalAttendees: 0,
    centerNetRevenue: 0,
    teacherPayouts: 0,
    digitalCollections: 0,
    digitalCollectionsByMethod: { vodafoneCash: 0, instapay: 0 },
  });
});

test('dateBounds builds a full Egypt business-day range (GMT+3)', () => {
  const bounds = dateBounds('2026-01-05');
  assert.ok(bounds);
  assert.equal(bounds!.start.toISOString(), '2026-01-04T21:00:00.000Z');
  assert.equal(bounds!.end.toISOString(), '2026-01-05T21:00:00.000Z');
});

test('dateBounds rejects malformed and impossible dates', () => {
  assert.equal(dateBounds('garbage'), null);
  assert.equal(dateBounds('2026-13-01'), null);
  assert.equal(dateBounds('2026-00-10'), null);
  assert.equal(dateBounds('05-01-2026'), null);
});

test('dateBounds handles the last day of the month', () => {
  const bounds = dateBounds('2026-01-31');
  assert.ok(bounds);
  assert.equal(bounds!.start.toISOString(), '2026-01-30T21:00:00.000Z');
  assert.equal(bounds!.end.toISOString(), '2026-01-31T21:00:00.000Z');
});