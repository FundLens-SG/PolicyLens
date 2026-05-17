// PolicyLens product-catalogue assimilation pipeline.
//
// PURPOSE
//   Take JSON files produced by Claude Co-Work / ChatGPT 5.5 (per the deep-research
//   brief 2026-05-17), validate them against the canonical schema, diff against the
//   existing PolicyLens catalogue, surface conflicts, and emit ready-to-apply
//   patches.
//
// USAGE
//   node tools/assimilate-catalogue.mjs <file-or-dir> [<more files>] [--apply]
//
//   Default mode is DRY-RUN: validates everything, writes reports + patches to
//   tools/catalogue-output/, and prints a summary. No source files are modified.
//
//   With --apply: writes new entries to a corpus supplement text file at
//   PolicyLens_Singapore_Reference/99_research_2026_05_17.txt, generates rich
//   SEED_REPOSITORY additions into a patch file you paste manually, and writes
//   a conflict-resolution worksheet for any flagged conflicts.
//
// CONVENTION
//   Input JSON files follow the schema documented in the 2026-05-17 research
//   brief — see tools/catalogue-staging/ for examples once you drop files there.
//
// EXIT CODES
//   0 — all entries validated and assimilated cleanly
//   1 — at least one validation error or unresolved conflict
//   2 — input file missing or unreadable

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STAGING_DIR = path.join(ROOT, 'tools/catalogue-staging');
const OUTPUT_DIR = path.join(ROOT, 'tools/catalogue-output');
const SG_KNOWLEDGE_FILE = path.join(ROOT, 'singapore-product-knowledge.js');
const INDEX_BABEL = path.join(ROOT, 'src/index.babel.html');
const CORPUS_DIR = 'C:/CKG Creations/PolicyLens_Singapore_Reference';

// ─── CLI ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const SELFTEST = args.includes('--selftest');
const inputs = args.filter(a => !a.startsWith('--'));
if (!SELFTEST && inputs.length === 0) {
  console.error('Usage: node tools/assimilate-catalogue.mjs <file-or-dir> [...more] [--apply]');
  console.error('   or: node tools/assimilate-catalogue.mjs --selftest');
  process.exit(2);
}

// ─── Canonical enums ─────────────────────────────────────────────────────
const CATEGORIES = new Set(['protection','savings','health','investment','retirement','maternity','cash_investments','other_assets']);

const SUB_TYPES = {
  protection: new Set(['Term Life','Whole Life','Universal Life (UL)','Indexed UL (IUL)','Variable UL (VUL)','Critical Illness','Early Critical Illness','Personal Accident','Disability Income','Long-term Care','ILP (Protection)']),
  savings: new Set(['Endowment','Lifetime Endowment','Education Plan','Short-term Endowment']),
  health: new Set(['Integrated Shield Plan','Shield Rider','Hospital Income','CareShield Life / Supplement','ElderShield 300','ElderShield 400','Long-term Care']),
  investment: new Set(['ILP (Investment)','Unit Trust','Single Premium Investment']),
  retirement: new Set(['Retirement Income (Par WL)','Annuity','CPF Life','Income Plan','Retirement']),
  maternity: new Set(['Maternity Coverage']),
  // rc2.54: kept in sync with canonical SUB_TYPES in src/index.babel.html.
  cash_investments: new Set(['Fixed Deposit','T-bill','Singapore Savings Bond','Corporate Bond','Money Market','Cash Management','Structured Deposit','Fixed Coupon Note (FCN)','Equity Linked Note (ELN)']),
  other_assets: new Set(['Property','Stocks/Equities','Brokerage Account','Regular Savings Plan (RSP)','Gold/Precious Metals','Fixed Coupon Note (FCN)','Equity Linked Note (ELN)','Options/Futures','Cryptocurrency','Art/Collectibles','Other']),
};

// rc2.54: alias map for sub-types the AIs commonly emit but that aren't canonical.
//   Pipeline silently rewrites the incoming subType to the canonical form during validation
//   so the entry doesn't fail. Logged in the report so we can see how often each fires.
const SUBTYPE_ALIASES = {
  'bonds': 'Corporate Bond',
  'bond': 'Corporate Bond',
  'treasury bills': 'T-bill',
  't-bills': 'T-bill',
  'singapore government securities': 'Corporate Bond',
  'sgs': 'Corporate Bond',
  'precious metals': 'Gold/Precious Metals',
  'gold': 'Gold/Precious Metals',
  'regular savings plan': 'Regular Savings Plan (RSP)',
  'rsp': 'Regular Savings Plan (RSP)',
  'investment-linked policy (ilp)': 'ILP (Investment)',
  'ilp': 'ILP (Investment)',
  'integrated shield': 'Integrated Shield Plan',
  'isp': 'Integrated Shield Plan',
  'careshield': 'CareShield Life / Supplement',
  // rc2.54: NOT aliasing "Shield Rider" — riders are now first-class sub-type under health.
  //   VitalHealth, HSG Max Rider, PRUExtra, GREAT TotalCare, Singlife Health Plus, AIA Max
  //   A Cancer Care Booster etc. → Shield Rider, distinct from the parent Integrated Shield
  //   Plan product they attach to.
};

