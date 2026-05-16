import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(rootDir, 'src/index.babel.html'), 'utf8');
const start = source.indexOf('function canonicalPolicyId');
const end = source.indexOf('function normalizePolicyForStorage');

assert.ok(start > 0 && end > start, 'expected canonical preview helper block in src/index.babel.html');

function normalizeTextKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePersonNameKey(value) {
  return normalizeTextKey(value);
}

function cleanPersonDisplayName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
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

function buildPolicyIdentityFingerprint(policy) {
  return { id: normalizeTextKey([policy.insurer, policy.productName, policy.policyNumber].join('|')) || 'policy-preview-test' };
}

function isIspPolicyLike(policy) {
  return /\bintegrated shield plan\b/i.test(String(policy?.subType || ''))
    || /\b(healthshield|hsg max|incomeshield|prushield|supremehealth|singlife shield|raffles shield|hsbc life shield)\b/i.test(String(policy?.productName || policy?.policyName || ''));
}

const helperBlock = source.slice(start, end);
const buildHarness = new Function(
  'buildPolicyIdentityFingerprint',
  'normalizeTextKey',
  'normalizePersonNameKey',
  'cleanPersonDisplayName',
  'personNameEquivalent',
  'moneyNumber',
  'isIspPolicyLike',
  'EXTRACT_PIPELINE_VERSION',
  helperBlock + '\nreturn { attachPolicyCanonicalPreview, buildPolicyCanonicalPreview };'
);

const { attachPolicyCanonicalPreview, buildPolicyCanonicalPreview } = buildHarness(
  buildPolicyIdentityFingerprint,
  normalizeTextKey,
  normalizePersonNameKey,
  cleanPersonDisplayName,
  personNameEquivalent,
  moneyNumber,
  isIspPolicyLike,
  'v-test-canonical-preview'
);

const shieldPolicy = attachPolicyCanonicalPreview({
  id: 'pol-aia-shield',
  insurer: 'AIA',
  productName: 'AIA HSG Max Special A',
  _xlsxIspBaseProductName: 'AIA HealthShield Gold Max',
  _xlsxIspPlanOption: 'AIA HSG Max Special A',
  policyNumber: 'H230740130',
  category: 'health',
  subType: 'Integrated Shield Plan',
  policyOwner: 'Soh Soon Jooh, Eric',
  lifeInsured: 'Soh Jia Le',
  documentOwner: 'Soh Jia Le',
  premiumAmount: 640.97,
  annualPremium: 640.97,
  premFrequency: 'annual',
  ispCoinsurance: 5,
  ispCoInsCap: 3000,
  sourceSheet: 'JL Policy Summary',
  sourceRow: 6,
  _sourceTrace: {
    sourceKind: 'spreadsheet',
    sourceFile: 'Soh Family Policy Summary.xlsx',
    sourceSheet: 'JL Policy Summary',
    sourceRow: 6,
    verificationState: 'extracted',
    reviewState: 'pending',
    extractionRunId: 'xlsx:jl-shield'
  },
  _fieldEvidence: {
    policyOwner: { value: 'Soh Soon Jooh, Eric', confidence: 'high', verificationState: 'extracted', reviewState: 'pending', sourceText: 'Owner: DD' },
    lifeInsured: { value: 'Soh Jia Le', confidence: 'high', verificationState: 'extracted', reviewState: 'pending', sourceText: 'Life insured: Self' },
    premiumAmount: { value: 640.97, confidence: 'high', verificationState: 'extracted', reviewState: 'pending', sourceText: '$640.97' },
    productName: { value: 'AIA HSG Max Special A', confidence: 'high', verificationState: 'extracted', reviewState: 'pending', sourceText: 'AIA HSG MAX SPECIAL A' }
  },
  riders: [
    {
      type: 'other',
      componentType: 'co_pay_rider',
      riderName: 'AIA HSG Max Rider',
      premium: 1061.8,
      bundled: false,
      policyNumber: 'E230740130',
      sourceSheet: 'JL Policy Summary',
      sourceRow: 7,
      coverageText: '5% co-payment, capped at S$3,000 with deductible waiver pass'
    },
    {
      type: 'other',
      componentType: 'outpatient_booster',
      riderName: 'AIA Max VitalHealth A',
      bundled: false,
      sourceSheet: 'JL Policy Summary',
      sourceRow: 8
    },
    {
      type: 'ci',
      componentType: 'cancer_booster',
      riderName: 'AIA Max A Cancer Care Booster',
      premium: 45.8,
      bundled: false,
      sourceSheet: 'JL Policy Summary',
      sourceRow: 9,
      coverageText: 'Cancer Drug treatments (non-CDL) $200,000/yr'
    }
  ]
});

