// Apply approved auto-resolved overrides into the canonical catalogue.
//
// USAGE
//   node tools/apply-overrides.mjs <auto-resolved.json> [<approved-review.json>]
//
// For each override, finds the existing entry by (insurer, productName) in:
//   1. SEED_REPOSITORY in src/index.babel.html (rich entries) — edited in place
//   2. PRODUCTS array in singapore-product-knowledge.js — edited in place
//
// Reports what was applied vs missed.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SG_FILE = path.join(ROOT, 'singapore-product-knowledge.js');
const INDEX_BABEL = path.join(ROOT, 'src/index.babel.html');

const inputs = process.argv.slice(2);
if (inputs.length === 0) { console.error('Usage: node tools/apply-overrides.mjs <auto-resolved.json> [<approved-review.json>]'); process.exit(2); }

const compact = v => String(v||'').toLowerCase().replace(/[^a-z0-9]+/g, '');

const INSURER_NORMALIZE = {
  'aia singapore': 'AIA', 'great eastern life': 'Great Eastern', 'great eastern life assurance': 'Great Eastern',
  'prudential singapore': 'Prudential', 'manulife singapore': 'Manulife', 'income insurance': 'NTUC Income',
  'singapore life': 'Singlife', 'aviva': 'Singlife', 'hsbc life singapore': 'HSBC Life',
  'tokio marine life singapore': 'Tokio Marine', 'china life singapore': 'China Life', 'china taiping singapore': 'China Taiping',
  'raffles health insurance': 'Raffles Health Insurance', 'fwd singapore': 'FWD',
};
function normIns(s) {
  if (!s) return '';
  const t = String(s).trim();
  return INSURER_NORMALIZE[t.toLowerCase()] || t;
}

// ─── Load overrides ──────────────────────────────────────────────────
const overrides = [];
for (const inputPath of inputs) {
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  for (const item of data) {
    // The default `decision` placeholder is "pending — ai_wins | keep_existing | manual"
    // and DOES contain "keep_existing" as substring — that's why we match exact words only.
    const decision = String(item.decision || '').toLowerCase().trim();
    if (/^(reject|keep_existing|skip)$/.test(decision)) continue;
    if (decision.startsWith('rejected')) continue;
    overrides.push(item);
  }
}
console.log(`Loaded ${overrides.length} overrides from ${inputs.length} file(s)`);

// ─── Load target files ───────────────────────────────────────────────
let html = fs.readFileSync(INDEX_BABEL, 'utf8');
let sgJs = fs.readFileSync(SG_FILE, 'utf8');
const htmlOriginal = html;
const sgOriginal = sgJs;

const seedStart = html.indexOf('const SEED_REPOSITORY = [');
const seedEnd = html.indexOf('\n];', seedStart);
if (seedStart < 0 || seedEnd < 0) { console.error('SEED_REPOSITORY block not found'); process.exit(2); }

