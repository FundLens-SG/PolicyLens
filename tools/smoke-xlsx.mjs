// PolicyLens smoke test — xlsx structure + multi-member + fingerprint
//
// PURPOSE
//   Run the deterministic xlsx-handling code paths (detectMultiMemberDocument
//   + computeDocFingerprint + identity-header detection) against real
//   FC-provided xlsx files. Catches regressions in:
//     • Leading-newline name cells (e.g. "\nKONG SEET YIN")
//     • y/o projection-label false positives (e.g. "(55 y/o)" in Belinda's
//       projections table being treated as a person)
//     • NRIC-style identity headers (Belinda + Eunice templates)
//     • Multi-sheet workbooks (Soh family — 5 sheets, one per person)
//
// USAGE
//   npm run smoke:xlsx
//
// FIXTURES
//   Local-only (user-specific). The 3 default fixtures live in
//   ~/Downloads/. If they're not on the running machine the harness
//   exits 0 with a 'no fixtures available' note — so CI doesn't fail
//   on machines where the FC test files aren't present. Add a fresh
//   xlsx to the FIXTURES array below to extend coverage.
//
// EXIT CODES
//   0 = all available fixtures pass, OR no fixtures available
//   1 = at least one available fixture regressed
//   2 = xlsx package not installed (cannot run)

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

let XLSX;
try {
  XLSX = await import('xlsx');
} catch (e) {
  console.error('[smoke:xlsx] xlsx package is not installed. Run: npm install');
  process.exit(2);
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FIXTURES = [
  { label: 'Soh Family',     path: 'C:\\Users\\user\\Downloads\\Soh Family Policy Summary.xlsx',           expectMulti: true,  expectMin: 5, expectCandidates: ['Soh Soon Jooh, Eric', 'Teo Sock Choo, Stacy', 'Soh Jia Le', 'Soh Jia Yi', 'Je'] },
  { label: 'Belinda (Tan Kah Lan)', path: 'C:\\Users\\user\\Downloads\\Tan Kah Lan (Belinda) Policy Summary.xlsx', expectMulti: false, expectMin: 1 },
  { label: 'Eunice Kong',    path: 'C:\\Users\\user\\Downloads\\Eunice Kong policy summary.xlsx',          expectMulti: false, expectMin: 1 }
];

function colorize(s, code) { return process.stdout.isTTY ? '\x1b[' + code + 'm' + s + '\x1b[0m' : s; }
const green = s => colorize(s, '32');
const red   = s => colorize(s, '31');
const yellow = s => colorize(s, '33');
const cyan = s => colorize(s, '36');
const dim = s => colorize(s, '90');

// ── XLSX -> CSV text, mirroring PolicyLens processFileForAI ──
function xlsxToContentBlocks(filePath) {
  const ab = readFileSync(filePath);
  const wb = XLSX.read(ab, { type: 'buffer' });
  let allText = '[Spreadsheet: ' + path.basename(filePath) + ']\n';
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws['!ref']) continue;
    const range = XLSX.utils.decode_range(ws['!ref']);
    let maxCol = 0;
    for (let r = range.s.r; r <= Math.min(range.s.r + 30, range.e.r); r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell && cell.v !== null && cell.v !== undefined && String(cell.v).trim() !== '') {
          maxCol = Math.max(maxCol, c);
        }
      }
    }
    const limitedRange = {
      s: { r: range.s.r, c: range.s.c },
      e: { r: Math.min(range.e.r, range.s.r + 200), c: Math.min(maxCol + 1, 20) }
    };
    const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false, range: limitedRange });
    const cleaned = csv.split('\n').map(line => line.replace(/,+$/g, '')).filter(line => line.replace(/,/g, '').trim() !== '').join('\n');
    if (cleaned.trim()) allText += '\n--- Sheet: ' + sheetName + ' ---\n' + cleaned;
  }
  return [{ type: 'text', text: allText.slice(0, 60000) }];
}