// rc2.54: build a reverse map subType → category so we can auto-correct the category when
//   the AI assigned a subType that lives in a different category. E.g. "Corporate Bond" is
//   only valid for cash_investments, so if the AI says category:other_assets + subType:
//   Corporate Bond, we silently rewrite category to cash_investments.
const SUBTYPE_TO_CATEGORY = (() => {
  const m = {};
  for (const [cat, set] of Object.entries(SUB_TYPES)) for (const st of set) m[st] = cat;
  return m;
})();

// rc2.54: products that should NEVER be in this catalogue. These are not insurance/wealth
//   products — they're account types or built-in scheme components handled by other parts
//   of the app. Surface as info, drop the entry.
const SKIP_PATTERNS = [
  /^cpf\s+(ordinary|special|medisave|retirement)\s+account$/i,
  /^cpf\s+(oa|sa|ma|ra)$/i,
  /^medishield\s+life$/i,           // base scheme, built-in
  /^careshield\s+life$/i,            // base scheme, built-in (NOT supplements — those stay)
  /^eldershield\s+(300|400)$/i,      // base scheme, built-in
  /^cpf\s+life\s+(standard|basic|escalating)\b/i, // built-in via CPF_LIFE infra
  // rc2.54: CPFIS schemes and CPF Investment Accounts are investment VEHICLES, not products.
  //   They hold underlying funds/stocks which themselves are tracked. Skip the wrapper.
  /^cpf\s+investment\s+(scheme|account)/i,
  /^uob\s+cpf\s+investment\s+account$/i,
  /^cpfis(\s|$)/i,
];

const INSURERS = new Set([
  // SG retail insurers
  'AIA','Great Eastern','Prudential','Manulife','NTUC Income','Singlife','HSBC Life',
  'Tokio Marine','Etiqa','FWD','China Taiping','China Life','Zurich','Generali','MSIG',
  'Transamerica','Raffles Health Insurance',
  // Govt
  'CPF Board',
  // Brokerages / robo-advisors
  'iFAST','Tiger Brokers','moomoo','Endowus','StashAway','Syfe','Saxo','Interactive Brokers',
  'Philip Securities',
  // rc2.54: banks accepted as canonical insurers for their OWN cash/deposit/structured
  //   products (DBS Multiplier, Singlife Account, UOB One Account, OCBC 360, etc.). For
  //   bank-DISTRIBUTED insurance (Signature Life, etc.) the underwriter goes in `insurer`
  //   and the bank goes in `distributor` — the AI brief covers this.
  'DBS','UOB','OCBC','Citibank','HSBC','Standard Chartered','Maybank','POSB',
]);

const STATUSES = new Set(['active','legacy_in_force','discontinued']);
const CONFIDENCES = new Set(['high','medium','low']);

