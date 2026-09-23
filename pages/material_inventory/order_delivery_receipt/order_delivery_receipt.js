const app = getApp();

function request(planId, method) {
  return new Promise((resolve, reject) => {
    app.ensureLogin(ok => {
      if (!ok) return reject(new Error('请重新登录后再试'));
      if ((app.globalData.role || '').trim() !== 'factory_material_stock') {
        return reject(new Error('仅厂家物料库管可办理订单配送入库'));
      }
      wx.request({
        url: `${app.globalData.apiBase}/sales/order-plans/${planId}/material-flow/order-delivery-receipt/`,
        method,
        header: app.authHeader('application/json'),
        success: res => {
          const body = res.data || {};
          if (res.statusCode === 401 || body.code === 401) app.reauthenticate();
          if (res.statusCode === 200 && body.code === 0) return resolve(body.data || {});
          reject(new Error(body.msg || '订单配送入库处理失败'));
        },
        fail: () => reject(new Error('网络连接失败，请稍后重试'))
      });
    });
  });
}

Page({
  data: { loading: false, submitting: false, error: '', form: null, received: [] },
  onLoad(options) {
    this.planId = Number(options.plan_id);
    if (!Number.isFinite(this.planId) || this.planId <= 0) {
      this.setData({ error: '订单参数无效，请返回订单计划详情页重新进入' });
      return;
    }
    this.load();
  },
  onShow() { if (this._loaded && !this.data.submitting && !this.data.received.length) this.load(); },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const form = await request(this.planId, 'GET');
      this._loaded = true;
      this.setData({ form });
      wx.setNavigationBarTitle({ title: '物料入库' });
    } catch (error) { this.setData({ error: error.message, form: null }); }
    finally { this.setData({ loading: false }); }
  },
  async submitAllReceipt() {
    const form = this.data.form;
    if (this._receiptBusy || this.data.submitting) {
      wx.showToast({ title: '正在提交入库，请勿重复操作', icon: 'none' });
      return;
    }
    if (!form || !form.can_submit) {
      wx.showToast({ title: '当前没有可入库物料，请刷新订单详情', icon: 'none' });
      return;
    }
    this._receiptBusy = true;
    this.setData({ submitting: true, error: '' });
    wx.showLoading({ title: '正在全部入库...', mask: true });
    try {
      const data = await request(this.planId, 'POST');
      this.setData({
        received: data.received || [],
        form: { ...form, can_submit: false, item_count: 0, items: [] }
      });
      if (typeof app.refreshTasks === 'function') app.refreshTasks();
      app.globalData.orderDeliveryReceiptRefreshPlanId = this.planId;
      wx.showToast({ title: '全部物料已入库', icon: 'success' });
    } catch (error) {
      const message = error && error.message ? error.message : '订单配送物料入库失败';
      this.setData({ error: message });
      wx.showToast({ title: message, icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ submitting: false });
      this._receiptBusy = false;
    }
  },
  backToPlan() {
    app.globalData.orderDeliveryReceiptRefreshPlanId = this.planId;
    const pages = getCurrentPages();
    const previousPage = pages.length > 1 ? pages[pages.length - 2] : null;
    if (
      previousPage &&
      previousPage.data &&
      Number(previousPage.data.orderPlanId) === this.planId &&
      typeof previousPage.loadDetail === 'function'
    ) {
      previousPage.loadDetail();
    }
    wx.navigateBack({ delta: 1 });
  }
});
