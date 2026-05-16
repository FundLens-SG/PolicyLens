// Per-sheet regression test for the Soh Family Policy Summary.xlsx fixture.
//
// Sibling to test-soh-je-xlsx-extraction.mjs but covers ALL 5 sheets — DD/MM/JL/JY/JE — and
// asserts field-level accuracy via the same hand-curated truth file used by
// diff-extraction-against-source.mjs. Locks in the rc2.42 fixes:
//   • D1: section banner length cap 40 → 60 (DD's "Personal Accident Protection / Travel
//         Insurance" is 47 chars).
//   • D2: ISP umbrella name preserved on parent (was overwritten by plan-option name).
//   • D3: AIA HSG MAX A/B/Standard ward suffixes recognised as plan options.
//   • D4: phantom Legacy sections dedupped, ordinal-row rejection in policy-header scorer.
//   • D5: bare "Policy Start"/"Policy End"/"Maturity"/"Amount" headers now map to
//         inceptionDate/maturityDate/premiumAmount.
//   • D6: coverage-column continuation rows append to parent coverage, not riders.
//
// If this file's fixture path is not present on the running machine, the test exits 0 with
// a friendly note — same convention as smoke-xlsx.mjs (fixture is user-specific).
//
// USAGE
//   npm run test:soh-family
//
// EXIT CODES
//   0 = pass (or fixture missing — local-only test)
//   1 = at least one assertion failed

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = 'C:\\Users\\user\\Downloads\\Soh Family Policy Summary.xlsx';
const truthPath = path.join(rootDir, 'tools/fixtures/soh-family-truth.json');

if (!fs.existsSync(fixturePath)) {
  console.log('Soh Family XLSX regression skipped: fixture not found at ' + fixturePath);
  process.exit(0);
}
if (!fs.existsSync(truthPath)) {
  console.error('Truth file missing: ' + truthPath);
  process.exit(1);
}

const result = spawnSync(process.execPath, [
  path.join(rootDir, 'tools/diff-extraction-against-source.mjs'),
  '--soh-family'
], { cwd: rootDir, encoding: 'utf8' });

const out = (result.stdout || '') + (result.stderr || '');
const summaryMatch = out.match(/TOTAL:\s+(\d+)\/(\d+)\s+fields\s+\((\d+)%\),\s+(\d+)\s+missing\s+policies/);
if (!summaryMatch) {
  console.error('Could not parse diff harness output:');
  console.error(out);
  process.exit(1);
}
const [, matchesStr, totalStr, pctStr, missingStr] = summaryMatch;
const matches = parseInt(matchesStr, 10);
const total = parseInt(totalStr, 10);
const pct = parseInt(pctStr, 10);
const missing = parseInt(missingStr, 10);

let failed = 0;
function check(condition, msg) {
  if (condition) return;
  console.error('FAIL: ' + msg);
  failed++;
}

check(missing === 0, 'No policies should be missing from the extraction (got ' + missing + ' missing)');
check(matches === total, 'All asserted fields should match (got ' + matches + '/' + total + ', ' + pct + '%)');

const perSheet = {};
for (const line of out.split(/\r?\n/)) {
  const m = line.match(/^\s+(\S.*?)\s{2,}(\d+)\/(\d+)\s+fields\s+\((\d+)%\)/);
  if (!m) continue;
  perSheet[m[1].trim()] = { matches: parseInt(m[2], 10), total: parseInt(m[3], 10) };
}
for (const expectedSheet of ['DD Policy Summary', 'MM Policy Summary', 'JL Policy Summary', 'JY Policy Summary', 'JE Policy Summary']) {
  const s = perSheet[expectedSheet];
  check(s, expectedSheet + ' should appear in diff output');
  if (s) check(s.matches === s.total, expectedSheet + ' should be 100% (got ' + s.matches + '/' + s.total + ')');
}

if (failed) {
  console.error('\nFull diff harness output:');
  console.error(out);
  console.error('\n' + failed + ' assertion(s) failed.');
  process.exit(1);
}
console.log('Soh Family XLSX extraction (5 sheets) passed: ' + matches + '/' + total + ' fields, 0 missing policies.');