const INSURER_ALIASES = {
  'aia singapore': 'AIA',
  'aia sg': 'AIA',
  'great eastern life': 'Great Eastern',
  'great eastern life assurance': 'Great Eastern',
  'great eastern singapore': 'Great Eastern',
  'ge': 'Great Eastern',
  'prudential assurance': 'Prudential',
  'prudential singapore': 'Prudential',
  'prudential assurance singapore': 'Prudential',
  'pru': 'Prudential',
  'manulife singapore': 'Manulife',
  'manulife (singapore)': 'Manulife',
  'income insurance': 'NTUC Income',
  'income insurance limited': 'NTUC Income',
  'income': 'NTUC Income',
  'ntuc': 'NTUC Income',
  'singapore life': 'Singlife',
  'aviva': 'Singlife',
  'aviva singapore': 'Singlife',
  'hsbc life singapore': 'HSBC Life',
  'hsbc insurance': 'HSBC Life',
  'axa': 'HSBC Life',
  'tokio marine life': 'Tokio Marine',
  'tokio marine life singapore': 'Tokio Marine',
  'tm': 'Tokio Marine',
  'etiqa singapore': 'Etiqa',
  'etiqa insurance': 'Etiqa',
  'fwd singapore': 'FWD',
  'fwd life singapore': 'FWD',
  'china taiping singapore': 'China Taiping',
  'china taiping insurance singapore': 'China Taiping',
  'china life singapore': 'China Life',
  'china life (singapore)': 'China Life',
  'raffles health': 'Raffles Health Insurance',
  // rc2.54: govt-side entities. Singapore retirement / long-term-care / health schemes
  //   are administered by various bodies but we collapse them all under "CPF Board" for
  //   the catalogue since CPF Board is the primary administrator. AIC handles private LTC
  //   supplements distribution; MAS regulates; MOF/IRAS handles SRS — all map to CPF Board
  //   in the catalogue. If you need to separate, surface this via the `distributor` field
  //   on the entry.
  'cpf board': 'CPF Board',
  'monetary authority of singapore': 'CPF Board',
  'mas': 'CPF Board',
  'ministry of finance / iras': 'CPF Board',
  'ministry of finance': 'CPF Board',
  'iras': 'CPF Board',
  'agency for integrated care': 'CPF Board',
  'aic': 'CPF Board',
  // Brokerages
  'fsmone': 'iFAST',
  'fsm': 'iFAST',
  'ifast / fsmone': 'iFAST',
  'ifast financial': 'iFAST',
  'poems': 'Philip Securities',
  'philip securities pte ltd': 'Philip Securities',
  'philip securities pte. ltd.': 'Philip Securities',
  'ibkr': 'Interactive Brokers',
  'moomoo financial singapore': 'moomoo',
  'moomoo singapore': 'moomoo',
  'tiger brokers (singapore)': 'Tiger Brokers',
  // Banks — these come back as the "insurer" sometimes when the product is the bank's own
  //   cash management / savings product (Singlife Account, DBS Multiplier, etc.). For pure-
  //   bank products the bank IS the underwriter. For bank-distributed INSURANCE products
  //   the AI should name the actual insurer (Manulife / AIA / etc.); we don't auto-rewrite
  //   here because we don't know which case it is. Both forms are accepted as canonical.
  'citi': 'Citibank',
  'citibank singapore': 'Citibank',
  'hsbc bank': 'HSBC',
  'standard chartered bank': 'Standard Chartered',
  'standard chartered bank singapore': 'Standard Chartered',
  'uob singapore': 'UOB',
  'dbs bank': 'DBS',
  'ocbc bank': 'OCBC',
  'maybank singapore': 'Maybank',
};

function canonicalInsurer(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  if (INSURERS.has(s)) return s;
  const key = s.toLowerCase();
  return INSURER_ALIASES[key] || s; // pass-through if unknown
}

// ─── Helpers ─────────────────────────────────────────────────────────────
const norm = v => String(v||'').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const compact = v => String(v||'').toLowerCase().replace(/[^a-z0-9]+/g, '');

function color(c, s) { return process.stdout.isTTY ? `\x1b[${c}m${s}\x1b[0m` : s; }
const red = s => color('31', s);
const green = s => color('32', s);
const yellow = s => color('33', s);
const cyan = s => color('36', s);
const dim = s => color('90', s);
const bold = s => color('1', s);

// ─── Load incoming JSON files ────────────────────────────────────────────
function loadInputs(paths) {
  const docs = [];
  for (const p of paths) {
    if (!fs.existsSync(p)) { console.error(red('Missing input: ' + p)); process.exit(2); }
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(p)) {
        if (name.endsWith('.json')) docs.push(...loadInputs([path.join(p, name)]));
      }
      continue;
    }
    try {
      const raw = fs.readFileSync(p, 'utf8');
      const json = JSON.parse(raw);
      docs.push({ path: p, json });
    } catch (e) {
      console.error(red('Failed to parse JSON: ' + p + ' — ' + e.message));
      process.exit(2);
    }
  }
  return docs;
}

