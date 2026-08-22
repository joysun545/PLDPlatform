const app = getApp();

const ALLOWED_ROLES = [
  'factory_sales',
  'factory_sales_assistant',
  'factory_matching',
  'factory_production',
  'factory_stock',
  'factory_logistics',
  'merchant_owner',
  'merchant_senior_manager',
  'merchant_sales',
  'merchant_stock',
  'supplier_owner',
  'supplier_sales'
];

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = number => String(number).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function preparePlan(plan) {
  const statusClassMap = {
    MATCHING_PENDING: 'pending',
    MATCHING_COMPLETED: 'completed',
    PRODUCTION_PENDING: 'processing',
    PRODUCTION_COMPLETED: 'completed',
    SHIPPED: 'completed',
    RECEIVED: 'completed',
    SUPPLIER_PENDING: 'pending',
    SUPPLIER_PROCESSING: 'processing',
    SUPPLIER_CONFIRMED: 'completed',
    CANCELLED: 'cancelled'
  };
  const confirmation = plan.supplier_confirmation || null;
  const productionConfirmation = plan.production_confirmation || null;
  const shipmentAuthorization = plan.shipment_authorization || null;
  const stockConfirmation = plan.stock_confirmation || null;
  const receiptConfirmation = plan.receipt_confirmation || null;
  const accountingConfirmation = plan.accounting_confirmation || null;
  const financeSummary = plan.finance_summary || null;
  const logisticsSummary = plan.logistics_summary
    ? {
        ...plan.logistics_summary,
        latestUploadedText: formatDate(plan.logistics_summary.latest_uploaded_at)
      }
    : null;
  return {
    ...plan,
    submittedText: formatDate(plan.submitted_at),
    statusClass: statusClassMap[plan.status] || 'pending',
    canOpen: !!plan.detail_link,
    canConfirmDelivery: !!(confirmation && confirmation.can_confirm),
    canConfirmProduction: !!(
      productionConfirmation && productionConfirmation.can_confirm
    ),
    canConfirmShipmentAuthorization: !!(
      shipmentAuthorization && shipmentAuthorization.can_confirm
    ),
    canConfirmOutbound: !!(stockConfirmation && stockConfirmation.can_confirm),
    canConfirmReceipt: !!(receiptConfirmation && receiptConfirmation.can_confirm),
    canConfirmAccounting: !!(
      accountingConfirmation && accountingConfirmation.can_confirm
    ),
    confirmation,
    productionConfirmation,
    shipmentAuthorization,
    stockConfirmation,
    receiptConfirmation,
    accountingConfirmation,
    financeSummary,
    logisticsSummary,
    fulfillmentStages: plan.fulfillment_stages || [],
    items: (plan.items || []).map(item => ({
      ...item,
      bomVersion: item.bom_confirmation
        ? item.bom_confirmation.version
        : (Number(item.production_quantity) === 0
            ? '沿用退货设备原BOM'
            : '待配套确认'),
      materials: item.materials || []
    }))
  };
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    viewer: null,
    visibility: '',
    visibilityText: '',
    plans: [],
    confirmingPlanId: 0,
    confirmingProductionPlanId: 0,
    confirmingShipmentAuthorizationPlanId: 0,
    confirmingOutboundPlanId: 0,
    confirmingReceiptPlanId: 0,
    confirmingAccountingPlanId: 0,
    activeStatus: '',
    filters: [
      { key: '', label: '全部' },
      { key: 'MATCHING_PENDING', label: '待配套' },
      { key: 'MATCHING_COMPLETED', label: '配套完成' },
      { key: 'PRODUCTION_PENDING', label: '生产中' },
      { key: 'PRODUCTION_COMPLETED', label: '待发货' },
      { key: 'SHIPPED', label: '已发货' },
      { key: 'RECEIVED', label: '商家已入库' },
      { key: 'CANCELLED', label: '已取消' }
    ]
  },

  onLoad() {
    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({ loading: false, errorMessage: '登录失败，请重新进入小程序' });
        return;
      }
      const role = app.globalData.role || '';
      if (!ALLOWED_ROLES.includes(role)) {
        wx.showModal({
          title: '无法进入',
          content: '当前岗位不是订单计划参与角色',
          showCancel: false,
          success: () => wx.navigateBack()
        });
        return;
      }
      this.loadPlans();
    });
  },

  onPullDownRefresh() {
    this.loadPlans(() => wx.stopPullDownRefresh());
  },

  selectStatus(e) {
    const status = e.currentTarget.dataset.status || '';
    if (status === this.data.activeStatus) return;
    this.setData({ activeStatus: status });
    this.loadPlans();
  },

  loadPlans(done) {
    this.setData({ loading: true, errorMessage: '' });
    const data = { limit: 100 };
    if (this.data.activeStatus) data.status = this.data.activeStatus;

    wx.request({
      url: `${app.globalData.apiBase}/sales/order-plans/`,
      method: 'GET',
      data,
      header: app.authHeader(),
      success: res => {
        if (res.statusCode === 401) {
          app.reauthenticate();
          this.setData({ loading: false, errorMessage: '登录状态已失效，请重新进入' });
          return;
        }
        const body = res.data || {};
        if (body.code !== 0 || !body.data) {
          this.setData({
            loading: false,
            errorMessage: body.msg || '订单计划加载失败'
          });
          return;
        }
        const payload = body.data;
        const visibilityTextMap = {
          created_by_me: '仅显示由您本人创建的订单计划',
          factory_all: '显示当前厂家组织的全部订单计划',
          merchant_receiving: '显示当前商家待接收及已入库的订单计划',
          supplier_participating: '仅显示本供应商实际参与的型号和物料',
          supplier_responsibility: '仅显示负责人分配给您的品类或物料'
        };
        this.setData({
          loading: false,
          viewer: payload.viewer || null,
          visibility: payload.visibility || '',
          visibilityText: visibilityTextMap[payload.visibility] || '',
          plans: (payload.items || []).map(preparePlan),
          filters: payload.viewer && ['supplier_owner', 'supplier_sales'].includes(payload.viewer.role)
            ? [
                { key: '', label: '全部' },
                { key: 'SUPPLIER_PENDING', label: '待配送' },
                { key: 'SUPPLIER_PROCESSING', label: '配送确认中' },
                { key: 'SUPPLIER_CONFIRMED', label: '配送完成' },
                { key: 'CANCELLED', label: '已取消' }
              ]
            : this.data.filters
        });
      },
      fail: () => {
        this.setData({ loading: false, errorMessage: '网络连接失败，请稍后重试' });
      },
      complete: () => done && done()
    });
  },

  retryLoad() {
    this.loadPlans();
  },

  openPlan(e) {
    const plan = this.data.plans.find(
      item => item.id === Number(e.currentTarget.dataset.id)
    );
    if (!plan || !plan.detail_link) return;
    wx.navigateTo({
      url: plan.detail_link,
      fail: () => wx.showToast({ title: '订单详情打开失败', icon: 'none' })
    });
  },

  openFinance(e) {
    const planId = Number(e.currentTarget.dataset.id);
    if (!planId) return;
    wx.navigateTo({
      url: `/pages/sales/order_finance/order_finance?order_plan_id=${planId}`,
      fail: () => wx.showToast({ title: '订单资金页面打开失败', icon: 'none' })
    });
  },

  openLogistics(e) {
    const planId = Number(e.currentTarget.dataset.id);
    if (!planId) return;
    wx.navigateTo({
      url: `/pages/sales/order_logistics/order_logistics?order_plan_id=${planId}`,
      fail: () => wx.showToast({ title: '物流单据页面打开失败', icon: 'none' })
    });
  },

  confirmDelivery(e) {
    const planId = Number(e.currentTarget.dataset.id);
    const plan = this.data.plans.find(item => item.id === planId);
    if (!plan || !plan.canConfirmDelivery || this.data.confirmingPlanId) return;

    const role = (this.data.viewer && this.data.viewer.role) || '';
    const content = role === 'supplier_owner'
      ? '确认后，本供应商在该订单中的全部物料将标记为已完成配送。'
      : '确认后，您责任范围内的物料将标记为已完成配送；系统会等待其他责任人。';

    wx.showModal({
      title: '确认物料配送',
      content,
      confirmText: '确认配送',
      success: modal => {
        if (!modal.confirm) return;
        this.submitDeliveryConfirmation(plan);
      }
    });
  },

  submitDeliveryConfirmation(plan) {
    const confirmation = plan.confirmation || {};
    this.setData({ confirmingPlanId: plan.id });
    wx.showLoading({ title: '正在确认...', mask: true });
    wx.request({
      url: `${app.globalData.apiBase}/sales/order-plans/${plan.id}/supplier-confirm/`,
      method: 'POST',
      header: {
        ...app.authHeader(),
        'content-type': 'application/json'
      },
      data: {
        supplier_id: confirmation.supplier && confirmation.supplier.id,
        usertask_id: confirmation.task_id
      },
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401) {
          app.reauthenticate();
          wx.showToast({ title: '登录状态已失效', icon: 'none' });
          return;
        }
        if (body.code !== 0) {
          wx.showToast({ title: body.msg || '配送确认失败', icon: 'none' });
          return;
        }
        wx.showToast({ title: body.msg || '配送状态已更新', icon: 'success' });
        app.refreshTasks && app.refreshTasks();
        this.loadPlans();
      },
      fail: () => wx.showToast({ title: '网络连接失败', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ confirmingPlanId: 0 });
      }
    });
  },

  confirmProduction(e) {
    const planId = Number(e.currentTarget.dataset.id);
    const plan = this.data.plans.find(item => item.id === planId);
    if (!plan || !plan.canConfirmProduction || this.data.confirmingProductionPlanId) return;

    wx.showModal({
      title: '确认生产完成',
      content: '确认后将向创建订单的厂家销售经理推送“确认发货”任务。销售经理确认后，厂家库管才能打印二维码并出库。',
      confirmText: '确认完成',
      success: modal => {
        if (!modal.confirm) return;
        this.submitProductionConfirmation(plan);
      }
    });
  },

  submitProductionConfirmation(plan) {
    this.setData({ confirmingProductionPlanId: plan.id });
    wx.showLoading({ title: '正在确认...', mask: true });
    wx.request({
      url: `${app.globalData.apiBase}/sales/order-plans/${plan.id}/production-confirm/`,
      method: 'POST',
      header: app.authHeader('application/json'),
      data: {},
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401) {
          app.reauthenticate();
          wx.showToast({ title: '登录状态已失效', icon: 'none' });
          return;
        }
        if (body.code !== 0) {
          wx.showToast({ title: body.msg || '生产确认失败', icon: 'none' });
          return;
        }
        wx.showToast({ title: body.msg || '生产完成已确认', icon: 'success' });
        app.refreshTasks && app.refreshTasks();
        this.loadPlans();
      },
      fail: () => wx.showToast({ title: '网络连接失败', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ confirmingProductionPlanId: 0 });
      }
    });
  },

  confirmShipmentAuthorization(e) {
    const planId = Number(e.currentTarget.dataset.id);
    const plan = this.data.plans.find(item => item.id === planId);
    if (
      !plan ||
      !plan.canConfirmShipmentAuthorization ||
      this.data.confirmingShipmentAuthorizationPlanId
    ) return;

    wx.showModal({
      title: '确认发货',
      content: `确认订单 ${plan.plan_code} 进入二维码打印和库房出库流程？这是实物流转的必经确认，与付款、应收款无关。`,
      confirmText: '确认发货',
      success: modal => {
        if (!modal.confirm) return;
        this.submitShipmentAuthorization(plan);
      }
    });
  },

  submitShipmentAuthorization(plan) {
    this.setData({ confirmingShipmentAuthorizationPlanId: plan.id });
    wx.showLoading({ title: '正在确认...', mask: true });
    wx.request({
      url: `${app.globalData.apiBase}/sales/order-plans/${plan.id}/shipment-authorization/`,
      method: 'POST',
      header: app.authHeader('application/json'),
      data: {},
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401) {
          app.reauthenticate();
          wx.showToast({ title: '登录状态已失效', icon: 'none' });
          return;
        }
        if (body.code !== 0) {
          wx.showToast({ title: body.msg || '发货确认失败', icon: 'none' });
          return;
        }
        wx.showToast({ title: body.msg || '发货已确认', icon: 'success' });
        app.refreshTasks && app.refreshTasks();
        this.loadPlans();
      },
      fail: () => wx.showToast({ title: '网络连接失败', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ confirmingShipmentAuthorizationPlanId: 0 });
      }
    });
  },

  confirmOutbound(e) {
    const planId = Number(e.currentTarget.dataset.id);
    const plan = this.data.plans.find(item => item.id === planId);
    if (!plan || !plan.canConfirmOutbound || this.data.confirmingOutboundPlanId) return;
    wx.showModal({
      title: '确认一键发货',
      content: `确认将订单 ${plan.plan_code} 标记为已发货？本操作不需要逐台扫描。`,
      confirmText: '确认发货',
      success: modal => {
        if (!modal.confirm) return;
        this.submitOutbound(plan);
      }
    });
  },

  submitOutbound(plan) {
    this.setData({ confirmingOutboundPlanId: plan.id });
    wx.showLoading({ title: '正在发货...', mask: true });
    wx.request({
      url: `${app.globalData.apiBase}/sales/order-plans/${plan.id}/stock-outbound/`,
      method: 'POST',
      header: app.authHeader('application/json'),
      data: {},
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401) {
          app.reauthenticate();
          wx.showToast({ title: '登录状态已失效', icon: 'none' });
          return;
        }
        if (body.code !== 0) {
          wx.showToast({ title: body.msg || '发货失败', icon: 'none' });
          return;
        }
        wx.showToast({ title: body.msg || '订单已发货', icon: 'success' });
        app.refreshTasks && app.refreshTasks();
        this.loadPlans();
      },
      fail: () => wx.showToast({ title: '网络连接失败', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ confirmingOutboundPlanId: 0 });
      }
    });
  },

  confirmReceipt(e) {
    const planId = Number(e.currentTarget.dataset.id);
    const plan = this.data.plans.find(item => item.id === planId);
    if (!plan || !plan.canConfirmReceipt || this.data.confirmingReceiptPlanId) return;
    wx.showModal({
      title: '确认一键入库',
      content: `请确认订单 ${plan.plan_code} 的线下货物已全部验收。首位确认后，同组织其他处理人将同步显示处理人。`,
      confirmText: '确认入库',
      success: modal => modal.confirm && this.submitReceipt(plan)
    });
  },

  submitReceipt(plan) {
    this.setData({ confirmingReceiptPlanId: plan.id });
    wx.showLoading({ title: '正在入库...', mask: true });
    wx.request({
      url: `${app.globalData.apiBase}/sales/order-plans/${plan.id}/merchant-receipt/`,
      method: 'POST',
      header: app.authHeader('application/json'),
      data: {},
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401) app.reauthenticate();
        if (body.code !== 0) {
          wx.showToast({ title: body.msg || '入库失败', icon: 'none' });
          return;
        }
        wx.showToast({ title: body.msg || '订单已入库', icon: 'success' });
        app.refreshTasks && app.refreshTasks();
        this.loadPlans();
      },
      fail: () => wx.showToast({ title: '网络连接失败', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ confirmingReceiptPlanId: 0 });
      }
    });
  },

  confirmAccounting(e) {
    const planId = Number(e.currentTarget.dataset.id);
    const plan = this.data.plans.find(item => item.id === planId);
    if (!plan || !plan.canConfirmAccounting || this.data.confirmingAccountingPlanId) return;
    wx.showModal({
      title: '确认订单入账',
      content: `确认订单 ${plan.plan_code} 已完成线下账务处理？`,
      confirmText: '确认入账',
      success: modal => modal.confirm && this.submitAccounting(plan)
    });
  },

  submitAccounting(plan) {
    this.setData({ confirmingAccountingPlanId: plan.id });
    wx.showLoading({ title: '正在确认...', mask: true });
    wx.request({
      url: `${app.globalData.apiBase}/sales/order-plans/${plan.id}/accounting-confirm/`,
      method: 'POST',
      header: app.authHeader('application/json'),
      data: {},
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401) app.reauthenticate();
        if (body.code !== 0) {
          wx.showToast({ title: body.msg || '入账确认失败', icon: 'none' });
          return;
        }
        wx.showToast({ title: body.msg || '已标记入账', icon: 'success' });
        app.refreshTasks && app.refreshTasks();
        this.loadPlans();
      },
      fail: () => wx.showToast({ title: '网络连接失败', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ confirmingAccountingPlanId: 0 });
      }
    });
  }
});
