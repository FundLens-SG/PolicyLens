import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// rc2.57: auto-detect the reference corpus location instead of pinning the user's old
//   workspace path. Try a few common locations; fail fast with a clear message if none
//   resolve so it's obvious how to fix.
const REF_DIR_CANDIDATES = [
  'C:\\CKG Creations\\PolicyLens_Singapore_Reference',
  'C:\\Creations\\PolicyLens_Singapore_Reference',
  path.join(repoRoot, '..', 'PolicyLens_Singapore_Reference'),
];
const refDir = REF_DIR_CANDIDATES.find(p => fs.existsSync(p)) || REF_DIR_CANDIDATES[0];
if (!fs.existsSync(refDir)) {
  console.error('Reference corpus directory not found. Tried:\n  ' + REF_DIR_CANDIDATES.join('\n  '));
  process.exit(2);
}
const policyLensOut = path.join(repoRoot, 'singapore-product-knowledge.js');
// Also auto-detect the ckgtools mirror location.
const CRM_OUT_CANDIDATES = [
  'C:\\CKG Creations\\ckgtools\\public\\tools\\_policy-product-knowledge.js',
  'C:\\Creations\\ckgtools\\public\\tools\\_policy-product-knowledge.js',
];
const crmLensOut = CRM_OUT_CANDIDATES.find(p => fs.existsSync(path.dirname(p))) || CRM_OUT_CANDIDATES[0];

const VERSION = 'sg-ref-2026-05-15-r2';

const SOURCE_FILES = [
  '01_flat_policy_name_corpus.txt',
  'ge_aia_findings.txt',
  'pru_income_findings.txt',
  'singlife_manulife_hsbc_findings.txt',
  'smaller_insurers_findings.txt',
  'shield_rider_anchors.txt',
  'cpf_and_general_insurance.txt'
];

const INSURER_ALIASES = new Map([
  ['aia singapore', 'AIA'],
  ['aia', 'AIA'],
  ['great eastern life', 'Great Eastern'],
  ['great eastern', 'Great Eastern'],
  ['ge', 'Great Eastern'],
  ['prudential assurance co sg', 'Prudential'],
  ['prudential', 'Prudential'],
  ['pru', 'Prudential'],
  ['income insurance limited', 'NTUC Income'],
  ['income insurance', 'NTUC Income'],
  ['ntuc income', 'NTUC Income'],
  ['ntuc income insurance', 'NTUC Income'],
  ['singlife', 'Singlife'],
  ['singapore life', 'Singlife'],
  ['aviva', 'Singlife'],
  ['aviva singapore', 'Singlife'],
  ['hsbc life singapore', 'HSBC Life'],
  ['hsbc life', 'HSBC Life'],
  ['axa', 'HSBC Life'],
  ['axa insurance', 'HSBC Life'],
  ['manulife singapore', 'Manulife'],
  ['manulife', 'Manulife'],
  ['tokio marine life singapore', 'Tokio Marine'],
  ['tokio marine', 'Tokio Marine'],
  ['tm', 'Tokio Marine'],
  ['china life singapore', 'China Life'],
  ['china life', 'China Life'],
  ['china taiping singapore', 'China Taiping'],
  ['china taiping', 'China Taiping'],
  ['etiqa insurance singapore', 'Etiqa'],
  ['etiqa', 'Etiqa'],
  ['tiq by etiqa', 'Etiqa'],
  ['tiq', 'Etiqa'],
  ['fwd singapore', 'FWD'],
  ['fwd', 'FWD'],
  ['raffles health insurance', 'Raffles Health'],
  ['raffles', 'Raffles Health'],
  ['cpf board', 'CPF Board'],
  ['cpf', 'CPF Board'],
  ['aig singapore', 'AIG'],
  ['aig', 'AIG'],
  ['msig singapore', 'MSIG'],
  ['msig', 'MSIG'],
  ['allianz singapore', 'Allianz'],
  ['allianz', 'Allianz'],
  ['liberty insurance', 'Liberty'],
  ['liberty', 'Liberty'],
  ['sompo singapore', 'Sompo'],
  ['sompo', 'Sompo'],
  ['tugu insurance', 'Tugu'],
  ['tugu', 'Tugu'],
  ['chubb insurance singapore', 'Chubb'],
  ['chubb', 'Chubb'],
  ['hl assurance', 'HL Assurance'],
  ['qbe', 'QBE'],
  ['ecics', 'ECICS']
]);