// ─── Schema validation ───────────────────────────────────────────────────
function validateEntry(entry, idx, sourcePath) {
  const errors = [];
  const where = `${path.basename(sourcePath)}#${idx}` + (entry?.canonicalName ? ` "${entry.canonicalName}"` : '');

  const must = (cond, msg) => { if (!cond) errors.push({ where, msg }); };

  must(entry && typeof entry === 'object', 'entry must be an object');
  if (!entry || typeof entry !== 'object') return errors;

  // rc2.54: skip-pattern check runs first — non-products get dropped with an info-level
  //   message rather than a fatal error so the run continues smoothly.
  if (entry.canonicalName && SKIP_PATTERNS.some(rx => rx.test(entry.canonicalName))) {
    errors.push({ where, msg: `entry skipped (matches SKIP_PATTERNS — built-in or non-product)`, severity: 'skip' });
    return errors;
  }

  // rc2.54: normalise subType via aliases before strict validation.
  if (entry.subType && typeof entry.subType === 'string') {
    const aliased = SUBTYPE_ALIASES[entry.subType.toLowerCase()];
    if (aliased && aliased !== entry.subType) {
      errors.push({ where, msg: `subType "${entry.subType}" auto-rewritten to canonical "${aliased}"`, severity: 'warn' });
      entry.subType = aliased;
    }
  }
  // rc2.54: if subType is canonical but lives in a different category than the one the AI
  //   assigned, the AI got the category wrong. Auto-correct the category.
  if (entry.subType && SUBTYPE_TO_CATEGORY[entry.subType] && SUBTYPE_TO_CATEGORY[entry.subType] !== entry.category) {
    errors.push({ where, msg: `category "${entry.category}" → "${SUBTYPE_TO_CATEGORY[entry.subType]}" auto-corrected (subType "${entry.subType}" belongs to that category)`, severity: 'warn' });
    entry.category = SUBTYPE_TO_CATEGORY[entry.subType];
  }

  must(entry.canonicalName && typeof entry.canonicalName === 'string', 'canonicalName required (string)');
  must(entry.insurer && typeof entry.insurer === 'string', 'insurer required (string)');
  must(CATEGORIES.has(entry.category), `category "${entry.category}" not in canonical set`);
  if (CATEGORIES.has(entry.category)) {
    must(SUB_TYPES[entry.category].has(entry.subType), `subType "${entry.subType}" not allowed for category "${entry.category}"`);
  }
  // rc2.54: rewrite entry.insurer to the canonical form so downstream outputs (new-entries
  //   JSON, corpus additions, SEED patch) all use the same string. Without this, AI-supplied
  //   variants like "Tokio Marine Life Singapore" / "Citi" / "iFAST / FSMOne" / "Monetary
  //   Authority of Singapore" survived to the report and looked like distinct insurers in
  //   per-insurer counts even though dedup matching used the canonical form.
  const canonIns = canonicalInsurer(entry.insurer);
  if (canonIns && canonIns !== entry.insurer) {
    errors.push({ where, msg: `insurer "${entry.insurer}" → "${canonIns}" auto-normalised`, severity: 'warn' });
    entry.insurer = canonIns;
  }
  if (!INSURERS.has(canonIns)) errors.push({ where, msg: `insurer "${entry.insurer}" not in canonical list (canonicalised to "${canonIns}"). Add to INSURERS or use a known name.` , severity: 'warn' });
  must(Array.isArray(entry.aliases), 'aliases must be an array');
  must(Array.isArray(entry.sources) && entry.sources.length > 0, 'sources required (non-empty array)');
  if (Array.isArray(entry.sources)) {
    for (const [i, src] of entry.sources.entries()) {
      must(src && typeof src.url === 'string' && /^https?:\/\//.test(src.url), `sources[${i}].url must be a valid http(s) URL`);
    }
  }
  if (entry.status != null) must(STATUSES.has(entry.status), `status "${entry.status}" not in {active|legacy_in_force|discontinued}`);
  if (entry.confidence != null) must(CONFIDENCES.has(entry.confidence), `confidence "${entry.confidence}" not in {high|medium|low}`);
  if (entry.notes != null) {
    if (typeof entry.notes !== 'string') errors.push({ where, msg: 'notes must be a string' });
    else if (/\b(award[\s-]?winning|peace of mind|comprehensive|tailored|flexible solutions|hassle[\s-]?free)\b/i.test(entry.notes)) {
      errors.push({ where, msg: 'notes contains marketing language — paraphrase to facts', severity: 'warn' });
    }
  }

  return errors;
}

// ─── Load existing canonical catalogue ───────────────────────────────────
function loadSgKnowledge() {
  // Extract the PRODUCTS array from singapore-product-knowledge.js by evaluating
  // the file under a stub global.
  try {
    const code = fs.readFileSync(SG_KNOWLEDGE_FILE, 'utf8');
    const sandbox = { window: {}, globalThis: {} };
    const fn = new Function('window', 'globalThis', code + '\nreturn window.PolicyLensSingaporeProductKnowledge || globalThis.PolicyLensSingaporeProductKnowledge;');
    const api = fn(sandbox.window, sandbox.globalThis);
    if (!api || !Array.isArray(api.products)) throw new Error('PRODUCTS not parseable');
    return api.products.map(row => ({
      insurer: row[0],
      productName: row[1],
      category: row[2],
      subType: row[3],
      aliases: Array.isArray(row[4]) ? row[4] : [],
      source: row[5] || ''
    }));
  } catch (e) {
    console.warn(yellow(`[warn] Could not load SG knowledge from ${SG_KNOWLEDGE_FILE}: ${e.message}`));
    return [];
  }
}

function loadSeedRepository() {
  try {
    const html = fs.readFileSync(INDEX_BABEL, 'utf8');
    const start = html.indexOf('const SEED_REPOSITORY = [');
    if (start < 0) return [];
    const end = html.indexOf('\n];', start);
    if (end < 0) return [];
    // Extract by regex — each entry is a single-line object literal `{id:'...', ...}`.
    const block = html.slice(start, end);
    const entries = [];
    const re = /\{id:'([^']+)',insurer:'([^']+)',productName:'([^']*)'/g;
    let m;
    while ((m = re.exec(block)) !== null) {
      entries.push({ id: m[1], insurer: m[2], productName: m[3] });
    }
    return entries;
  } catch (e) {
    console.warn(yellow(`[warn] Could not load SEED_REPOSITORY: ${e.message}`));
    return [];
  }
}

