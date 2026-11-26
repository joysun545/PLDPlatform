const APPLICATION_PAGE = '/pages/account/root_application/root_application';
const REVIEW_PAGE = '/pages/account/root_application_review/root_application_review';

function validWebToken(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function applicationUrl(webToken) {
  return APPLICATION_PAGE + (validWebToken(webToken) ? `?webToken=${webToken}` : '');
}

function requestError(message, response) {
  const error = new Error(message);
  error.statusCode = response && response.statusCode;
  error.code = response && response.data && response.data.code;
  error.data = response && response.data && response.data.data;
  return error;
}

function accountChanged() {
  const error = new Error('登录账号已变化，请重新进入页面。');
  error.accountChanged = true;
  error.statusCode = 403;
  return error;
}

function decodeBody(raw) {
  if (raw && typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch (error) { return {}; }
}

function request(path, options = {}) {
  const app = getApp();
  const token = app.globalData.access_token;
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${app.globalData.apiBase}/root-trial/${path}`,
      method: options.method || 'GET',
      header: app.authHeader('application/json'),
      data: options.data || {},
      success: response => {
        if (token !== app.globalData.access_token) {
          reject(accountChanged());
          return;
        }
        const body = decodeBody(response.data);
        if (response.statusCode === 401 || body.code === 401) {
          app.reauthenticate();
          reject(requestError('登录状态已失效，请重新进入页面。', response));
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300 || body.code !== 0) {
          reject(requestError(body.msg || '操作未完成，请刷新后重试。', response));
          return;
        }
        resolve(body.data || {});
      },
      fail: () => reject(new Error('网络连接失败，请刷新状态后重试。'))
    });
  });
}

function uploadLicense(filePath) {
  const app = getApp();
  const token = app.globalData.access_token;
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${app.globalData.apiBase}/root-trial/license/`,
      filePath,
      name: 'file',
      header: app.authHeader(null),
      success: response => {
        if (token !== app.globalData.access_token) {
          reject(accountChanged());
          return;
        }
        const body = decodeBody(response.data);
        if (response.statusCode === 401 || body.code === 401) {
          app.reauthenticate();
          reject(requestError('登录状态已失效，请重新进入页面。', response));
          return;
        }
        const result = body.data || {};
        const id = result.license_upload_id || result.id;
        if (response.statusCode < 200 || response.statusCode >= 300 || body.code !== 0 || !id) {
          reject(requestError(body.msg || '营业执照上传失败，请重新上传。', response));
          return;
        }
        resolve({ id, filePath });
      },
      fail: () => reject(new Error('营业执照上传失败，请检查网络后重试。'))
    });
  });
}

function downloadLicense(licenseId) {
  const app = getApp();
  const id = String(licenseId || '');
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
    return Promise.reject(new Error('营业执照编号无效，请刷新申请状态。'));
  }
  const token = app.globalData.access_token;
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url: `${app.globalData.apiBase}/root-trial/licenses/${encodeURIComponent(id)}/`,
      header: app.authHeader(null),
      success: response => {
        if (token !== app.globalData.access_token) {
          reject(accountChanged());
          return;
        }
        if (response.statusCode === 401) app.reauthenticate();
        if (response.statusCode !== 200 || !response.tempFilePath) {
          reject(requestError('暂时无法查看营业执照，请刷新申请状态后重试。', response));
          return;
        }
        resolve(response.tempFilePath);
      },
      fail: () => reject(new Error('营业执照加载失败，请检查网络后重试。'))
    });
  });
}

function refreshProfile() {
  const app = getApp();
  const token = app.globalData.access_token;
  return new Promise((resolve, reject) => {
    app.refreshUserProfile(ok => {
      if (token !== app.globalData.access_token) {
        reject(accountChanged());
        return;
      }
      if (!ok) {
        reject(new Error('申请已通过，身份刷新未完成，请重试刷新。'));
        return;
      }
      if (app.globalData.role !== 'factory_admin' || !app.globalData.organization_id) {
        reject(new Error('当前身份尚未就绪，请刷新审核状态后重试。'));
        return;
      }
      resolve(app.globalData);
    });
  });
}

function approveWebLogin(token) {
  if (!validWebToken(token)) return Promise.reject(new Error('电脑登录二维码无效，请重新扫码。'));
  const app = getApp();
  const accountToken = app.globalData.access_token;
  const webBase = app.globalData.apiBase.replace(/\/api\/?$/, '');
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${webBase}/web/portal/api/approve/`,
      method: 'POST',
      header: app.authHeader('application/json'),
      data: { token },
      success: response => {
        if (accountToken !== app.globalData.access_token) {
          reject(accountChanged());
          return;
        }
        const body = decodeBody(response.data);
        if (response.statusCode === 401 || body.code === 401) app.reauthenticate();
        if (response.statusCode < 200 || response.statusCode >= 300 || body.code !== 0) {
          reject(requestError(body.msg || '电脑登录授权未完成，请在电脑刷新二维码后重新扫码。', response));
          return;
        }
        resolve(body.data || {});
      },
      fail: () => reject(new Error('网络请求失败，请重试确认电脑登录。'))
    });
  });
}

function isTrialRequired(data) {
  return !!data && (data.trial_required === true || data.status === 'trial_required');
}

function refreshTasks() {
  try {
    const app = getApp();
    if (typeof app.refreshTasks === 'function') app.refreshTasks();
  } catch (error) {
    console.warn('[root-trial] Task refresh did not finish.');
  }
}

function requestId() {
  // This is a retry key, not an authentication credential.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const value = Math.floor(Math.random() * 16);
    return (character === 'x' ? value : (value & 3) | 8).toString(16);
  });
}

function statusLabel(status) {
  return { PENDING: '审核中', APPROVED: '审核通过', REJECTED: '未通过' }[status] || '尚未申请';
}

function applicationRoot(application, draftName) {
  const root = application && application.root_organization;
  if (application && application.status === 'APPROVED' && root && Number(root.id) > 0 && root.name) {
    return { id: Number(root.id), name: root.name };
  }
  const name = String(draftName || (application && application.organization_name) || '').trim();
  return { state: 'pending_creation', name: name || '待填写企业名称' };
}

module.exports = {
  APPLICATION_PAGE, REVIEW_PAGE, applicationUrl, validWebToken, request,
  uploadLicense, downloadLicense, refreshProfile, approveWebLogin,
  isTrialRequired, refreshTasks, requestId, statusLabel, applicationRoot
};
