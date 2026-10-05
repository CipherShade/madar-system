import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Error codes, at the source-shape level.
 *
 * Every module used to build its own error envelope behind a helper shaped like
 * `invalid(message, messageEn, code = 'VALIDATION_ERROR')`. The default is right
 * for a 400 — that is what a malformed body is — and wrong for a 404. A missing
 * row then answered `404 {"code":"VALIDATION_ERROR"}`, which says the request was
 * malformed when in fact the caller asked for something real that does not exist.
 *
 * It matters beyond tidiness. A client that keys off the code cannot tell "you
 * sent this wrong" from "that student is gone", and the two deserve different
 * behaviour: the first is the user's problem to fix, the second usually means a
 * stale screen. It also hides a genuine regression. If a route stops finding its
 * row at all, the 404 looks identical to every other 404 and nothing flags it.
 *
 * Two rules are enforced here:
 *
 *   1. a 404 must name the entity it could not find, via an explicit code. It may
 *      never fall through to the `VALIDATION_ERROR` default.
 *   2. the code must match the entity the message names. `ROOM_NOT_FOUND` on a
 *      student route is just as misleading as `VALIDATION_ERROR`, and it is the
 *      kind of copy-paste slip that survives review because it compiles.
 *
 * These assertions exist because the failure mode is silent: nothing at runtime
 * breaks when a code is wrong, and no test fails. The HTTP-level counterpart for
 * the tenant-facing routes is `tests/integration/db/tenant-isolation.test.ts`.
 */

const SERVER_ROOT = join(process.cwd(), 'src', 'server');

