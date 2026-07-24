// pages/scan/scan/scan.js
const app = getApp();

/**
 * 根据角色决定普通设备二维码的结果页
 */
function getResultPageByRole(role) {
  const P = {
    public: '/pages/common/scan_result/public/public',
    installer: '/pages/common/scan_result/installer/installer',
    user: '/pages/common/scan_result/user/user',
    other: '/pages/common/scan_result/other/other'
  };

  const r = role || 'tourist';
  if (r === 'tourist' || !r) return P.public;
  if (r === 'user') return P.user;
  if (['dealer', 'dealer_sales', 'dealer_electrician'].includes(r)) return P.installer;
  return P.other;
}

Page({
  data: {
    role: 'tourist',
    nickname: '',
    role_name: ''
  },

  onLoad() {
    this.updateUserInfo();
  },

  onShow() {
    this.updateUserInfo();
    this.controlTabBar();
  },

  updateUserInfo() {
    this.setData({
      role: app.globalData.role || 'tourist',
      nickname: app.globalData.nickname || '用户',
      role_name: app.globalData.role_name || ''
    });
  },

  controlTabBar() {
    if (this.data.role === 'tourist') {
      wx.hideTabBar();
    } else {
      wx.showTabBar();
    }
  },

  /**
   * 统一扫码入口
   * 1️⃣ INSTALL_INVITE|token  → 终端用户专用邀请页
   * 2️⃣ 其他                  → 按角色跳转不同 scan_result 页面
   */
  directScan() {
    wx.scanCode({
      onlyFromCamera: true,
      scanType: ['qrCode'],
      success: (res) => {
        const qrText = (res.result || '').trim();
        if (!qrText) {
          wx.showToast({ title: '二维码无效', icon: 'none' });
          return;
        }

        // ✅ 装车邀请二维码（终端用户扫描）
        if (qrText.startsWith('INSTALL_INVITE|')) {
          const token = qrText.split('|')[1];
          if (!token) {
            wx.showToast({ title: '邀请二维码无效', icon: 'none' });
            return;
          }
          wx.navigateTo({
            url: `/pages/user/invite_accept/invite_accept?token=${encodeURIComponent(token)}`
          });
          return;
        }

        // ✅ 普通设备二维码
        const page = getResultPageByRole(app.globalData.role);
        wx.navigateTo({
          url: `${page}?qr_text=${encodeURIComponent(qrText)}`
        });
      },
      fail: (err) => {
        if (err.errMsg !== 'scanCode:fail cancel') {
          wx.showToast({ title: '扫码失败', icon: 'none' });
        }
      }
    });
  }
});

