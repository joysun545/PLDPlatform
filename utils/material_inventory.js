const app = getApp();
const root = '/supply-chain/material-inventory/';

function request(path = '', method = 'GET', data = {}) {
  return new Promise((resolve, reject) => {
    app.ensureLogin(ok => {
      if (!ok) return reject(new Error('请重新登录后再试'));
      // Check after login: an account may have moved to another role slot
      // while this page was waiting. Server-side scope checks remain final.
      const role = (app.globalData.role || '').trim();
      const needsKeeper = method !== 'GET' || /^(catalog|form)\//.test(path);
      const allowed = needsKeeper ? role === 'factory_material_stock'
        : ['factory_material_stock', 'supplier_owner', 'supplier_sales'].includes(role);
      if (!allowed) {
        return reject(new Error(needsKeeper ? '该操作仅限厂家物料库管，请返回首页' : '当前岗位无物料库查看权限，请返回首页'));
      }
      wx.request({
        url: `${app.globalData.apiBase}${root}${path}`,
        method, data, header: app.authHeader('application/json'),
        success: res => {
          const body = res.data || {};
          if (res.statusCode === 401 || body.code === 401) app.reauthenticate();
          if (res.statusCode === 200 && body.code === 0) return resolve(body.data);
          const error = new Error(body.msg || '暂时无法读取物料库，请稍后重试');
          error.business = res.statusCode === 200 && body.code === 1;
          reject(error);
        },
        fail: () => reject(new Error(method === 'POST' ? '提交结果尚未确认，请点击核验重试' : '网络连接失败，请重试'))
      });
    });
  });
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const n = Math.floor(Math.random() * 16);
    return (c === 'x' ? n : (n & 3) | 8).toString(16);
  });
}

function pendingKey() {
  const g = app.globalData;
  if (!g.openid || !g.organization_id) throw new Error('请重新登录后再试');
  return `MATERIAL_MOVEMENT_PENDING_V1:${g.organization_id}:${g.openid}`;
}

function readPending() { return wx.getStorageSync(pendingKey()) || null; }
function savePending(value) { wx.setStorageSync(pendingKey(), value); }
function clearPending() { wx.removeStorageSync(pendingKey()); }

function formUrl(kind, extra = {}) {
  const params = Object.assign({ kind }, extra);
  return '/pages/material_inventory/form/form?' + Object.keys(params).map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');
}

module.exports = { request, uuid, readPending, savePending, clearPending, formUrl };
