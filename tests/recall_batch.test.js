const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../pages/quality_trace/recall_detail/recall_detail.js'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));

test('三个厂家全批岗位与仅知晓岗位在页面中保持独立', async () => {
  for (const role of ['factory_chief_engineer', 'factory_sales_assistant', 'factory_logistics',
    'factory_admin', 'factory_manager', 'factory_sales', 'factory_matching', 'factory_production']) {
    const { page, qt } = pageFixture();
    const full = ['factory_chief_engineer', 'factory_sales_assistant', 'factory_logistics'].includes(role);
    const observer = ['factory_admin', 'factory_manager'].includes(role);
    page.setData({ role: 'factory_chief_engineer', isFactory: true, isQualityFactory: true });
    qt.request = async () => ({ id: 10, status: 'ACTIVE', device_count: observer ? null : 3,
      viewer: { role, organization_id: 1, full_campaign_access: full, observer_only: observer },
      devices: [], batch_flow: { enabled: false, groups: [] } });
    await page.load();
    assert.equal(page.data.isFactory, full);
    assert.equal(page.data.isQualityFactory, role === 'factory_chief_engineer');
    assert.equal(page.data.isObserver, observer);
    assert.equal(page.data.batchEnabled, false);
  }
});

test('生产岗位保留本台处置操作且不显示全批控制台', async () => {
  const { page, qt } = pageFixture();
  qt.request = async () => ({ id: 10, status: 'ACTIVE', device_count: 1,
    viewer: { role: 'factory_production', organization_id: 1, full_campaign_access: false },
    batch_flow: { enabled: false, groups: [] }, devices: [{ id: 7, transport_legs: [],
      post_disposition: { execution_stage: 'WAITING_PRODUCTION', available_actions: { production_complete: true } } }] });
  await page.load();
  assert.equal(page.data.isFactory, false);
  assert.equal(page.data.isQualityFactory, false);
  assert.equal(page.data.devices.length, 1);
  assert.equal(page.data.selected.post_disposition.available_actions.production_complete, true);
});
const group = (action, ids, key = 'dispatch:1') => ({
  key, action, title: '本批设备', action_label: '一键办理', device_count: ids.length,
  from_organization: { id: 2, name: '商家' }, to_organization: { id: 1, name: '厂家' },
  devices: ids.map(id => ({ recall_device_id: id, sn: `SN-${id}` }))
});

function pageFixture() {
  let page;
  const qt = { statusLabels: {}, request: async () => ({}) };
  const wx = {
    showModal: options => options.success && options.success({ confirm: true }),
    showToast() {}, showLoading() {}, hideLoading() {}, pageScrollTo() {}
  };
  vm.runInNewContext(source, {
    getApp: () => ({ globalData: {} }), require: () => qt, Page: value => { page = value; },
    wx, setTimeout: () => {},
  });
  page.data = copy(page.data);
  page.setData = (values, done) => { Object.assign(page.data, copy(values)); if (done) done(); };
  page.setData({ campaignId: 10, role: 'merchant_owner', organizationId: 2, loading: false });
  return { page, qt, wx };
}

function prepare(page, groups) {
  page.setData(page.prepareBatchState({ enabled: true, groups }));
  page.setData({ batchEvidence: { storage_key: 'private/recall/test.jpg' }, batchProvider: '物流', batchTrackingNo: 'TRACK-1' });
}

test('默认全选并允许部分办理，切换批次重新全选且不复用凭证', () => {
  const { page } = pageFixture();
  prepare(page, [group('DISPATCH', [1, 2, 3]), group('RECEIVE', [4, 5], 'receive:2:9')]);
  assert.deepEqual(page.data.batchSelectedIds, [1, 2, 3]);
  page.selectBatchDevices({ detail: { value: ['1', '3'] } });
  assert.equal(page.data.batchSelectedCount, 2);
  assert.equal(page.data.batchAllSelected, false);
  page.changeBatchGroup({ detail: { value: 1 } });
  assert.equal(page.data.batchGroups.length, 2);
  assert.equal(page.data.batchGroupIndex, 1);
  assert.deepEqual(page.data.batchSelectedIds, [4, 5]);
  assert.equal(page.data.batchEvidence, null);
  assert.equal(page.data.batchTrackingNo, '');
});