// ─── Dedup matcher ───────────────────────────────────────────────────────
function buildIndex(existingSg, existingSeed) {
  // Indexes by (insurer, name) and by (insurer, alias) and by productCode.
  const byNameKey = new Map(); // 'insurer|compactname' -> entry
  const byAliasKey = new Map(); // 'insurer|compactalias' -> entry
  const allInsurerNames = new Map(); // 'insurer|normname' -> entry (used for fuzzy)

  const add = (insurer, name, aliases, source) => {
    const ci = canonicalInsurer(insurer);
    const nk = ci + '|' + compact(name);
    if (!byNameKey.has(nk)) byNameKey.set(nk, { insurer: ci, productName: name, source });
    const nrm = ci + '|' + norm(name);
    if (!allInsurerNames.has(nrm)) allInsurerNames.set(nrm, { insurer: ci, productName: name, source });
    for (const a of (aliases || [])) {
      const ak = ci + '|' + compact(a);
      if (!byAliasKey.has(ak)) byAliasKey.set(ak, { insurer: ci, productName: name, alias: a, source });
    }
  };

  for (const e of existingSg) add(e.insurer, e.productName, e.aliases, 'sg-knowledge');
  for (const e of existingSeed) add(e.insurer, e.productName, [], 'seed-repository');

  return { byNameKey, byAliasKey, allInsurerNames };
}

function classify(entry, index) {
  const insurer = canonicalInsurer(entry.insurer);
  const nameKey = insurer + '|' + compact(entry.canonicalName);
  // 1. Exact name match
  const direct = index.byNameKey.get(nameKey);
  if (direct) return { kind: 'match', match: direct };
  // 2. Alias hit (incoming canonicalName matches an existing alias)
  const aliasMatch = index.byAliasKey.get(nameKey);
  if (aliasMatch) return { kind: 'match', match: aliasMatch, viaAlias: true };
  // 3. Any of the new entry's aliases match an existing canonical name
  for (const a of (entry.aliases || [])) {
    const ak = insurer + '|' + compact(a);
    if (index.byNameKey.has(ak)) return { kind: 'match', match: index.byNameKey.get(ak), viaAlias: true };
  }
  return { kind: 'new' };
}

// ─── Diff existing vs incoming ───────────────────────────────────────────
function diffMatch(incoming, existing) {
  // The existing entries (from SG knowledge) include category + subType.
  // Compare and surface conflicts.
  const conflicts = [];
  // Look up the FULL existing entry (we only have shallow info from `match`);
  // re-resolve via insurer + compactname.
  // We'll rely on the caller to pass the full existing record.
  // Here `existing` is the loaded SG-knowledge entry directly.
  if (existing.category && incoming.category && existing.category !== incoming.category) {
    conflicts.push({ field: 'category', existing: existing.category, incoming: incoming.category });
  }
  if (existing.subType && incoming.subType && existing.subType !== incoming.subType) {
    conflicts.push({ field: 'subType', existing: existing.subType, incoming: incoming.subType });
  }
  if (existing.insurer && incoming.insurer && canonicalInsurer(existing.insurer) !== canonicalInsurer(incoming.insurer)) {
    conflicts.push({ field: 'insurer', existing: existing.insurer, incoming: incoming.insurer });
  }
  return conflicts;
}

