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
  const re = new RegExp(`\\{id:'[^']+',insurer:'([^']+)',productName:'([^']*)'[^}]*\\}`, 'g');
  let m;
  const seedBlock = html.slice(seedStart, seedEnd);
  while ((m = re.exec(seedBlock)) !== null) {
    const eIns = normIns(m[1]);
    if (eIns === ins && compact(m[2]) === compact(productName)) {
      return { fullMatch: m[0], offset: seedStart + m.index, length: m[0].length };
    }
  }
  return null;
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
function findCorpusEntry(insurer, productName) {
  const ins = normIns(insurer);
  // Match: ["Insurer","Product Name","category","subType",[...],...]
  const re = /\["([^"]+)","([^"]*)","([^"]*)","([^"]*)"(?=,\[)/g;
  let m;
  while ((m = re.exec(sgJs)) !== null) {
    if (normIns(m[1]) === ins && compact(m[2]) === compact(productName)) {
      return { offset: m.index, length: m[0].length, insurer: m[1], name: m[2], category: m[3], subType: m[4] };
    }
  }
  return null;
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

// ─── Apply ──────────────────────────────────────────────────────────
let appliedSeed = 0, appliedCorpus = 0, missed = 0;
const missedList = [];

for (const ov of overrides) {
  const seedLoc = findSeedEntry(ov.insurer, ov.product);
  if (seedLoc) {
    applySeedOverride(seedLoc, ov);
    appliedSeed++;
    continue;
  }
  const corpLoc = findCorpusEntry(ov.insurer, ov.product);
  if (corpLoc) {
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
console.log(`  Missed:           ${missed}`);
if (missed > 0) {
  console.log('\nMissed entries (no matching record in SEED or SG corpus):');
  for (const m of missedList.slice(0, 30)) console.log('  - ' + m);
  if (missedList.length > 30) console.log(`  ... and ${missedList.length - 30} more`);
}