/** Recursively collects every .ts file under the server tree. */
function serverFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...serverFiles(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

/**
 * Extracts the text passed to `.send(` for every `code(404)` in a source file, by
 * walking parentheses rather than guessing a window length. The send payload nests
 * calls and object literals several levels deep, so a fixed-width window would
 * silently truncate long handlers and report a missing code that is in fact there.
 *
 * The source offset travels with each payload. Identical handlers recur in a file
 * — four student 404s share one message — so the line has to come from the offset
 * actually found, not from the first match of the payload text.
 */
function notFoundPayloads(source: string): Array<{ payload: string; at: number }> {
  const found: Array<{ payload: string; at: number }> = [];
  const marker = 'code(404).send(';
  let at = source.indexOf(marker);

  while (at !== -1) {
    let depth = 1;
    let i = at + marker.length;
    while (i < source.length && depth > 0) {
      if (source[i] === '(') depth += 1;
      else if (source[i] === ')') depth -= 1;
      i += 1;
    }
    found.push({ payload: source.slice(at + marker.length, i - 1), at });
    at = source.indexOf(marker, i);
  }

  return found;
}

/**
 * The body of a top-level `const NAME = { ... }`, so a 404 that sends a named
 * constant rather than an inline object is still read. `app.ts` answers unknown
 * endpoints with `reply.code(404).send(NOT_FOUND_BODY)`, and a scanner that cannot
 * follow that reports a correct handler as a missing code.
 */
function constantBody(name: string, source: string): string | null {
  const declaration = new RegExp(`\\bconst\\s+${name}\\s*(?::[^=]+)?=\\s*\\{`).exec(source);
  if (!declaration) return null;

  const open = source.indexOf('{', declaration.index);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return null;
}

/**
 * The code carried by a 404 payload, or null when none is stated. Three shapes are
 * accepted, and only three: a named constant, an inline `code: 'X'`, or a third
 * positional string argument to one of the envelope helpers — which is what makes
 * the `VALIDATION_ERROR` default reachable in the first place.
 */
function statedCode(payload: string, source: string, depth = 0): string | null {
  if (depth > 3) return null;

  const constant = payload.trim().match(/^[A-Z][A-Z0-9_]*$/);
  if (constant) {
    const body = constantBody(constant[0], source);
    return body ? statedCode(body, source, depth + 1) : null;
  }

  const inline = payload.match(/code:\s*'([A-Z0-9_]+)'/);
  if (inline) return inline[1];

  const helper = payload.match(/\b(?:invalid|validation|validationError|failure)\(\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'([A-Z0-9_]+)'/);
  if (helper) return helper[1];

  return null;
}

/**
 * The English message of a payload, following a named constant if needed.
 *
 * Most 404s are not objects at all — they are `invalid(arabic, english, code)`
 * calls — so the helper form has to be read as well as the inline `messageEn:`
 * property. An earlier version only read the inline form, returned null for every
 * site, and quietly left the message/code cross-check below with nothing to
 * check: a wrong code passed, and the rule that exists to catch it never ran.
 */
function englishMessage(payload: string, source: string, depth = 0): string | null {
  if (depth > 3) return null;

  const constant = payload.trim().match(/^[A-Z][A-Z0-9_]*$/);
  if (constant) {
    const body = constantBody(constant[0], source);
    return body ? englishMessage(body, source, depth + 1) : null;
  }

  const inline = payload.match(/messageEn:\s*'([^']*)'/);
  if (inline) return inline[1];

  // The helper's second positional argument is the English message.
  const helper = payload.match(/\b(?:invalid|validation|validationError|failure)\(\s*'[^']*'\s*,\s*'([^']*)'/);
  if (helper) return helper[1];

  return null;
}

/** The entity a not-found message names, in English. */
function namedEntity(messageEn: string): string | null {
  const match = messageEn.match(/([A-Za-z ]+?) not found/);
  return match ? match[1].trim().toLowerCase() : null;
}

/**
 * Entity noun to expected code. The two entries that are not a plain uppercasing
 * are deliberate: the model is `BookSale`, and the attendance message reads
 * "Attendance record", neither of which is the code name.
 */
const ENTITY_CODES: Record<string, string> = {
  student: 'STUDENT_NOT_FOUND',
  room: 'ROOM_NOT_FOUND',
  teacher: 'TEACHER_NOT_FOUND',
  branch: 'BRANCH_NOT_FOUND',
  user: 'USER_NOT_FOUND',
  session: 'SESSION_NOT_FOUND',
  product: 'PRODUCT_NOT_FOUND',
  tenant: 'TENANT_NOT_FOUND',
  subscription: 'SUBSCRIPTION_NOT_FOUND',
  attendance: 'ATTENDANCE_NOT_FOUND',
  'attendance record': 'ATTENDANCE_NOT_FOUND',
  sale: 'BOOK_SALE_NOT_FOUND',
  shift: 'SHIFT_NOT_FOUND',
};

/**
 * 404 codes that are legitimately not `<ENTITY>_NOT_FOUND`. Each is listed rather
 * than pattern-matched so that a genuinely wrong code is a test failure and not a
 * silently widened escape hatch.
 */
const NON_ENTITY_404_CODES = new Set([
  'NOT_FOUND', // the app-level handler for an unregistered endpoint
  'UNKNOWN_FEATURE_FLAG', // an unknown feature flag name in a query
]);

/** Every 404 in the server, paired with the file and line it came from. */
const ALL_NOT_FOUNDS = serverFiles(SERVER_ROOT).flatMap((file) => {
  const source = readFileSync(file, 'utf8');
  const relative = file.replace(SERVER_ROOT, '').replace(/\\/g, '/');

  return notFoundPayloads(source).map(({ payload, at }) => ({
    file: relative,
    line: source.slice(0, at).split('\n').length,
    payload,
    code: statedCode(payload, source),
    messageEn: englishMessage(payload, source),
  }));
});

describe('ERROR CODES: a 404 always names what it could not find', () => {
  test('the scanner finds the 404 sites it is meant to police', () => {
    // Without this the rules below would pass on an empty list. An earlier
    // version of the tenant-isolation scanner had exactly this bug: it stopped
    // at `async (` and never read a handler body, so its read-side rule was
    // satisfied by nothing at all. The message-extraction count is here for the
    // same reason: a rule that reads nothing must not report success.
    assert.ok(ALL_NOT_FOUNDS.length >= 30, `expected at least 30 not-found responses, found ${ALL_NOT_FOUNDS.length}`);

    const withCode = ALL_NOT_FOUNDS.filter((nf) => nf.code !== null);
    assert.equal(withCode.length, ALL_NOT_FOUNDS.length, 'the scanner cannot read every code');

    const withMessage = ALL_NOT_FOUNDS.filter((nf) => nf.messageEn !== null);
    assert.equal(withMessage.length, ALL_NOT_FOUNDS.length, 'the scanner cannot read every English message, so the code/message cross-check would be vacuous');

    const crossCheckable = withMessage.filter((nf) => namedEntity(nf.messageEn!) !== null);
    assert.ok(crossCheckable.length >= 25, `expected at least 25 entity-named 404s to cross-check, found ${crossCheckable.length}`);

    // And it must not be reporting one shape only.
    const distinct = new Set(withCode.map((nf) => nf.code));
    assert.ok(distinct.size >= 8, `expected a variety of not-found codes, saw ${distinct.size}: ${[...distinct].join(', ')}`);
  });

  test('no 404 falls through to the VALIDATION_ERROR default', () => {
    const offenders = ALL_NOT_FOUNDS
      .filter((nf) => nf.code === null || nf.code === 'VALIDATION_ERROR')
      .map((nf) => `${nf.file}:${nf.line}`);

    assert.deepEqual(
      offenders,
      [],
      `these 404s state no code, so they answer VALIDATION_ERROR:\n${offenders.join('\n')}`,
    );
  });

  test('a 404 code matches the entity its message names', () => {
    const offenders: string[] = [];

    for (const nf of ALL_NOT_FOUNDS) {
      if (!nf.code || !nf.messageEn) continue;
      if (NON_ENTITY_404_CODES.has(nf.code)) continue;

      const entity = namedEntity(nf.messageEn);
      // A message that names no entity ("The requested endpoint was not found.")
      // has nothing to cross-check.
      if (!entity) continue;

      const expected = ENTITY_CODES[entity];
      if (!expected) {
        offenders.push(`${nf.file}:${nf.line}  message names an unknown entity "${entity}" (code ${nf.code})`);
      } else if (expected !== nf.code) {
        offenders.push(`${nf.file}:${nf.line}  "${nf.messageEn}" should carry ${expected}, not ${nf.code}`);
      }
    }

    assert.deepEqual(offenders, [], `mismatched not-found codes:\n${offenders.join('\n')}`);
  });

  test('the 400 default is untouched', () => {
    // The point of the fix was the 404 default only. A 400 with no code is the
    // normal case, and a 400 claiming a row is missing would be its own bug.
    const bogus = serverFiles(SERVER_ROOT).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return notFoundPayloads(source.replace(/code\(404\)/g, 'code(400)'))
        .filter(({ payload }) => {
          const code = statedCode(payload, source);
          return code !== null && code.endsWith('_NOT_FOUND');
        })
        .map(({ at }) => `${file.replace(SERVER_ROOT, '')}:${source.slice(0, at).split('\n').length}`);
    });

    assert.deepEqual(bogus, [], 'a 400 must not claim a row was not found');
  });
});