const INSURER_RULES = [
  [/^aia\b|^prime\s+secure\b|^prime\s+life\b/i, 'AIA'],
  [/^great\b|great\s+eastern|^supremehealth\b|^prestige\s+life\b|^maxgrowth\b/i, 'Great Eastern'],
  [/^pru|prudential/i, 'Prudential'],
  [/^enhanced\s+incomeshield\b|^incomeshield\b|^income\b|^ntuc\b|^gro\b|^vivo\b|^star\s|^astra\b|^revosave\b|^dread\s+disease\b|^corporate\s+cover\b/i, 'NTUC Income'],
  [/^singlife\b|^aviva\b|^myshield\b|^myhealthplus\b|^myprotector\b|^mymultipay\b|^mycoreci\b|^mylongtermcare\b|^myretirement\b|^mysavings\b|^mywholelife\b|^dash\b/i, 'Singlife'],
  [/^hsbc\s+life\b|^hsbc\b|^axa\b|^early\s+payout\b|^future\s+protector\b|^max\s+vitality\b/i, 'HSBC Life'],
  [/^manulife\b|^manu|^investready\b|^lifeready\b|^completeready\b|^readyprotect\b|^readybuilder\b|^readypayout\b|^readywealth\b|^retireready\b|^protectready\b|^goal\s+\d{4}\b/i, 'Manulife'],
  [/^tokio\s+marine\b|^tm\b|^#go/i, 'Tokio Marine'],
  [/^china\s+life\b/i, 'China Life'],
  [/^china\s+taiping\b|^i-[a-z]/i, 'China Taiping'],
  [/^etiqa\b|^tiq\b|^eprotect\b|^elady\b|^enrich\b|^maternity\s+360\b|^cancer\s+insurance\b/i, 'Etiqa'],
  [/^fwd\b/i, 'FWD'],
  [/^raffles\s+shield\b/i, 'Raffles Health'],
  [/^medishield\b|^careshield\b|^eldershield\b|^dependants'? protection scheme\b|^home protection scheme\b|^cpf\s+/i, 'CPF Board'],
  [/^aig\b/i, 'AIG'],
  [/^msig\b/i, 'MSIG'],
  [/^allianz\b/i, 'Allianz'],
  [/^liberty\b/i, 'Liberty'],
  [/^sompo\b/i, 'Sompo'],
  [/^tugu\b/i, 'Tugu'],
  [/^chubb\b/i, 'Chubb'],
  [/^hl\s+assurance\b/i, 'HL Assurance'],
  [/^qbe\b/i, 'QBE'],
  [/^ecics\b/i, 'ECICS']
];

const REJECT_LINE_PATTERNS = [
  /^=+$/,
  /^-+$/,
  /^\+[-+]+\+$/,
  /^flat corpus/i,
  /^auto-extracted/i,
  /^companion to/i,
  /^de-duplicated/i,
  /^each line/i,
  /^includes current/i,
  /^coverage:/i,
  /^status:/i,
  /^purpose:/i,
  /^compiled:/i,
  /^source:/i,
  /^part\s+\d/i,
  /^section\s+\d/i,
  /^contents\b/i,
  /^do not treat\b/i,
  /^never underwriters\b/i,
  /^distribution channels/i,
  /^general insurance-only/i,
  /^life \/ health insurers/i,
  /^regex\b/i,
  /^example\b/i,
  /^false[- ]positive/i,
  /^policy number/i,
  /^structural/i,
  /^grouping/i,
  /^implementation/i,
  /^\|?\s*product\s*\|/i,
  /^\|?\s*legacy name/i,
  /^\|?\s*insurer/i,
  /^\|?\s*base/i,
  /^\|?\s*rider/i,
  /^\d+\.\s+[A-Z][A-Z\s/().-]+$/,
  /^all caps\b/i,
  /^if the parser/i,
  /^the products below/i,
  /^these names appear/i,
  /^use as a literal/i,
  /^customer documents/i,
  /^one night research/i
];

const CORPORATE_ONLY_PATTERNS = [
  /\bfinancial advisers\b/i,
  /\baiafa\b/i,
  /\bltd\b/i,
  /\buk parent\b/i,
  /\bsingapore \(.*\)$/i,
  /\bhotline\b/i,
  /\bcustomer service\b/i,
  /\bclaims\b/i,
  /\bportal\b/i,
  /\bapp\b/i,
  /\bwebsite\b/i,
  /\bunderwritten by\b/i,
  /\bco-operative\b/i,
  /\bcorporatised\b/i,
  /\bbranch\b/i,
  /\bsubsidiary\b/i,
  /\bdistribution\b/i,
  /\bchannel\b/i
];

function read(file) {
  return fs.readFileSync(path.join(refDir, file), 'utf8');
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}#]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalInsurer(value) {
  const key = normalizeText(value);
  if (!key) return '';
  return INSURER_ALIASES.get(key) || value;
}

function inferInsurer(name, context = '') {
  const combined = [name, context].filter(Boolean).join(' ');
  for (const [re, insurer] of INSURER_RULES) {
    if (re.test(combined)) return insurer;
  }
  const contextKey = normalizeText(context);
  for (const [alias, insurer] of INSURER_ALIASES.entries()) {
    if (contextKey.includes(alias)) return insurer;
  }
  return '';
}

function cleanName(line) {
  return String(line || '')
    .replace(/^\s*[-*]\s*/, '')
    .replace(/^\s*\d+\.\s*/, '')
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isRejectLine(line) {
  const s = cleanName(line);
  if (!s || s.length < 3 || s.length > 120) return true;
  if (REJECT_LINE_PATTERNS.some(re => re.test(s))) return true;
  if (CORPORATE_ONLY_PATTERNS.some(re => re.test(s))) return true;
  if (/^[A-Z\s/()&.-]{18,}$/.test(s) && !/\b(AIA|GREAT|PRU|HSBC|AXA|FWD|TM|CPF|MSIG|AIG|Tiq|ePROTECT)\b/i.test(s)) return true;
  if (/^(AIG Singapore|Aviva Ltd|HSBC Life Singapore|Income Insurance|Manulife Singapore|Prudential Singapore|Singlife|Great Eastern Life)$/i.test(s)) return true;
  return false;
}

function splitAliases(value) {
  if (!value) return [];
  return String(value)
    .split(/\s*(?:\/|,|;|\bor\b|\baka\b)\s*/i)
    .map(cleanName)
    .filter(Boolean)
    .filter(a => a.length >= 3 && a.length <= 90)
    .filter(a => !/^(ii|iii|iv|v|vi|plan|rider|plus|lite|care)$/i.test(a));
}

function expandSlashProductNames(value) {
  const original = cleanName(value);
  if (!original.includes('/')) return [original];
  const parts = original.split(/\s*\/\s*/).map(cleanName).filter(Boolean);
  if (parts.length <= 1) return [original];
  const first = parts[0];
  const prefixMatch = first.match(/^(.+?)\s+(?:Plan|Option|Plus|Premier|Preferred|Standard|A|B|C)\b/i);
  const prefix = prefixMatch ? prefixMatch[1] : first.split(/\s+/).slice(0, Math.max(1, first.split(/\s+/).length - 2)).join(' ');
  const expanded = new Set([original, first]);
  for (const part of parts.slice(1)) {
    if (/^(AIA|Aviva|AXA|GREAT|HSBC|Income|Manulife|PRU|Singlife|TM|Tokio|FWD|Etiqa|Tiq|Raffles|China)\b/i.test(part)) {
      expanded.add(part);
    } else if (/^(Plan|Option|Standard|Premier|Preferred|Plus|A|B|C|B Lite|Lite|Care|CoPay)\b/i.test(part) && prefix) {
      expanded.add((prefix + ' ' + part).replace(/\s+/g, ' ').trim());
    } else {
      expanded.add(part);
    }
  }
  return [...expanded].filter(Boolean);
}

function inferCategory(name, categoryHint = '') {
  const t = normalizeText([name, categoryHint].join(' '));
  let category = '';
  let subType = '';

  if (/\bmedishield life\b|\bcareshield life\b|\beldershield\b|\bdependants protection scheme\b|\bhome protection scheme\b/.test(t)) {
    category = 'health';
    subType = 'National Scheme';
  }
  if (/\bmedishield\b|\bcareshield\b|\beldershield\b|\bshield\b|\bmyshield\b|\bhealthshield\b|\bsupremehealth\b|\bincomeshield\b|\bhospital\b|\bmedical\b|\bhealth\b|\bpruextra\b|\btotalcare\b|\bvitalhealth\b|\bvitalcare\b|\bbooster\b|\benhanced care\b|\bhealth plus\b|\bcare rider\b/.test(t)) {
    category = 'health';
    subType = subType || (/\brider\b|\btotalcare\b|\bvitalhealth\b|\bvitalcare\b|\bbooster\b|\bextra\b|\bhealth plus\b|\benhanced care\b|\bcare rider\b|\bcopay\b|\bco pay\b|\bdeluxe care\b|\bclassic care\b|\bkey rider\b|\bchoice rider\b/.test(t) ? 'Shield Rider' : 'Integrated Shield Plan');
  }
  if (/\bmaternity\b|\bmum\b|\bbaby protect\b|\bpregnan/.test(t)) {
    category = 'maternity';
    subType = 'Maternity';
  }
  if (/\bpersonal accident\b|\baccident\b|\bsolitaire pa\b|\bpa\b|\btravel\b|\bmotor\b|\bhome\b|\bmaid\b|\bcyber\b|\bpet\b|\bbicycle\b/.test(t)) {
    category = category || 'protection';
    subType = subType || (/\btravel|motor|home|maid|cyber|pet|bicycle\b/.test(t) ? 'General Insurance' : 'Personal Accident');
  }
  if (/\bcritical\b|\bcrisis\b|\bci\b|\bcancer\b|\bmultistage\b|\bmultipay\b|\bdread disease\b/.test(t)) {
    category = category || 'protection';
    subType = subType || 'Critical Illness';
  }
  if (/\bdisability\b|\bpay protector\b|\blong term care\b|\blongtermcare\b/.test(t)) {
    category = category || 'protection';
    subType = subType || 'Disability Income';
  }
  if (/\bterm\b|\bmortgage reducing\b|\bmrta\b/.test(t)) {
    category = category || 'protection';
    subType = subType || 'Term Life';
  }
  if (/\bwhole life\b|\bwholelife\b|\blife advantage\b|\blife ready\b|\blifeready\b|\blife flex\b|\blifeflex\b|\blife plus\b|\blifemultiplier\b|\bvivolife\b|\bpro lifetime\b/.test(t)) {
    category = category || 'protection';
    subType = subType || 'Whole Life';
  }
  if (/\buniversal life\b|\biul\b|\bvul\b|\bindex universal\b|\bvariable universal\b|\blegacy\b|\bregal\b|\bprestige\b/.test(t)) {
    category = category || 'protection';
    subType = subType || (/\biul|index universal\b/.test(t) ? 'Indexed Universal Life' : /\bvul|variable universal\b/.test(t) ? 'Variable Universal Life' : 'Universal Life');
  }
  if (/\bilp\b|\binvestment linked\b|\binvest-linked\b|\binvestready\b|\binvest ready\b|\bpro achiever\b|\bwealth venture\b|\bwealth pro\b|\bpruwealth\b|\bmanulink\b|\bwealthlink\b|\b#goinvest\b|\bfund\b/.test(t)) {
    category = category || 'investment';
    subType = subType || 'ILP (Investment)';
  }
  if (/\bendowment\b|\bsaver\b|\bsave\b|\bsavings\b|\bcashback\b|\bcash back\b|\bguaranteed cash\b|\bsp\b|\bgro capital\b|\brevosave\b|\bgoal\s+20\d\d\b|\bsmart growth\b|\basset builder\b/.test(t)) {
    category = category || 'savings';
    subType = subType || 'Endowment';
  }
  if (/\bretire\b|\bretirement\b|\bannuity\b|\blifetime income\b|\blifetime payout\b|\bgen3\b|\bpremierlife\b|\bincomegen\b|\bcpf life\b/.test(t)) {
    category = category || 'retirement';
    subType = subType || (/\bcpf life\b|\bannuity\b/.test(t) ? 'Annuity' : 'Retirement Income');
  }
  if (/\brider\b/.test(t) && !subType) {
    category = category || 'protection';
    subType = 'Rider';
  }
  return { category: category || 'protection', subType: subType || '' };
}

const products = new Map();

function addProduct(name, source, { insurer = '', aliases = [], categoryHint = '', context = '', skipExpansion = false } = {}) {
  const productName = cleanName(name);
  if (isRejectLine(productName)) return;
  if (!skipExpansion && productName.includes('/')) {
    for (const expanded of expandSlashProductNames(productName)) {
      if (normalizeText(expanded) !== normalizeText(productName)) {
        addProduct(expanded, source, { insurer, aliases: [productName, ...aliases], categoryHint, context, skipExpansion: true });
      }
    }
  }
  const resolvedInsurer = canonicalInsurer(insurer || inferInsurer(productName, context));
  const inferred = inferCategory(productName, categoryHint);
  const key = [resolvedInsurer || 'unknown', normalizeText(productName)].join('|');
  const existing = products.get(key);
  const aliasList = splitAliases(aliases.join(' / '));
  if (existing) {
    for (const a of aliasList) existing.aliases.add(a);
    if (!existing.category && inferred.category) existing.category = inferred.category;
    if (!existing.subType && inferred.subType) existing.subType = inferred.subType;
    existing.sources.add(source);
    return;
  }
  products.set(key, {
    insurer: resolvedInsurer,
    productName,
    category: inferred.category,
    subType: inferred.subType,
    aliases: new Set(aliasList),
    sources: new Set([source])
  });
}

function currentInsurerFromLine(line, fallback) {
  const t = normalizeText(line);
  if (/\bgreat eastern\b/.test(t)) return 'Great Eastern';
  if (/\baia\b/.test(t)) return 'AIA';
  if (/\bprudential\b/.test(t)) return 'Prudential';
  if (/\bincome insurance\b|\bntuc income\b/.test(t)) return 'NTUC Income';
  if (/\bsinglife\b|\baviva\b/.test(t)) return 'Singlife';
  if (/\bmanulife\b/.test(t)) return 'Manulife';
  if (/\bhsbc life\b|\baxa\b/.test(t)) return 'HSBC Life';
  if (/\btokio marine\b/.test(t)) return 'Tokio Marine';
  if (/\bchina life\b/.test(t)) return 'China Life';
  if (/\bchina taiping\b/.test(t)) return 'China Taiping';
  if (/\betiqa\b|\btiq\b/.test(t)) return 'Etiqa';
  if (/\bfwd\b/.test(t)) return 'FWD';
  if (/\braffles\b/.test(t)) return 'Raffles Health';
  if (/\bcpf\b/.test(t)) return 'CPF Board';
  return fallback;
}

for (const file of SOURCE_FILES) {
  const text = read(file);
  let currentInsurer = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = cleanName(raw);
    if (!line) continue;
    currentInsurer = currentInsurerFromLine(line, currentInsurer);
    const exactName = line.match(/^Exact name:\s*(.+)$/i);
    if (exactName) {
      addProduct(exactName[1], file, { insurer: currentInsurer, context: line });
      continue;
    }
    if (line.includes('|')) {
      const parts = line.split('|').map(cleanName).filter(Boolean);
      if (parts.length >= 2) {
        const [name, alias = '', categoryHint = ''] = parts;
        addProduct(name, file, { insurer: currentInsurer, aliases: [alias], categoryHint, context: line });
      }
      continue;
    }
    if (file !== '01_flat_policy_name_corpus.txt' && /\s{2,}/.test(raw)) {
      const parts = raw.trim().split(/\s{2,}/).map(cleanName).filter(Boolean);
      if (parts.length >= 3 && !isRejectLine(parts[0])) {
        addProduct(parts[0], file, {
          insurer: currentInsurer,
          aliases: [parts[1]],
          categoryHint: parts.slice(2).join(' '),
          context: line
        });
        continue;
      }
    }
    if (file === '01_flat_policy_name_corpus.txt') {
      addProduct(line, file, { context: line });
    }
  }
}

let productRows = [...products.values()]
  .filter(p => p.insurer || /^(medishield|careshield|eldershield|dps|hps|cpf)/i.test(p.productName))
  .map(p => [
    p.insurer || '',
    p.productName,
    p.category || '',
    p.subType || '',
    [...p.aliases].filter(a => normalizeText(a) !== normalizeText(p.productName)).slice(0, 8),
    [...p.sources].sort().join(',')
  ])
  .sort((a, b) => (a[0] + a[1]).localeCompare(b[0] + b[1]));

// rc2.57: apply persisted manual corrections from tools/manual-corpus-overrides.json.
//   These are corrections that came out of the 2026-05-17 deep-research run (and any
//   subsequent runs). Without this step, every build would silently revert manual
//   classification fixes back to whatever heuristics the script's inferCategory chose.
//   Match by (canonicalInsurer, normalized productName); update category and subType
//   only — leave aliases / source alone (those come from the corpus text files).
try {
  const overridesPath = path.join(repoRoot, 'tools/manual-corpus-overrides.json');
  if (fs.existsSync(overridesPath)) {
    const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
    const ovIdx = new Map();
    for (const ov of overrides) {
      const key = canonicalInsurer(ov.insurer || '') + '|' + normalizeText(ov.productName || '');
      ovIdx.set(key, ov);
    }
    let applied = 0;
    productRows = productRows.map(row => {
      const key = canonicalInsurer(row[0]) + '|' + normalizeText(row[1]);
      const ov = ovIdx.get(key);
      if (!ov) return row;
      const nextCat = ov.category != null ? ov.category : row[2];
      const nextSub = ov.subType != null ? ov.subType : row[3];
      if (nextCat !== row[2] || nextSub !== row[3]) applied++;
      return [row[0], row[1], nextCat, nextSub, row[4], row[5]];
    });
    console.log('[manual-overrides] applied ' + applied + ' corrections from manual-corpus-overrides.json');
  }
} catch (err) {
  console.warn('[manual-overrides] skipped:', err.message);
}

// rc2.58: append additional entries from tools/manual-corpus-additions.json.
//   These are products surfaced by deep-research runs that don't exist in the corpus
//   text files (yet). Each entry follows the same tuple shape as the generated rows.
//   Skipped if already present in productRows (by canonical insurer + name) to keep
//   the operation idempotent across re-runs.
try {
  const additionsPath = path.join(repoRoot, 'tools/manual-corpus-additions.json');
  if (fs.existsSync(additionsPath)) {
    const additions = JSON.parse(fs.readFileSync(additionsPath, 'utf8'));
    const existing = new Set(productRows.map(r => canonicalInsurer(r[0]) + '|' + normalizeText(r[1])));
    let added = 0;
    for (const a of additions) {
      const key = canonicalInsurer(a.insurer || '') + '|' + normalizeText(a.productName || '');
      if (existing.has(key)) continue;
      existing.add(key);
      productRows.push([
        a.insurer || '',
        a.productName || '',
        a.category || '',
        a.subType || '',
        Array.isArray(a.aliases) ? a.aliases.slice(0, 8) : [],
        a.source || 'manual-corpus-additions.json'
      ]);
      added++;
    }
    if (added > 0) {
      // Re-sort to keep the (insurer, name) order stable.
      productRows.sort((a, b) => (a[0] + a[1]).localeCompare(b[0] + b[1]));
    }
    console.log('[manual-additions] added ' + added + ' new entries from manual-corpus-additions.json');
  }
} catch (err) {
  console.warn('[manual-additions] skipped:', err.message);
}

const falsePositives = [
  'AIA Vitality',
  'Live Great',
  'Great Eastern Rewards',
  'PRURewards',
  'Singlife Account',
  'DBS Insurance',
  'OCBC Insurance',
  'UOB Insurance',
  'Standard Chartered Insurance',
  'Citibank Insurance',
  'Singtel Dash',
  'GrabInsure',
  'MyDoc',
  'customer service',
  'customer hotline',
  'customer portal',
  'insurer hotline',
  'insurer hotlines',
  'claims hotline',
  'claims hotlines',
  'hotline',
  'portal',
  'contact details',
  'policy summary',
  'statement of account',
  'premium payment',
  'benefit illustration',
  'product summary',
  'fund performance',
  'contact us',
  'underwritten by'
];

const output = `/* Auto-generated by tools/build-singapore-product-knowledge.mjs. Do not edit by hand. */
(function(global){
  'use strict';
  const VERSION = ${JSON.stringify(VERSION)};
  const PRODUCTS = ${JSON.stringify(productRows)};
  const FALSE_POSITIVES = ${JSON.stringify(falsePositives)};
  const INSURER_ALIASES = ${JSON.stringify([...INSURER_ALIASES.entries()])};
  const STOP = new Set(['policy','plan','series','life','insurance','assurance','the','and','with','plus','rider','legacy','singapore','sg','limited','ltd','ii','iii','iv','v','vi']);
  function normalizeText(value){
    return String(value || '').toLowerCase()
      .replace(/\\bhsgm\\b/g,'healthshield gold max')
      .replace(/\\bhsg\\s+max\\b/g,'healthshield gold max')
      .replace(/\\bhsg\\b/g,'healthshield gold max')
      .replace(/\\bpruex\\b/g,'pruextra')
      .replace(/\\bmvh\\b/g,'max vitalhealth')
      .replace(/\\bmvc\\b/g,'max vitalcare')
      .replace(/\\bmys\\b/g,'myshield')
      .replace(/\\baxs\\b/g,'axa shield')
      .replace(/[^a-z0-9#]+/g,' ')
      .replace(/\\s+/g,' ')
      .trim();
  }
  function compact(value){ return normalizeText(value).replace(/\\s+/g,''); }
  function canonicalInsurer(value){
    const key = normalizeText(value);
    if (!key) return '';
    for (const pair of INSURER_ALIASES) if (pair[0] === key) return pair[1];
    return String(value || '').trim();
  }
  function tokens(value){
    return normalizeText(value).split(' ').filter(t => t && !STOP.has(t));
  }
  function tokenScore(a, b){
    const aa = new Set(tokens(a));
    const bb = new Set(tokens(b));
    if (!aa.size || !bb.size) return 0;
    let common = 0;
    for (const t of aa) if (bb.has(t)) common++;
    return common / Math.max(aa.size, bb.size);
  }
  function levenshtein(a, b){
    if (Math.abs(a.length - b.length) > 12) return 99;
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    return row[b.length];
  }
  function isFalsePositiveName(value){
    const n = normalizeText(value);
    if (!n) return false;
    return FALSE_POSITIVES.some(fp => {
      const f = normalizeText(fp);
      return f && (n === f || n.includes(f));
    });
  }
  function isInsurerOnlyName(value){
    const n = normalizeText(value);
    if (!n) return false;
    const insurerOnly = new Set([
      'aia','great eastern','ge','prudential','pru','ntuc income','income','income insurance',
      'singlife','aviva','hsbc life','hsbc','manulife','tokio marine','etiqa','fwd',
      'raffles health','raffles health insurance','cpf board','cpf','china life','china taiping',
      'sompo','msig','aig','allianz','liberty','tugu','chubb','hl assurance','qbe','ecics'
    ]);
    return insurerOnly.has(n);
  }
  function scoreName(input, candidate){
    const a = normalizeText(input);
    const b = normalizeText(candidate);
    if (!a || !b) return 0;
    if (a === b || compact(a) === compact(b)) return 1;
    if (a.includes(b) && b.length >= 7) return 0.94;
    if (b.includes(a) && a.length >= 7) return 0.90;
    const overlap = tokenScore(a, b);
    let score = overlap >= 0.72 ? 0.80 + (overlap * 0.14) : 0;
    const ac = compact(a), bc = compact(b);
    if (score < 0.86 && ac.length >= 8 && bc.length >= 8 && Math.max(ac.length, bc.length) <= 70) {
      const sim = 1 - (levenshtein(ac, bc) / Math.max(ac.length, bc.length));
      if (sim >= 0.86) score = Math.max(score, sim);
    }
    return score;
  }
  function findProduct(input, opts){
    opts = opts || {};
    if (!input || isFalsePositiveName(input) || isInsurerOnlyName(input)) return null;
    const wantedInsurer = canonicalInsurer(opts.insurer || '');
    let best = null;
    for (const row of PRODUCTS) {
      const [insurer, productName, category, subType, aliases, source] = row;
      if (wantedInsurer && canonicalInsurer(insurer) !== wantedInsurer) continue;
      const names = [productName].concat(Array.isArray(aliases) ? aliases : []);
      for (const name of names) {
        const score = scoreName(input, name);
        if (score < 0.78) continue;
        if (!best || score > best.score || (score === best.score && productName.length > best.productName.length)) {
          best = { insurer, productName, category, subType, aliases: Array.isArray(aliases) ? aliases.slice() : [], source, score, matchName: name };
        }
      }
    }
    return best;
  }
  function classifyProductName(input, insurer){
    const hit = findProduct(input, { insurer });
    return hit && hit.score >= 0.86 ? hit : null;
  }
  function toRepoEntries(){
    // rc2.51 fix retained: do NOT populate \`notes\` from the corpus source filename.
    //   That field used to read "Singapore product reference (sg-ref-…). Source:
    //   01_flat_policy_name_corpus.txt" which is metadata about WHERE the entry came
    //   from in our internal corpus — useless to an FC and noisy in the form. Source
    //   tracking now lives on _knowledgeVersion / _corpusSource hidden fields.
    return PRODUCTS.map(row => ({
      insurer: row[0],
      productName: row[1],
      category: row[2],
      subType: row[3],
      productAliases: row[4],
      currency: 'SGD',
      _source: 'singapore-product-reference',
      _knowledgeVersion: VERSION,
      _corpusSource: row[5]
    }));
  }
  const api = { VERSION, products: PRODUCTS, falsePositives: FALSE_POSITIVES, normalizeText, canonicalInsurer, isFalsePositiveName, findProduct, classifyProductName, toRepoEntries };
  global.PolicyLensSingaporeProductKnowledge = api;
  global.CKGPolicyProductKnowledge = api;
})(typeof window !== 'undefined' ? window : globalThis);
`;

fs.writeFileSync(policyLensOut, output, 'utf8');
try {
  fs.mkdirSync(path.dirname(crmLensOut), { recursive: true });
  fs.writeFileSync(crmLensOut, output, 'utf8');
} catch (err) {
  console.warn('[product-knowledge] CRMLens output skipped:', err.message);
}

console.log(JSON.stringify({
  version: VERSION,
  products: productRows.length,
  policyLensOut,
  crmLensOut: fs.existsSync(crmLensOut) ? crmLensOut : null
}, null, 2));
