const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const requestPage = path.join(__dirname, '..', 'pages/customer/aftersale/request/request');
const source = fs.readFileSync(requestPage + '.js', 'utf8');
const draftPath = '/lifecycle/customer/devices/7/after-sales/applications/';
const finalPath = '/lifecycle/after-sales/applications/31/submit/';
const detailPath = '/pages/aftersale/detail/detail?application_id=31';

function setup(finalReplies = []) {
  const requests = [];
  const uploads = [];
  const toasts = [];
  const redirects = [];
  const app = {
    globalData: { apiBase: '', openid: 'applicant', organization_id: 9, role: 'customer_owner', operationRoot: { id: 3 } },
    authHeader: () => ({})
  };
  const finish = (request, data, statusCode = 200) => request.success({ statusCode, data });
  const ok = request => finish(request, { code: 0, data: { id: 31 } });
  const wx = {
    request(request) {
      requests.push(request);
      if (request.url === draftPath) return ok(request);
      assert.equal(request.url, finalPath);
      const reply = finalReplies.shift() || ok;
      reply(request, finish, app);
    },
    uploadFile(request) {
      uploads.push(request);
      request.success({ statusCode: 201, data: JSON.stringify({ code: 0, data: { id: 300 + uploads.length } }) });
      if (request.complete) request.complete();
    },
    showToast: ({ title }) => toasts.push(title),
    redirectTo: ({ url }) => redirects.push(url)
  };
  let page;
  vm.runInNewContext(source, { Page: value => { page = value; }, getApp: () => app, wx });
  page.setData = (values, callback) => {
    Object.assign(page.data, values);
    if (callback) callback();
  };
  page.setData({
    deviceId: 7, context: {}, loading: false, faultDescription: '控制器停止运行',
    locationName: '维修现场', location: { latitude: '30.5', longitude: '104.1' }, locationConfirmed: true,
    media: [{ path: '/tmp/evidence.jpg', media_type: 'IMAGE', status: 'PENDING' }],
    platePhotoPath: '/tmp/plate.jpg'
  });
  return { page, app, wx, requests, uploads, toasts, redirects };
}

test('a lost final response keeps the same application and skips draft and all uploads on retry', async () => {
  const { page, requests, uploads, redirects } = setup([request => request.fail()]);
  await page.submit();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(requests.map(request => request.url), [draftPath, finalPath]);
  assert.equal(uploads.length, 2);
  assert.equal(page.data.confirmingSubmission, true);
  assert.equal(page.data.submitting, false);
  assert.equal(redirects.length, 0);
  page.onFaultDescription({ detail: { value: '另一种故障' } });
  page.onLocationName({ detail: { value: '另一个位置' } });
  page.onMediaChange({ detail: { files: [] } });
  await page.submit();
  assert.equal(page.data.faultDescription, '控制器停止运行');
  assert.equal(page.data.locationName, '维修现场');
  assert.equal(page.data.media.length, 1);
  await page.retrySubmission();
  assert.deepEqual(requests.map(request => request.url), [draftPath, finalPath, finalPath]);
  assert.equal(uploads.length, 2);
  assert.deepEqual(redirects, [detailPath]);
});

test('a server error and an invalid success body leave confirmation pending', async () => {
  const { page, requests, redirects } = setup([
    (request, finish) => finish(request, { code: 1, msg: '代理故障' }, 502),
    (request, finish) => finish(request, { code: 0, data: { id: 99 } })
  ]);
  await page.submit();
  assert.equal(page.data.confirmingSubmission, true);
  await page.retrySubmission();
  assert.equal(page.data.confirmingSubmission, true);
  assert.equal(redirects.length, 0);
  await page.retrySubmission();
  assert.deepEqual(requests.map(request => request.url), [draftPath, finalPath, finalPath, finalPath]);
  assert.deepEqual(redirects, [detailPath]);
});

