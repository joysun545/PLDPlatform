const app = getApp();

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function preparePlan(plan) {
  const statusClassMap = {
    MATERIAL_REVIEW: 'pending',
    MATERIAL_WAITING: 'pending',
    MATERIAL_READY: 'processing',
    PRODUCTION_RELEASED: 'processing',
    PRODUCTION_COMPLETED: 'processing',
    SHIPPED: 'completed',
    RECEIVED: 'completed',
    CANCELLED: 'cancelled'
  };
  return {
    ...plan,
    submittedText: formatDate(plan.submitted_at),
    statusClass: statusClassMap[plan.material_status || plan.status] || 'pending'
  };
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    viewer: null,
    plans: [],
    activeStatus: '',
    filters: [{ key: '', label: '全部' }]
  },

  onLoad() {
    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({ loading: false, errorMessage: '登录失败，请重新进入小程序' });
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
          this.setData({ loading: false, errorMessage: body.msg || '订单计划加载失败' });
          return;
        }
        const payload = body.data;
        this.setData({
          loading: false,
          viewer: payload.viewer || null,
          plans: (payload.items || []).map(preparePlan),
          filters: [{ key: '', label: '全部' }].concat(
            (payload.status_choices || []).map(item => ({ key: item.value, label: item.name }))
          )
        });
      },
      fail: () => this.setData({ loading: false, errorMessage: '网络连接失败，请稍后重试' }),
      complete: () => done && done()
    });
  },

  retryLoad() {
    this.loadPlans();
  },

  openPlan(e) {
    const plan = this.data.plans.find(item => item.id === Number(e.currentTarget.dataset.id));
    if (!plan || !plan.detail_link) return;
    wx.navigateTo({
      url: plan.detail_link,
      fail: () => wx.showToast({ title: '订单详情打开失败', icon: 'none' })
    });
  }
});
