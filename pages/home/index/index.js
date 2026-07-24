// pages/home/index/index.js
const app = getApp();

Page({
  data: {
    nickname: '',
    role_name: '',
    real_name: '',

    // 按钮显示控制
    showInvite: false,
    showManageRole: false,
    showCreateSalesPlan: false,   // 厂家销售经理
    showMatching: false,          // 厂家配套经理
    showStock: false,
    showStats: false,
    showAftersale: false,
    showMyDevice: false
  },

  onLoad() {
    this.updateUserInfo();
    this.updateButtons();
  },

  onShow() {
    this.updateUserInfo();
    this.updateButtons();
  },

  updateUserInfo() {
    this.setData({
      nickname: app.globalData.nickname || '用户',
      role_name: app.globalData.role_name || '',
      real_name: app.globalData.real_name || ''
    });
  },

  updateButtons() {
    const role = (app.globalData.role || 'tourist').trim();

    this.setData({
      showInvite: ['admin', 'factory_sales', 'merchant_admin', 'merchant_sales', 'merchant_electrician'].includes(role),
      showManageRole: ['admin', 'factory_sales', 'merchant_admin'].includes(role),

      // 新增核心功能
      showCreateSalesPlan: role === 'factory_sales',      // 厂家销售经理
      showMatching: role === 'factory_matching',          // 厂家配套经理

      showStock: ['factory_stock', 'merchant_admin', 'merchant_sales', 'merchant_stock'].includes(role),
      showStats: ['admin', 'factory_sales', 'factory_matching', 'merchant_admin', 'merchant_sales'].includes(role),
      showAftersale: !['tourist', 'admin'].includes(role),
      showMyDevice: role === 'user'
    });
  },

  // ==================== 按钮跳转方法 ====================

  // 邀请下级
  goInvite() {
    wx.navigateTo({
      url: '/pages/home/invite/invite/invite'
    });
  },

  // 管理下级
  goManageRole() {
    wx.navigateTo({
      url: '/pages/home/manage_role/index/index'
    });
  },

  goCreateSalesPlan() {
    wx.navigateTo({ url: '/pages/sales/create_plan/create_plan' });
  },

  goMatching() {
    wx.navigateTo({ url: '/pages/supply_chain/matching/matching' });
  },

  goBatchScan() {
    wx.navigateTo({ url: '/pages/stock/batch_scan/batch_scan' });
  },

  goStats() {
    wx.navigateTo({ url: '/pages/stats/dealer_stats/index' });
  },

  goAftersaleList() {
    wx.navigateTo({ url: '/pages/aftersale/list/list' });
  },

  goMyDevice() {
    wx.navigateTo({
      url: '/pages/common/scan_result/user/user?from_home=1'
    });
  }
});