import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(rootDir, 'src/index.babel.html'), 'utf8');
const start = source.indexOf('function getXlsxEvidenceSourceMeta');
const end = source.indexOf('function applyHighConfidenceRepoMatchToPolicy');

assert.ok(start > 0 && end > start, 'expected XLSX evidence helper block in src/index.babel.html');

function normalizeTextKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeXlsxHeaderName(value) {
  return normalizeTextKey(value);
}

const helperBlock = source.slice(start, end);
const buildHarness = new Function(
  'normalizeTextKey',
  'normalizeXlsxHeaderName',
  `
  const EXTRACT_PIPELINE_VERSION = 'test-pipeline';
  const EXTRACT_PROMPT_VERSION = 'test-prompt';
  const APP_VERSION = 'test-app';
  ${helperBlock}
  return { attachXlsxSourceEvidence, addXlsxFieldEvidence, getXlsxEvidenceSourceMeta };
  `
);

const { attachXlsxSourceEvidence } = buildHarness(normalizeTextKey, normalizeXlsxHeaderName);

const policy = {
  productName: 'AIA HSG Max B',
  policyNumber: 'H230740143',
  insurer: 'AIA',
  premiumAmount: 377.79,
  annualPremium: 377.79,
  lifeInsured: 'Soh Jia Yi',
  policyOwner: 'Soh Soon Jooh, Eric',
  documentOwner: 'Soh Jia Yi',
  sourceSheet: 'JY Policy Summary',
  sourceRow: 6,
  sourceDocument: {
    clientName: 'Soh Jia Yi',
    sourceSheet: 'JY Policy Summary',
    sourceRow: 6
  },
  _rawSpreadsheetRow: {
    'Policy Name': 'AIA HEALTHSHIELD GOLD MAX',
    'Policy No.': 'H230740143',
    'Life Insured': 'Self\nDD Owner',
    'Premium amount/yr': '$377.79'
  }
};

attachXlsxSourceEvidence(policy, 'Soh Family Policy Summary.xlsx');

assert.equal(policy._sourceTrace.sourceKind, 'spreadsheet');
assert.equal(policy._sourceTrace.sourceSheet, 'JY Policy Summary');
assert.equal(policy._sourceTrace.sourceRow, 6);
assert.equal(policy._sourceTrace.documentOwner, 'Soh Jia Yi');
assert.equal(policy._sourceTrace.verificationState, 'extracted');
assert.equal(policy._sourceTrace.reviewState, 'pending');

assert.equal(policy._extractionRun.pipelineVersion, 'test-pipeline');
assert.equal(policy._extractionRun.promptVersion, 'test-prompt');
assert.equal(policy._extractionRun.status, 'extracted');

assert.equal(policy._fieldEvidence.productName.value, 'AIA HSG Max B');
assert.equal(policy._fieldEvidence.productName.rawValue, 'AIA HEALTHSHIELD GOLD MAX');
assert.equal(policy._fieldEvidence.productName.verificationState, 'extracted');
assert.equal(policy._fieldEvidence.productName.reviewState, 'pending');
assert.equal(policy._fieldEvidence.productName.evidence.sourceFile, 'Soh Family Policy Summary.xlsx');
assert.equal(policy._fieldEvidence.productName.evidence.sourceSheet, 'JY Policy Summary');
assert.equal(policy._fieldEvidence.productName.evidence.sourceRow, 6);

assert.equal(policy._fieldEvidence.premiumAmount.rawValue, '$377.79');
assert.equal(policy._fieldEvidence.lifeInsured.rawValue, 'Self\nDD Owner');

console.log('XLSX evidence envelope checks passed.');
