// pages/index/index.js
const app = getApp();

Page({
  onShow() {
    this.waitForLogin();
  },

  waitForLogin() {
    const check = () => {
      const role = app.globalData.role;

      if (!role) {
        setTimeout(check, 50);
        return;
      }

      // 角色判断（后续可根据新角色扩展）
      if (role === 'tourist') {
        // 游客直接去扫码页（后续创建 pages/scan/scan/scan）
        wx.switchTab({ url: '/pages/scan/scan/scan' });
      } else {
        // 其他角色进入首页
        wx.switchTab({ url: '/pages/home/index/index' });
      }
    };

    check();
  }
});
