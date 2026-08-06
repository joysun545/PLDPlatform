const app = getApp();

Page({
  data: {
    nickname: '',
    role_name: '',
    real_name: '',

    showInvite: false,
    showManageRole: false,
    showCreateSalesPlan: false,
    showMatching: false,
    showStock: false,
    showStats: false,
    showAftersale: false,
    showMyDevice: false
  },

  onLoad() {
    this.refreshPage();
  },

  onShow() {
    this.refreshPage();
  },

  refreshPage() {
    this.updateUserInfo();
    this.updateButtons();
    this.updateInviteCapability();
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
      showManageRole: [
        'factory_admin',
        'merchant_owner',
        'supplier_owner',
        'service_owner'
      ].includes(role),

      showCreateSalesPlan: role === 'factory_sales',
      showMatching: role === 'factory_matching',

      showStock: [
        'factory_stock',
        'merchant_owner',
        'merchant_senior_manager',
        'merchant_sales',
        'merchant_stock'
      ].includes(role),

      showStats: [
        'factory_admin',
        'factory_sales',
        'factory_matching',
        'merchant_owner',
        'merchant_senior_manager',
        'merchant_sales'
      ].includes(role),

      showAftersale: !['tourist', 'factory_admin'].includes(role),
      showMyDevice: ['customer_owner', 'driver'].includes(role)
    });
  },

  updateInviteCapability() {
    app.ensureLogin(ok => {
      if (!ok || app.globalData.role === 'tourist') {
        this.setData({ showInvite: false });
        return;
      }

      wx.request({
        url: `${app.globalData.apiBase}/account/invitation_roles/`,
        method: 'GET',
        header: app.authHeader(),
        success: res => {
          const items = (
            res.data &&
            res.data.code === 0 &&
            res.data.data &&
            res.data.data.items
          ) || [];
          this.setData({ showInvite: items.length > 0 });
        },
        fail: () => {
          this.setData({ showInvite: false });
        }
      });
    });
  },

  goInvite() {
    wx.navigateTo({
      url: '/pages/home/invite/invite/invite'
    });
  },

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
