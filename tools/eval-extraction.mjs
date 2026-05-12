// PolicyLens extraction eval harness — rc1.99
//
// PURPOSE
//   Measure how the post-AI extraction pipeline (JSON repair, normalization,
//   sanity checks, insurer-specific rules) handles representative AI
//   responses. Designed for stable regression testing without burning real
//   AI quota every run.
//
// USAGE
//   npm run eval:extraction
//   npm run eval:extraction:verbose
//
// HOW IT WORKS
//   1. Loads every fixture from data/eval-extraction/<insurer>/<scenario>.json
//   2. Each fixture has the raw AI response string (mock or recorded) and
//      a golden-truth expected output (the answer an FC would actually keep).
//   3. The harness feeds the raw AI response through repairJSON (vendored
//      from src/index.babel.html) and compares the parsed object against
//      the fixture's field assertions.
//   4. Reports per-fixture pass/fail and overall accuracy per insurer + field.
//
// EXIT CODE
//   0 if accuracy >= EXPECTED_ACCURACY_FLOOR (default 0.8)
//   1 if accuracy falls below the floor (regression)
//   2 if no fixtures were found (so this script can be wired into CI without
//     failing CI before any fixtures exist).
//
// EXTENDING
//   Drop a new fixture under data/eval-extraction/<insurer>/<scenario>.json:
//     {
//       "name": "Manulife InvestReady III — cash outlay annual",
//       "description": "Premium cell says '$1464 cash outlay' — should map to annual, not monthly.",
//       "insurer": "Manulife",
//       "rawAiOutput": "{ \"insurer\":\"Manulife\", \"productName\":\"InvestReady III\", \"premiumAmount\":1464, \"premFrequency\":\"monthly\" }",
//       "expectedNormalized": { "premFrequency": "annual" },
//       "fieldAssertions": [{ "field": "premFrequency", "expected": "annual" }]
//     }
//
//   Repeat for every reported FC complaint. Over time this becomes the canonical
//   regression suite.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturesRoot = path.join(rootDir, 'data', 'eval-extraction');
const VERBOSE = process.argv.includes('--verbose');
const EXPECTED_ACCURACY_FLOOR = 0.80;

function log(...args) { console.log(...args); }
function colorize(s, code) { return process.stdout.isTTY ? '[' + code + 'm' + s + '[0m' : s; }
const green = s => colorize(s, '32');
const red = s => colorize(s, '31');
const yellow = s => colorize(s, '33');
const dim = s => colorize(s, '90');

