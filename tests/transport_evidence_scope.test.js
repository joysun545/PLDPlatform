const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../pages/aftersale/detail/detail.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const applicationUrl = '/pldp/api/lifecycle/after-sales/applications/31/';

function ftRow(direction, index, transportId = 'transport-1', media = []) {
  return { direction, index, can_send: true, status: 'PENDING',
    evidence_scope_key: `ft:${transportId}:${direction}:${index}:send`,
    evidence_count: media.length, evidence_remaining: 9 - media.length, evidence_media: media };
}
function oldRow(id, media = []) {
  return { id, direction: 'OLD', can_send: true, status: 'PENDING',
    evidence_scope_key: `old:${id}:send`, evidence_count: media.length,
    evidence_remaining: 9 - media.length, evidence_media: media };
}
function mediaRecord(id, scope, kind = 'LOGISTICS', extra = {}) {
  return { id, media_type: 'IMAGE', purpose: 'REPAIR_RETURN_SHIPMENT_DOCUMENT',
    evidence_scope_key: scope, evidence_kind: kind, client_upload_id: `existing-${id}`,
    url: `/api/lifecycle/after-sales/media/${id}/file/`, original_name: `${id}.jpg`, ...extra };
}
function setup(detail, handlers = {}) {
  const state = { detail: plain(detail), uploads: [], posts: [], toasts: [], downloads: [], byClient: new Map(), nextId: 100 };
  const app = { globalData: { apiBase: '/pldp/api' }, authHeader: () => ({ Authorization: 'Bearer current-user' }) };
  let page;
  function targetRow(form) {
    if (form.evidence_action === 'FACTORY_TRANSPORT_SEND') {
      return ((state.detail.factory_transport || {}).legs || []).find(row => row.direction === form.direction && row.index === Number(form.index));
    }
    return ((state.detail.replacement_flow || {}).legs || []).find(row => row.id === Number(form.leg_id));
  }
  function acceptUpload(request) {
    const form = request.formData;
    const scope = form.evidence_action === 'FACTORY_TRANSPORT_SEND'
      ? `ft:${form.transport_id}:${form.direction}:${form.index}:send`
      : (form.evidence_action === 'SEND_REPLACEMENT_LEG' ? `old:${form.leg_id}:send` : '');
    let record = form.client_upload_id && state.byClient.get(form.client_upload_id);
    if (!record) {
      record = mediaRecord(state.nextId++, scope, form.evidence_kind, {
        media_type: form.media_type, client_upload_id: form.client_upload_id, purpose: form.purpose
      });
      if (form.client_upload_id) state.byClient.set(form.client_upload_id, record);
      const row = targetRow(form);
      if (row) {
        row.evidence_media.push(record);
        row.evidence_count += 1;
        row.evidence_remaining = Math.max(0, 9 - row.evidence_count);
      }
    }
    return record;
  }
  const wx = {
    showToast: ({ title }) => state.toasts.push(title),
    pageScrollTo() {},
    request(request) {
      if (request.method === 'GET') {
        assert.equal(request.url, applicationUrl);
        return request.success({ statusCode: 200, data: { code: 0, data: plain(state.detail) } });
      }
      assert.equal(request.url, applicationUrl + 'escalation/');
      state.posts.push(plain(request.data));
      if (handlers.post) return handlers.post(request, state);
      request.success({ statusCode: 200, data: { code: 0, data: {} } });
    },
    uploadFile(request) {
      state.uploads.push({ ...request, formData: plain(request.formData) });
      if (handlers.upload) return handlers.upload(request, state, acceptUpload);
      request.success({ statusCode: 201, data: JSON.stringify({ code: 0, data: acceptUpload(request) }) });
    },
    downloadFile(request) {
      state.downloads.push(request);
      request.success({ statusCode: 200, tempFilePath: `/downloaded/${state.downloads.length}.jpg` });
    }
  };
  vm.runInNewContext(source, { getApp: () => app, Page: value => { page = value; }, wx, console });
  page.data = plain(page.data);
  page.setData = (patch, callback) => { Object.assign(page.data, patch); if (callback) callback(); };
  page.setData({ applicationId: 31, detail: plain(detail), replacementCompany: '顺丰', replacementTracking: 'SF31' });
  return { page, state, wx, acceptUpload };
}
function ftEvent(direction = 'inbound', index = 0) { return { currentTarget: { dataset: { direction, index } } }; }
function chooseFt(page, files, direction = 'inbound', index = 0) {
  page.onActionMediaChange({ currentTarget: { dataset: {
    evidenceAction: 'FACTORY_TRANSPORT_SEND', transportId: page.data.detail.factory_transport.transport_id, direction, index
  } }, detail: { files } });
}
function chooseOld(page, kind, files, legId = 13) {
  page[kind === 'DEVICE' ? 'onOldReturnDeviceMedia' : 'onOldReturnLogisticsMedia']({
    currentTarget: { dataset: { legId } }, detail: { files }
  });
}
const file = (name, media_type = 'IMAGE') => ({ key: name, path: `/local/${name}`, media_type, status: 'PENDING' });