test('a definitive business rejection restores the editable draft and sends a changed description', async () => {
  const { page, requests, uploads, redirects, toasts } = setup([
    request => request.fail(),
    (request, finish) => finish(request, { code: 1, msg: '厂家尚未配置厂家售后经理，暂不能提交' }, 409)
  ]);
  await page.submit();
  await page.retrySubmission();
  assert.equal(page.data.confirmingSubmission, false);
  assert.equal(page._pendingSubmission, null);
  assert.match(toasts[0], /厂家尚未配置/);
  page.onFaultDescription({ detail: { value: '重新核实后的故障' } });
  await page.submit();
  assert.deepEqual(requests.map(request => request.url), [draftPath, finalPath, finalPath, draftPath, finalPath]);
  assert.equal(requests[3].data.fault_description, '重新核实后的故障');
  assert.equal(uploads.length, 2, 'existing evidence remains uploaded');
  assert.deepEqual(redirects, [detailPath]);
});

test('a changed identity cannot retry and an authorization failure cannot settle an earlier unknown result', async () => {
  const { page, app, requests, redirects } = setup([
    request => request.fail(),
    (request, finish) => finish(request, { code: 401, msg: '登录已过期' }, 401)
  ]);
  await page.submit();
  app.globalData.openid = 'other';
  await page.retrySubmission();
  assert.equal(requests.length, 2);
  assert.match(page.data.submissionNotice, /原申请身份/);
  app.globalData.openid = 'applicant';
  app.globalData.operationRoot = { id: 4 };
  await page.retrySubmission();
  assert.equal(requests.length, 2);
  app.globalData.operationRoot = { id: 3 };
  await page.retrySubmission();
  assert.equal(requests.length, 3);
  assert.equal(page.data.confirmingSubmission, true);
  assert.equal(redirects.length, 0);
  await page.retrySubmission();
  assert.deepEqual(redirects, [detailPath]);
});

test('an identity change while a final response is in flight prevents opening the old application', async () => {
  const { page, app, redirects } = setup([
    (request, finish, app) => {
      app.globalData.organization_id = 999;
      finish(request, { code: 0, data: { id: 31 } });
    }
  ]);
  await page.submit();
  assert.equal(page.data.confirmingSubmission, true);
  assert.equal(redirects.length, 0);
  app.globalData.organization_id = 9;
  await page.retrySubmission();
  assert.deepEqual(redirects, [detailPath]);
});

test('an upload error leaves normal draft submission available and does not retry final submission', async () => {
  const { page, wx, requests, redirects, toasts } = setup();
  const upload = wx.uploadFile;
  wx.uploadFile = request => request.fail();
  await page.submit();
  assert.equal(page.data.confirmingSubmission, false);
  assert.match(toasts[0], /附件上传失败/);
  await page.retrySubmission();
  assert.deepEqual(requests.map(request => request.url), [draftPath]);
  wx.uploadFile = upload;
  await page.submit();
  assert.deepEqual(requests.map(request => request.url), [draftPath, draftPath, finalPath]);
  assert.deepEqual(redirects, [detailPath]);
});

test('a confirmation response after leaving the page cannot open the work order', async () => {
  let finalRequest;
  const { page, redirects } = setup([
    request => request.fail(),
    request => { finalRequest = request; }
  ]);
  await page.submit();
  const retry = page.retrySubmission();
  page.onUnload();
  finalRequest.success({ statusCode: 200, data: { code: 0, data: { id: 31 } } });
  await retry;
  assert.equal(redirects.length, 0);
});

test('the confirmation view replaces the editable form while the result is unknown', () => {
  const template = fs.readFileSync(requestPage + '.wxml', 'utf8');
  assert.match(template, /wx:if="\{\{confirmingSubmission\}\}"[\s\S]*?bindtap="retrySubmission"[\s\S]*?wx:elif="\{\{presenceRequired && !presenceVerified\}\}"[\s\S]*?<block wx:else>/);
  assert.match(template, /<textarea[^>]+disabled="\{\{submitting\}\}"/);
});
