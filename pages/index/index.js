// pages/index/index.js
const app = getApp();

Page({
  onShow() {
    this._active = true;
    this.waitForLogin();
  },

  onHide() {
    this._active = false;
  },

  onUnload() {
    this._active = false;
  },

  waitForLogin() {
    if (this._loginPending) return;
    this._loginPending = true;
    app.ensureLogin(ok => {
      this._loginPending = false;
      if (!this._active) return;
      if (!ok) {
        wx.showModal({
          title: '微信登录未完成',
          content: '暂时无法确认当前账号身份，请检查网络后重新登录。',
          confirmText: '重新登录',
          cancelText: '稍后重试',
          success: result => {
            if (result.confirm && this._active) this.waitForLogin();
          }
        });
        return;
      }
      const globalData = app.globalData;
      const isGuest = !globalData.is_platform_admin && (!globalData.role || globalData.role === 'tourist');
      wx.switchTab({ url: isGuest ? '/pages/scan/scan/scan' : '/pages/home/index/index' });
    });
  }
});