test('factory send carries its real target through runAction and both upload methods', async () => {
  const { page, state } = setup({ factory_transport: { transport_id: 'transport-1', legs: [ftRow('outbound', 2)] } });
  chooseFt(page, [file('waybill.jpg')], 'outbound', 2);
  await page.factoryTransportSend(ftEvent('outbound', 2));
  assert.equal(state.uploads.length, 1);
  const form = state.uploads[0].formData;
  assert.equal(form.evidence_action, 'FACTORY_TRANSPORT_SEND');
  assert.equal(form.transport_id, 'transport-1');
  assert.equal(form.direction, 'outbound');
  assert.equal(form.index, 2);
  assert.equal(form.evidence_kind, 'LOGISTICS');
  assert.match(form.client_upload_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.deepEqual(state.posts[0].document_ids, [100]);
  assert.equal(state.posts[0].transport_id, 'transport-1');
  assert.equal(state.posts[0].factory_transport_upload, undefined);
});

test('OLD real send uploads separate typed groups for the exact existing leg', async () => {
  const { page, state } = setup({ replacement_flow: { protocol_version: 6, legs: [oldRow(13)] } });
  chooseOld(page, 'DEVICE', [file('old.jpg')]);
  chooseOld(page, 'LOGISTICS', [file('receipt.pdf', 'DOCUMENT')]);
  await page.sendOldReplacementLeg({ currentTarget: { dataset: { id: 13 } } });
  assert.deepEqual(state.uploads.map(upload => upload.formData.evidence_kind), ['DEVICE', 'LOGISTICS']);
  state.uploads.forEach(upload => {
    assert.equal(upload.formData.evidence_action, 'SEND_REPLACEMENT_LEG');
    assert.equal(upload.formData.leg_id, 13);
    assert.equal(upload.formData.transport_id, undefined);
  });
  assert.deepEqual(state.posts[0].device_image_ids, [100]);
  assert.deepEqual(state.posts[0].logistics_document_ids, [101]);
  assert.equal(state.posts[0].qr_text, undefined);
});

test('a lost upload response retries the same file key and receives the original media id', async () => {
  let first = true;
  const { page, state } = setup({ factory_transport: { transport_id: 'transport-1', legs: [ftRow('inbound', 0)] } }, {
    upload(request, state, accept) {
      const record = accept(request);
      if (first) { first = false; return request.fail({ errMsg: 'uploadFile:fail timeout' }); }
      request.success({ statusCode: 200, data: JSON.stringify({ code: 0, data: record }) });
    }
  });
  chooseFt(page, [file('proof.jpg')]);
  await page.factoryTransportSend(ftEvent());
  assert.equal(state.posts.length, 0);
  assert.equal(page.data.actionMedia[0].status, 'FAILED');
  await page.factoryTransportSend(ftEvent());
  assert.equal(state.uploads.length, 2);
  assert.equal(state.uploads[0].formData.client_upload_id, state.uploads[1].formData.client_upload_id);
  assert.equal(state.byClient.size, 1);
  assert.deepEqual(state.posts[0].document_ids, [100]);
});

test('partial upload retry skips a success only within the same target scope', async () => {
  let failSecond = true;
  const { page, state } = setup({ factory_transport: { transport_id: 'transport-1', legs: [ftRow('inbound', 0)] } }, {
    upload(request, state, accept) {
      if (state.uploads.length === 2 && failSecond) { failSecond = false; return request.fail({}); }
      request.success({ statusCode: 201, data: JSON.stringify({ code: 0, data: accept(request) }) });
    }
  });
  chooseFt(page, [file('one.jpg'), file('two.jpg')]);
  await page.factoryTransportSend(ftEvent());
  assert.equal(state.posts.length, 0);
  await page.factoryTransportSend(ftEvent());
  assert.equal(state.uploads.length, 3);
  assert.equal(state.uploads[1].formData.client_upload_id, state.uploads[2].formData.client_upload_id);
  assert.deepEqual(state.posts[0].document_ids, [100, 101]);
});

test('moving a local uploaded file to another leg clears its old id and uses a new request key', async () => {
  const { page, state } = setup({ factory_transport: { transport_id: 'transport-1', legs: [ftRow('inbound', 0), ftRow('outbound', 0)] } }, {
    post(request) { request.fail({}); }
  });
  chooseFt(page, [file('proof.jpg')]);
  await page.factoryTransportSend(ftEvent());
  const oldFile = plain(page.data.actionMedia[0]);
  chooseFt(page, [oldFile], 'outbound', 0);
  assert.equal(page.data.actionMedia[0].serverMediaId, undefined);
  assert.notEqual(page.data.actionMedia[0].clientUploadId, oldFile.clientUploadId);
  await page.factoryTransportSend(ftEvent('outbound', 0));
  assert.equal(state.uploads.length, 2);
  assert.deepEqual(state.posts.map(post => post.document_ids), [[100], [101]]);
  assert.notEqual(state.uploads[0].formData.client_upload_id, state.uploads[1].formData.client_upload_id);
});

test('refresh restores only the selected server scope and explicit kinds, with authenticated previews', async () => {
  const rowA = oldRow(13, [mediaRecord(71, 'old:13:send', 'DEVICE', { caption: 'LOGISTICS' }), mediaRecord(72, 'old:13:send', 'LOGISTICS', { caption: 'DEVICE' })]);
  const rowB = oldRow(14, [mediaRecord(73, 'old:14:send', 'DEVICE'), mediaRecord(74, 'old:14:send', 'LOGISTICS')]);
  const { page, state } = setup({ replacement_flow: { protocol_version: 6, legs: [rowA, rowB] } });
  page._replacementFocus = 14;
  await page.loadDetail();
  assert.equal(page.data.actionEvidenceScopeKey, 'old:14:send');
  assert.deepEqual(plain(page.data.oldReturnDeviceMedia.map(item => item.serverMediaId)), [73]);
  assert.deepEqual(plain(page.data.oldReturnLogisticsMedia.map(item => item.serverMediaId)), [74]);
  assert.equal(page.data.evidenceMediaByScope['old:13:send'][0].evidenceKind, 'DEVICE');
  assert.equal(state.downloads.length, 4);
  assert.ok(state.downloads.every(download => download.header.Authorization === 'Bearer current-user'));
  await page.sendOldReplacementLeg({ currentTarget: { dataset: { id: 14 } } });
  assert.equal(state.uploads.length, 0);
  assert.deepEqual(state.posts[0].device_image_ids, [73]);
  assert.deepEqual(state.posts[0].logistics_document_ids, [74]);
});

test('silent refresh reconciles an unknown upload result by client key without duplicating the file', async () => {
  const { page, state } = setup({ factory_transport: { transport_id: 'transport-1', legs: [ftRow('inbound', 0)] } }, {
    upload(request, state, accept) { accept(request); request.fail({ errMsg: 'timeout' }); }
  });
  chooseFt(page, [file('proof.jpg')]);
  await page.factoryTransportSend(ftEvent());
  await page.loadDetail(true);
  assert.equal(page.data.actionMedia.length, 1);
  assert.equal(page.data.actionMedia[0].status, 'SUCCESS');
  assert.equal(page.data.actionMedia[0].serverMediaId, 100);
  await page.factoryTransportSend(ftEvent());
  assert.equal(state.uploads.length, 1);
  assert.deepEqual(state.posts[0].document_ids, [100]);
});

test('OLD permits eight device photos and one logistics document but rejects ten combined files', async () => {
  const { page, state } = setup({ replacement_flow: { protocol_version: 6, legs: [oldRow(13)] } });
  chooseOld(page, 'DEVICE', Array.from({ length: 8 }, (_, n) => file(`device-${n}.jpg`)));
  assert.equal(page.data.oldReturnLogisticsMaxCount, 1);
  chooseOld(page, 'LOGISTICS', [file('waybill.jpg')]);
  await page.sendOldReplacementLeg({ currentTarget: { dataset: { id: 13 } } });
  assert.equal(state.uploads.length, 9);
  assert.equal(state.posts[0].device_image_ids.length, 8);
  assert.equal(state.posts[0].logistics_document_ids.length, 1);

  const rejected = setup({ replacement_flow: { protocol_version: 6, legs: [oldRow(13)] } });
  chooseOld(rejected.page, 'DEVICE', Array.from({ length: 8 }, (_, n) => file(`device-${n}.jpg`)));
  chooseOld(rejected.page, 'LOGISTICS', [file('one.jpg'), file('two.jpg')]);
  await rejected.page.sendOldReplacementLeg({ currentTarget: { dataset: { id: 13 } } });
  assert.equal(rejected.state.uploads.length, 0);
  assert.equal(rejected.state.posts.length, 0);
  assert.match(rejected.state.toasts.at(-1), /合计最多9/);
});

test('the segment quota includes other uploaders while existing own files can still be submitted at nine', async () => {
  const own = mediaRecord(81, 'ft:transport-1:inbound:0:send');
  const row = { ...ftRow('inbound', 0, 'transport-1', [own]), evidence_count: 9, evidence_remaining: 0 };
  const { page, state } = setup({ factory_transport: { transport_id: 'transport-1', legs: [row] } });
  await page.loadDetail();
  assert.equal(page.data.evidenceMaxByScope[row.evidence_scope_key], 1);
  chooseFt(page, [...page.data.actionMedia, file('extra.jpg')]);
  await page.factoryTransportSend(ftEvent());
  assert.equal(state.uploads.length, 0);
  assert.equal(state.posts.length, 0);
  chooseFt(page, [page.data.actionMedia[0]]);
  await page.factoryTransportSend(ftEvent());
  assert.deepEqual(state.posts[0].document_ids, [81]);
});

test('eleven factory transport legs keep independent proof targets and request ids', async () => {
  const rows = Array.from({ length: 5 }, (_, index) => ftRow('inbound', index))
    .concat(Array.from({ length: 6 }, (_, index) => ftRow('outbound', index)));
  const { page, state } = setup({ factory_transport: { transport_id: 'transport-1', legs: rows } });
  for (const row of rows) {
    chooseFt(page, [file(`${row.direction}-${row.index}.jpg`)], row.direction, row.index);
    await page.factoryTransportSend(ftEvent(row.direction, row.index));
  }
  assert.equal(state.uploads.length, 11);
  assert.equal(new Set(state.uploads.map(upload => upload.formData.client_upload_id)).size, 11);
  assert.equal(new Set(state.posts.map(post => post.document_ids[0])).size, 11);
  assert.deepEqual(state.uploads.map(upload => `${upload.formData.direction}:${upload.formData.index}`), rows.map(row => `${row.direction}:${row.index}`));
});

test('a response for a different scope cannot be attached to the final transport action', async () => {
  const { page, state } = setup({ factory_transport: { transport_id: 'transport-1', legs: [ftRow('inbound', 0)] } }, {
    upload(request) { request.success({ statusCode: 201, data: JSON.stringify({ code: 0, data: mediaRecord(99, 'ft:other:outbound:4:send') }) }); }
  });
  chooseFt(page, [file('proof.jpg')]);
  await page.factoryTransportSend(ftEvent());
  assert.equal(state.posts.length, 0);
  assert.equal(page.data.actionMedia[0].status, 'FAILED');
  assert.equal(page.data.actionMedia[0].serverMediaId, undefined);
});

test('unscoped scan-before-leg workflows retain their existing upload contract and successful reuse', async () => {
  const { page, state } = setup({ replacement_flow: { protocol_version: 5, legs: [] } });
  page.onActionMediaChange({ detail: { files: [file('legacy-proof.jpg')] } });
  await page.escalationAction('SCAN_SWAP', { qr_text: 'NEW-LIFECYCLE' }, 'REPAIR_RETURN_SHIPMENT_DOCUMENT');
  assert.equal(state.uploads.length, 1);
  assert.equal(state.uploads[0].formData.evidence_action, undefined);
  assert.equal(state.uploads[0].formData.client_upload_id, undefined);
  assert.equal(state.posts[0].action, 'SCAN_SWAP');
  assert.equal(state.posts[0].qr_text, 'NEW-LIFECYCLE');
  assert.equal(state.posts[0].leg_id, undefined);

  const retry = setup({ replacement_flow: { protocol_version: 5, legs: [] } }, { post(request) { request.fail({}); } });
  retry.page.onActionMediaChange({ detail: { files: [file('legacy-proof.jpg')] } });
  await retry.page.escalationAction('SCAN_SWAP', { qr_text: 'NEW-LIFECYCLE' }, 'REPAIR_RETURN_SHIPMENT_DOCUMENT');
  await retry.page.escalationAction('SCAN_SWAP', { qr_text: 'NEW-LIFECYCLE' }, 'REPAIR_RETURN_SHIPMENT_DOCUMENT');
  assert.equal(retry.state.uploads.length, 1);
  assert.equal(retry.page.data.actionMedia[0].status, 'SUCCESS');
});
