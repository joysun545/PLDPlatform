const app = getApp();
const tabBar = typeof require === 'function'
  ? require('../../../utils/tab-bar')
  : { sync() {} };

Page({
  data: {
    nickname: '',
    role_name: '',
    real_name: '',
    isPlatformAdmin: false,

    showInvite: false,
    showManageSubordinates: false,
    showCreateOrderPlan: false,
    showOrderPlanList: false,
    showSupplierResponsibility: false,
    showMaterialInventory: false,
    showSupplierWarranty: false,
    showSupplierQualityNotices: false,
    showMatching: false,
    showStock: false,
    showGoodsTransfer: false,
    showGoodsTransferList: false,
    showFactoryReturnInventory: false,
    showStats: false,
    showAftersale: false,
    showApplyServiceStation: false,
    serviceStationEntryText: '申请售后服务站',
    showMyDevice: false,
    showQualityTrace: false,
    showThemeSettings: false,
    iconTheme: 'jade'
  },

  onLoad() {
    this.refreshPage();
  },

  onShow() {
    tabBar.sync(this, 0);
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
      real_name: app.globalData.real_name || '',
      isPlatformAdmin: !!app.globalData.is_platform_admin
    });
  },

  updateButtons() {
    const role = (app.globalData.role || 'tourist').trim();
    const appearance = app.globalData.appearance || {};
    const iconTheme = ['jade', 'ocean', 'amber'].includes(appearance.color_scheme)
      ? appearance.color_scheme
      : 'jade';

    this.setData({
      iconTheme,
      showCreateOrderPlan: role === 'factory_sales',
      showThemeSettings: role === 'factory_admin',
      showOrderPlanList: [
        // These are V2 awareness roles.  The server decides which plans they
        // can read and returns no action button unless a real task belongs to
        // them; the home entry must not hide the dynamic order card first.
        'factory_admin',
        'factory_manager',
        'factory_chief_engineer',
        'factory_sales',
        'factory_sales_assistant',
        'factory_matching',
        'factory_production',
        'factory_stock',
        'factory_material_stock',
        'factory_logistics',
        'supplier_owner',
        'supplier_sales',
        'merchant_owner',
        'merchant_senior_manager',
        'merchant_sales',
        'merchant_stock'
      ].includes(role),
      showSupplierResponsibility: role === 'supplier_owner',
      showMaterialInventory: ['factory_material_stock', 'supplier_owner', 'supplier_sales'].includes(role),
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
      ].includes(role) || (
        role === 'merchant_senior_manager' &&
        (app.globalData.delegated_role_codes || []).some(code =>
          ['merchant_sales', 'merchant_stock'].includes(code)
        )
      ),

      showGoodsTransferList: [
        'merchant_owner',
        'merchant_sales',
        'merchant_stock',
        'factory_stock',
        'factory_sales'
      ].includes(role) || (
        role === 'merchant_senior_manager' &&
        (app.globalData.delegated_role_codes || []).some(code =>
          ['merchant_sales', 'merchant_stock'].includes(code)
        )
      ),

      showFactoryReturnInventory: [
        'factory_sales',
        'factory_sales_assistant',
        'factory_stock',
        'factory_production',
        'factory_matching'
      ].includes(role),

      showStats: [
        'factory_admin',
        'factory_chief_engineer',
        'factory_sales',
        'factory_sales_assistant',
        'factory_matching',
        'factory_production',
        'factory_purchase',
        'factory_stock',
        'factory_material_stock',
        'factory_logistics',
        'factory_aftersales',
        'merchant_owner',
        'merchant_senior_manager',
        'merchant_manager',
        'merchant_sales',
        'merchant_stock',
        'merchant_assistant',
        'merchant_electrician',
        'supplier_owner',
        'supplier_manager',
        'supplier_sales',
        'supplier_technical',
        'service_owner',
        'service_electrician'
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
      this.updateUserInfo();
      this.updateButtons();
      this.updateServiceStationCapability(ok);
      if (!ok || (app.globalData.role === 'tourist' && !app.globalData.is_platform_admin)) {
        this.setData({
          showInvite: false,
          showManageSubordinates: false
        });
        return;
      }

      if (app.globalData.is_platform_admin) {
        this.setData({ showInvite: true, showManageSubordinates: false });
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

  goMaterialInventory() {
    wx.navigateTo({ url: '/pages/material_inventory/list/list' });
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
    wx.navigateTo({
      url: '/pages/data_statistics/dashboard/dashboard',
      fail: () => wx.showToast({ title: '数据统计页面打开失败', icon: 'none' })
    });
  },

  updateServiceStationCapability(loginReady) {
    this.setData({ showApplyServiceStation: false });
    if (!loginReady || (app.globalData.role || '').trim() !== 'merchant_owner') return;

    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/after-sales/service-station/application/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        const data = res.data && res.data.code === 0 ? (res.data.data || {}) : {};
        if (!data.eligible) {
          this.setData({ showApplyServiceStation: false });
          return;
        }
        const application = data.application || null;
        this.setData({
          showApplyServiceStation: true,
          serviceStationEntryText: application && application.status === 'APPROVED'
            ? '查看售后服务站'
            : application
              ? '售后服务站申请'
              : '申请售后服务站'
        });
      },
      fail: () => this.setData({ showApplyServiceStation: false })
      });
  },

  goThemeSettings() {
    wx.navigateTo({
      url: '/pages/theme/setting/setting',
      fail: () => wx.showToast({ title: '主题设置页面打开失败', icon: 'none' })
    });
  },

  goAftersaleList() {
    wx.navigateTo({ url: '/pages/aftersale/list/list' });
  },

  goApplyServiceStation() {
    wx.navigateTo({
      url: '/pages/aftersale/service_station/application/application',
      fail: () => wx.showToast({ title: '服务站申请页面打开失败', icon: 'none' })
    });
  },

  goMyDevice() {
    wx.navigateTo({
      url: '/pages/customer/device/list/list'
    });
  }
});
