const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

test('merchant owner can edit the separate organization official address in account profile', () => {
  const pageJs = fs.readFileSync(path.join(ROOT, 'pages/personal/edit/edit.js'), 'utf8');
  const pageWxml = fs.readFileSync(path.join(ROOT, 'pages/personal/edit/edit.wxml'), 'utf8');

  assert.match(pageWxml, /组织官方地址/);
  assert.match(pageWxml, /wx:if="\{\{canEditOrganizationAddress\}\}"/);
  assert.match(pageJs, /url: `\$\{app\.globalData\.apiBase\}\/account\/profile\//);
  assert.match(pageJs, /method: 'GET'/);
  assert.match(pageJs, /profileData\.organization_address = organizationAddress/);
});

test('service station receives an inherited but independently editable after-sales receiving address', () => {
  const pageJs = fs.readFileSync(path.join(ROOT, 'pages/aftersale/service_station/application/application.js'), 'utf8');
  const pageWxml = fs.readFileSync(path.join(ROOT, 'pages/aftersale/service_station/application/application.wxml'), 'utf8');

  assert.match(pageWxml, /官方售后服务收件地址/);
  assert.match(pageJs, /savedReceiving && savedReceiving\.address\) \|\| organization\.address/);
  assert.match(pageJs, /action: 'update_receiving_address'/);
});
