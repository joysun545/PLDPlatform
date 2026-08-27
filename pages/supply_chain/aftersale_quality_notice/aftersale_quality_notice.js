const app = getApp();

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

Page({
  data: {
    applicationId: 0,
    supplierId: 0,
    loading: true,
    errorMessage: '',
    notice: null
  },

  onLoad(options) {
    const applicationId = Number((options || {}).application_id || 0);
    const supplierId = Number((options || {}).supplier_id || 0);
    if (!applicationId || !supplierId) {
      this.setData({ loading: false, errorMessage: '质量通知参数无效' });
      return;
    }
    this.setData({ applicationId, supplierId });
    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({ loading: false, errorMessage: '登录失败，请重新进入小程序' });
        return;
      }
      this.loadNotice();
    });
  },

  onPullDownRefresh() {
    this.loadNotice(() => wx.stopPullDownRefresh());
  },

  loadNotice(done) {
    this.setData({ loading: true, errorMessage: '' });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/after-sales/applications/${this.data.applicationId}/supplier-quality-notices/${this.data.supplierId}/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401 || body.code === 401) app.reauthenticate();
        if (body.code !== 0 || !body.data) {
          this.setData({ loading: false, errorMessage: body.msg || '质量通知加载失败' });
          return;
        }
        const notice = body.data;
        notice.closedAtText = formatDate(notice.closed_at);
        this.setData({ loading: false, notice });
      },
      fail: () => this.setData({ loading: false, errorMessage: '网络连接失败，请稍后重试' }),
      complete: () => done && done()
    });
  },

  retryLoad() {
    this.loadNotice();
  }
});
