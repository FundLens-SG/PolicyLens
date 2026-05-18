// PolicyLens corpus verification against PPF Register PDFs.
//
// PURPOSE
//   For every entry in singapore-product-knowledge.js, attempt to match against the
//   insurer's official PPF Register (extracted to text in tools/ppf-registers/).
//   Produces a verification report classifying each entry as:
//     • verified  — found in register (with match strategy + line evidence)
//     • not-found — searched but not in register (potentially fabricated)
//     • no-register — no register available for this insurer (cannot verify)
//
// USAGE
//   node tools/verify-against-registers.mjs                    # full corpus
//   node tools/verify-against-registers.mjs --riders-only      # only entries with "rider" in name
//   node tools/verify-against-registers.mjs --insurer "Income Insurance"  # one insurer
//
// MATCH STRATEGIES (in priority order — first hit wins, reported as `strategy`)
//   1. exact         — full normalised name appears as substring of any register line
//   2. no-prefix     — name with insurer prefix stripped
//   3. no-rider      — name with trailing " rider" suffix dropped
//   4. no-pre-no-rdr — both prefix + rider suffix stripped
//   5. token-set     — ≥80% of significant-word tokens appear in same line
//   6. token-set-loose — ≥60% with looser stopword set (high false-positive risk)
//
// SIGNIFICANT WORDS: any word with length > 3 EXCEPT a curated stopword list of
//   generic insurance terms ('rider','plan','plus','life','great','insurance', etc.)
//   that would otherwise cause meaningless matches.
//
// EXIT CODES
//   0 = success (report written)
//   2 = setup error

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registersDir = path.join(rootDir, 'tools/ppf-registers');

// ─── Args ───
const args = process.argv.slice(2);
const ridersOnly = args.includes('--riders-only');
const insurerArg = (() => {
  const i = args.indexOf('--insurer');
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
})();

// ─── Map our corpus insurer names → register filenames ───
const insurerToRegister = {
  'AIA':                     'aia.txt',
  'Great Eastern':           'ge.txt',
  'Manulife':                'manulife.txt',
  'Prudential':              'prudential.txt',
  'Singlife':                'singlife.txt',
  'NTUC Income':             'income.txt',
  'Income Insurance':        'income.txt',  // Income rebranded; same insurer
  'HSBC Life':               'hsbc-life.txt',
  'FWD':                     'fwd.txt',
  'Tokio Marine':            'tokio-marine.txt',
  'China Life':              'china-life.txt',
  'China Life (Singapore)':  'china-life.txt',
  'China Taiping':           'china-taiping.txt',
  'Etiqa':                   'etiqa.txt',
  'Raffles Health':          'raffles-health.txt',
  'Raffles Health Insurance':'raffles-health.txt',
  'Liberty':                 'liberty.txt',
  'Liberty Insurance':       'liberty.txt',
  'MSIG':                    'msig.txt',
  'Sompo':                   'sompo.txt',
  'HL Assurance':            'hl-assurance.txt',
};

// ─── Load available registers ───
const registers = {};
for (const f of fs.readdirSync(registersDir)) {
  if (!f.endsWith('.txt')) continue;
  registers[f] = fs.readFileSync(path.join(registersDir, f), 'utf8').toLowerCase();
}
console.log('Available registers: ' + Object.keys(registers).sort().join(', '));

// ─── Helpers ───
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[–—]/g, '-')       // en/em-dash → hyphen
    .replace(/[‘’]/g, "'")        // smart quotes
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9' -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compact(s) {
  return norm(s).replace(/[^a-z0-9]/g, '');
}

// Stopwords for token-set matching — these don't contribute to a meaningful match
const STOPWORDS = new Set([
  'rider','plan','plus','life','great','insurance','aia','manulife','prudential',
  'singlife','income','hsbc','fwd','tokio','marine','etiqa','raffles','china',
  'taiping','liberty','sompo','msig','allianz','generali','assurance','policy',
  'benefit','benefits','protection','protector','protect','cover','coverage',
  'limited','company','singapore','sg','pte','ltd','the','of','and','or','with',
  'for','at','from','to','an','ii','iii','iv','v','vi','vii','i','ltd','co'
]);

function tokens(s, opts = {}) {
  const min = opts.minLen || 3;
  return norm(s).split(' ').filter(w => w.length > min && !STOPWORDS.has(w));
}

