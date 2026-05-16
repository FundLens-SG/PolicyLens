import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(rootDir, 'src/index.babel.html'), 'utf8');
const start = source.indexOf('function appendXlsxRider');
const end = source.indexOf('function coalesceContinuationRiders');

assert.ok(start > 0 && end > start, 'expected ISP coalescing helper block in src/index.babel.html');

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

function personNameEquivalent(a, b) {
  return normalizeTextKey(a) === normalizeTextKey(b);
}

function getXlsxRawCoverageText(row) {
  return String(row?._xlsxRawText || row?.coverageBenefits || row?.notes || '');
}

function parseXlsxMoneyNumber(value) {
  const match = String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function classifyXlsxRiderType() {
  return 'other';
}

function parseXlsxRiderSa() {
  return 0;
}

function _titleCaseProductName(value) {
  return String(value || '').replace(/\b\w/g, ch => ch.toUpperCase());
}

const helperBlock = source.slice(start, end);
const buildHarness = new Function(
  'normalizeTextKey',
  'normalizePersonNameKey',
  'personNameEquivalent',
  'getXlsxRawCoverageText',
  'parseXlsxMoneyNumber',
  'classifyXlsxRiderType',
  'parseXlsxRiderSa',
  '_titleCaseProductName',
  helperBlock + '\nreturn { coalesceIspShieldRows };'
);

const { coalesceIspShieldRows } = buildHarness(
  normalizeTextKey,
  normalizePersonNameKey,
  personNameEquivalent,
  getXlsxRawCoverageText,
  parseXlsxMoneyNumber,
  classifyXlsxRiderType,
  parseXlsxRiderSa,
  _titleCaseProductName
);

function names(policy) {
  return String(policy?.riderList || '');
}

const aiaRows = [
  {
    productName: 'AIA HEALTHSHIELD GOLD MAX',
    insurer: 'AIA',
    subType: 'Integrated Shield Plan',
    category: 'health',
    policyNumber: 'H230740130',
    premiumAmount: 640.97,
    annualPremium: 640.97,
    lifeInsured: 'Soh Jia Le',
    sourceSheet: 'JL Policy Summary'
  },
  {
    productName: 'AIA HSG MAX SPECIAL A',
    insurer: 'AIA',
    subType: 'Integrated Shield Plan',
    category: 'health',
    lifeInsured: 'Soh Jia Le',
    sourceSheet: 'JL Policy Summary'
  },
  {
    productName: 'AIA HSG MAX RIDER',
    insurer: 'AIA',
    subType: 'Shield Rider',
    category: 'health',
    policyNumber: 'E230740130',
    premiumAmount: 1061.8,
    annualPremium: 1061.8,
    lifeInsured: 'Soh Jia Le',
    sourceSheet: 'JL Policy Summary',
    coverageBenefits: '5% co-payment, capped at S$3,000 with deductible waiver pass'
  },
  {
    productName: 'AIA MAX VITALHEALTH A',
    insurer: 'AIA',
    subType: 'Shield Rider',
    category: 'health',
    lifeInsured: 'Soh Jia Le',
    sourceSheet: 'JL Policy Summary'
  },
  {
    productName: 'AIA MAX A CANCER CARE BOOSTER',
    insurer: 'AIA',
    subType: 'Shield Rider',
    category: 'health',
    lifeInsured: 'Soh Jia Le',
    sourceSheet: 'JL Policy Summary',
    coverageBenefits: 'Cancer Drug treatments (non-CDL) $200,000/yr'
  }
];

const aia = coalesceIspShieldRows(aiaRows);
assert.equal(aia.length, 1, 'AIA Shield stack should become one parent ISP policy');
assert.equal(aia[0].hasRider, true, 'AIA parent should be marked as having rider(s)');
// rc2.42: the umbrella product name ("AIA HEALTHSHIELD GOLD MAX") must stay on the parent
//   policy — the plan tier ("AIA HSG MAX SPECIAL A") is tracked separately in
//   `_xlsxIspPlanOption`. Previously the coalescer overwrote the umbrella name with the plan
//   tier, which destroyed the policy's canonical identity in the UI.
assert.match(aia[0].productName, /AIA HEALTHSHIELD GOLD MAX/i, 'umbrella ISP product name should stay on parent policy');
assert.match(aia[0]._xlsxIspPlanOption || '', /HSG MAX SPECIAL A/i, 'plan tier should be tracked in _xlsxIspPlanOption');
assert.match(aia[0]._xlsxIspBaseProductName, /AIA HEALTHSHIELD GOLD MAX/i, 'original ISP parent name should be preserved for canonical components');
assert.equal(aia[0].riders.length, 3, 'AIA parent should retain all three rider/add-on rows');
assert.match(names(aia[0]), /AIA HSG MAX RIDER/i);
assert.match(names(aia[0]), /AIA MAX VITALHEALTH A/i);
assert.match(names(aia[0]), /AIA MAX A CANCER CARE BOOSTER/i);
assert.deepEqual(aia[0].riders.map(r => r.componentType), ['co_pay_rider', 'outpatient_booster', 'cancer_booster']);
assert.equal(aia[0].riderPremium, 1061.8, 'AIA combined rider premium should use the actual rider premium row once');
assert.equal(aia[0].ispCoinsurance, 5, 'AIA co-insurance should be inferred from rider text');
assert.equal(aia[0].ispCoInsCap, 3000, 'AIA co-insurance cap should be inferred from rider text');

const rafflesRows = [
  {
    productName: 'Raffles Shield Private',
    insurer: 'Raffles Health',
    subType: 'Integrated Shield Plan',
    category: 'health',
    premiumAmount: 500,
    annualPremium: 500,
    lifeInsured: 'Client A',
    sourceSheet: 'Policy Summary'
  },
  {
    productName: 'Choice Rider',
    insurer: 'Raffles Health',
    subType: 'Shield Rider',
    category: 'health',
    premiumAmount: 120,
    annualPremium: 120,
    lifeInsured: 'Client A',
    sourceSheet: 'Policy Summary'
  },
  {
    productName: 'Cancer Guard Rider',
    insurer: 'Raffles Health',
    subType: 'Shield Rider',
    category: 'health',
    premiumAmount: 80,
    annualPremium: 80,
    lifeInsured: 'Client A',
    sourceSheet: 'Policy Summary'
  }
];

const raffles = coalesceIspShieldRows(rafflesRows);
assert.equal(raffles.length, 1, 'Raffles Shield riders should attach to the parent ISP');
assert.equal(raffles[0].riders.length, 2, 'Raffles parent should retain both riders');
assert.equal(raffles[0].riderPremium, 200, 'multiple rider premiums should be combined');
assert.match(names(raffles[0]), /Choice Rider/i);
assert.match(names(raffles[0]), /Cancer Guard Rider/i);

const singlifeRows = [
  {
    productName: 'Singlife Shield Plan 1',
    insurer: 'Singlife',
    subType: 'Integrated Shield Plan',
    category: 'health',
    policyNumber: 'S1',
    premiumAmount: 100,
    annualPremium: 100,
    lifeInsured: 'Je',
    sourceSheet: 'JE Policy Summary'
  },
  {
    productName: 'Singlife Health Plus',
    insurer: 'Singlife',
    subType: 'Shield Rider',
    category: 'health',
    policyNumber: 'R1',
    premiumAmount: 200,
    annualPremium: 200,
    lifeInsured: 'Je',
    sourceSheet: 'JE Policy Summary'
  }
];

const singlife = coalesceIspShieldRows(singlifeRows);
assert.equal(singlife.length, 1, 'Singlife Health Plus should attach to Singlife Shield');
assert.match(names(singlife[0]), /Singlife Health Plus/i);

console.log('ISP rider coalescing checks passed: multi-rider ISPs stay embedded in parent policy records.');