// ─── Main pipeline ───────────────────────────────────────────────────────
function run() {
  if (SELFTEST) return selftest();

  console.log(dim('PolicyLens catalogue assimilation'));
  console.log(dim('===================================='));

  const docs = loadInputs(inputs);
  if (docs.length === 0) { console.error(red('No input files found.')); process.exit(2); }

  const existingSg = loadSgKnowledge();
  const existingSeed = loadSeedRepository();
  console.log(dim(`Loaded existing: ${existingSg.length} SG knowledge entries + ${existingSeed.length} SEED_REPOSITORY entries`));

  const index = buildIndex(existingSg, existingSeed);

  // Build a map from (insurer|compactName) -> full SG knowledge entry for diff.
  const sgFullByKey = new Map();
  for (const e of existingSg) sgFullByKey.set(canonicalInsurer(e.insurer) + '|' + compact(e.productName), e);

  let allEntries = 0;
  const allErrors = [];
  const allWarnings = [];
  const allSkips = [];
  const newEntries = [];
  const identicalEntries = [];
  const conflictEntries = [];
  const autoResolvedConflicts = [];

  for (const doc of docs) {
    const phase = doc.json?.metadata?.phase || doc.json?.metadata?.groupCovered || path.basename(doc.path);
    console.log(cyan(`\n→ ${phase} (${doc.path})`));
    const products = Array.isArray(doc.json?.products) ? doc.json.products : [];
    console.log(dim(`  ${products.length} products in this file`));

    for (const [i, p] of products.entries()) {
      allEntries++;
      const errs = validateEntry(p, i, doc.path);
      const skip = errs.filter(e => e.severity === 'skip');
      if (skip.length > 0) { allSkips.push(...skip); continue; }
      const fatal = errs.filter(e => !e.severity);
      const warns = errs.filter(e => e.severity === 'warn');
      allErrors.push(...fatal);
      allWarnings.push(...warns);
      if (fatal.length > 0) continue;

      const cls = classify(p, index);
      if (cls.kind === 'new') {
        newEntries.push({ doc: doc.path, entry: p });
      } else {
        // Look up full existing
        const insurer = canonicalInsurer(p.insurer);
        const matchKey = insurer + '|' + compact(cls.match.productName);
        const full = sgFullByKey.get(matchKey) || cls.match;
        const conflicts = diffMatch(p, full);
        if (conflicts.length === 0) {
          identicalEntries.push({ doc: doc.path, entry: p, existing: full });
        } else {
          // rc2.54: auto-resolve when AI provided a verifiable source URL (per user's
          //   conflict policy choice from the brief). AI version wins; original logged.
          const hasSourceUrl = Array.isArray(p.sources) && p.sources.some(s => s && /^https?:\/\//.test(s.url || ''));
          if (hasSourceUrl) {
            autoResolvedConflicts.push({ doc: doc.path, entry: p, existing: full, conflicts, resolution: 'ai_wins_via_source_url' });
          } else {
            conflictEntries.push({ doc: doc.path, entry: p, existing: full, conflicts });
          }
        }
      }
    }
  }

  // ─── Report ─────────────────────────────────────────────────────────
  console.log('\n' + bold('SUMMARY'));
  console.log(`  Total entries processed : ${allEntries}`);
  console.log(`  Skipped (non-product)   : ${allSkips.length}`);
  console.log(`  Validation errors       : ${allErrors.length} (${fatal0(allErrors.length)})`);
  console.log(`  Validation warnings     : ${allWarnings.length}`);
  console.log(`  ${green('NEW')}                     : ${newEntries.length}`);
  console.log(`  ${dim('IDENTICAL (skip)')}        : ${identicalEntries.length}`);
  console.log(`  ${green('AUTO-RESOLVED')}           : ${autoResolvedConflicts.length} (AI source URL present)`);
  console.log(`  ${yellow('CONFLICT (needs review)')}  : ${conflictEntries.length}`);

  if (allErrors.length > 0) {
    console.log('\n' + bold(red('Validation errors:')));
    for (const e of allErrors.slice(0, 30)) console.log(red(`  ✗ ${e.where}: ${e.msg}`));
    if (allErrors.length > 30) console.log(red(`  ... and ${allErrors.length - 30} more`));
  }

  // ─── Write outputs ──────────────────────────────────────────────────
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const reportPath = path.join(OUTPUT_DIR, `assimilation-report-${timestamp}.json`);
  const conflictsPath = path.join(OUTPUT_DIR, `conflicts-${timestamp}.json`);
  const newEntriesPath = path.join(OUTPUT_DIR, `new-entries-${timestamp}.json`);
  const corpusAddPath = path.join(OUTPUT_DIR, `corpus-additions-${timestamp}.txt`);
  const seedPatchPath = path.join(OUTPUT_DIR, `seed-repository-patch-${timestamp}.js`);

  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp, totalEntries: allEntries, errors: allErrors, warnings: allWarnings, skips: allSkips,
    counts: { new: newEntries.length, identical: identicalEntries.length, conflicts: conflictEntries.length, autoResolved: autoResolvedConflicts.length, skipped: allSkips.length },
    sourceFiles: docs.map(d => d.path)
  }, null, 2));
  // rc2.54: auto-resolved conflicts get their own file so we can audit which were
  //   overridden silently. Same shape as conflicts file.
  if (autoResolvedConflicts.length > 0) {
    const autoPath = path.join(OUTPUT_DIR, `auto-resolved-${timestamp}.json`);
    fs.writeFileSync(autoPath, JSON.stringify(autoResolvedConflicts.map((c, i) => ({
      number: i + 1,
      product: c.entry.canonicalName,
      insurer: c.entry.insurer,
      conflicts: c.conflicts.map(cf => ({ field: cf.field, was: cf.existing, nowIs: cf.incoming })),
      sourceUrl: c.entry.sources?.[0]?.url || '',
      confidence: c.entry.confidence || '',
      resolution: c.resolution
    })), null, 2));
  }

  if (conflictEntries.length > 0) {
    fs.writeFileSync(conflictsPath, JSON.stringify(conflictEntries.map((c, i) => ({
      number: i + 1,
      product: c.entry.canonicalName,
      insurer: c.entry.insurer,
      conflicts: c.conflicts.map(cf => ({
        field: cf.field,
        currentlyInCanonical: cf.existing,
        proposedByAI: cf.incoming
      })),
      aiSourceUrl: c.entry.sources?.[0]?.url || '',
      aiConfidence: c.entry.confidence || '',
      decision: 'pending — ai_wins | keep_existing | manual'
    })), null, 2));
  }

  if (newEntries.length > 0) {
    fs.writeFileSync(newEntriesPath, JSON.stringify(newEntries.map(n => n.entry), null, 2));

    // Corpus additions — append-able to a new text file in the SG reference corpus.
    const corpusLines = ['# Auto-generated from deep-research run ' + timestamp, '# Format: Name | Aliases | Sub-type/Notes\n'];
    for (const n of newEntries) {
      const e = n.entry;
      const aliases = (e.aliases || []).join(' / ') || '';
      const note = `${e.category}/${e.subType}${e.status && e.status !== 'active' ? ' [' + e.status + ']' : ''}`;
      corpusLines.push(`${(e.insurer + ' — ').padEnd(20)}${e.canonicalName.padEnd(60)} | ${aliases.padEnd(40)} | ${note}`);
    }
    fs.writeFileSync(corpusAddPath, corpusLines.join('\n'));

    // SEED_REPOSITORY patch — only for high-confidence entries with rich notes.
    const seedAdds = newEntries.filter(n => n.entry.confidence === 'high' && (n.entry.notes || '').length >= 80);
    if (seedAdds.length > 0) {
      const seedLines = [
        '  // ─── ADDED ' + timestamp + ' (deep-research) ───',
        ...seedAdds.map(n => {
          const e = n.entry;
          const id = 'repo-' + (canonicalInsurer(e.insurer).toLowerCase().replace(/[^a-z0-9]+/g, '-')) + '-' + compact(e.canonicalName).slice(0, 24);
          const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          return `  {id:'${id}',insurer:'${esc(canonicalInsurer(e.insurer))}',productName:'${esc(e.canonicalName)}',productCode:'${esc(e.productCode || '')}',category:'${esc(e.category)}',subType:'${esc(e.subType)}',currency:'${esc(e.currency || 'SGD')}',notes:'${esc(e.notes)}',editHistory:[]},`;
        })
      ];
      fs.writeFileSync(seedPatchPath, seedLines.join('\n'));
    }
  }

  console.log('\n' + bold('Outputs written to ' + OUTPUT_DIR));
  console.log(dim('  report             : ' + path.relative(ROOT, reportPath)));
  if (conflictEntries.length > 0) console.log(dim('  conflicts          : ' + path.relative(ROOT, conflictsPath)));
  if (newEntries.length > 0) {
    console.log(dim('  new entries (full) : ' + path.relative(ROOT, newEntriesPath)));
    console.log(dim('  corpus additions   : ' + path.relative(ROOT, corpusAddPath)));
    const seedAdds = newEntries.filter(n => n.entry.confidence === 'high' && (n.entry.notes || '').length >= 80);
    if (seedAdds.length > 0) console.log(dim('  SEED patch         : ' + path.relative(ROOT, seedPatchPath)));
  }

  if (APPLY) {
    if (allErrors.length > 0) {
      console.error(red('\nRefusing to --apply with validation errors. Fix errors first.'));
      process.exit(1);
    }
    if (conflictEntries.length > 0) {
      console.warn(yellow('\n--apply: ' + conflictEntries.length + ' conflicts NOT auto-applied. Open conflicts file and decide manually.'));
    }
    // Apply: append corpus additions to a new file in CORPUS_DIR.
    if (newEntries.length > 0 && fs.existsSync(CORPUS_DIR)) {
      const corpusTargetPath = path.join(CORPUS_DIR, '99_research_' + new Date().toISOString().slice(0, 10).replace(/-/g, '_') + '.txt');
      fs.writeFileSync(corpusTargetPath, fs.readFileSync(corpusAddPath, 'utf8'));
      console.log(green('  ✓ Wrote corpus additions to ' + corpusTargetPath));
      console.log(dim('    Run `node tools/build-singapore-product-knowledge.mjs` next to regenerate singapore-product-knowledge.js'));
    }
    console.log(yellow('  ⚠ SEED_REPOSITORY patch is in ' + seedPatchPath + ' — paste manually after review.'));
  }

  process.exit(allErrors.length > 0 ? 1 : 0);
}

