const app = getApp();


Page({
  data: {
    deviceId: null,
    documentId: null,
    loading: true,
    confirming: false,
    openingFile: false,
    canConfirm: false,
    requiresFileOpen: false,
    fileOpened: false,
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
        const document = res.data.data;
        const requiresFileOpen = document.has_file &&
          ['DOCX', 'PDF'].includes(document.file_type);
        this.setData({
          loading: false,
          document,
          requiresFileOpen,
          canConfirm: Boolean(document.is_read)
        });
        if (!requiresFileOpen && !document.is_read) {
          this.enableConfirmAfterDelay();
        }
      },
      fail: () => this.setData({ loading: false, error: '网络请求失败' })
    });
  },

  enableConfirmAfterDelay() {
    if (this._confirmTimer) clearTimeout(this._confirmTimer);
    this._confirmTimer = setTimeout(() => {
      this.setData({ canConfirm: true });
    }, 2000);
  },

  openSourceFile() {
    const document = this.data.document;
    if (!document || !document.file_endpoint || this.data.openingFile) return;
    this.setData({ openingFile: true });
    wx.showLoading({ title: '正在打开资料' });
    wx.downloadFile({
      url: `${app.globalData.apiBase}${document.file_endpoint}`,
      header: app.authHeader(),
      success: downloadRes => {
        if (downloadRes.statusCode !== 200 || !downloadRes.tempFilePath) {
          wx.showToast({ title: '资料下载失败', icon: 'none' });
          return;
        }
        wx.openDocument({
          filePath: downloadRes.tempFilePath,
          fileType: String(document.file_type || '').toLowerCase(),
          showMenu: true,
          success: () => {
            this.setData({ fileOpened: true });
            if (!document.is_read) this.enableConfirmAfterDelay();
          },
          fail: () => wx.showToast({ title: '无法打开该资料文件', icon: 'none' })
        });
      },
      fail: () => wx.showToast({ title: '资料下载失败', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ openingFile: false });
      }
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
