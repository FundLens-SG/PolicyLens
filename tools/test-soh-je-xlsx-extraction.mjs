import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = 'C:\\Users\\user\\Downloads\\Soh Family Policy Summary.xlsx';

if (!fs.existsSync(fixturePath)) {
  console.log('Soh JE XLSX regression skipped: fixture not found.');
  process.exit(0);
}

const source = fs.readFileSync(path.join(rootDir, 'src/index.babel.html'), 'utf8');
const start = source.indexOf('function xlsxCellText');
const end = source.indexOf('// rc2e.36: Cash-investment row applier');
assert.ok(start > 0 && end > start, 'expected XLSX helper block in src/index.babel.html');

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

function personNameEquivalent(a, b) {
  const ak = normalizePersonNameKey(a);
  const bk = normalizePersonNameKey(b);
  return !!ak && !!bk && ak === bk;
}

function cleanPersonDisplayName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normaliseTextForMatch(value) {
  return normalizeTextKey(value);
}

function normalizePolicyKey(value) {
  return normalizeCompactKey(value);
}

function moneyNumber(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const n = parseFloat(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function normalizeInsurerName(value) {
  const s = String(value || '').trim();
  if (/^manulife$/i.test(s)) return 'Manulife';
  if (/^singlife$/i.test(s)) return 'Singlife';
  return s;
}

function _titleCaseProductName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b([a-z])/g, ch => ch.toUpperCase())
    .replace(/\bSgd\b/g, 'SGD')
    .replace(/\bIii\b/g, 'III')
    .replace(/\bEccwr\b/g, 'ECCWR');
}

function _titleCaseInsurerName(value) {
  return normalizeInsurerName(value);
}

function _normalizePersonNameFields(policy) {
  return policy;
}

function findSingaporeProductReference() {
  return null;
}

function singaporeProductKnowledgeApi() {
  return null;
}

function isSingaporeProductFalsePositive() {
  return false;
}

function inferPremiumTermFromProductName() {
  return null;
}

function _toIsoDateLoose(value) {
  return String(value || '').trim();
}

function _normalizePolicyStatus(value) {
  return String(value || '').trim().toLowerCase();
}

const helperBlock = source.slice(start, end);
const buildHarness = new Function(
  'normalizeTextKey',
  'normalizeCompactKey',
  'normalizePersonNameKey',
  'personNameEquivalent',
  'cleanPersonDisplayName',
  'normaliseTextForMatch',
  'normalizePolicyKey',
  'moneyNumber',
  'normalizeInsurerName',
  '_titleCaseProductName',
  '_titleCaseInsurerName',
  '_normalizePersonNameFields',
  'findSingaporeProductReference',
  'singaporeProductKnowledgeApi',
  'isSingaporeProductFalsePositive',
  'inferPremiumTermFromProductName',
  '_toIsoDateLoose',
  '_normalizePolicyStatus',
  'DOCUMENT_TRIAGE_META',
  'CATEGORIES',
  helperBlock + '\nreturn { findAllXlsxPolicyHeaderRows, makeUniqueXlsxHeaders, buildXlsxRowsFromHeader, inferXlsxColumnMap, applyColumnMap, coalesceIspShieldRows, coalesceContinuationRiders, inferInsurerFromProductName, inferXlsxProductRule };'
);

const fns = buildHarness(
  normalizeTextKey,
  normalizeCompactKey,
  normalizePersonNameKey,
  personNameEquivalent,
  cleanPersonDisplayName,
  normaliseTextForMatch,
  normalizePolicyKey,
  moneyNumber,
  normalizeInsurerName,
  _titleCaseProductName,
  _titleCaseInsurerName,
  _normalizePersonNameFields,
  findSingaporeProductReference,
  singaporeProductKnowledgeApi,
  isSingaporeProductFalsePositive,
  inferPremiumTermFromProductName,
  _toIsoDateLoose,
  _normalizePolicyStatus,
  { policy_schedule: { label: 'Policy schedule' } },
  { protection: true, health: true, savings: true, investment: true, retirement: true, cash_investments: true }
);

const workbook = XLSX.readFile(fixturePath, { cellDates: false });
const sheet = workbook.Sheets['JE Policy Summary'];
assert.ok(sheet, 'JE Policy Summary sheet should exist');
const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: false });
const sections = fns.findAllXlsxPolicyHeaderRows(matrix);
const jeSection = sections.find(section => /Hospitalisation\s*\/\s*Protection/i.test(section.sectionLabel));
assert.ok(jeSection, 'JE Hospitalisation / Protection section should be detected');

const headers = fns.makeUniqueXlsxHeaders(matrix[jeSection.headerIndex] || []);
const rows = fns.buildXlsxRowsFromHeader(matrix, jeSection.headerIndex, headers, 'JE Policy Summary', jeSection.sectionLabel, jeSection.endIndex);
const map = fns.inferXlsxColumnMap(headers);
assert.ok(map.confidence >= 5, 'JE header should map locally');

const rawPolicies = fns.applyColumnMap(rows, map.columnMap, map.categoryColumn);
const policies = fns.coalesceContinuationRiders(fns.coalesceIspShieldRows(rawPolicies));
const names = policies.map(policy => policy.productName || policy.policyName);

assert.deepEqual(names, [
  'Singlife Shield Plan 1',
  'Manulife Early CompleteCare (Deluxe)',
  'Manulife ReadyProtect (Advantage)'
]);

const shield = policies[0];
assert.equal(shield.hasRider, true, 'Singlife Health Plus should be embedded under Singlife Shield');
assert.equal(shield.riders.length, 1);
assert.match(shield.riderList, /Singlife Health Plus/i);

const completeCare = policies[1];
assert.equal(completeCare.insurer, 'Manulife');
assert.equal(completeCare.subType, 'Critical Illness');
assert.equal(completeCare.premiumAmount, 1578.78);
assert.equal(completeCare.sumAssured, 100000);

const readyProtect = policies[2];
assert.equal(readyProtect.insurer, 'Manulife');
assert.equal(readyProtect.subType, 'Personal Accident');
assert.equal(readyProtect.premiumAmount, 288);
assert.equal(readyProtect.sumAssured, 200000);

assert.equal(fns.inferInsurerFromProductName('Signature Life-SGD'), 'Manulife');
const signatureRule = fns.inferXlsxProductRule('SIGNATURE INDEXED UNIVERSAL LIFE (III) SELECT');
assert.equal(signatureRule.insurer, 'Manulife');
assert.equal(signatureRule.subType, 'Indexed UL (IUL)');

console.log('Soh JE XLSX extraction checks passed.');
