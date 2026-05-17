// PolicyLens xlsx extraction diff harness.
//
// PURPOSE
//   Run the real index.babel.html xlsx extraction pipeline against a fixture
//   workbook, then diff the result against a hand-curated truth JSON. Reports
//   per-field mismatches and a summary so we know what the parser is actually
//   producing vs what the source says.
//
// USAGE
//   node tools/diff-extraction-against-source.mjs <fixture.xlsx> <truth.json>
//   node tools/diff-extraction-against-source.mjs --soh-family   # default fixture
//
// EXIT CODES
//   0 = all asserted fields match
//   1 = at least one mismatch (run with eyes open)
//   2 = harness setup error (file missing, xlsx not installed, etc.)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// rc2.64: extraction setup factored into tools/lib/extract-xlsx.mjs so the smoke
// test can reuse the same harness without duplicating ~50 lines of stub wiring.
import { extractAllSheets, pipelineVersion, normalizeTextKey, normalizeCompactKey } from './lib/extract-xlsx.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── CLI ──
let fixturePath, truthPath;
const args = process.argv.slice(2);
if (args[0] === '--soh-family') {
  fixturePath = 'C:\\Users\\user\\Downloads\\Soh Family Policy Summary.xlsx';
  truthPath = path.join(rootDir, 'tools/fixtures/soh-family-truth.json');
} else if (args.length >= 2) {
  [fixturePath, truthPath] = args;
} else {
  console.error('Usage: node tools/diff-extraction-against-source.mjs <fixture.xlsx> <truth.json>');
  console.error('   or: node tools/diff-extraction-against-source.mjs --soh-family');
  process.exit(2);
}
if (!fs.existsSync(fixturePath)) { console.error('Fixture not found:', fixturePath); process.exit(2); }
if (!fs.existsSync(truthPath))   { console.error('Truth file not found:', truthPath); process.exit(2); }

// ── Color helpers ──
const isTTY = process.stdout.isTTY;
const c = (s, code) => isTTY ? '\x1b[' + code + 'm' + s + '\x1b[0m' : s;
const red    = s => c(s, '31');
const green  = s => c(s, '32');
const yellow = s => c(s, '33');
const cyan   = s => c(s, '36');
const dim    = s => c(s, '90');
const bold   = s => c(s, '1');