test('多台设备仅发一个批量请求，连续点击不重复提交', async () => {
  const { page, qt, wx } = pageFixture();
  prepare(page, [group('DISPATCH', [1, 2, 3])]);
  page.load = async () => {};
  const requests = [];
  qt.request = async (url, method, data) => { requests.push({ url, method, data: copy(data) }); return { processed_count: 3 }; };
  let confirm;
  wx.showModal = options => { confirm = options.success; };
  const first = page.submitBatch();
  await page.submitBatch();
  assert.equal(requests.length, 0);
  confirm({ confirm: true });
  await first;
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/recalls/10/batch-operations/');
  assert.deepEqual(requests[0].data.recall_device_ids, [1, 2, 3]);
  assert.equal(requests[0].data.tracking_no, 'TRACK-1');
  assert.equal(page.data.busy, false);
});

test('网络失败保留提交标识，修改清单后使用新标识', async () => {
  const { page, qt } = pageFixture();
  prepare(page, [group('DISPATCH', [1, 2, 3])]);
  const requests = [];
  qt.request = async (url, method, data) => { requests.push(copy(data)); throw new Error('模拟网络失败'); };
  await page.submitBatch();
  await page.submitBatch();
  assert.equal(requests[0].client_request_id, requests[1].client_request_id);
  page.selectBatchDevices({ detail: { value: ['1', '2'] } });
  await page.submitBatch();
  assert.notEqual(requests[0].client_request_id, requests[2].client_request_id);
  assert.deepEqual(requests[2].recall_device_ids, [1, 2]);
});

test('批量岗位使用清单办理，原用户交付按钮仍有效', () => {
  const { page } = pageFixture();
  const row = { id: 1, transport_legs: [{ status: 'PREPARING', from_organization: { id: 2 }, to_organization: { id: 1 } }] };
  assert.equal(page.decorateDevice(row, true).canDispatch, false);
  assert.equal(page.decorateDevice(row, false).canDispatch, true);
  page.setData({ role: 'customer_owner' });
  const customer = page.decorateDevice({ id: 1, handover: { available_actions: { submit_direct_shipment: true } } }, false);
  assert.equal(customer.canSubmitDirect, true);
});

test('旧单设备任务链接自动加载所属批次的批量清单', async () => {
  const { page, qt } = pageFixture();
  page.setData({ campaignId: 0, recallDeviceId: 7 });
  const urls = [];
  qt.request = async url => {
    urls.push(url);
    if (url === '/recall-devices/7/') return { id: 7, campaign_id: 10 };
    return { id: 10, devices: [{ id: 7 }, { id: 8 }], batch_flow: { enabled: true, groups: [group('DISPATCH', [7, 8])] } };
  };
  await page.load();
  assert.deepEqual(urls, ['/recall-devices/7/', '/recalls/10/']);
  assert.equal(page.data.campaignId, 10);
  assert.equal(page.data.batchSelectedCount, 2);
  assert.equal(page.data.selected.id, 7);
});

test('接收待办优先显示到货清单，物流单号区分不同批次', () => {
  const { page } = pageFixture();
  page.setData({ focusStage: 'MERCHANT_PENDING_RECEIPT' });
  prepare(page, [group('DISPATCH', [1, 2]), { ...group('RECEIVE', [3, 4], 'receive:2:1'), tracking_no: 'RECEIPT-001' }]);
  assert.equal(page.data.batchGroup.action, 'RECEIVE');
  assert.equal(page.data.batchGroupIndex, 1);
  assert.ok(page.data.batchGroup.pickerLabel.includes('RECEIPT-001'));
});

