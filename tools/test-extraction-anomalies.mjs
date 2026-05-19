// PolicyLens extraction anomaly detector.
//
// Goes beyond the structural smoke test (≥60% insurer / ≥80% productName / etc.)
// and inspects EVERY policy for specific classes of bug:
//
//   AA1  Missing/Unknown insurer on a non-cash policy
//   AA2  Zero/missing premium on an active non-Single-Premium policy
//   AA3  Zero sum assured on protection/savings policy
//   AA4  Maturity date before inception date
//   AA5  Inception year out of plausible range (1990..2030)
//   AA6  Suspicious duplicates: same insurer + same product + same premium on same sheet
//   AA7  Empty productName / "(?)" / shorter than 4 chars
//   AA8  Riders list contains "(unnamed)" entries
//   AA9  Policy number missing on a non-cash, in-force policy
//   AA10 Multi-line lifeInsured (e.g. "Self\nDD Owner") — should be normalised
//   AA11 lifeInsured equals literal "Self" but no profile sync happened (production-only)
//   AA12 Premium > $1M (sanity)
//   AA13 Date in unparsed format (e.g. "Dec 2024" not converted to ISO)
//
// USAGE
//   node tools/test-extraction-anomalies.mjs                   # all workbooks
//   node tools/test-extraction-anomalies.mjs <path1> <path2>   # specific
//
// EXIT CODES
//   0 — no anomalies (or fixtures missing)
//   1 — anomalies found (review)
//   2 — setup error

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { extractAllSheets, pipelineVersion } from './lib/extract-xlsx.mjs';

const isTTY = process.stdout.isTTY;
const c = (s, code) => isTTY ? '\x1b[' + code + 'm' + s + '\x1b[0m' : s;
const red = s => c(s, '31');
const yellow = s => c(s, '33');
const green = s => c(s, '32');
const dim = s => c(s, '90');
const bold = s => c(s, '1');

function discoverWorkbooks() {
  const downloadsDir = path.join(os.homedir(), 'Downloads');
  if (!fs.existsSync(downloadsDir)) return [];
  const pat = /policy\s*summary.*\.xlsx$|policy summary report.*\.xlsx$/i;
  return fs.readdirSync(downloadsDir)
    .filter(f => pat.test(f) && !f.startsWith('~$'))
    .map(f => path.join(downloadsDir, f));
}