assert.equal(shieldPolicy._canonicalPreview.schemaVersion, 'policylens-canonical-preview/v1');
assert.equal(shieldPolicy._canonicalPreview.participants.length, 2, 'owner and life insured should be role rows');
assert.ok(shieldPolicy._canonicalPreview.participants.some(p => p.role === 'owner' && p.party_key === 'soh soon jooh eric'));
assert.ok(shieldPolicy._canonicalPreview.participants.some(p => p.role === 'life_insured' && p.party_key === 'soh jia le'));

const coverages = shieldPolicy._canonicalPreview.coverages;
assert.equal(coverages.length, 4, 'base ISP plus three riders should be coverage rows');
assert.equal(coverages[0].coverage_type_id, 'integrated_shield');
assert.equal(coverages[0].coverage_name, 'AIA HSG Max Special A');
assert.equal(coverages[0].component_type_id, 'integrated_shield_plan');

const riderRows = coverages.filter(c => c.component === 'rider');
assert.equal(riderRows.length, 3);
assert.ok(riderRows.every(c => c.coverage_type_id === 'shield_rider'), 'ISP add-ons should become shield rider coverage children');
assert.ok(riderRows.every(c => c.parent_coverage_key === coverages[0].coverage_key), 'riders should point at the base ISP coverage key');
assert.deepEqual(riderRows.map(c => c.component_type_id), ['co_pay_rider', 'outpatient_booster', 'cancer_booster']);
assert.equal(riderRows[0].premium_amount, 1061.8);
assert.equal(riderRows[0].co_insurance_pct, 5);
assert.equal(riderRows[0].co_insurance_cap, 3000);
assert.equal(riderRows[0].source_row, 7);
assert.equal(riderRows[0].verification_state, 'extracted');
assert.equal(riderRows[0].review_state, 'pending');
assert.equal(riderRows[0].medisave_eligible, false, 'rider rows should be marked cash-only');

const components = shieldPolicy._canonicalPreview.components;
assert.equal(components.length, 7, 'canonical ISP model should include base, MSL, private component, plan tier, and three riders');
assert.equal(components[0].component_type_id, 'integrated_shield_plan');
assert.equal(components[0].component_name, 'AIA HealthShield Gold Max');
assert.equal(components[0].premium_scope, 'policy_total');
assert.ok(components.some(c => c.component_type_id === 'medishield_life' && c.medisave_eligible === true));
assert.ok(components.some(c => c.component_type_id === 'isp_private_component' && c.medisave_eligible === true));
const planTier = components.find(c => c.component_role === 'plan_option');
assert.equal(planTier.component_name, 'AIA HSG Max Special A');
assert.equal(planTier.parent_component_key, components[0].component_key);
const componentRiders = components.filter(c => c.component_role === 'rider');
assert.equal(componentRiders.length, 3, 'riders should stay embedded as component rows');
assert.ok(componentRiders.every(c => c.parent_component_key === components[0].component_key));
assert.ok(componentRiders.every(c => c.cash_only === true && c.medisave_eligible === false));
assert.deepEqual(componentRiders.map(c => c.component_type_id), ['co_pay_rider', 'outpatient_booster', 'cancer_booster']);
assert.equal(componentRiders[0].source_row, 7);
assert.equal(componentRiders[0].coverage_text, '5% co-payment, capped at S$3,000 with deductible waiver pass');

const verified = buildPolicyCanonicalPreview({
  id: 'pol-verified',
  insurer: 'AIA',
  productName: 'Life Protect',
  policyOwner: 'Verified Client',
  lifeInsured: 'Verified Client',
  _extractVerifiedAt: Date.now()
});
assert.equal(verified.verification_state, 'advisor_verified');
assert.equal(verified.review_state, 'approved');
assert.ok(verified.participants.every(p => p.verification_state === 'advisor_verified'));
assert.deepEqual(verified.components, [], 'non-ISP policies should not receive Shield component rows');

console.log('Canonical policy preview checks passed.');