test('服务器用户身份覆盖厂家缓存，只显示自己的设备和交付操作', async () => {
  const { page, qt } = pageFixture();
  page.setData({ role: 'factory_chief_engineer', organizationId: 1, taskFocusDeviceId: 99,
    evidence: { storage_key: 'previous.jpg' }, batchGroup: group('DISPATCH', [99]) });
  qt.request = async () => ({ id: 10, status: 'ACTIVE', viewer: { role: 'customer_owner', organization_id: 9 },
    devices: [{ id: 7, handover: { available_actions: { select_delivery_method: true } }, next_step: '请选择交付方式' }],
    batch_flow: { enabled: false, groups: [] } });
  await page.load();
  assert.equal(page.data.role, 'customer_owner');
  assert.equal(page.data.isCustomer, true);
  assert.equal(page.data.isFactory, false);
  assert.equal(page.data.devices.length, 1);
  assert.equal(page.data.taskFocusDeviceId, 0);
  assert.equal(page.data.selected.canSelectDelivery, true);
  assert.equal(page.data.batchGroup, null);
  assert.equal(page.data.evidence, null);
});

test('第二下级商家已发出时保留三台进度，不显示接收按钮或下级待交提示', async () => {
  const { page, qt } = pageFixture();
  const message = '3 台：已发出至直属商家，等待其确认接收。';
  qt.request = async () => ({ id: 10, status: 'ACTIVE', viewer: { role: 'merchant_owner', organization_id: 8 },
    devices: [4, 5, 6].map(id => ({ id, next_step: message, transport_legs: [{ status: 'IN_TRANSIT',
      from_organization: { id: 8 }, to_organization: { id: 3 } }] })),
    batch_flow: { enabled: true, groups: [], guidance: '商家三岗位协同', empty_message: message } });
  await page.load();
  assert.equal(page.data.devices.length, 3);
  assert.equal(page.data.batchEmptyMessage, message);
  assert.equal(page.data.batchGroup, null);
  assert.ok(page.data.devices.every(row => !row.canReceive && !row.canDispatch));
});

test('来源商家旧交接操作服从服务器权限，上级同岗位不能接管', () => {
  const { page } = pageFixture();
  const handover = { status: 'PICKUP_SCHEDULED', merchant_organization_id: 7,
    available_actions: { merchant_receive: false, schedule_pickup: false } };
  page.setData({ organizationId: 3, role: 'merchant_owner' });
  assert.equal(page.decorateDevice({ id: 1, handover }, true).canMerchantReceive, false);
  handover.available_actions.merchant_receive = true;
  page.setData({ organizationId: 7, role: 'merchant_stock' });
  assert.equal(page.decorateDevice({ id: 1, handover }, true).canMerchantReceive, true);
});

test('用户和司机三种交付方式的操作标志完整保留，锁定后不再出现选项', () => {
  const { page } = pageFixture();
  for (const role of ['customer_owner', 'driver']) {
    page.setData({ role, organizationId: 9 });
    for (const [apiAction, button] of [['select_delivery_method', 'canSelectDelivery'],
      ['submit_direct_shipment', 'canSubmitDirect'], ['submit_factory_pickup_shipment', 'canSubmitFactoryPickupShipment']]) {
      assert.equal(page.decorateDevice({ handover: { available_actions: { [apiAction]: true } } }, false)[button], true);
      assert.equal(page.decorateDevice({ handover: { available_actions: { [apiAction]: false } } }, false)[button], false);
    }
  }
});

