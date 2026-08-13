const app = getApp();

Page({
  data: {
    orderPlanId: 0,
    loading: true,
    errorMessage: '',
    detail: null,
    previewingItemId: 0,
    submitting: false
  },

  onLoad(options) {
    const orderPlanId = Number((options || {}).order_plan_id);
    if (!orderPlanId) {
      this.setData({ loading: false, errorMessage: '订单参数缺失' });
      return;
    }
    this.setData({ orderPlanId });
    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({ loading: false, errorMessage: '登录失败，请重新进入小程序' });
        return;
      }
      this.loadDetail();
    });
  },

  onPullDownRefresh() {
    this.loadDetail(() => wx.stopPullDownRefresh());
  },

  loadDetail(done) {
    this.setData({ loading: true, errorMessage: '' });
    wx.request({
      url: `${app.globalData.apiBase}/sales/order-plans/${this.data.orderPlanId}/stock-outbound/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        const body = res.data || {};
        this.setData(body.code === 0
          ? { loading: false, detail: body.data || null }
          : { loading: false, errorMessage: body.msg || '出库任务加载失败' });
      },
      fail: () => this.setData({ loading: false, errorMessage: '网络连接失败' }),
      complete: () => done && done()
    });
  },

  retryLoad() {
    this.loadDetail();
  },

  copyLifecycleCode(e) {
    wx.setClipboardData({ data: String(e.currentTarget.dataset.code || '') });
  },

  previewQrcode(e) {
    const itemId = Number(e.currentTarget.dataset.id);
    if (!itemId || this.data.previewingItemId) return;
    this.setData({ previewingItemId: itemId });
    wx.showLoading({ title: '生成二维码...', mask: true });
    wx.downloadFile({
      url: `${app.globalData.apiBase}/sales/order-plans/${this.data.orderPlanId}/items/${itemId}/lifecycle-qrcode/`,
      header: app.authHeader(),
      success: res => {
        if (res.statusCode !== 200 || !res.tempFilePath) {
          wx.showToast({ title: '二维码获取失败', icon: 'none' });
          return;
        }
        wx.previewImage({ urls: [res.tempFilePath], current: res.tempFilePath });
      },
      fail: () => wx.showToast({ title: '二维码获取失败', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ previewingItemId: 0 });
      }
    });
  },

  confirmOutbound() {
    if (!this.data.detail || !this.data.detail.can_outbound || this.data.submitting) return;
    wx.showModal({
      title: '确认完成出库',
      content: '请确认生命周期编码及二维码已经核对完毕。确认后将完成本次出库任务。',
      success: modal => {
        if (!modal.confirm) return;
        this.setData({ submitting: true });
        wx.request({
          url: `${app.globalData.apiBase}/sales/order-plans/${this.data.orderPlanId}/stock-outbound/`,
          method: 'POST',
          header: app.authHeader(),
          success: res => {
            const body = res.data || {};
            if (body.code !== 0) {
              wx.showToast({ title: body.msg || '出库确认失败', icon: 'none' });
              return;
            }
            wx.showToast({ title: '出库已确认', icon: 'success' });
            this.loadDetail();
            if (typeof app.refreshTasks === 'function') app.refreshTasks();
          },
          fail: () => wx.showToast({ title: '网络连接失败', icon: 'none' }),
          complete: () => this.setData({ submitting: false })
        });
      }
    });
  }
});