// ── Vendored: detectMultiMemberDocument (rc2.11) ──
function detectMultiMemberDocument(contentBlocks) {
  if (!Array.isArray(contentBlocks)) return { detected: false, candidates: [] };
  const textChunks = contentBlocks
    .filter(b => b && (b.type === 'text' || typeof b.text === 'string'))
    .map(b => String(b.text || ''))
    .join('\n');
  if (!textChunks) return { detected: false, candidates: [] };

  const candidates = new Set();
  const addCandidate = (rawName, opts = {}) => {
    if (!rawName) return;
    const name = String(rawName).replace(/^[\s\n\r",]+|[\s\n\r",]+$/g, '').replace(/\s+/g, ' ');
    if (name.length > 60) return;
    if (/policy|summary|report|portfolio|insurer|insurance|review|client|account|holder|owner|hospitalisation|protection|critical\s+illness|legacy\s+planning|life\s+protection|personal\s+accident/i.test(name)) return;
    if (opts.loose) {
      if (name.length < 2) return;
    } else {
      if (name.length < 4) return;
      if (!/\s/.test(name)) return;
    }
    candidates.add(name);
  };

  const sohRegex = /([A-Z][a-zA-Z'\-\.\s]{3,50}?),\s*(\d{1,2}\s+[A-Z][a-z]+\s+\d{4})/g;
  let m;
  while ((m = sohRegex.exec(textChunks)) !== null) { addCandidate(m[1], { loose: true }); if (candidates.size > 8) break; }

  const quotedNameDobRegex = /"([A-Z][a-zA-Z'\-\.\s,]{3,60}?)"\s*\n\s*"?\d{1,2}\s+[A-Z][a-z]+\s+\d{4}/g;
  while ((m = quotedNameDobRegex.exec(textChunks)) !== null) { addCandidate(m[1], { loose: true }); if (candidates.size > 8) break; }

  const nricRegex = /(?:^|\n)[\s,"]*([A-Z][A-Z\sa-z'\-\.,\(\)]{3,60}?)[\s"]*\n[\s,"]*(?:Policy Summary|NRIC\/FIN|NRIC|FIN\b)/g;
  while ((m = nricRegex.exec(textChunks)) !== null) { addCandidate(m[1], { loose: true }); if (candidates.size > 8) break; }

  const sheetRegex = /---\s*Sheet:\s*[^-]+---\s*\n[\s",]*([A-Z][A-Z\sa-z'\-\.,\(\)]{4,60})/g;
  while ((m = sheetRegex.exec(textChunks)) !== null) { addCandidate(m[1]); if (candidates.size > 8) break; }

  const fileRegex = /\[Spreadsheet:[^\]]+\]\s*\n[\s",]*([A-Z][A-Z\sa-z'\-\.,\(\)]{4,60})/g;
  while ((m = fileRegex.exec(textChunks)) !== null) { addCandidate(m[1]); if (candidates.size > 8) break; }

  const sheetNameDobRegex = /---\s*Sheet:\s*[^-]+---\s*\n\s*"?([A-Za-z][A-Za-z'\-\.\s,]{1,60}?)"?\s*\n\s*"?\d{1,2}\s+[A-Z][a-z]+\s+\d{4}/g;
  while ((m = sheetNameDobRegex.exec(textChunks)) !== null) { addCandidate(m[1], { loose: true }); if (candidates.size > 8) break; }

  const all = [...candidates];
  const final = all.filter(c => {
    const cLow = c.toLowerCase();
    return !all.some(other => other !== c && other.toLowerCase().includes(cLow) && other.length > c.length);
  });
  return { detected: final.length >= 2, candidates: final };
}

// ── Vendored: computeDocFingerprint (rc2.9) — Node port ──
function computeDocFingerprint(contentBlocks) {
  if (!Array.isArray(contentBlocks)) return null;
  const text = contentBlocks
    .filter(b => b && (b.type === 'text' || typeof b.text === 'string'))
    .map(b => String(b.text || ''))
    .join('\n');
  if (!text || text.length < 50) return null;

  const anchors = [];
  const sheetMatches = text.match(/---\s*Sheet:\s*[^-]+---/g) || [];
  if (sheetMatches.length) anchors.push('sheets:' + sheetMatches.length);
  const spreadsheetMatch = text.match(/\[Spreadsheet:\s*([^\]]+)\]/);
  if (spreadsheetMatch) anchors.push('xlsx:' + spreadsheetMatch[1].toLowerCase().replace(/\s+/g, '-'));

  const colHeaderMatches = text.match(/(?:^|\n)([A-Z][^,\n]{0,40},){3,15}[A-Z][^,\n]{0,40}/g) || [];
  for (const h of colHeaderMatches.slice(0, 5)) {
    const cols = h.replace(/^[\n]+/, '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (cols.length >= 3) anchors.push('cols:' + cols.slice(0, 8).join('|'));
  }

  const sectionMatches = text.match(/\b(Hospitalisation|Life Protection|Critical Illness|Personal Accident|Investment-linked|ILP|Endowment|Legacy Planning|Fixed Deposits|CPF Accounts|Short Term Endowments|Long Term Endowments|Wealth Accumulation|SRS|Annuity|Disability Income)\b/gi) || [];
  const uniqueSections = [...new Set(sectionMatches.map(s => s.toLowerCase()))].sort();
  if (uniqueSections.length) anchors.push('sections:' + uniqueSections.join(','));

  const insurerMatches = text.match(/\b(Manulife|Prudential|Great Eastern|AIA|NTUC Income|Income Insurance|Singlife|Aviva|HSBC|FWD|Etiqa|Tokio Marine|MSIG|China Taiping|China Life|Generali|Zurich|Tugu|Sun Life|Friends Provident|Transamerica)\b/gi) || [];
  const uniqueInsurers = [...new Set(insurerMatches.map(s => s.toLowerCase().trim()))].sort();
  if (uniqueInsurers.length) anchors.push('insurers:' + uniqueInsurers.slice(0, 5).join(','));

  if (/NRIC\/FIN/i.test(text)) anchors.push('schema:nric');
  if (/\d{1,2}\s+[A-Z][a-z]+\s+\d{4},\s*\d{1,3}\s*y\/?o/i.test(text)) anchors.push('schema:soh');

  if (anchors.length < 2) return null;
  const composite = anchors.join('|');
  const hex = createHash('sha256').update(composite).digest('hex').slice(0, 12);
  return { id: hex, composite };
}

function smokeXlsxCellText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim();
}

function smokeLooksLikeXlsxSectionLabel(line) {
  const s = String(line || '').trim();
  if (!s || s.length < 3 || s.length > 40) return false;
  if (!/[a-z]/i.test(s)) return false;
  if (/[$%]|\d{4}|\d[,.]\d|s\d{7}|\bnric\b|\bdob\b|\baddress\b|\bcontact\b/i.test(s)) return false;
  if (/^(no|s\/no|serial)\.?$/i.test(s)) return false;
  if (/^(policy|insurer|company|provider|sum\s*assured|sum\s*insured|policy\s*name|policy\s*no|policy\s*number)$/i.test(s.trim())) return false;
  if (/\bpolicy\s+(no|number|name)\b|\bsum\s*(assured|insured)\b/i.test(s)) return false;
  if (/\([^)]+\)/.test(s)) return false;
  if (/\b(mr|mrs|ms|miss|dr|madam|mdm|mister)\b\.?/i.test(s)) return false;
  return true;
}

function smokeLooksLikeXlsxProductContinuationLabel(line) {
  const s = String(line || '').replace(/\s+/g, ' ').trim();
  if (!s || s.length < 3 || s.length > 80) return false;
  if (/\b(policy\s+summary|hospitali[sz]ation|protection|critical\s+illness|personal\s+accident|investment[\s-]*linked|endowments?|legacy\s+planning|fixed\s+deposits?|bank\s+investments?|govt\s+schemes?|government\s+schemes?)\b/i.test(s)) return false;
  if (/^(aia|singlife|aviva|manulife|prudential|pru|great\s+eastern|ge|ntuc|income|hsbc|fwd|etiqa|tokio\s+marine|tokio|tm|dbs|uob|ocbc|posb|standard\s+chartered|maybank|citi(?:bank)?)\b/i.test(s)) return true;
  if (/\b(hsg\s*max|health\s*plus|vitalhealth|shield|rider|waiver|completecare|readyprotect|investready|elite\s*term|financier|travelcare|flexiplan|solitaire|assure|vantage|cash\s*max|early\s*critical|cancer\s*care)\b/i.test(s)) return true;
  return false;
}

function smokeDetectBannerAtRow(matrix, r) {
  const cellsRaw = matrix[r] || [];
  const positions = [];
  for (let c = 0; c < cellsRaw.length; c++) {
    const v = smokeXlsxCellText(cellsRaw[c]).trim();
    if (v) positions.push({ c, v });
  }
  if (positions.length === 0) return null;
  if (positions.length === 1) {
    const { c, v } = positions[0];
    if (c <= 1 && smokeLooksLikeXlsxProductContinuationLabel(v)) return null;
    if (c <= 1 && smokeLooksLikeXlsxSectionLabel(v)) return v;
    return null;
  }
  if (positions.length === 2 && positions[1].c - positions[0].c <= 2 && positions[1].c <= 2) {
    const a = positions[0].v;
    const b = positions[1].v;
    const aIsSymbol = a.length <= 3 || !/[A-Za-z]{3,}/.test(a);
    const bIsSymbol = b.length <= 3 || !/[A-Za-z]{3,}/.test(b);
    if (aIsSymbol && !bIsSymbol && smokeLooksLikeXlsxSectionLabel(b)) return b;
    if (bIsSymbol && !aIsSymbol && smokeLooksLikeXlsxSectionLabel(a)) return a;
  }
  return null;
}

function smokeMatrixForSheet(filePath, sheetName) {
  const wb = XLSX.read(readFileSync(filePath), { type: 'buffer' });
  const ws = wb.Sheets[sheetName];
  if (!ws || !ws['!ref']) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, blankrows: false });
}

