import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(rootDir, 'src/index.babel.html'), 'utf8');
const start = source.indexOf('function isAdvisorVerifiedPolicyField');
const end = source.indexOf('const EXTRACT_FIELD_REMAP');

assert.ok(start > 0 && end > start, 'expected review-safety helper block in src/index.babel.html');

function normalizeCompactKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '').trim();
}

function moneyNumber(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const n = parseFloat(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

const helperBlock = source.slice(start, end);
const buildHarness = new Function(
  'normalizeCompactKey',
  'moneyNumber',
  helperBlock + '\nreturn { isAdvisorVerifiedPolicyField, mergePolicyRecords };'
);

const { isAdvisorVerifiedPolicyField, mergePolicyRecords } = buildHarness(normalizeCompactKey, moneyNumber);

const verifiedBase = {
  productName: 'Advisor Confirmed Product',
  annualPremium: 1000,
  _fieldEvidence: {
    productName: { verificationState: 'advisor_verified' }
  }
};
const incomingExtraction = {
  productName: 'Wrong OCR Product',
  annualPremium: 1500
};

assert.equal(isAdvisorVerifiedPolicyField(verifiedBase, 'productName'), true);
const protectedMerge = mergePolicyRecords(verifiedBase, incomingExtraction);
assert.equal(protectedMerge.productName, 'Advisor Confirmed Product', 'advisor-verified productName should not be overwritten');
assert.equal(protectedMerge.annualPremium, 1500, 'unverified fields can still merge normally');
assert.ok(protectedMerge._mergeConflicts.some(c => c.field === 'productName' && c.reason === 'advisor_verified'));

const timestampVerified = {
  policyOwner: 'Correct Owner',
  _extractVerifiedAt: Date.now(),
  _fieldVersions: { policyOwner: Date.now() }
};
assert.equal(isAdvisorVerifiedPolicyField(timestampVerified, 'policyOwner'), true);
assert.equal(mergePolicyRecords(timestampVerified, { policyOwner: 'OCR Owner' }).policyOwner, 'Correct Owner');

const unverifiedMerge = mergePolicyRecords(
  { productName: 'AIA HSG' },
  { productName: 'AIA HSG Max Special A' }
);
assert.equal(unverifiedMerge.productName, 'AIA HSG Max Special A', 'normal unverified merge behavior remains intact');

assert.equal(/const\s+AUTO_IMPORT_HIGH_CONFIDENCE_EXTRACTIONS\s*=\s*false/.test(source), true, 'high-confidence auto-import should be disabled');

console.log('Review safety checks passed.');
