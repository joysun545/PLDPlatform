const app = getApp();

function request(path, method = 'GET', data = {}) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${app.globalData.apiBase}/quality-trace${path}`,
      method,
      data,
      header: app.authHeader(method === 'GET' ? undefined : 'application/json'),
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401 || body.code === 401) app.reauthenticate();
        if (body.code !== 0) {
          reject(new Error(body.msg || '请求失败'));
          return;
        }
        resolve(body.data || {});
      },
      fail: () => reject(new Error('网络连接失败，请稍后重试'))
    });
  });
}

function uploadEvidence(file) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${app.globalData.apiBase}/quality-trace/recall-evidence/upload/`,
      filePath: file.tempFilePath || file.path,
      name: 'file',
      header: app.authHeader(null),
      timeout: 180000,
      success: res => {
        let body = {};
        try { body = JSON.parse(res.data || '{}'); } catch (e) {}
        if (res.statusCode === 401 || body.code === 401) app.reauthenticate();
        if (body.code !== 0) {
          reject(new Error(body.msg || '凭证上传失败'));
          return;
        }
        resolve(body.data || {});
      },
      fail: () => reject(new Error('凭证上传失败，请检查网络'))
    });
  });
}

function chooseEvidence() {
  return new Promise((resolve, reject) => {
    wx.showActionSheet({
      itemList: ['拍照或录像', '从相册选择图片/视频', '选择PDF文件'],
      success: ({ tapIndex }) => {
        if (tapIndex === 2) {
          wx.chooseMessageFile({
            count: 1,
            type: 'file',
            extension: ['pdf'],
            success: result => resolve(result.tempFiles[0]),
            fail: reject
          });
          return;
        }
        wx.chooseMedia({
          count: 1,
          mediaType: ['image', 'video'],
          sourceType: tapIndex === 0 ? ['camera'] : ['album'],
          maxDuration: 60,
          success: result => resolve(result.tempFiles[0]),
          fail: reject
        });
      },
      fail: reject
    });
  });
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const statusLabels = {
  DRAFT: '待发布', ACTIVE: '召回中', COMPLETED: '已完成', CANCELLED: '已取消',
  PENDING_NOTICE: '待通知', NOTIFIED: '待确认', ACKNOWLEDGED: '已确认',
  RETURN_IN_PROGRESS: '退回中', RECEIVED: '已收回', DISPOSED: '已处置',
  UNREACHABLE: '无法联系', EXEMPTED: '已豁免',
  PENDING_CUSTOMER_ACK: '待用户确认', PICKUP_SCHEDULED: '已预约取回',
  MERCHANT_RECEIVED: '商家已接管', PREPARING: '待发出', IN_TRANSIT: '运输中'
};

module.exports = { request, uploadEvidence, chooseEvidence, formatTime, statusLabels };
