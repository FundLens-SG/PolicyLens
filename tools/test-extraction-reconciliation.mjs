import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(rootDir, 'src/index.babel.html'), 'utf8');
const start = source.indexOf('function policyPersonKey');
const end = source.indexOf('function classifyPolicyDocumentTriage');
assert.ok(start > 0 && end > start, 'expected policy identity/reconciliation helper block');

function normalizeTextKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCompactKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '').trim();
}

function normalizePersonNameKey(value) {
  return normalizeTextKey(value);
}

function normalizePolicyKey(value) {
  return normalizeCompactKey(value);
}

function personNameEquivalent(a, b) {
  const ak = normalizePersonNameKey(a);
  const bk = normalizePersonNameKey(b);
  return !!ak && !!bk && ak === bk;
}

function moneyNumber(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const n = parseFloat(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function _levenshtein(a, b) {
  a = String(a || '');
  b = String(b || '');
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

const helperBlock = source.slice(start, end);
const buildHarness = new Function(
  'normalizeTextKey',
  'normalizeCompactKey',
  'normalizePersonNameKey',
  'normalizePolicyKey',
  'personNameEquivalent',
  'moneyNumber',
  '_levenshtein',
  "const EXTRACT_PIPELINE_VERSION = 'test-reconciliation';\n" +
    helperBlock +
    '\nreturn { reconcileSavedPoliciesAgainstExtraction, isExtractionQuarantinedPolicy, policyExtractionSourceScope };'
);

const {
  reconcileSavedPoliciesAgainstExtraction,
  isExtractionQuarantinedPolicy,
  policyExtractionSourceScope
} = buildHarness(
  normalizeTextKey,
  normalizeCompactKey,
  normalizePersonNameKey,
  normalizePolicyKey,
  personNameEquivalent,
  moneyNumber,
  _levenshtein
);

const sourceMeta = {
  sourceKind: 'spreadsheet',
  sourceFile: 'Soh Family Policy Summary.xlsx',
  sourceSheet: 'JE Policy Summary',
  documentOwner: 'Je'
};

const saved = [
  {
    id: 'stale-income-shield',
    insurer: 'NTUC Income',
    productName: 'Enhanced IncomeShield Preferred',
    policyOwner: 'Je',
    lifeInsured: 'Je',
    premiumAmount: 288,
    sumAssured: 200000,
    _sourceTrace: sourceMeta
  },
  {
    id: 'singlife-shield',
    insurer: 'Singlife',
    productName: 'Singlife Shield Plan 1',
    policyOwner: 'Je',
    lifeInsured: 'Je',
    _sourceTrace: sourceMeta
  },
  {
    id: 'manual-verified',
    insurer: 'NTUC Income',
    productName: 'Enhanced IncomeShield Preferred',
    policyOwner: 'Je',
    lifeInsured: 'Je',
    _sourceTrace: sourceMeta,
    _fieldEvidence: {
      productName: { verificationState: 'advisor_verified' }
    }
  },
  {
    id: 'different-sheet',
    insurer: 'NTUC Income',
    productName: 'Enhanced IncomeShield Preferred',
    policyOwner: 'Soh Jia Le',
    lifeInsured: 'Soh Jia Le',
    _sourceTrace: { ...sourceMeta, sourceSheet: 'JL Policy Summary', documentOwner: 'Soh Jia Le' }
  }
];

const extracted = [
  {
    insurer: 'Singlife',
    productName: 'Singlife Shield Plan 1',
    policyOwner: 'Je',
    lifeInsured: 'Je',
    _sourceTrace: sourceMeta
  },
  {
    insurer: 'Manulife',
    productName: 'Manulife Early CompleteCare (Deluxe)',
    policyOwner: 'Je',
    lifeInsured: 'Je',
    _sourceTrace: sourceMeta
  },
  {
    insurer: 'Manulife',
    productName: 'Manulife ReadyProtect (Advantage)',
    policyOwner: 'Je',
    lifeInsured: 'Je',
    _sourceTrace: sourceMeta
  }
];

assert.equal(policyExtractionSourceScope(saved[0]), policyExtractionSourceScope(extracted[0]));

const result = reconcileSavedPoliciesAgainstExtraction(saved, extracted, { now: '2026-05-16T00:00:00.000Z' });
assert.equal(result.quarantined.length, 1);
assert.equal(result.quarantined[0].id, 'stale-income-shield');
assert.equal(result.reviewItems.length, 1);
assert.equal(result.reviewItems[0].itemType, 'stale_extraction_mismatch');

const byId = new Map(result.policies.map(policy => [policy.id, policy]));
assert.equal(isExtractionQuarantinedPolicy(byId.get('stale-income-shield')), true);
assert.equal(isExtractionQuarantinedPolicy(byId.get('singlife-shield')), false);
assert.equal(isExtractionQuarantinedPolicy(byId.get('manual-verified')), false);
assert.equal(isExtractionQuarantinedPolicy(byId.get('different-sheet')), false);
assert.match(byId.get('stale-income-shield')._reviewReasons.join(' '), /no longer appears/i);
assert.deepEqual(byId.get('stale-income-shield')._extractionReconciliation.extractedPolicyNames, [
  'Singlife Shield Plan 1',
  'Manulife Early CompleteCare (Deluxe)',
  'Manulife ReadyProtect (Advantage)'
]);

console.log('Extraction reconciliation checks passed.');
