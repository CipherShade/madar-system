import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateChangeOwed, isSessionEligibleForLobbyDashboard } from '../src/server/modules/attendances/attendances.js';

test('calculateChangeOwed returns the amount still owed to the student', () => {
  assert.equal(calculateChangeOwed(180, 150), 30);
  assert.equal(calculateChangeOwed(120, 150), 0);
});

test('isSessionEligibleForLobbyDashboard includes active and upcoming sessions within window', () => {
  const now = new Date();

  assert.equal(
    isSessionEligibleForLobbyDashboard({
      status: 'ACTIVE',
      startTime: new Date(now.getTime() - 1000 * 60),
      endTime: new Date(now.getTime() + 60 * 60 * 1000),
    }),
    true,
  );

  assert.equal(
    isSessionEligibleForLobbyDashboard({
      status: 'SCHEDULED',
      startTime: new Date(now.getTime() + 10 * 60 * 1000),
      endTime: new Date(now.getTime() + 70 * 60 * 1000),
    }),
    true,
  );

  assert.equal(
    isSessionEligibleForLobbyDashboard({
      status: 'SCHEDULED',
      startTime: new Date(now.getTime() + 50 * 60 * 1000),
      endTime: new Date(now.getTime() + 110 * 60 * 1000),
    }),
    true,
  );

  assert.equal(
    isSessionEligibleForLobbyDashboard({
      status: 'SCHEDULED',
      startTime: new Date(now.getTime() - 120 * 60 * 1000),
      endTime: new Date(now.getTime() + 60 * 60 * 1000),
    }),
    true,
  );

  assert.equal(
    isSessionEligibleForLobbyDashboard({
      status: 'SCHEDULED',
      startTime: new Date(now.getTime() - 181 * 60 * 1000),
      endTime: new Date(now.getTime() - 1 * 60 * 1000),
    }),
    false,
  );

  assert.equal(
    isSessionEligibleForLobbyDashboard({
      status: 'SCHEDULED',
      startTime: new Date(now.getTime() - 180 * 60 * 1000),
      endTime: new Date(now.getTime() + 60 * 60 * 1000),
    }),
    true,
  );

  assert.equal(
    isSessionEligibleForLobbyDashboard({
      status: 'SCHEDULED',
      startTime: new Date(now.getTime() + 181 * 60 * 1000),
      endTime: new Date(now.getTime() + 241 * 60 * 1000),
    }),
    false,
  );
});