// Insurer-prefix patterns
const prefixPatterns = {
  'Great Eastern': [/^great\s+eastern\s+/i, /^great\s+/i, /^ge\s+/i],
  'AIA':           [/^aia\s+/i],
  'Manulife':      [/^manulife\s+/i, /^manu\s+/i],
  'Prudential':    [/^prudential\s+/i, /^pru\s+/i],
  'Singlife':      [/^singlife\s+/i, /^aviva\s+/i, /^my\s+/i],
  'NTUC Income':   [/^ntuc\s+income\s+/i, /^income\s+insurance\s+/i, /^income\s+/i, /^ntuc\s+/i],
  'Income Insurance': [/^ntuc\s+income\s+/i, /^income\s+insurance\s+/i, /^income\s+/i, /^ntuc\s+/i],
  'HSBC Life':     [/^hsbc\s+life\s+/i, /^hsbc\s+/i],
  'FWD':           [/^fwd\s+/i],
  'Tokio Marine':  [/^tokio\s+marine\s+/i, /^tm\s+/i],
  'China Life':    [/^china\s+life\s*\(?(?:singapore)?\)?\s+/i, /^china\s+life\s+/i],
  'China Life (Singapore)': [/^china\s+life\s*\(?(?:singapore)?\)?\s+/i, /^china\s+life\s+/i],
  'China Taiping': [/^china\s+taiping\s+/i, /^taiping\s+/i],
  'Etiqa':         [/^etiqa\s+/i, /^tiq\s+/i],
  'Raffles Health':[/^raffles\s+health\s+/i, /^raffles\s+/i],
  'Raffles Health Insurance':[/^raffles\s+health\s+/i, /^raffles\s+/i],
  'Liberty':       [/^liberty\s+insurance\s+/i, /^liberty\s+/i],
  'Liberty Insurance': [/^liberty\s+insurance\s+/i, /^liberty\s+/i],
};

function stripPrefix(productName, insurer) {
  let s = productName;
  for (const re of (prefixPatterns[insurer] || [])) s = s.replace(re, '');
  return s.trim();
}

// Build register-line index once per register (lowercased, whitespace-collapsed)
const linesCache = {};
function getRegisterLines(registerFile) {
  if (linesCache[registerFile]) return linesCache[registerFile];
  const reg = registers[registerFile];
  if (!reg) return null;
  const lines = reg.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  linesCache[registerFile] = lines;
  return lines;
}

// ─── Match strategies ───
function tryMatch(productName, insurer, lines) {
  const full = productName;
  const stripped = stripPrefix(full, insurer);
  const fullNoRider = full.replace(/\s+rider\s*$/i, '').trim();
  const strippedNoRider = stripped.replace(/\s+rider\s*$/i, '').trim();

  // Strategy 1-4: substring of normalised name
  const candidates = [
    { tag: 'exact', q: full },
    { tag: 'no-prefix', q: stripped },
    { tag: 'no-rider', q: fullNoRider },
    { tag: 'no-pre-no-rdr', q: strippedNoRider },
  ];

  for (const c of candidates) {
    const nq = norm(c.q);
    if (!nq || nq.length < 4) continue;
    for (const line of lines) {
      if (norm(line).includes(nq)) return { strategy: c.tag, line, query: c.q };
    }
  }

  // Strategy 4.5: progressive prefix reduction. Many corpus entries prefix the
  // parent-plan family in front of the actual rider, e.g.:
  //   "Income Enhanced IncomeShield Classic Care Rider" → register has just
  //   "Classic Care Rider". Lop leading words one by one and check.
  const words = stripped.split(/\s+/).filter(Boolean);
  if (words.length >= 3) {
    for (let lop = 1; lop < words.length - 1; lop++) {
      const sub = words.slice(lop).join(' ');
      const nq = norm(sub);
      if (nq.length < 5) break;
      for (const line of lines) {
        if (norm(line).includes(nq)) {
          return { strategy: 'progressive-prefix-' + lop, line, query: sub };
        }
      }
    }
  }

  // Strategy 4.7: compact-form matching. Some corpus entries use CamelCase /
  // no-space forms ("ManuEduFirst") while the register uses spaced form
  // ("ManuEdu First"). Strip all non-alphanum and match.
  const compactProduct = compact(full);
  const compactStripped = compact(stripped);
  if (compactProduct.length >= 6) {
    for (const line of lines) {
      const c = compact(line);
      if (c.includes(compactProduct)) {
        return { strategy: 'compact-full', line, query: full };
      }
      if (compactStripped !== compactProduct && c.includes(compactStripped)) {
        return { strategy: 'compact-no-prefix', line, query: stripped };
      }
    }
  }

  // Strategy 4.8: progressive prefix reduction in COMPACT form. Combines 4.5+4.7.
  if (words.length >= 3) {
    for (let lop = 1; lop < words.length - 1; lop++) {
      const sub = words.slice(lop).join(' ');
      const cq = compact(sub);
      if (cq.length < 5) break;
      for (const line of lines) {
        if (compact(line).includes(cq)) {
          return { strategy: 'compact-progressive-' + lop, line, query: sub };
        }
      }
    }
  }

  // Strategy 5: token-set overlap (≥80% of significant tokens in same line)
  const productTokens = tokens(stripped);
  if (productTokens.length >= 2) {
    for (const line of lines) {
      const lineTokens = tokens(line);
      if (lineTokens.length === 0) continue;
      const matched = productTokens.filter(t => lineTokens.includes(t));
      const ratio = matched.length / productTokens.length;
      if (ratio >= 0.8) {
        return { strategy: 'token-set', line, query: stripped, ratio: ratio.toFixed(2), matched: matched.length + '/' + productTokens.length };
      }
    }
  }

  // Strategy 6: looser token-set (≥60%) — only if at least 3 product tokens to avoid trivial matches
  if (productTokens.length >= 3) {
    for (const line of lines) {
      const lineTokens = tokens(line);
      if (lineTokens.length === 0) continue;
      const matched = productTokens.filter(t => lineTokens.includes(t));
      const ratio = matched.length / productTokens.length;
      if (ratio >= 0.6) {
        return { strategy: 'token-set-loose', line, query: stripped, ratio: ratio.toFixed(2), matched: matched.length + '/' + productTokens.length };
      }
    }
  }

  return null;
}

