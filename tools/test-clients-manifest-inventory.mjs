import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(rootDir, 'src/index.babel.html'), 'utf8');
const start = source.indexOf('function summarizeManifestPoliciesByClient');
const end = source.indexOf('async function buildLocalDriveClientsManifest');

assert.ok(start > 0 && end > start, 'expected clients-manifest inventory helper block in src/index.babel.html');

function normalizePolicyKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function normalizePersonNameKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function moneyNumber(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const n = parseFloat(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function annualizedPremium(policy) {
  const raw = moneyNumber(policy?.annualPremium || policy?.premiumAmount);
  if (!raw) return 0;
  return policy?.premFrequency === 'monthly' ? raw * 12 : raw;
}

function buildPolicyIdentityFingerprint(policy) {
  return { id: normalizePolicyKey([policy.insurer, policy.productName, policy.policyNumber].join('|')) };
}

function isValidDriveFileId(value) {
  return /^[A-Za-z0-9_-]{8,}$/.test(String(value || ''));
}

function syncTimeMs(value) {
  if (!value) return 0;
  const n = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(n) ? n : 0;
}

function getPolicyLensDeviceName() {
  return 'Test Device';
}

function getPolicyLensUserEmail() {
  return 'advisor@example.com';
}

const helperBlock = source.slice(start, end);
const buildHarness = new Function(
  'annualizedPremium',
  'moneyNumber',
  'buildPolicyIdentityFingerprint',
  'normalizePolicyKey',
  'normalizePersonNameKey',
  'isValidDriveFileId',
  'syncTimeMs',
  'getPolicyLensDeviceName',
  'getPolicyLensUserEmail',
  'UNASSIGNED_TIER',
  'DRIVE_CLIENTS_MANIFEST_VERSION',
  helperBlock + '\nreturn { summarizeManifestPoliciesByClient, normalizeManifestClient, parseDriveClientsManifest, mergeDriveClientsManifest };'
);

const {
  summarizeManifestPoliciesByClient,
  normalizeManifestClient,
  parseDriveClientsManifest,
  mergeDriveClientsManifest
} = buildHarness(
  annualizedPremium,
  moneyNumber,
  buildPolicyIdentityFingerprint,
  normalizePolicyKey,
  normalizePersonNameKey,
  isValidDriveFileId,
  syncTimeMs,
  getPolicyLensDeviceName,
  getPolicyLensUserEmail,
  'Unassigned',
  2
);

const policies = [
  {
    id: 'pol-jy-1',
    clientId: 'client-jy',
    insurer: 'AIA',
    productName: 'AIA HealthShield Gold Max',
    policyNumber: 'H230740143',
    annualPremium: 100,
    premFrequency: 'monthly',
    status: 'Inforce',
    _syncUpdatedAt: '2026-05-16T01:00:00.000Z'
  },
  {
    id: 'pol-jy-2',
    clientId: 'client-jy',
    insurer: 'Great Eastern',
    productName: 'GREAT Junior Protector',
    policyNumber: 'G123',
    annualPremium: 300,
    status: 'Terminated',
    _syncUpdatedAt: '2026-05-16T02:00:00.000Z'
  },
  {
    id: 'pol-eric-1',
    clientId: 'client-eric',
    insurer: 'Singlife',
    productName: 'Singlife Shield',
    policyNumber: 'S1',
    annualPremium: 500,
    status: 'Inforce',
    _syncUpdatedAt: '2026-05-15T02:00:00.000Z'
  }
];

const summaryByClient = summarizeManifestPoliciesByClient(policies);
const jy = normalizeManifestClient({
  clientId: 'client-jy',
  clientName: 'Soh Jia Yi',
  tier: 'Platinum',
  fileId: 'driveFileJy123',
  lastSyncedAt: '2026-05-16T03:00:00.000Z'
}, summaryByClient.get('client-jy'));

assert.equal(jy.clientKey, 'soh jia yi');
assert.equal(jy.policyCount, 2);
assert.equal(jy.activePolicyCount, 1);
assert.equal(jy.annualPremiumEstimate, 1500);
assert.equal(jy.lastPolicyUpdatedAt, '2026-05-16T02:00:00.000Z');
assert.equal(jy.policyInventory.policyRefs.length, 2);
assert.equal(jy.policyInventory.policyRefs[0].policyId, 'pol-jy-2', 'latest policy ref should sort first');
assert.ok(jy.policyFingerprintDigest.length > 10);

const parsed = parseDriveClientsManifest({
  schemaVersion: 1,
  clients: [jy],
  tombstones: []
});
assert.equal(parsed.schemaVersion, 1, 'parse preserves remote schema version for compatibility');
assert.equal(parsed.clients[0].policyInventory.policyCount, 2);

const merged = mergeDriveClientsManifest(
  {
    clients: [{
      ...jy,
      policyCount: 1,
      updatedAt: '2026-05-15T00:00:00.000Z'
    }],
    tombstones: []
  },
  {
    clients: [jy],
    tombstones: []
  }
);

assert.equal(merged.schemaVersion, 2);
assert.equal(merged.updatedByDevice, 'Test Device');
assert.equal(merged.clients.length, 1);
assert.equal(merged.clients[0].policyInventory.policyCount, 2, 'newer manifest entry should win with inventory intact');

const tombstoned = mergeDriveClientsManifest(merged, {
  tombstones: [{ clientId: 'client-jy', reason: 'client-trash', trashedAt: '2026-05-16T04:00:00.000Z' }]
});
assert.equal(tombstoned.clients.some(c => c.clientId === 'client-jy'), false, 'tombstones remove clients from manifest list');

console.log('Clients manifest inventory checks passed.');
