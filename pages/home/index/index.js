const app = getApp();

Page({
  data: {
    nickname: '',
    role_name: '',
    real_name: '',

    showInvite: false,
    showManageSubordinates: false,
    showCreateOrderPlan: false,
    showOrderPlanList: false,
    showSupplierResponsibility: false,
    showSupplierWarranty: false,
    showSupplierQualityNotices: false,
    showMatching: false,
    showStock: false,
    showGoodsTransfer: false,
    showGoodsTransferList: false,
    showFactoryReturnInventory: false,
    showStats: false,
    showAftersale: false,
    showMyDevice: false,
    showQualityTrace: false
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
      showCreateOrderPlan: role === 'factory_sales',
      showOrderPlanList: [
        'factory_sales',
        'factory_sales_assistant',
        'factory_matching',
        'factory_production',
        'factory_stock',
        'factory_logistics',
        'supplier_owner',
        'supplier_sales',
        'merchant_owner',
        'merchant_senior_manager',
        'merchant_sales',
        'merchant_stock'
      ].includes(role),
      showSupplierResponsibility: role === 'supplier_owner',
      showSupplierWarranty: [
        'supplier_owner',
        'supplier_sales'
      ].includes(role),
      showSupplierQualityNotices: [
        'supplier_owner',
        'supplier_sales'
      ].includes(role),
      showMatching: role === 'factory_matching',

      showStock: [
        'merchant_owner',
        'merchant_senior_manager',
        'merchant_sales',
        'merchant_stock'
      ].includes(role),

      showGoodsTransfer: [
        'merchant_owner',
        'merchant_sales',
        'merchant_stock'
      ].includes(role),

      showGoodsTransferList: [
        'merchant_owner',
        'merchant_sales',
        'merchant_stock',
        'factory_stock',
        'factory_sales'
      ].includes(role),

      showFactoryReturnInventory: [
        'factory_sales',
        'factory_sales_assistant',
        'factory_stock',
        'factory_production',
        'factory_matching'
      ].includes(role),

      showStats: [
        'factory_admin',
        'factory_sales',
        'factory_sales_assistant',
        'factory_matching',
        'merchant_owner',
        'merchant_senior_manager',
        'merchant_sales'
      ].includes(role),

      // 终端用户需要从首页持续查看自己发起的服务单；不应只能依靠
      // "我的任务"里的临时推送入口。销售经理仍保留同一列表入口。
      showAftersale: [
        'factory_sales',
        'factory_aftersales',
        'customer_owner',
        'driver'
      ].includes(role),
      showMyDevice: ['customer_owner', 'driver'].includes(role),
      showQualityTrace: [
        'factory_admin',
        'factory_chief_engineer'
      ].includes(role)
    });
  },

  updateInviteCapability() {
    app.ensureLogin(ok => {
      if (!ok || app.globalData.role === 'tourist') {
        this.setData({
          showInvite: false,
          showManageSubordinates: false
        });
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
          const canInvite = items.length > 0;
          this.setData({
            showInvite: canInvite,
            showManageSubordinates: canInvite
          });
        },
        fail: () => {
          this.setData({
            showInvite: false,
            showManageSubordinates: false
          });
        }
      });
    });
  },

  goInvite() {
    wx.navigateTo({
      url: '/pages/home/invite/invite/invite'
    });
  },

  goManageSubordinates() {
    wx.navigateTo({
      url: '/pages/home/edit/edit',
      fail: error => {
        console.error('[manage subordinates navigate failed]', error);
        wx.showToast({ title: '管理页面打开失败', icon: 'none' });
      }
    });
  },

  goCreateOrderPlan() {
    wx.navigateTo({ url: '/pages/sales/create_plan/create_plan' });
  },

  goOrderPlanList() {
    wx.navigateTo({ url: '/pages/sales/order_plan_list/order_plan_list' });
  },

  goSupplierResponsibility() {
    wx.navigateTo({
      url: '/pages/supply_chain/responsibility/responsibility',
      fail: () => wx.showToast({ title: '责任分配页面打开失败', icon: 'none' })
    });
  },

  goSupplierWarranty() {
    wx.navigateTo({
      url: '/pages/supply_chain/warranty_list/warranty_list',
      fail: () => wx.showToast({ title: '三包清单页面打开失败', icon: 'none' })
    });
  },

  goSupplierQualityNotices() {
    wx.navigateTo({
      url: '/pages/supply_chain/aftersale_quality_list/aftersale_quality_list',
      fail: () => wx.showToast({ title: '售后质量通知打开失败', icon: 'none' })
    });
  },

  goQualityTrace() {
    wx.navigateTo({
      url: '/pages/quality_trace/dashboard/dashboard',
      fail: () => wx.showToast({ title: '质量追溯页面打开失败', icon: 'none' })
    });
  },

  goMatching() {
    wx.navigateTo({ url: '/pages/supply_chain/matching/matching' });
  },

  goBatchScan() {
    wx.navigateTo({ url: '/pages/stock/batch_scan/batch_scan' });
  },

  goGoodsTransfer() {
    wx.navigateTo({ url: '/pages/stock/goods_transfer/goods_transfer' });
  },

  goGoodsTransferList() {
    wx.navigateTo({
      url: '/pages/stock/goods_transfer_list/goods_transfer_list'
    });
  },

  goFactoryReturnInventory() {
    wx.navigateTo({
      url: '/pages/stock/factory_return_inventory/factory_return_inventory'
    });
  },

  goStats() {
    wx.navigateTo({ url: '/pages/stats/dealer_stats/index' });
  },

  goAftersaleList() {
    wx.navigateTo({ url: '/pages/aftersale/list/list' });
  },

  goMyDevice() {
    wx.navigateTo({
      url: '/pages/customer/device/list/list'
    });
  }
});