test('权限失败清空旧设备和操作区，较早请求不能覆盖较新身份', async () => {
  const { page, qt } = pageFixture();
  let resolveOld;
  qt.request = () => new Promise(resolve => { resolveOld = resolve; });
  const oldLoad = page.load();
  qt.request = async () => ({ id: 10, status: 'ACTIVE', viewer: { role: 'customer_owner', organization_id: 9 },
    devices: [{ id: 7 }], batch_flow: { enabled: false, groups: [] } });
  await page.load();
  resolveOld({ id: 10, devices: [{ id: 99 }], viewer: { role: 'factory_chief_engineer', organization_id: 1 } });
  await oldLoad;
  assert.equal(page.data.selected.id, 7);
  assert.equal(page.data.role, 'customer_owner');
  qt.request = async () => { throw new Error('当前账号无权查看'); };
  await page.load();
  assert.equal(page.data.campaign, null);
  assert.equal(page.data.selected, null);
  assert.equal(page.data.devices.length, 0);
  assert.equal(page.data.batchEnabled, false);
});

test('完成或取消的批次禁止回退到单台运输按钮，取消程次不覆盖有效程次', () => {
  const { page } = pageFixture();
  const row = { transport_legs: [{ status: 'PREPARING', from_organization: { id: 2 }, to_organization: { id: 1 } },
    { status: 'CANCELLED', from_organization: { id: 2 }, to_organization: { id: 1 } }] };
  assert.equal(page.decorateDevice(row, false).latestLeg.status, 'PREPARING');
  assert.equal(page.decorateDevice(row, false, false).canDispatch, false);
});

function otherPage(relative, qt, app = { globalData: {} }) {
  let page;
  const wx = { showToast() {}, redirectTo() {}, showLoading() {}, hideLoading() {}, showModal() {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'), {
    getApp: () => app, require: () => qt, Page: value => { page = value; }, wx, setTimeout: () => {}
  });
  page.data = copy(page.data);
  page.setData = (values, done) => { Object.assign(page.data, copy(values)); if (done) done(); };
  return page;
}

test('来源商家扫码先只读核对SN，提交接管后关闭重复操作', async () => {
  const requests = [];
  const qt = { request: async (url, method, data) => {
    requests.push({ url, method, data });
    return method === 'POST' ? { recall_device_id: 7 } : { sn: 'SN-7', recall_device_id: 7, can_accept: true };
  } };
  const page = otherPage('pages/quality_trace/recall_handover_accept/recall_handover_accept.js', qt);
  page.setData({ token: 'test-token', receiptNote: 'SN核验通过' });
  await page.loadPreview();
  assert.equal(page.data.preview.sn, 'SN-7');
  assert.equal(requests.filter(request => request.method === 'POST').length, 0);
  await page.accept();
  await page.accept();
  assert.equal(requests.filter(request => request.method === 'POST').length, 1);
  assert.equal(page.data.preview.can_accept, false);
});

test('召回任务按实时阶段显示，普通业务任务的完成显示保持原语义', () => {
  const app = { globalData: { taskList: [
    { id: 1, state: 'DONE', group_kind: 'QUALITY_RECALL', display_state: '跟踪中' },
    { id: 2, state: 'DONE', group_kind: '', domain: 'LOGISTICS' }
  ] } };
  const page = otherPage('pages/personal/task_list/task_list.js', {}, app);
  page.syncTasks();
  assert.equal(page.data.taskList[0].stateText, '跟踪中');
  assert.equal(page.data.taskList[1].stateText, '已完成');
});

test('旧处置分配页面遇到非总工程师身份时清空旧清单，不提交请求', async () => {
  const requests = [];
  const qt = { request: async (url, method) => {
    requests.push(method || 'GET');
    return { id: 10, status: 'ACTIVE', viewer: { role: 'supplier_sales', organization_type: 'SUPPLIER' }, devices: [{ id: 7 }] };
  } };
  const page = otherPage('pages/quality_trace/recall_disposition/recall_disposition.js', qt);
  page.setData({ campaignId: 10, campaign: { id: 10 }, selectedIds: [7] });
  await page.load();
  await page.submit('REPAIR_NO_PARTS', '维修', [7]);
  assert.equal(page.data.campaign, null);
  assert.equal(page.data.selectedIds.length, 0);
  assert.deepEqual(requests, ['GET']);
});