// ── Field comparison ──
function normaliseValue(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const s = v.replace(/\s+/g, ' ').trim();
    return s === '' || s === '-' ? null : s;
  }
  if (Array.isArray(v)) return v.map(normaliseValue).filter(x => x != null);
  return v;
}
function fieldsMatch(actual, expected) {
  const a = normaliseValue(actual);
  const e = normaliseValue(expected);
  if (a == null && e == null) return true;
  if (a == null || e == null) return false;
  if (typeof a === 'number' && typeof e === 'number') return Math.abs(a - e) < 0.01;
  if (Array.isArray(a) && Array.isArray(e)) {
    if (a.length !== e.length) return false;
    for (const ex of e) {
      const rx = new RegExp(String(ex).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      if (!a.some(av => rx.test(String(av)))) return false;
    }
    return true;
  }
  return String(a).toLowerCase().includes(String(e).toLowerCase())
      || String(e).toLowerCase().includes(String(a).toLowerCase())
      || normalizeTextKey(a) === normalizeTextKey(e);
}

function findExtractedForExpected(expected, extracted) {
  if (typeof expected._idx === 'number' && extracted[expected._idx]) return { policy: extracted[expected._idx], idx: expected._idx };
  if (expected.productName) {
    const ek = normalizeCompactKey(expected.productName);
    for (const [i, p] of extracted.entries()) {
      const pk = normalizeCompactKey(p.productName || p.policyName);
      if (pk && (pk.includes(ek) || ek.includes(pk))) return { policy: p, idx: i };
    }
  }
  if (expected.policyNo) {
    for (const [i, p] of extracted.entries()) {
      if (String(p.policyNumber || '').includes(String(expected.policyNo))) return { policy: p, idx: i };
    }
  }
  return { policy: null, idx: -1 };
}

// ── Main ──
const truth = JSON.parse(fs.readFileSync(truthPath, 'utf8'));
const extracted = extractAllSheets(fixturePath);

console.log(dim('PolicyLens extraction diff'));
console.log(dim('=========================='));
console.log(dim('fixture: ' + path.basename(fixturePath)));
console.log(dim('truth  : ' + path.basename(truthPath)));
console.log(dim('pipeline: ' + (pipelineVersion || '(unknown)')));
console.log('');

const fieldOrder = ['section', 'productName', 'insurer', 'policyNo', 'lifeInsured', 'policyOwner', 'premiumAmount', 'sumAssured', 'inceptionDate', 'endDate', 'subType', 'hasRider', 'planOption', 'riders', 'coverage'];
const fieldExtractedKey = {
  section: '_section',
  productName: ['productName', 'policyName'],
  insurer: 'insurer',
  policyNo: 'policyNumber',
  lifeInsured: 'lifeInsured',
  policyOwner: 'policyOwner',
  premiumAmount: 'premiumAmount',
  sumAssured: 'sumAssured',
  inceptionDate: 'inceptionDate',
  // PolicyLens schema uses `maturityDate` for end-of-coverage; the truth file calls it endDate for readability.
  endDate: 'maturityDate',
  subType: 'subType',
  hasRider: 'hasRider',
  // ISP plan option is stored as a single string on the parent, not in riders[].
  planOption: '_xlsxIspPlanOption',
  riders: '_ridersOut',
  coverage: 'coverage'
};
function getActual(policy, fieldKey) {
  const key = fieldExtractedKey[fieldKey];
  if (Array.isArray(key)) return policy[key[0]] ?? policy[key[1]];
  return policy[key];
}

let totalChecks = 0, totalMatches = 0, totalMissingPolicies = 0;
const summary = [];

for (const sheetName of Object.keys(truth.sheets || {})) {
  const sheetTruth = truth.sheets[sheetName];
  const sheetExtracted = extracted[sheetName];
  console.log(bold(cyan('=== ' + sheetName + ' ===')));
  if (!sheetExtracted) { console.log(red('  (sheet not found in extraction)')); continue; }
  console.log(dim('  sections detected: ' + sheetExtracted.sections.length + ' | policies extracted: ' + sheetExtracted.policies.length + ' | expected: ' + (sheetTruth.policies || []).length));
  console.log(dim('  sections: ' + sheetExtracted.sections.map(s => '"' + s.sectionLabel + '"(conf=' + s.confidence + ')').join(', ')));

  let sheetChecks = 0, sheetMatches = 0, sheetMissing = 0;
  const matchedIndices = new Set();
  for (const expected of (sheetTruth.policies || [])) {
    const { policy, idx } = findExtractedForExpected(expected, sheetExtracted.policies);
    const label = expected.productName || expected.policyNo || '(unnamed)';
    if (!policy) {
      console.log('  ' + red('✗ MISSING') + ' ' + bold(label) + dim(' (not found in extraction)'));
      sheetMissing++; totalMissingPolicies++;
      continue;
    }
    matchedIndices.add(idx);
    const diffs = [];
    for (const fieldKey of fieldOrder) {
      if (!(fieldKey in expected)) continue;
      const actual = getActual(policy, fieldKey);
      const ok = fieldsMatch(actual, expected[fieldKey]);
      sheetChecks++; totalChecks++;
      if (ok) { sheetMatches++; totalMatches++; }
      else diffs.push({ field: fieldKey, actual, expected: expected[fieldKey] });
    }
    if (diffs.length === 0) {
      console.log('  ' + green('✓') + ' ' + bold(label) + dim(' [idx=' + idx + ' actual="' + (policy.productName || policy.policyName) + '"]'));
    } else {
      console.log('  ' + red('✗') + ' ' + bold(label) + dim(' [idx=' + idx + ' actual="' + (policy.productName || policy.policyName) + '"]'));
      for (const d of diffs) {
        const a = d.actual == null ? '(null)' : (Array.isArray(d.actual) ? '[' + d.actual.join(', ') + ']' : JSON.stringify(d.actual));
        const e = d.expected == null ? '(null)' : (Array.isArray(d.expected) ? '[' + d.expected.join(', ') + ']' : JSON.stringify(d.expected));
        console.log('      ' + dim(d.field.padEnd(14)) + red('actual=') + a + dim('  ') + yellow('expected=') + e);
      }
    }
  }
  // Unexpected extractions — anything not matched to a truth row
  let extraCount = 0;
  for (const [i, ex] of sheetExtracted.policies.entries()) {
    if (matchedIndices.has(i)) continue;
    console.log('  ' + yellow('?') + ' EXTRA extracted: ' + (ex.productName || ex.policyName) + dim(' [idx=' + i + ', section=' + ex._section + ']'));
    extraCount++;
  }
  summary.push({ sheet: sheetName, checks: sheetChecks, matches: sheetMatches, missing: sheetMissing, extra: extraCount });
  console.log('');
}

console.log(bold('SUMMARY'));
for (const s of summary) {
  const pct = s.checks ? Math.round(100 * s.matches / s.checks) : 0;
  const colour = pct === 100 && s.missing === 0 ? green : (pct >= 80 && s.missing === 0 ? yellow : red);
  console.log('  ' + colour(s.sheet.padEnd(34)) + dim(' ') + s.matches + '/' + s.checks + ' fields (' + pct + '%)' + (s.missing ? red('  ' + s.missing + ' MISSING policies') : '') + (s.extra ? yellow('  ' + s.extra + ' extras') : ''));
}
const totalPct = totalChecks ? Math.round(100 * totalMatches / totalChecks) : 0;
console.log('');
console.log(bold('  TOTAL: ' + totalMatches + '/' + totalChecks + ' fields (' + totalPct + '%), ' + totalMissingPolicies + ' missing policies'));

process.exit(totalMissingPolicies > 0 || totalMatches < totalChecks ? 1 : 0);
