const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const detailJs = fs.readFileSync(path.join(ROOT, 'pages/aftersale/detail/detail.js'), 'utf8');
const detailWxml = fs.readFileSync(path.join(ROOT, 'pages/aftersale/detail/detail.wxml'), 'utf8');
const requestJs = fs.readFileSync(path.join(ROOT, 'pages/customer/aftersale/request/request.js'), 'utf8');
const requestWxml = fs.readFileSync(path.join(ROOT, 'pages/customer/aftersale/request/request.wxml'), 'utf8');

test('triage lets the manager preselect suspected BOM materials before a station lookup', () => {
  assert.match(detailWxml, /可能故障或需要更换的物料型号/);
  assert.match(detailWxml, /checkbox-group bindchange="onTriageMaterials"/);
  assert.match(detailJs, /preliminary_fault_materials: triage\.preliminaryMaterials/);
  assert.match(detailJs, /COMPONENT_SUSPECTED/);
});

test('service station recommendations are refreshed from the server and show distance and contact details', () => {
  assert.match(detailWxml, /推荐售后服务站/);
  assert.match(detailWxml, /{{item\.distance_label}}/);
  assert.match(detailWxml, /{{item\.phone}}/);
  assert.match(detailWxml, /catchtap="callServiceStation"/);
  assert.match(detailJs, /service_station_recommendations/);
  assert.match(detailJs, /service_station_application_id/);
  assert.match(detailJs, /wx\.makePhoneCall/);
});

test('confirming a station sends the confirmed station application id', () => {
  assert.match(detailJs, /data\.service_station_application_id = candidate\.station_application_id/);
  assert.match(detailWxml, /确认并通知厂家与服务站/);
});

test('station distance lookup waits for the fault choice and required BOM materials', async () => {
  let definition;
  let requestCount = 0;
  vm.runInNewContext(detailJs, {
    getApp: () => ({ globalData: { apiBase: '' }, authHeader: () => ({}) }),
    Page: value => { definition = value; },
    wx: { request: () => { requestCount += 1; } },
    Promise,
    encodeURIComponent
  });
  const page = {
    getTriageOptions: definition.getTriageOptions,
    data: {
      applicationId: 7,
      detail: { triage_options: { preliminary_fault_types: [{ value: 'COMPONENT_SUSPECTED' }] } },
      triage: {
        route: 'SERVICE_STATION',
        faultIndex: -1,
        preliminaryMaterials: [],
        candidates: [],
        candidateIndex: -1
      }
    },
    setData(patch) {
      for (const [key, value] of Object.entries(patch)) {
        const parts = key.split('.');
        let target = this.data;
        while (parts.length > 1) target = target[parts.shift()];
        target[parts[0]] = value;
      }
    }
  };
  await definition.loadStationRecommendations.call(page);
  assert.equal(requestCount, 0);
  assert.match(page.data.triage.stationRecommendationMessage, /先选择初步故障认定/);

  page.data.triage.faultIndex = 0;
  await definition.loadStationRecommendations.call(page);
  assert.equal(requestCount, 0);
  assert.match(page.data.triage.stationRecommendationMessage, /先勾选可能需要更换的BOM物料/);
});

test('aftersales request and detail cards have independent fold controls', () => {
  for (const field of ['equipmentExpanded', 'locationExpanded', 'faultExpanded']) {
    assert.match(requestWxml, new RegExp(`data-field="${field}"`));
  }
  for (const field of ['summaryExpanded', 'reportExpanded', 'triageExpanded', 'afterSalesHistoryExpanded']) {
    assert.match(detailWxml, new RegExp(`data-field="${field}"`));
  }
  assert.match(requestJs, /toggleSection\(e\)/);
  assert.match(detailJs, /toggleSection\(e\)/);
});
