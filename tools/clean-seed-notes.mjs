// Strip leaked AI classification directives from SEED_REPOSITORY notes.
//
// Some deep-research-generated notes contain meta-instructions intended for the
// parser but visible to the FC in the UI:
//   "NOT an ILP. Classify as retirement → Retirement Income (Par WL)."
//   "CLASSIFY AS retirement/Retirement Income (Par WL), NEVER as investment/ILP."
//   "Use annuityPayout for the guaranteed + dividend income."
//
// This tool processes src/index.babel.html in place. It splits each SEED entry's
// notes into sentences and drops any sentence that matches a directive pattern,
// while keeping all substantive FC-relevant content. Writes a report of what
// changed.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX_BABEL = path.join(ROOT, 'src/index.babel.html');

// Directive-stripping approach — match and remove specific directive sentences/clauses
// directly instead of splitting on `.` (which breaks decimals like "2.25%").
//
// Each pattern matches a complete directive (typically ending in a period or end of
// string). Order matters — earlier patterns are stripped first so later ones see
// cleaner input.
const DIRECTIVE_STRIPS = [
  // Full sentence: "Classify as X." / "Classify as X, not Y." / "Classify as X → Y."
  // Anchored on start-of-string or after `. ` / `! ` / `? ` — i.e. real sentence boundary.
  /(?:^|(?<=[.!?]\s))Classif(?:y|ied|ies)\s+as\b[^.!?]*[.!?]/gi,
  /(?:^|(?<=[.!?]\s))Categori[sz](?:e|ed|es)\s+as\b[^.!?]*[.!?]/gi,
  /(?:^|(?<=[.!?]\s))Treat\s+(?:as|it\s+as)\b[^.!?]*[.!?]/gi,
  /(?:^|(?<=[.!?]\s))Mark\s+as\b[^.!?]*[.!?]/gi,
  /(?:^|(?<=[.!?]\s))Do\s+not\s+(?:confuse|merge|classify|treat|mistake|category|category as)\b[^.!?]*[.!?]/gi,
  /(?:^|(?<=[.!?]\s))Should\s+be\s+(?:classif|categori[sz])[^.!?]*[.!?]/gi,
  /(?:^|(?<=[.!?]\s))Must\s+be\s+(?:classif|categori[sz])[^.!?]*[.!?]/gi,
  /(?:^|(?<=[.!?]\s))CLASSIFY\s+AS\b[^.!?]*[.!?]/g, // ALL-CAPS variant (the AIA Gen3 case)
  /(?:^|(?<=[.!?]\s))NEVER\s+as\b[^.!?]*[.!?]/g,
  /(?:^|(?<=[.!?]\s))ALWAYS\s+(?:as|classify)\b[^.!?]*[.!?]/g,
  /(?:^|(?<=[.!?]\s))Use\s+annuityPayout\b[^.!?]*[.!?]/gi,
  // "NOT an ILP." or "NOT a [type]." as standalone sentence
  /(?:^|(?<=[.!?]\s))NOT\s+an?\s+(?:ILP|investment|UL|whole\s+life|annuity|endowment|term\s+life|fund)\s*[.!?]/g,
  // "No fundAllocations, no ilpGrowth, no management fee." standalone
  /(?:^|(?<=[.!?]\s))No\s+(?:fundAllocations?|ilpGrowth|annuityPayout|management\s+fee|investment\s+component)\b[^.!?]*[.!?]/gi,
  // Mid-sentence cleanup: " — NOT an ILP, no fund allocation, no investment component"
  /\s*[—–]\s*NOT\s+an?\s+(?:ILP|investment|UL|whole\s+life|fund|annuity|endowment|term\s+life)(?:\s*,\s*no\s+[a-zA-Z]+(?:\s+[a-zA-Z]+)?)*(?:\s*,\s*no\s+[a-zA-Z]+\s+component)?/gi,
  // Mid-sentence: ", NOT an ILP" (no dash)
  /\s*,\s*NOT\s+an?\s+(?:ILP|investment|UL|whole\s+life|fund|annuity|endowment|term\s+life)\b/gi,
  // Mid-sentence comma-separated: ", no fundAllocations, no ilpGrowth, no management fee"
  /(?:\s*,\s*no\s+(?:fundAllocations?|ilpGrowth|annuityPayout|management\s+fee|investment\s+component))+/gi,
];

function cleanNotes(raw) {
  if (!raw) return raw;
  let s = raw;
  for (const re of DIRECTIVE_STRIPS) s = s.replace(re, '');
  // Tidy: collapse whitespace, kill orphan punctuation that strips might leave.
  s = s.replace(/\s+([.,!?;])/g, '$1');
  s = s.replace(/[—–]\s*([.!?])/g, '$1');
  s = s.replace(/^\s*[—–,.;]+\s*/, '');     // leading orphan punctuation
  s = s.replace(/\s{2,}/g, ' ').trim();
  return s;
}

const html = fs.readFileSync(INDEX_BABEL, 'utf8');
const seedStart = html.indexOf('const SEED_REPOSITORY = [');
const seedEnd = html.indexOf('\n];', seedStart);
if (seedStart < 0 || seedEnd < 0) { console.error('SEED_REPOSITORY block not found'); process.exit(2); }

const before = html.slice(0, seedStart);
const block = html.slice(seedStart, seedEnd);
const after = html.slice(seedEnd);

// Replace each entry's notes field. Each entry is one line like:
//   {id:'…',insurer:'…',productName:'…',productCode:'…',category:'…',subType:'…',
//    currency:'…',notes:'…',editHistory:[]}
const entryRe = /\{id:'([^']+)',insurer:'([^']+)',productName:'([^']*)'([^}]*?)notes:'((?:\\.|[^'])*)'([^}]*)\}/g;
let modifiedCount = 0;
const examples = [];
const updatedBlock = block.replace(entryRe, (match, id, insurer, name, midFields, notes, tailFields) => {
  // Unescape JS string literal escape sequences inside the captured notes (mainly \')
  const raw = notes.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  const cleaned = cleanNotes(raw);
  if (cleaned === raw) return match;
  modifiedCount++;
  if (examples.length < 8) examples.push({ insurer, name, before: raw, after: cleaned });
  // Re-escape for JS string literal
  const escaped = cleaned.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `{id:'${id}',insurer:'${insurer}',productName:'${name}'${midFields}notes:'${escaped}'${tailFields}}`;
});

if (modifiedCount === 0) {
  console.log('No directive leakage found — notes are clean.');
  process.exit(0);
}

if (process.argv.includes('--dry-run')) {
  console.log(`DRY RUN: would modify ${modifiedCount} entries.`);
} else {
  fs.writeFileSync(INDEX_BABEL, before + updatedBlock + after);
  console.log(`✓ Cleaned ${modifiedCount} SEED entries.`);
}

console.log('\nSample cleanups (first 8):');
for (const ex of examples) {
  console.log('\n  ' + ex.insurer + ' / ' + ex.name);
  console.log('    before: ' + ex.before.slice(0, 220) + (ex.before.length > 220 ? '...' : ''));
  console.log('    after:  ' + ex.after.slice(0, 220) + (ex.after.length > 220 ? '...' : ''));
}
