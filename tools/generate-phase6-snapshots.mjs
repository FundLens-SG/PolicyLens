// Generate Phase 6 audit snapshots for hand-off to Claude Co-Work + ChatGPT 5.5 Pro.
//
// Two snapshots:
//   • phase-6A-not-found-needs-evidence.json — 324 entries our register check could
//     not match. AI must verify each: either (a) cite the actual register line that
//     proves the entry is real, OR (b) mark as 'recommend-delete' with reasoning.
//   • phase-6B-no-register-coverage.json — 866 entries from insurers without PPF
//     registers (Tier B carriers + HNW offshore). AI must verify via insurer
//     website / product brochure URLs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(rootDir, 'tools/verification-output');
const targetDir = path.join(rootDir, 'tools');

// Find the most recent verification artifacts
const files = fs.readdirSync(outDir).sort();
const nfFile = files.filter(f => f.startsWith('not-found-')).pop();
const nrFile = files.filter(f => f.startsWith('no-register-')).pop();
const sumFile = files.filter(f => f.startsWith('verification-summary-')).pop();

if (!nfFile || !nrFile) { console.error('Missing verification artifacts'); process.exit(1); }

const notFound = JSON.parse(fs.readFileSync(path.join(outDir, nfFile), 'utf8'));
const noRegister = JSON.parse(fs.readFileSync(path.join(outDir, nrFile), 'utf8'));
const summary = JSON.parse(fs.readFileSync(path.join(outDir, sumFile), 'utf8'));

// ─── Phase 6A: Not-found needs evidence ───
// Group by insurer, sort by source so AI sees Phase 2 boilerplate first (highest priority).
const a = {
  metadata: {
    phase: 'P6A-not-found-audit',
    purpose: 'Verify entries that our register cross-check could not match. For EACH entry, either prove it real with a register-line quote, or mark for deletion.',
    verificationToolRun: sumFile,
    totalEntries: notFound.length,
    registersChecked: summary.registersAvailable,
    instructions: [
      'For EACH entry, return ONE of:',
      '  (a) {verdict:"keep", canonicalName:"...", correctName:"...", registerLineQuote:"...", sourceUrl:"...", category:"...", subType:"..."} — if you find the entry in the official PPF register or insurer materials, with the exact register line quoted',
      '  (b) {verdict:"rename", canonicalName:"...", suggestedName:"...", reason:"...", registerLineQuote:"...", sourceUrl:"...", category:"...", subType:"..."} — if the entry exists but under a different name in the register',
      '  (c) {verdict:"delete", canonicalName:"...", reason:"...", evidenceUrl:"..."} — if you can confirm the entry does NOT exist (and ideally provide a link showing what DOES exist instead)',
      '  (d) {verdict:"defer", canonicalName:"...", reason:"...", whatToCheck:"..."} — only if you absolutely cannot find evidence; explain what specific document or website needs to be checked',
      'NO SPECULATION. Every verdict must cite a URL + a quote from the document.',
      'If the entry name appears to be a slash-joined family (e.g. "Plan A / Plan B"), use verdict:"split" with an array of variants: {verdict:"split", canonicalName:"...", variants:[{name:"Plan A", category, subType, sourceUrl, registerLineQuote}, ...]}',
    ],
  },
  entriesByInsurer: {},
};
for (const e of notFound) {
  if (!a.entriesByInsurer[e.insurer]) a.entriesByInsurer[e.insurer] = [];
  a.entriesByInsurer[e.insurer].push({
    canonicalName: e.name,
    currentClassification: e.category + '/' + e.subType,
    aliases: e.aliases,
    source: e.source,
  });
}
fs.writeFileSync(path.join(targetDir, 'phase-6A-not-found-audit.json'), JSON.stringify(a, null, 2));
console.log('Wrote phase-6A-not-found-audit.json (' + notFound.length + ' entries across ' + Object.keys(a.entriesByInsurer).length + ' insurers)');

// ─── Phase 6B: No-register coverage ───
// These are entries from insurers without an extracted PPF register. AI must verify
// against insurer website / product brochures.
const b = {
  metadata: {
    phase: 'P6B-no-register-audit',
    purpose: 'Verify entries from insurers without committed PPF register coverage. Include Tier B carriers (Etiqa, China Taiping, Raffles, MSIG, Sompo, etc.) and HNW offshore (Manulife Bermuda, Sun Life HK, FPI, Quilter, Transamerica Bermuda, Hansard). Banks/brokers/robo-advisors are out-of-scope and should NOT be audited (cash + brokerage products use different verification model).',
    verificationToolRun: sumFile,
    totalEntries: noRegister.length,
    instructions: [
      'Same verdict format as Phase 6A: keep / rename / delete / split / defer.',
      'For Tier B insurers WITH a register: provide the official register URL + line quote.',
      'For HNW offshore: provide product brochure URL + extracted feature quote.',
      'For BANKS/BROKERS/ROBO-ADVISORS in the list (Citibank, DBS, HSBC, Maybank, OCBC, UOB, Standard Chartered, Saxo, iFAST, Tiger Brokers, moomoo, Interactive Brokers, Philip Securities, StashAway, Syfe, Endowus, SGX Central Depository, CPF Board, MOH): SKIP — these will use a different audit pipeline. Mark verdict:"out-of-scope".',
    ],
  },
  entriesByInsurer: {},
};
const skipInsurers = new Set([
  'Citibank','DBS','HSBC','Maybank','OCBC','UOB','Standard Chartered','Saxo','iFAST',
  'Tiger Brokers','moomoo','Interactive Brokers','Philip Securities','StashAway','Syfe',
  'Endowus','SGX Central Depository','CPF Board','MOH',
]);
for (const e of noRegister) {
  if (skipInsurers.has(e.insurer)) continue;  // bank/broker, defer
  if (!b.entriesByInsurer[e.insurer]) b.entriesByInsurer[e.insurer] = [];
  b.entriesByInsurer[e.insurer].push({
    canonicalName: e.name,
    currentClassification: e.category + '/' + e.subType,
    aliases: e.aliases,
    source: e.source,
  });
}
const bTotalEntries = Object.values(b.entriesByInsurer).reduce((s, x) => s + x.length, 0);
b.metadata.totalEntries = bTotalEntries;
b.metadata.skippedBankBrokerEntries = noRegister.length - bTotalEntries;
fs.writeFileSync(path.join(targetDir, 'phase-6B-no-register-audit.json'), JSON.stringify(b, null, 2));
console.log('Wrote phase-6B-no-register-audit.json (' + bTotalEntries + ' insurance entries across ' + Object.keys(b.entriesByInsurer).length + ' insurers; skipped ' + (noRegister.length - bTotalEntries) + ' bank/broker rows)');

// Print insurer breakdowns
console.log('\n═══ Phase 6A by insurer ═══');
for (const [ins, items] of Object.entries(a.entriesByInsurer).sort((x, y) => y[1].length - x[1].length)) {
  console.log('  ' + String(items.length).padStart(4) + '  ' + ins);
}
console.log('\n═══ Phase 6B by insurer (insurers only, banks/brokers excluded) ═══');
for (const [ins, items] of Object.entries(b.entriesByInsurer).sort((x, y) => y[1].length - x[1].length)) {
  console.log('  ' + String(items.length).padStart(4) + '  ' + ins);
}
