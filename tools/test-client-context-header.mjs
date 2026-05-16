import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(rootDir, 'src/index.babel.html'), 'utf8');
const start = source.indexOf('function buildClientContextHeaderSummary');
const end = source.indexOf('function classifyPolicyDocumentTriage');

assert.ok(start > 0 && end > start, 'expected client context helper block in src/index.babel.html');

function annualizedPremium(policy) {
  const amount = Number(policy.premiumAmount ?? policy.annualPremium) || 0;
  if (policy.premFrequency === 'monthly') return amount * 12;
  return amount;
}

function getProfileAge(profile) {
  return profile?.age ?? null;
}

function isExtractionQuarantinedPolicy(policy = {}) {
  return !!policy?._extractionReconciliation && !policy._extractionReconciliation.advisorRestoredAt;
}

function buildReviewInboxItems(policies = [], driveState = null) {
  const policyItems = policies.filter(policy => Array.isArray(policy._reviewReasons) && policy._reviewReasons.length > 0);
  const syncItems = driveState?.pendingError ? [{ type: 'sync_failure' }] : [];
  return [...policyItems, ...syncItems];
}

const helperBlock = source.slice(start, end);
const buildHarness = new Function(
  'annualizedPremium',
  'getProfileAge',
  'buildReviewInboxItems',
  'isExtractionQuarantinedPolicy',
  'UNASSIGNED_TIER',
  helperBlock + '\nreturn { buildClientContextHeaderSummary };'
);

const { buildClientContextHeaderSummary } = buildHarness(
  annualizedPremium,
  getProfileAge,
  buildReviewInboxItems,
  isExtractionQuarantinedPolicy,
  'Unassigned'
);

const summary = buildClientContextHeaderSummary({
  clientName: 'Je',
  clientProfile: { name: 'Je', age: 25, tier: 'Platinum' },
  policies: [
    { id: 'annual', productName: 'A', premiumAmount: 1000, premFrequency: 'annual' },
    { id: 'monthly', productName: 'B', premiumAmount: 100, premFrequency: 'monthly', _reviewReasons: ['Verify owner'] },
    { id: 'lapsed', productName: 'C', premiumAmount: 500, status: 'lapsed' },
    { id: 'stale', productName: 'D', premiumAmount: 999, _extractionReconciliation: { state: 'stale_source_mismatch' } }
  ],
  driveState: { pendingError: 'Drive failed', pendingReason: 'policy-save' }
});

assert.equal(summary.hasClient, true);
assert.equal(summary.clientName, 'Je');
assert.equal(summary.tier, 'Platinum');
assert.equal(summary.age, 25);
assert.equal(summary.activePolicyCount, 2, 'active count should exclude lapsed and quarantined stale policies');
assert.equal(summary.totalPolicyCount, 3, 'total count should exclude quarantined stale policies');
assert.equal(summary.annualPremiumTotal, 2200);
assert.equal(summary.reviewCount, 2, 'review count should include policy review items and sync failures');
assert.equal(summary.syncState, 'failed');
assert.equal(summary.syncLabel, 'Sync retry needed');
assert.equal(summary.pendingReason, 'policy-save');

const empty = buildClientContextHeaderSummary({ policies: [], driveState: null, clientProfile: {} });
assert.equal(empty.hasClient, false);
assert.equal(empty.tier, 'Unassigned');
assert.equal(empty.syncState, 'idle');

console.log('Client context header checks passed.');
