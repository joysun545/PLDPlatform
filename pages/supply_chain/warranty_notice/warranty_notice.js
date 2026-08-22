const app = getApp();

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = number => String(number).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function preparePage(data) {
  if (!data) return null;
  return {
    ...data,
    confirmedText: formatDate(data.confirmed_at),
    receivedText: formatDate(data.received_at)
  };
}

Page({
  data: {
    dispatchId: 0,
    loading: true,
    errorMessage: '',
    pageData: null
  },

  onLoad(options) {
    const dispatchId = Number((options || {}).dispatch_id || 0);
    if (!dispatchId) {
      this.setData({ loading: false, errorMessage: '三包协同任务参数无效' });
      return;
    }
    this.setData({ dispatchId });
    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({ loading: false, errorMessage: '登录失败，请重新进入小程序' });
        return;
      }
      this.loadData();
    });
  },

  onPullDownRefresh() {
    this.loadData(() => wx.stopPullDownRefresh());
  },

  loadData(done) {
    this.setData({ loading: true, errorMessage: '' });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/factory-return-warranty-dispatches/${this.data.dispatchId}/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401 || body.code === 401) app.reauthenticate();
        if (body.code !== 0 || !body.data) {
          this.setData({
            loading: false,
            errorMessage: body.msg || '三包物料任务加载失败'
          });
          return;
        }
        this.setData({ loading: false, pageData: preparePage(body.data) });
      },
      fail: () => this.setData({
        loading: false,
        errorMessage: '网络连接失败，请稍后重试'
      }),
      complete: () => done && done()
    });
  },

  retryLoad() {
    this.loadData();
  }
});
