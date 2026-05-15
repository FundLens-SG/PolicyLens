import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync('singapore-product-knowledge.js', 'utf8');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(code, ctx);

const api = ctx.PolicyLensSingaporeProductKnowledge;
assert.ok(api, 'knowledge API should load');
assert.ok(Array.isArray(api.products) && api.products.length >= 600, 'expected a broad SG product dictionary');

const cases = [
  ['AIA HSG MAX SPECIAL A', 'AIA', 'AIA HealthShield Gold Max Special A', 'health'],
  ['PRUExtra Premier CoPay', 'Prudential', 'PRUExtra Premier CoPay', 'health'],
  ['Aviva MyShield Plan 2', 'Singlife', 'Aviva MyShield Plan 2', 'health'],
  ['AXA Shield Plus Option A', 'HSBC Life', 'AXA Shield Plus Option A (legacy)', 'health'],
  ['Manulife InvestReady III', 'Manulife', 'Manulife InvestReady (III)', 'investment'],
  ['GREAT SupremeHealth P Plus', 'Great Eastern', 'GREAT SupremeHealth P PLUS', 'health'],
  ['MediShield Life', 'CPF Board', 'MediShield Life', 'health']
];

for (const [query, insurer, productName, category] of cases) {
  const hit = api.findProduct(query);
  assert.ok(hit, query + ' should match');
  assert.equal(hit.insurer, insurer, query + ' insurer');
  assert.equal(hit.productName, productName, query + ' product name');
  assert.equal(hit.category, category, query + ' category');
  assert.ok(hit.score >= 0.88, query + ' should be high confidence');
}

assert.equal(api.findProduct('AIA Vitality'), null, 'known wellness platform should not match as a policy');
assert.equal(api.isFalsePositiveName('DBS Insurance'), true, 'distribution brand should be a false positive');
assert.equal(api.findProduct('NTUC Income'), null, 'insurer-only text should not match IncomeShield products');
assert.equal(api.findProduct('Income'), null, 'generic insurer/product token should not match Income products');
assert.equal(api.findProduct('NTUC Income Customer Hotline'), null, 'hotline rows should not match NTUC Income policies');
assert.equal(api.isFalsePositiveName('Customer Portal'), true, 'customer portal table labels should be false positives');
assert.equal(api.isFalsePositiveName('Insurer Hotlines'), true, 'insurer hotline section labels should be false positives');

console.log('Singapore product knowledge: ' + api.products.length + ' products, ' + cases.length + ' match cases passed.');