// Vendored repairJSON — kept in sync with src/index.babel.html (~line 24894).
// The canonical version handles AI-malformed output (truncated arrays,
// mismatched braces, markdown fences, trailing commas). We re-implement
// the same recovery logic here so the harness can run without sandboxing
// index.html (which trips on `}` inside regex literals).
function repairJSON(raw) {
  let s = String(raw || '').replace(/```json\s*|```\s*/g, '').trim();
  const firstBrace = s.indexOf('{');
  const firstBracket = s.indexOf('[');
  if (firstBrace > 0 && (firstBracket < 0 || firstBrace < firstBracket)) s = s.slice(firstBrace);
  else if (firstBracket >= 0 && firstBracket < firstBrace) s = s.slice(firstBracket);

  try { return JSON.parse(s); } catch (_) {}

  let braces = 0, brackets = 0;
  for (const c of s) {
    if (c === '{') braces++;
    else if (c === '}') braces--;
    else if (c === '[') brackets++;
    else if (c === ']') brackets--;
  }
  if ((s.match(/"/g) || []).length % 2 !== 0) s += '"';
  while (brackets > 0) { s += ']'; brackets--; }
  while (braces > 0) { s += '}'; braces--; }
  s = s.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');

  try { return JSON.parse(s); } catch (_) {
    throw new Error('repairJSON could not parse fixture rawAiOutput');
  }
}

function loadFixtures() {
  const out = [];
  if (!existsSync(fixturesRoot)) return out;
  for (const insurer of readdirSync(fixturesRoot)) {
    const insurerDir = path.join(fixturesRoot, insurer);
    if (!statSync(insurerDir).isDirectory()) continue;
    for (const file of readdirSync(insurerDir)) {
      if (!file.endsWith('.json')) continue;
      const full = path.join(insurerDir, file);
      try {
        const parsed = JSON.parse(readFileSync(full, 'utf8'));
        parsed._insurerFolder = insurer;
        parsed._fixturePath = path.relative(rootDir, full);
        out.push(parsed);
      } catch (e) {
        console.warn('[eval] failed to load ' + full + ': ' + e.message);
      }
    }
  }
  return out;
}

function deepGet(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined;
  if (key.includes('.')) {
    const parts = key.split('.');
    let cursor = obj;
    for (const p of parts) {
      if (cursor == null) return undefined;
      cursor = cursor[p];
    }
    return cursor;
  }
  return obj[key];
}

function looseEqual(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === 'number' && typeof b === 'string') return String(a) === b.trim();
  if (typeof a === 'string' && typeof b === 'number') return a.trim() === String(b);
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

function evalFixture(fixture) {
  const results = { fixture: fixture.name || fixture._fixturePath, insurer: fixture._insurerFolder, passes: [], fails: [], skipped: [] };
  let parsed;
  try {
    parsed = repairJSON(fixture.rawAiOutput);
  } catch (e) {
    results.fails.push({ field: '<parse>', reason: 'repairJSON threw: ' + e.message });
    return results;
  }
  if (!parsed || typeof parsed !== 'object') {
    results.fails.push({ field: '<parse>', reason: 'repairJSON returned non-object' });
    return results;
  }
  const assertions = Array.isArray(fixture.fieldAssertions) ? fixture.fieldAssertions.slice() : [];
  if (!assertions.length && fixture.expectedNormalized && typeof fixture.expectedNormalized === 'object') {
    for (const [field, expected] of Object.entries(fixture.expectedNormalized)) {
      assertions.push({ field, expected });
    }
  }
  for (const a of assertions) {
    if (!a || !a.field) { results.skipped.push(a); continue; }
    const actual = deepGet(parsed, a.field);
    if (looseEqual(actual, a.expected)) {
      results.passes.push({ field: a.field, actual });
    } else {
      results.fails.push({ field: a.field, expected: a.expected, actual, reason: a.reason || null });
    }
  }
  return results;
}

function main() {
  log(dim('Loading fixtures from ' + path.relative(rootDir, fixturesRoot) + ' ...'));
  const fixtures = loadFixtures();
  if (fixtures.length === 0) {
    log(yellow('No fixtures found yet. Drop one under ' + path.relative(rootDir, fixturesRoot) + '/<Insurer>/<scenario>.json to start measuring.'));
    log(dim('Exit code 2 — harness is wired up, fixtures are empty.'));
    process.exit(2);
  }
  log('Running ' + fixtures.length + ' fixture(s)...');
  log('');

  let totalAssertions = 0;
  let totalPasses = 0;
  const perInsurer = new Map();
  const perField = new Map();

  for (const fx of fixtures) {
    const r = evalFixture(fx);
    const passCount = r.passes.length;
    const failCount = r.fails.length;
    totalAssertions += passCount + failCount;
    totalPasses += passCount;
    const insurerBucket = perInsurer.get(r.insurer) || { pass: 0, fail: 0, fixtures: 0 };
    insurerBucket.pass += passCount;
    insurerBucket.fail += failCount;
    insurerBucket.fixtures += 1;
    perInsurer.set(r.insurer, insurerBucket);
    for (const p of r.passes) {
      const bucket = perField.get(p.field) || { pass: 0, fail: 0 };
      bucket.pass++;
      perField.set(p.field, bucket);
    }
    for (const f of r.fails) {
      const bucket = perField.get(f.field) || { pass: 0, fail: 0 };
      bucket.fail++;
      perField.set(f.field, bucket);
    }
    const status = failCount === 0 ? green('PASS') : red('FAIL');
    log('  ' + status + '  ' + r.fixture + dim('  (' + passCount + '/' + (passCount + failCount) + ' fields)'));
    if (failCount > 0 || VERBOSE) {
      for (const f of r.fails) {
        log('    ' + red('x ' + f.field + ': expected ' + JSON.stringify(f.expected) + ', got ' + JSON.stringify(f.actual)) + (f.reason ? dim(' - ' + f.reason) : ''));
      }
      if (VERBOSE) {
        for (const p of r.passes) {
          log('    ' + green('+ ' + p.field + ': ' + JSON.stringify(p.actual)));
        }
      }
    }
  }

  log('');
  log('=== SUMMARY ===');
  const accuracy = totalAssertions === 0 ? 0 : totalPasses / totalAssertions;
  const accuracyStr = (accuracy * 100).toFixed(1) + '%';
  const accuracyColored = accuracy >= EXPECTED_ACCURACY_FLOOR ? green(accuracyStr) : red(accuracyStr);
  log('Overall accuracy: ' + accuracyColored + ' (' + totalPasses + '/' + totalAssertions + ' assertions)');
  log('');
  log('Per insurer:');
  for (const [ins, b] of perInsurer) {
    const total = b.pass + b.fail;
    const pct = total ? (b.pass / total * 100).toFixed(1) + '%' : 'n/a';
    log('  ' + (ins || 'unknown').padEnd(18) + ' ' + pct.padStart(7) + dim('  (' + b.pass + '/' + total + ', ' + b.fixtures + ' fixture' + (b.fixtures === 1 ? '' : 's') + ')'));
  }
  log('');
  log('Top failure modes (fields):');
  const fieldRows = [...perField.entries()]
    .map(([field, b]) => ({ field, b, fail: b.fail, total: b.pass + b.fail }))
    .filter(r => r.fail > 0)
    .sort((a, b) => b.fail - a.fail)
    .slice(0, 10);
  if (fieldRows.length === 0) {
    log('  ' + dim('(none — all assertions passed)'));
  } else {
    for (const r of fieldRows) {
      const pct = r.total ? (r.b.pass / r.total * 100).toFixed(0) + '%' : 'n/a';
      log('  ' + r.field.padEnd(20) + ' ' + pct.padStart(5) + dim('  (' + r.b.pass + '/' + r.total + ')'));
    }
  }
  log('');
  if (accuracy < EXPECTED_ACCURACY_FLOOR) {
    log(red('FAIL: accuracy ' + accuracyStr + ' is below the ' + (EXPECTED_ACCURACY_FLOOR * 100).toFixed(0) + '% floor.'));
    process.exit(1);
  }
  log(green('OK: accuracy ' + accuracyStr + ' meets the ' + (EXPECTED_ACCURACY_FLOOR * 100).toFixed(0) + '% floor.'));
  process.exit(0);
}

main();
