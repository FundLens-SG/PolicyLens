// Reusable xlsx extraction helper.
//
// Both tools/diff-extraction-against-source.mjs (truth-table diff) and
// tools/test-xlsx-smoke.mjs (structural smoke test) import from here so the
// extraction setup lives in ONE place. Loads the helper block from
// src/index.babel.html, stubs the runtime dependencies, and exports
// extractAllSheets(filePath) → { sheetName: { sections: [...], policies: [...] } }.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let XLSX;
try { XLSX = (await import('xlsx')).default; }
catch (e) { throw new Error('xlsx package not installed. Run: npm install'); }

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ── Normalisers (stub-compatible with index.babel.html) ──
export function normalizeTextKey(value) { return String(value || '').toLowerCase().replace(/ /g, ' ').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim(); }
export function normalizeCompactKey(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '').trim(); }
function normalizePersonNameKey(value) { return normalizeTextKey(value); }
function personNameEquivalent(a, b) { const ak = normalizePersonNameKey(a); const bk = normalizePersonNameKey(b); return !!ak && !!bk && ak === bk; }
function cleanPersonDisplayName(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function normaliseTextForMatch(value) { return normalizeTextKey(value); }
function normalizePolicyKey(value) { return normalizeCompactKey(value); }
function moneyNumber(value) { if (value == null || value === '') return 0; if (typeof value === 'number') return Number.isFinite(value) ? value : 0; const n = parseFloat(String(value).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0; }
function normalizeInsurerName(value) { const s = String(value || '').trim(); if (/^manulife$/i.test(s)) return 'Manulife'; if (/^singlife$/i.test(s)) return 'Singlife'; return s; }
function _titleCaseProductName(value) { return String(value || '').toLowerCase().replace(/\b([a-z])/g, ch => ch.toUpperCase()).replace(/\bSgd\b/g, 'SGD').replace(/\bIii\b/g, 'III').replace(/\bEccwr\b/g, 'ECCWR'); }
function _titleCaseInsurerName(value) { return normalizeInsurerName(value); }
function _normalizePersonNameFields(p) { return p; }
function findSingaporeProductReference() { return null; }
function singaporeProductKnowledgeApi() { return null; }
function isSingaporeProductFalsePositive() { return false; }
function inferPremiumTermFromProductName() { return null; }
function _toIsoDateLoose(value) { return String(value || '').trim(); }
function _normalizePolicyStatus(value) { return String(value || '').trim().toLowerCase(); }

// ── Load + execute the index.babel.html helper block ──
const source = fs.readFileSync(path.join(rootDir, 'src/index.babel.html'), 'utf8');
const start = source.indexOf('function xlsxCellText');
const end = source.indexOf('// rc2e.36: Cash-investment row applier');
if (start <= 0 || end <= start) {
  throw new Error('Could not locate XLSX helper block in src/index.babel.html (markers moved?)');
}

export const pipelineVersion = (source.match(/const EXTRACT_PIPELINE_VERSION = '([^']+)'/) || [])[1] || '(unknown)';

const helperBlock = source.slice(start, end);
const buildHarness = new Function(
  'normalizeTextKey','normalizeCompactKey','normalizePersonNameKey','personNameEquivalent','cleanPersonDisplayName','normaliseTextForMatch','normalizePolicyKey','moneyNumber','normalizeInsurerName','_titleCaseProductName','_titleCaseInsurerName','_normalizePersonNameFields','findSingaporeProductReference','singaporeProductKnowledgeApi','isSingaporeProductFalsePositive','inferPremiumTermFromProductName','_toIsoDateLoose','_normalizePolicyStatus','DOCUMENT_TRIAGE_META','CATEGORIES',
  helperBlock + '\nreturn { findAllXlsxPolicyHeaderRows, makeUniqueXlsxHeaders, buildXlsxRowsFromHeader, inferXlsxColumnMap, applyColumnMap, coalesceIspShieldRows, coalesceContinuationRiders, inferInsurerFromProductName, inferXlsxProductRule };'
);
export const fns = buildHarness(
  normalizeTextKey, normalizeCompactKey, normalizePersonNameKey, personNameEquivalent, cleanPersonDisplayName, normaliseTextForMatch, normalizePolicyKey, moneyNumber, normalizeInsurerName, _titleCaseProductName, _titleCaseInsurerName, _normalizePersonNameFields, findSingaporeProductReference, singaporeProductKnowledgeApi, isSingaporeProductFalsePositive, inferPremiumTermFromProductName, _toIsoDateLoose, _normalizePolicyStatus,
  { policy_schedule: { label: 'Policy schedule' } },
  { protection: true, health: true, savings: true, investment: true, retirement: true, cash_investments: true }
);

// ── Extract policies per sheet ──
export function extractAllSheets(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: false });
  const out = {};
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: false });
    const sections = fns.findAllXlsxPolicyHeaderRows(matrix);
    const policies = [];
    const sectionMeta = [];
    for (const section of sections) {
      const headers = fns.makeUniqueXlsxHeaders(matrix[section.headerIndex] || []);
      const rows = fns.buildXlsxRowsFromHeader(matrix, section.headerIndex, headers, sheetName, section.sectionLabel || '', section.endIndex);
      const map = fns.inferXlsxColumnMap(headers);
      sectionMeta.push({
        sectionLabel: section.sectionLabel, headerIndex: section.headerIndex,
        confidence: map.confidence, rowCount: rows.length
      });
      if (map.confidence < 5) continue;
      const rawPolicies = fns.applyColumnMap(rows, map.columnMap, map.categoryColumn);
      const coalesced = fns.coalesceContinuationRiders(fns.coalesceIspShieldRows(rawPolicies));
      for (const p of coalesced) {
        // Mirror the production enrichSpreadsheetPolicyCandidate insurer-from-name fill.
        if (!p.insurer || /^unknown$/i.test(String(p.insurer).trim())) {
          const inferred = fns.inferInsurerFromProductName(p.productName || p.policyName || '');
          if (inferred) p.insurer = inferred;
        }
        policies.push({
          ...p,
          _section: section.sectionLabel,
          _ridersOut: (p.riders || []).map(r => r.riderName || r.name || '(unnamed)')
        });
      }
    }
    out[sheetName] = { sections: sectionMeta, policies };
  }
  return out;
}
