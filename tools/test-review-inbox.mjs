import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(rootDir, 'src/index.babel.html'), 'utf8');
const start = source.indexOf('function reviewInboxPolicyLabel');
const end = source.indexOf('function classifyPolicyDocumentTriage');

assert.ok(start > 0 && end > start, 'expected review inbox helper block in src/index.babel.html');

function normalizeTextKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isExtractionQuarantinedPolicy(policy = {}) {
  return !!(
    policy &&
    policy._extractionReconciliation &&
    policy._extractionReconciliation.state === 'stale_source_mismatch' &&
    !policy._extractionReconciliation.advisorRestoredAt
  );
}

const helperBlock = source.slice(start, end);
const buildHarness = new Function(
  'normalizeTextKey',
  'isExtractionQuarantinedPolicy',
  helperBlock + '\nreturn { buildReviewInboxItems };'
);

const { buildReviewInboxItems } = buildHarness(normalizeTextKey, isExtractionQuarantinedPolicy);

const items = buildReviewInboxItems([
  {
    id: 'stale-income-shield',
    insurer: 'NTUC Income',
    productName: 'Enhanced IncomeShield Preferred',
    category: 'health',
    _sourceTrace: { sourceFile: 'Soh Family Policy Summary.xlsx', sourceSheet: 'JE Policy Summary', sourceRow: 3 },
    _extractionReconciliation: {
      state: 'stale_source_mismatch',
      reason: 'Saved extracted policy no longer appears in the latest extraction for the same source scope.'
    }
  },
  {
    id: 'missing-fields',
    productName: '',
    policyName: '',
    category: '',
    _extractConfidence: { lifeInsured: 'low', premiumAmount: 'medium' },
    _extractConfidenceReasons: { lifeInsured: 'Self could not be routed.' },
    _mergeConflicts: [{ field: 'productName', reason: 'advisor_verified' }],
    _reviewReasons: ['Owner routing needs confirmation.']
  },
  {
    id: 'clean-policy',
    insurer: 'AIA',
    productName: 'Financial Guardian',
    category: 'savings',
    policyOwner: 'Client'
  }
], {
  clientName: 'Je',
  pendingWrite: true,
  pendingError: 'Drive upload failed',
  pendingReason: 'policy-save'
}, { name: 'Je' });

assert.ok(items.length >= 8, 'review inbox should collect policy and sync issues');
assert.equal(items[0].severity, 'high', 'high severity issues should sort first');
assert.ok(items.some(i => i.type === 'stale_extraction_mismatch' && i.policyId === 'stale-income-shield'));
assert.ok(items.some(i => i.type === 'protected_field_conflict' && i.field === 'productName'));
assert.ok(items.some(i => i.type === 'missing_required_field' && i.field === 'insurer'));
assert.ok(items.some(i => i.type === 'missing_policy_person'));
assert.ok(items.some(i => i.type === 'low_confidence_field' && i.field === 'lifeInsured' && /Self could not/.test(i.detail)));
assert.ok(items.some(i => i.type === 'policy_review_reason' && /Owner routing/.test(i.detail)));
assert.ok(items.some(i => i.type === 'sync_failure' && i.action === 'retry_sync'));
assert.equal(items.filter(i => i.type === 'sync_pending').length, 0, 'pending write should not duplicate a sync failure');

const restored = buildReviewInboxItems([
  {
    id: 'restored',
    insurer: 'NTUC Income',
    productName: 'Enhanced IncomeShield Preferred',
    category: 'health',
    policyOwner: 'Je',
    _extractionReconciliation: {
      state: 'stale_source_mismatch',
      advisorRestoredAt: new Date().toISOString()
    }
  }
], null, {});
assert.equal(restored.length, 0, 'advisor-restored stale policies should leave the review queue');

console.log('Review inbox checks passed.');