// ─── Load corpus ───
const sgPath = path.join(rootDir, 'singapore-product-knowledge.js');
const sg = fs.readFileSync(sgPath, 'utf8');
const m = sg.match(/PRODUCTS\s*=\s*\[(.*?)\];/s);
if (!m) { console.error('Could not parse PRODUCTS array'); process.exit(2); }
const arr = eval('[' + m[1] + ']');
console.log('Loaded corpus: ' + arr.length + ' entries');

// ─── Filter ───
let toCheck = arr.map(r => ({ insurer: r[0], name: r[1], category: r[2], subType: r[3], aliases: r[4], source: r[5] }));
if (ridersOnly) toCheck = toCheck.filter(e => /\brider\b/i.test(e.name));
if (insurerArg) toCheck = toCheck.filter(e => e.insurer === insurerArg);
console.log('Entries to verify: ' + toCheck.length + (ridersOnly ? ' (riders only)' : '') + (insurerArg ? ' (insurer: ' + insurerArg + ')' : ''));

// ─── Verify ───
const verified = [];
const notFound = [];
const noRegister = [];

for (const e of toCheck) {
  const regFile = insurerToRegister[e.insurer];
  const lines = regFile ? getRegisterLines(regFile) : null;
  if (!lines) { noRegister.push({ ...e, reason: regFile ? 'register file missing' : 'no register mapping' }); continue; }
  const match = tryMatch(e.name, e.insurer, lines);
  if (match) verified.push({ ...e, ...match });
  else notFound.push(e);
}

// ─── Report ───
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
const outDir = path.join(rootDir, 'tools/verification-output');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const summary = {
  timestamp: ts,
  totalEntriesChecked: toCheck.length,
  verified: verified.length,
  notFound: notFound.length,
  noRegister: noRegister.length,
  ridersOnly,
  insurerArg,
  registersAvailable: Object.keys(registers).sort(),
};

const byInsurerSummary = {};
for (const e of toCheck) {
  const ins = e.insurer;
  if (!byInsurerSummary[ins]) byInsurerSummary[ins] = { total: 0, verified: 0, notFound: 0, noRegister: 0 };
  byInsurerSummary[ins].total++;
}
for (const v of verified) byInsurerSummary[v.insurer].verified++;
for (const n of notFound) byInsurerSummary[n.insurer].notFound++;
for (const n of noRegister) byInsurerSummary[n.insurer].noRegister++;
summary.byInsurer = byInsurerSummary;

const strategiesUsed = {};
for (const v of verified) strategiesUsed[v.strategy] = (strategiesUsed[v.strategy] || 0) + 1;
summary.strategiesUsed = strategiesUsed;

fs.writeFileSync(path.join(outDir, 'verification-summary-' + ts + '.json'), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(outDir, 'verified-' + ts + '.json'), JSON.stringify(verified, null, 2));
fs.writeFileSync(path.join(outDir, 'not-found-' + ts + '.json'), JSON.stringify(notFound, null, 2));
fs.writeFileSync(path.join(outDir, 'no-register-' + ts + '.json'), JSON.stringify(noRegister, null, 2));

console.log('\n═══ VERIFICATION SUMMARY ═══');
console.log('  Verified            : ' + verified.length);
console.log('  Not found in reg    : ' + notFound.length);
console.log('  No register avail   : ' + noRegister.length);

console.log('\nMatch strategies used:');
for (const [s, n] of Object.entries(strategiesUsed).sort((a, b) => b[1] - a[1])) {
  console.log('  ' + String(n).padStart(5) + '  ' + s);
}

console.log('\nBy insurer:');
const sorted = Object.entries(byInsurerSummary).sort((a, b) => b[1].total - a[1].total);
for (const [ins, s] of sorted) {
  const status = s.noRegister === s.total ? 'NO REG' : (s.verified === s.total ? 'all match' : s.notFound + ' suspect');
  console.log('  ' + ins.padEnd(40) + ' total=' + String(s.total).padStart(4) + '  verified=' + String(s.verified).padStart(4) + '  notFound=' + String(s.notFound).padStart(4) + '  noReg=' + String(s.noRegister).padStart(4) + '   [' + status + ']');
}

console.log('\nReports written to tools/verification-output/:');
console.log('  verification-summary-' + ts + '.json');
console.log('  verified-' + ts + '.json');
console.log('  not-found-' + ts + '.json');
console.log('  no-register-' + ts + '.json');