// ─── Helpers ───
function parseDate(s) {
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
}
function moneyNum(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

// ─── Anomaly checks ───
function checkPolicy(p, allOnSheet) {
  const anoms = [];
  const isCash = p.category === 'cash_investments' || p.kind === 'fd';
  const isSinglePrem = p.premSingle === true || p.premFrequency === 'single' || p.premiumStructure === 'Single Premium';
  const status = String(p.status || '').toLowerCase();
  const isInForce = !['matured', 'surrendered', 'lapsed'].includes(status);
  const name = String(p.productName || p.policyName || '').trim();
  const insurer = String(p.insurer || '').trim();

  // AA1: missing/unknown insurer (non-cash)
  if (!isCash && (!insurer || /^unknown$/i.test(insurer) || /^\?$/.test(insurer))) {
    anoms.push({ code: 'AA1', sev: 'high', msg: 'Missing/Unknown insurer' });
  }
  // AA2: zero premium on active non-single-prem policy
  const prem = moneyNum(p.premiumAmount ?? p.annualPremium);
  if (!isCash && isInForce && !isSinglePrem && prem === 0) {
    anoms.push({ code: 'AA2', sev: 'medium', msg: 'Zero/missing premium on in-force non-SP policy' });
  }
  // AA3: zero SA on protection/savings
  const sa = moneyNum(p.sumAssured);
  if (['protection', 'savings', 'maternity'].includes(p.category) && sa === 0) {
    anoms.push({ code: 'AA3', sev: 'low', msg: 'Zero sum assured on ' + p.category + ' policy' });
  }
  // AA4: maturity before inception
  const inc = parseDate(p.inceptionDate);
  const mat = parseDate(p.maturityDate);
  if (inc != null && mat != null && mat < inc) {
    anoms.push({ code: 'AA4', sev: 'high', msg: 'Maturity date BEFORE inception date' });
  }
  // AA5: inception out of range. 1980 lower bound covers DPS (1989) + legacy AIA
  // products from the late 1980s that are still in-force.
  if (inc != null) {
    const yr = new Date(inc).getFullYear();
    if (yr < 1980 || yr > 2031) {
      anoms.push({ code: 'AA5', sev: 'high', msg: 'Inception year ' + yr + ' out of range (1980-2031)' });
    }
  }
  // AA7: empty/short productName
  if (!name || name === '(?)' || name === '?' || name.length < 4) {
    anoms.push({ code: 'AA7', sev: 'high', msg: 'Empty/missing/too-short productName: "' + name + '"' });
  }
  // AA8: unnamed riders
  const riders = Array.isArray(p.riders) ? p.riders : [];
  for (const r of riders) {
    const rn = String(r.riderName || r.name || '').trim();
    if (!rn || rn === '(unnamed)' || /^unnamed/i.test(rn)) {
      anoms.push({ code: 'AA8', sev: 'low', msg: '(unnamed) rider in riders array' });
      break;
    }
  }
  // AA9: missing policy number on in-force non-cash
  if (!isCash && isInForce && !String(p.policyNumber || '').trim()) {
    anoms.push({ code: 'AA9', sev: 'low', msg: 'Missing policy number on in-force policy' });
  }
  // AA10: multi-line lifeInsured
  const li = String(p.lifeInsured || '');
  if (li.includes('\n') || li.includes('\r')) {
    anoms.push({ code: 'AA10', sev: 'medium', msg: 'Multi-line lifeInsured: ' + JSON.stringify(li) });
  }
  // AA12: premium > $1M (excluding Single Premium UL where this is legitimate HNW SP)
  const isUL = /Universal Life|Indexed UL|Variable UL|IUL|VUL/.test(String(p.subType || ''));
  const isSP = isSinglePrem || isUL;  // SP UL premiums of $500K-$5M are normal
  if (prem > 1_000_000 && !isSP) {
    anoms.push({ code: 'AA12', sev: 'high', msg: 'Premium > $1M (likely SA/premium confusion): $' + prem.toLocaleString() });
  }
  // AA13: unparsed date format
  for (const f of ['inceptionDate', 'maturityDate']) {
    const v = p[f];
    if (!v) continue;
    if (/^[A-Za-z]+\s+\d{4}$/.test(v) || /^\d{4}-\d{2}-\d{2}/.test(v)) {
      // "Dec 2024" or "2024-12-15" — first is unparsed
      if (/^[A-Za-z]+\s+\d{4}$/.test(v)) {
        anoms.push({ code: 'AA13', sev: 'low', msg: 'Unparsed ' + f + ' format: "' + v + '"' });
      }
    } else if (typeof v === 'string' && v.length > 0) {
      // Other ambiguous formats (e.g. "1 Jun 2006")
      const dt = new Date(v);
      if (!Number.isFinite(dt.getTime())) {
        anoms.push({ code: 'AA13', sev: 'medium', msg: 'Could not parse ' + f + ': "' + v + '"' });
      }
    }
  }

  // AA6: duplicates within same sheet — same insurer + same name + similar premium
  const sameSheetDups = (allOnSheet || []).filter(o => {
    if (o === p) return false;
    if (o.insurer !== p.insurer) return false;
    if (String(o.productName || '').trim().toLowerCase() !== name.toLowerCase()) return false;
    const op = moneyNum(o.premiumAmount ?? o.annualPremium);
    if (op === 0 && prem === 0) return true;
    if (op > 0 && prem > 0 && Math.abs(op - prem) < 0.01) return true;
    return false;
  });
  if (sameSheetDups.length > 0) {
    anoms.push({ code: 'AA6', sev: 'medium', msg: 'Possible duplicate of another policy on same sheet (same insurer + name + premium)' });
  }

  return anoms;
}

// ─── Main ───
const args = process.argv.slice(2);
const wbs = args.length > 0 ? args : discoverWorkbooks();
if (wbs.length === 0) {
  console.log(dim('extraction-anomalies: no workbooks found in ~/Downloads — skipping'));
  process.exit(0);
}

console.log(dim('PolicyLens extraction anomaly detector'));
console.log(dim('======================================='));
console.log(dim('pipeline: ' + pipelineVersion));
console.log(dim('workbooks: ' + wbs.length));
console.log('');

let totalAnoms = 0;
const sevCounts = { high: 0, medium: 0, low: 0 };
const codeCounts = {};

for (const wb of wbs) {
  console.log(bold(path.basename(wb)));
  let extraction;
  try { extraction = extractAllSheets(wb); }
  catch (err) {
    console.log(red('  ✗ extraction threw: ' + err.message));
    totalAnoms++;
    continue;
  }
  for (const [sheetName, sheetData] of Object.entries(extraction)) {
    const policies = sheetData.policies || [];
    if (policies.length === 0) continue;
    let sheetHeaderPrinted = false;
    for (const p of policies) {
      const anoms = checkPolicy(p, policies);
      if (anoms.length === 0) continue;
      if (!sheetHeaderPrinted) {
        console.log(dim('  ' + sheetName + ':'));
        sheetHeaderPrinted = true;
      }
      const nameDisplay = (p.productName || p.policyName || '(?)').slice(0, 60);
      console.log('    ' + nameDisplay.padEnd(60) + ' (' + (p.policyNumber || 'no#') + ')');
      for (const a of anoms) {
        const sevColor = a.sev === 'high' ? red : (a.sev === 'medium' ? yellow : dim);
        console.log('      ' + sevColor(a.code + ' [' + a.sev + ']') + ' ' + a.msg);
        totalAnoms++;
        sevCounts[a.sev]++;
        codeCounts[a.code] = (codeCounts[a.code] || 0) + 1;
      }
    }
  }
  console.log('');
}

console.log(dim('═══ SUMMARY ═══'));
console.log('Total anomalies: ' + totalAnoms);
console.log('  ' + red('high  ') + ': ' + sevCounts.high);
console.log('  ' + yellow('medium') + ': ' + sevCounts.medium);
console.log('  ' + dim('low   ') + ': ' + sevCounts.low);
console.log('\nBy code:');
for (const [code, n] of Object.entries(codeCounts).sort((a, b) => b[1] - a[1])) {
  console.log('  ' + String(n).padStart(4) + '  ' + code);
}

process.exit(totalAnoms === 0 ? 0 : 1);
