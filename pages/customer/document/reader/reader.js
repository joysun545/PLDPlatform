const app = getApp();


Page({
  data: {
    deviceId: null,
    documentId: null,
    loading: true,
    confirming: false,
    canConfirm: false,
    error: '',
    document: null
  },

  onLoad(options) {
    const deviceId = Number(options && options.device_id);
    const documentId = Number(options && options.document_id);
    if (!deviceId || !documentId) {
      this.setData({ loading: false, error: '资料参数无效' });
      return;
    }
    this.setData({ deviceId, documentId });
    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({ loading: false, error: '登录失败，请重新进入' });
        return;
      }
      this.loadDocument();
    });
  },

  onUnload() {
    if (this._confirmTimer) clearTimeout(this._confirmTimer);
  },

  loadDocument() {
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/customer/devices/${this.data.deviceId}/documents/${this.data.documentId}/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        if (!res.data || res.data.code !== 0 || !res.data.data) {
          this.setData({
            loading: false,
            error: (res.data && res.data.msg) || '资料读取失败'
          });
          return;
        }
        this.setData({ loading: false, document: res.data.data });
        this._confirmTimer = setTimeout(() => {
          this.setData({ canConfirm: true });
        }, 2000);
      },
      fail: () => this.setData({ loading: false, error: '网络请求失败' })
    });
  },

  confirmRead() {
    if (!this.data.canConfirm || this.data.confirming) return;
    if (this.data.document && this.data.document.is_read) {
      wx.navigateBack();
      return;
    }
    this.setData({ confirming: true });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/customer/devices/${this.data.deviceId}/documents/${this.data.documentId}/read/`,
      method: 'POST',
      header: app.authHeader(),
      success: res => {
        if (!res.data || res.data.code !== 0) {
          wx.showToast({
            title: (res.data && res.data.msg) || '阅读状态保存失败',
            icon: 'none'
          });
          return;
        }
        wx.showToast({ title: '已完成阅读', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 500);
      },
      fail: () => wx.showToast({ title: '网络请求失败', icon: 'none' }),
      complete: () => this.setData({ confirming: false })
    });
  },

  goBack() {
    wx.navigateBack();
  }
});
