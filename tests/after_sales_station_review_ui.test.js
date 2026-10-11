const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const route = 'pages/aftersale/service_station/review/review';

test('station review page is registered and uses the shared themed page shell', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const markup = fs.readFileSync(path.join(ROOT, `${route}.wxml`), 'utf8');
  const pageConfig = JSON.parse(fs.readFileSync(path.join(ROOT, `${route}.json`), 'utf8'));

  assert.equal(manifest.app_json_route.path, route);
  assert.match(markup, /^<theme-shell title-eyebrow="售后服务站审核"/);
  assert.match(markup, /<\/theme-shell>\s*$/);
  assert.equal(pageConfig.navigationStyle, 'custom');
  assert.ok(pageConfig.usingComponents['theme-shell']);
});

test('review page shows the application facts and exposes approve or reject only when authorized', () => {
  const markup = fs.readFileSync(path.join(ROOT, `${route}.wxml`), 'utf8');
  const logic = fs.readFileSync(path.join(ROOT, `${route}.js`), 'utf8');

  for (const label of ['申请组织', '维修服务地点', '官方售后服务收件信息', '售后服务对接人员']) {
    assert.ok(markup.includes(label), `missing application detail: ${label}`);
  }
  assert.match(markup, /wx:if="\{\{canReview\}\}"/);
  assert.match(markup, /data-action="approve"/);
  assert.match(markup, /data-action="reject"/);
  assert.match(markup, /taskCompletedByName/);
  assert.match(logic, /method: 'GET'/);
  assert.match(logic, /method: 'POST'/);
  assert.match(logic, /\/lifecycle\/after-sales\/service-station\/applications\//);
  assert.match(logic, /action, review_note: note/);
  assert.match(markup, /厂家销售经理及分管该岗位的高级经理可以协同审核/);
});
