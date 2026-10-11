const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const page = 'pages/aftersale/service_station/application/application';

test('service liaison appears before repair location and uses one radio choice', () => {
  const markup = fs.readFileSync(path.join(ROOT, `${page}.wxml`), 'utf8');
  assert.ok(markup.indexOf('售后服务对接人员') < markup.indexOf('维修服务地点'));
  assert.doesNotMatch(markup, /class="organization-card"/);
  assert.match(markup, /<radio-group class="liaison-list"/);
  assert.match(markup, /<radio value="\{\{item\.identity_id\}\}"/);
  assert.doesNotMatch(markup, /<checkbox-group class="liaison-list"/);
});

test('organization address is the editable default and liaison contact is generated', () => {
  const logic = fs.readFileSync(path.join(ROOT, `${page}.js`), 'utf8');
  const markup = fs.readFileSync(path.join(ROOT, `${page}.wxml`), 'utf8');
  assert.match(logic, /savedReceiving && savedReceiving\.address\) \|\| organization\.address/);
  assert.match(logic, /receivingContactName: selectedCandidate[\s\S]*selectedCandidate\.name/);
  assert.match(logic, /receivingContactPhone: selectedCandidate[\s\S]*selectedCandidate\.phone/);
  assert.match(logic, /never display the previous liaison's contact by fallback/);
  assert.doesNotMatch(logic, /selectedCandidate\.phone\) \|\| \(savedReceiving/);
  assert.match(markup, /bindinput="onReceivingAddressInput"/);
  assert.match(markup, /receivingContactName[\s\S]*readonly="\{\{true\}\}"/);
  assert.match(markup, /receivingContactPhone[\s\S]*readonly="\{\{true\}\}"/);
  assert.doesNotMatch(logic, /receiving_contact_name:/);
  assert.doesNotMatch(logic, /receiving_contact_phone:/);
});