// ─── Build per-entry locators ────────────────────────────────────────
// Each SEED entry is a single-line object literal. Find by insurer+productName.
function findSeedEntry(insurer, productName) {
  const ins = normIns(insurer);
  const targetC = compact(productName);
  if (!targetC) return null;
  const insC = compact(ins);
  const re = new RegExp(`\\{id:'[^']+',insurer:'([^']+)',productName:'([^']*)'[^}]*\\}`, 'g');
  let m, fallback = null;
  const seedBlock = html.slice(seedStart, seedEnd);
  while ((m = re.exec(seedBlock)) !== null) {
    if (normIns(m[1]) !== ins) continue;
    const eC = compact(m[2]);
    if (eC === targetC) return { fullMatch: m[0], offset: seedStart + m.index, length: m[0].length, matchType: 'exact' };
    // rc2.56: same stricter fuzzy as findCorpusEntry — skip insurer-name placeholder, cap
    //   the length diff at 30% of the longer side.
    if (eC.length < 6 || targetC.length < 6) continue;
    if (eC === insC || targetC === insC) continue;
    if (!(eC.includes(targetC) || targetC.includes(eC))) continue;
    const maxLen = Math.max(eC.length, targetC.length);
    if (Math.abs(eC.length - targetC.length) > maxLen * 0.30) continue;
    if (!fallback || Math.abs(eC.length - targetC.length) < Math.abs(compact(fallback.fullMatch.match(/productName:'([^']*)'/)[1]).length - targetC.length)) {
      fallback = { fullMatch: m[0], offset: seedStart + m.index, length: m[0].length, matchType: 'fuzzy' };
    }
  }
  return fallback;
}

function applySeedOverride(loc, override) {
  // Update the JS literal: replace category and subType fields within the matched literal.
  let lit = loc.fullMatch;
  for (const cf of override.conflicts) {
    const field = cf.field;
    const newVal = cf.proposedByAI ?? cf.nowIs;
    if (newVal == null) continue;
    const valEsc = String(newVal).replace(/'/g, "\\'");
    // Replace the field's value inside the literal.
    const fieldRe = new RegExp(`(,${field}:')([^']*)(')`);
    if (fieldRe.test(lit)) {
      lit = lit.replace(fieldRe, `$1${valEsc}$3`);
    } else {
      // Field not present (rare for SEED) — insert before the closing brace.
      lit = lit.replace(/}\s*$/, `,${field}:'${valEsc}'}`);
    }
  }
  html = html.slice(0, loc.offset) + lit + html.slice(loc.offset + loc.length);
}

// The 962-corpus PRODUCTS array uses tuple form: ["Insurer","Name","category","subType",[aliases],"source"]
// Find by insurer+name and rewrite category/subType slots.
//
// rc2.56: two-pass match. First exact-compact (case-insensitive, punctuation-stripped).
//   If that misses, fall back to substring match — either the incoming name CONTAINS the
//   existing or the existing CONTAINS the incoming. This catches the "AIA Early Critical
//   Cover Extra" (existing) vs "Early Critical Cover Extra" (incoming) class of mismatches
//   where the AI dropped or added an insurer-name prefix.
function findCorpusEntry(insurer, productName) {
  const ins = normIns(insurer);
  const targetC = compact(productName);
  if (!targetC) return null;
  const insC = compact(ins);
  const re = /\["([^"]+)","([^"]*)","([^"]*)","([^"]*)"(?=,\[)/g;
  // Pass 1: exact-compact match.
  let m, fallback = null;
  while ((m = re.exec(sgJs)) !== null) {
    if (normIns(m[1]) !== ins) continue;
    const eName = m[2];
    const eC = compact(eName);
    if (eC === targetC) {
      return { offset: m.index, length: m[0].length, insurer: m[1], name: eName, category: m[3], subType: m[4], matchType: 'exact' };
    }
    // rc2.56: stricter fuzzy match.
    //   • Both names ≥ 6 chars compacted
    //   • One must fully contain the other
    //   • Skip if either side is just the insurer name (avoids matching the generic
    //     insurer-as-product placeholder like ["Tokio Marine","Tokio Marine","protection","",[...]])
    //   • Length diff ≤ 30% of the longer side (catches "PRUShield" vs "PRUShield Plus"
    //     as too distant — different tiers)
    if (eC.length < 6 || targetC.length < 6) continue;
    if (eC === insC || targetC === insC) continue;
    if (!(eC.includes(targetC) || targetC.includes(eC))) continue;
    const maxLen = Math.max(eC.length, targetC.length);
    const diff = Math.abs(eC.length - targetC.length);
    if (diff > maxLen * 0.30) continue;
    if (!fallback || Math.abs(eC.length - targetC.length) < Math.abs(compact(fallback.name).length - targetC.length)) {
      fallback = { offset: m.index, length: m[0].length, insurer: m[1], name: eName, category: m[3], subType: m[4], matchType: 'fuzzy' };
    }
  }
  return fallback;
}

function applyCorpusOverride(loc, override) {
  let cat = loc.category, sub = loc.subType, ins = loc.insurer;
  for (const cf of override.conflicts) {
    const field = cf.field;
    const newVal = cf.proposedByAI ?? cf.nowIs;
    if (newVal == null) continue;
    if (field === 'category') cat = newVal;
    if (field === 'subType') sub = newVal;
    if (field === 'insurer') ins = newVal;
  }
  const esc = s => String(s || '').replace(/"/g, '\\"');
  const newPrefix = `["${esc(ins)}","${esc(loc.name)}","${esc(cat)}","${esc(sub)}"`;
  sgJs = sgJs.slice(0, loc.offset) + newPrefix + sgJs.slice(loc.offset + loc.length);
}

// rc2.56: if the AI prefixed the product name with the insurer's own name AND that
//   prefixed name doesn't match any corpus entry, strip the prefix and retry. Handles
//   "Tokio Marine Tokio Marine #goClassic" → "#goClassic" style mismatches where the
//   corpus stores the short form.
function stripInsurerPrefix(insurer, name) {
  const ins = normIns(insurer);
  if (!ins || !name) return name;
  const insL = ins.toLowerCase();
  const nL = name.toLowerCase();
  if (nL.startsWith(insL + ' ') && name.length > ins.length + 1) {
    return name.slice(ins.length + 1).trim();
  }
  return name;
}

// ─── Apply ──────────────────────────────────────────────────────────
let appliedSeed = 0, appliedCorpus = 0, missed = 0, fuzzyMatches = 0;
const missedList = [];
const fuzzyList = [];

for (const ov of overrides) {
  let seedLoc = findSeedEntry(ov.insurer, ov.product);
  if (!seedLoc) {
    const stripped = stripInsurerPrefix(ov.insurer, ov.product);
    if (stripped !== ov.product) seedLoc = findSeedEntry(ov.insurer, stripped);
  }
  if (seedLoc) {
    if (seedLoc.matchType === 'fuzzy') {
      const eName = seedLoc.fullMatch.match(/productName:'([^']*)'/)[1];
      fuzzyMatches++;
      fuzzyList.push(`SEED  | "${ov.product}" → "${eName}"`);
    }
    applySeedOverride(seedLoc, ov);
    appliedSeed++;
    continue;
  }
  let corpLoc = findCorpusEntry(ov.insurer, ov.product);
  if (!corpLoc) {
    const stripped = stripInsurerPrefix(ov.insurer, ov.product);
    if (stripped !== ov.product) corpLoc = findCorpusEntry(ov.insurer, stripped);
  }
  if (corpLoc) {
    if (corpLoc.matchType === 'fuzzy') {
      fuzzyMatches++;
      fuzzyList.push(`SG    | "${ov.product}" → "${corpLoc.name}"`);
    }
    applyCorpusOverride(corpLoc, ov);
    appliedCorpus++;
    continue;
  }
  missed++;
  missedList.push(`${ov.insurer} / ${ov.product}`);
}

// ─── Write back ────────────────────────────────────────────────────
if (html !== htmlOriginal) {
  fs.writeFileSync(INDEX_BABEL, html);
  console.log(`✓ Wrote ${appliedSeed} SEED override(s) to ${INDEX_BABEL}`);
}
if (sgJs !== sgOriginal) {
  fs.writeFileSync(SG_FILE, sgJs);
  console.log(`✓ Wrote ${appliedCorpus} SG-knowledge override(s) to ${SG_FILE}`);
}

console.log('\nSummary:');
console.log(`  Total overrides:  ${overrides.length}`);
console.log(`  Applied to SEED:  ${appliedSeed}`);
console.log(`  Applied to SG:    ${appliedCorpus}`);
console.log(`  Fuzzy matches:    ${fuzzyMatches}`);
console.log(`  Missed:           ${missed}`);
if (fuzzyMatches > 0) {
  console.log('\nFuzzy matches (review for false positives):');
  for (const f of fuzzyList) console.log('  ' + f);
}
if (missed > 0) {
  console.log('\nMissed entries (no matching record in SEED or SG corpus):');
  for (const m of missedList.slice(0, 30)) console.log('  - ' + m);
  if (missedList.length > 30) console.log(`  ... and ${missedList.length - 30} more`);
}