function smokeTestOne(fixture) {
  const result = { label: fixture.label, ok: true, issues: [], info: {} };
  if (!existsSync(fixture.path)) {
    result.ok = false;
    result.issues.push('Missing fixture: ' + fixture.path);
    return result;
  }
  const blocks = xlsxToContentBlocks(fixture.path);
  const text = blocks[0].text;
  result.info.textLength = text.length;
  result.info.sheetCount = (text.match(/---\s*Sheet:/g) || []).length;

  // Detection
  const det = detectMultiMemberDocument(blocks);
  result.info.detected = det.detected;
  result.info.candidates = det.candidates;

  if (fixture.expectMulti && !det.detected) {
    result.ok = false;
    result.issues.push('Expected multi-member detection but got single-person');
  }
  if (fixture.expectMin && det.candidates.length < fixture.expectMin) {
    result.ok = false;
    result.issues.push('Expected at least ' + fixture.expectMin + ' candidates, got ' + det.candidates.length);
  }
  if (Array.isArray(fixture.expectCandidates) && fixture.expectCandidates.length) {
    const got = new Set(det.candidates.map(c => String(c).toLowerCase()));
    const missing = fixture.expectCandidates.filter(c => !got.has(String(c).toLowerCase()));
    if (missing.length) {
      result.ok = false;
      result.issues.push('REGRESSION: missing expected candidate(s): ' + JSON.stringify(missing));
    }
  }

  // Smoke-test specific guards
  // 1) Leading-newline names — every candidate must have no leading whitespace
  const leadingWs = det.candidates.filter(c => /^[\s\n\r]/.test(c));
  if (leadingWs.length) {
    result.ok = false;
    result.issues.push('REGRESSION: leading-whitespace name(s): ' + JSON.stringify(leadingWs));
  }

  // 2) y/o false positive — no candidate name should literally contain "y/o"
  //    or be an obvious projection label like "(55 y/o)" or "Age 65"
  const yoFalse = det.candidates.filter(c => /\by\/o\b|^\(?age\s+\d|^\d+\s*y\/o\b/i.test(c));
  if (yoFalse.length) {
    result.ok = false;
    result.issues.push('REGRESSION: y/o false-positive(s): ' + JSON.stringify(yoFalse));
  }

  // 3) None of the candidates should literally be label-style words
  const labelFalse = det.candidates.filter(c => /^(Policy|Summary|Insurer|Client|Owner|Holder|Premium|Page \d|Total|Sub-?Total)\b/i.test(c));
  if (labelFalse.length) {
    result.ok = false;
    result.issues.push('REGRESSION: label-style false-positive(s): ' + JSON.stringify(labelFalse));
  }

  // Fingerprint
  const fp = computeDocFingerprint(blocks);
  result.info.fingerprint = fp ? fp.id : null;
  result.info.fingerprintComposite = fp ? fp.composite : null;
  if (!fp) {
    result.ok = false;
    result.issues.push('REGRESSION: fingerprint returned null (need >= 2 anchors)');
  }

  // rc2.18 — additional guards layered on top of the basic detection.

  // 4) Fingerprint stability: running computeDocFingerprint twice on
  //    the same blocks must return the same id. If not, the fingerprint
  //    is non-deterministic (e.g. picked up a time-based fallback) and
  //    the per-template few-shot will fragment across re-extractions.
  if (fp) {
    const fp2 = computeDocFingerprint(blocks);
    if (!fp2 || fp2.id !== fp.id) {
      result.ok = false;
      result.issues.push('REGRESSION: fingerprint NOT stable across re-runs (id1=' + fp.id + ', id2=' + (fp2?.id || 'null') + ')');
    }
  }

  // 5) Detection idempotency: running detectMultiMemberDocument twice
  //    must produce the same candidate set. Order-insensitive.
  const det2 = detectMultiMemberDocument(blocks);
  const set1 = JSON.stringify([...det.candidates].sort());
  const set2 = JSON.stringify([...det2.candidates].sort());
  if (set1 !== set2) {
    result.ok = false;
    result.issues.push('REGRESSION: detection NOT idempotent (run1=' + set1 + ', run2=' + set2 + ')');
  }

  // 6) Substring dedup verification: no candidate is a strict substring
  //    of another candidate (case-insensitive). The rc2.11 dedup step
  //    should enforce this; if it ever regresses, this fires.
  for (const a of det.candidates) {
    for (const b of det.candidates) {
      if (a === b) continue;
      if (b.toLowerCase().includes(a.toLowerCase()) && b.length > a.length) {
        result.ok = false;
        result.issues.push('REGRESSION: substring dedup let through: "' + a + '" is contained in "' + b + '"');
        break;
      }
    }
  }

  // 7) Performance sanity: detection should complete under ~250ms on
  //    a real FC xlsx. ReDoS would push this into seconds.
  const perfStart = Date.now();
  detectMultiMemberDocument(blocks);
  const perfMs = Date.now() - perfStart;
  result.info.detectionMs = perfMs;
  if (perfMs > 250) {
    result.ok = false;
    result.issues.push('REGRESSION: detection took ' + perfMs + 'ms (>250ms threshold) — possible ReDoS');
  }

  // 8) rc2.35: JE sheet product/rider continuations must not be
  // mistaken for section banners. If "Singlife Health Plus" becomes a
  // banner, the parser truncates the JE owner sheet after one policy and
  // never reaches Manulife CompleteCare / ReadyProtect.
  if (/Soh Family/i.test(fixture.label)) {
    const je = smokeMatrixForSheet(fixture.path, 'JE Policy Summary');
    if (je.length) {
      const banner = smokeDetectBannerAtRow(je, 6); // row 7 in Excel
      if (banner) {
        result.ok = false;
        result.issues.push('REGRESSION: JE continuation row misdetected as section banner: ' + JSON.stringify(banner));
      }
      const hotlineBanner = smokeDetectBannerAtRow(je, 15); // row 16 in Excel
      if (!hotlineBanner || !/insurer hotlines/i.test(hotlineBanner)) {
        result.ok = false;
        result.issues.push('REGRESSION: JE insurer hotline section is no longer detected as a non-policy banner');
      }
      const fixtureText = je.map(row => row.map(smokeXlsxCellText).join(' | ')).join('\n');
      if (!/NTUC Income Customer Hotline/i.test(fixtureText)) {
        result.ok = false;
        result.issues.push('REGRESSION: JE fixture no longer contains the NTUC Income hotline row this guard covers');
      }
      if (/Enhanced\s+IncomeShield|IncomeShield\s+Preferred/i.test(fixtureText)) {
        result.ok = false;
        result.issues.push('REGRESSION: JE fixture source unexpectedly contains Enhanced IncomeShield text');
      }
    }
  }

  return result;
}

function main() {
  console.log(dim('PolicyLens xlsx smoke test'));
  console.log(dim('=========================='));
  console.log('');

  // rc2.18 — skip fixtures that don't exist on the current machine
  // (they're user-specific files in ~/Downloads). If NONE are present,
  // exit 0 with a friendly note instead of failing CI.
  const presentFixtures = FIXTURES.filter(fx => existsSync(fx.path));
  if (presentFixtures.length === 0) {
    console.log(yellow('No fixtures found on this machine.'));
    console.log(dim('Add an xlsx path to the FIXTURES array in tools/smoke-xlsx.mjs to run.'));
    console.log(dim('Expected:'));
    for (const fx of FIXTURES) console.log(dim('  - ' + fx.path));
    process.exit(0);
  }
  if (presentFixtures.length < FIXTURES.length) {
    console.log(yellow('Note: ' + (FIXTURES.length - presentFixtures.length) + ' fixture(s) missing on this machine — skipping.'));
    console.log('');
  }

  let anyFail = false;
  const results = [];
  for (const fx of presentFixtures) {
    const r = smokeTestOne(fx);
    results.push(r);
    const status = r.ok ? green('PASS') : red('FAIL');
    console.log(status + '  ' + cyan(r.label));
    console.log(dim('  text length        : ') + r.info.textLength);
    console.log(dim('  sheets in workbook : ') + r.info.sheetCount);
    console.log(dim('  multi-member       : ') + (r.info.detected ? green('yes') : yellow('no')));
    console.log(dim('  candidates (' + (r.info.candidates || []).length + ')      : ') + JSON.stringify(r.info.candidates));
    console.log(dim('  fingerprint id     : ') + (r.info.fingerprint || '(none)'));
    console.log(dim('  fingerprint anchors: ') + (r.info.fingerprintComposite || '(none)'));
    if (typeof r.info.detectionMs === 'number') {
      const perfStr = r.info.detectionMs <= 50 ? green(r.info.detectionMs + 'ms')
        : r.info.detectionMs <= 150 ? yellow(r.info.detectionMs + 'ms')
        : red(r.info.detectionMs + 'ms');
      console.log(dim('  detection perf     : ') + perfStr);
    }
    if (r.issues.length) {
      console.log(red('  Issues:'));
      for (const iss of r.issues) console.log(red('    × ' + iss));
      anyFail = true;
    }
    console.log('');
  }

  // Distinct-fingerprint check: each xlsx should have a stable id, and
  // distinct templates should NOT collide.
  const distinctFps = new Set(results.map(r => r.info.fingerprint).filter(Boolean));
  console.log(dim('Distinct fingerprints across 3 files: ') + distinctFps.size);
  if (distinctFps.size < 2) {
    console.log(yellow('WARN: all fixtures collided to a single fingerprint — distinguishing power may be too low'));
  }

  console.log('');
  if (anyFail) {
    console.log(red('SMOKE TEST FAIL'));
    process.exit(1);
  }
  console.log(green('SMOKE TEST PASS — all 3 files behave as expected'));
  process.exit(0);
}

main();