function fatal0(n) { return n === 0 ? green('OK') : red(n + ' failures'); }

// ─── Self-test ───────────────────────────────────────────────────────────
function selftest() {
  console.log(dim('Running self-test...'));
  const sample = {
    metadata: { phase: 'selftest', researcher: 'pipeline-test', generatedAt: new Date().toISOString(), sourcesConsulted: [] },
    products: [
      // Valid new entry
      { canonicalName: 'TestNewProduct', insurer: 'AIA', distributor: '', productCode: 'TNP1', category: 'protection', subType: 'Term Life', currency: 'SGD', aliases: ['TNP'], status: 'active', notes: 'A long enough fictional product description for self-test. Covers death + TI. Non-par level term, 30-year maximum. Not real, do not commit. SDIC protected.', sources: [{ url: 'https://example.com/tnp', checkedAt: '2026-05-17' }], confidence: 'high' },
      // Missing required field
      { canonicalName: '', insurer: 'AIA', category: 'protection', subType: 'Term Life', aliases: [], sources: [{ url: 'https://example.com' }] },
      // Bad subType — not canonical in any category, can't be auto-corrected
      { canonicalName: 'BadSubtype', insurer: 'AIA', category: 'investment', subType: 'NonsenseSubTypeNobodyHasEver', aliases: [], sources: [{ url: 'https://example.com' }] },
      // Unknown insurer
      { canonicalName: 'UnknownInsurer', insurer: 'NotAnInsurer', category: 'protection', subType: 'Term Life', aliases: [], sources: [{ url: 'https://example.com' }] },
    ]
  };
  const tmpPath = path.join(STAGING_DIR, '_selftest.json');
  fs.mkdirSync(STAGING_DIR, { recursive: true });
  fs.writeFileSync(tmpPath, JSON.stringify(sample, null, 2));
  console.log(dim('Wrote sample to ' + tmpPath));
  // Reset CLI args programmatically — not perfect but works for this internal harness.
  process.argv = ['node', 'assimilate-catalogue.mjs', tmpPath];
  // Validate by direct call:
  const errors = [];
  for (const [i, p] of sample.products.entries()) errors.push(...validateEntry(p, i, tmpPath));
  const fatal = errors.filter(e => e.severity !== 'warn');
  const warn = errors.filter(e => e.severity === 'warn');
  console.log(dim(`Validation: ${fatal.length} fatal, ${warn.length} warn (expected: ≥2 fatal, ≥1 warn)`));
  for (const e of errors) console.log(dim(`  ${e.severity === 'warn' ? '⚠' : '✗'} ${e.where}: ${e.msg}`));
  if (fatal.length < 2 || warn.length < 1) { console.error(red('Self-test FAILED — expected ≥2 fatal + ≥1 warn')); process.exit(1); }
  // Also test canonicalInsurer aliases
  const aliasCheck = canonicalInsurer('Great Eastern Life');
  if (aliasCheck !== 'Great Eastern') { console.error(red('Self-test FAILED — canonicalInsurer alias map broken: ' + aliasCheck)); process.exit(1); }
  // Also test that a valid entry produces no fatal errors
  const validErrs = validateEntry(sample.products[0], 0, tmpPath).filter(e => e.severity !== 'warn');
  if (validErrs.length > 0) { console.error(red('Self-test FAILED — valid entry produced fatal errors: ' + JSON.stringify(validErrs))); process.exit(1); }
  console.log(green('Self-test PASS — validator catches malformed entries, canonicalInsurer maps aliases, valid entries pass clean.'));
  // Cleanup
  fs.unlinkSync(tmpPath);
  process.exit(0);
}

run();
