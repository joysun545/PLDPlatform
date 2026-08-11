const app = getApp();

const ALLOWED_ROLES = [
  'factory_sales',
  'factory_matching',
  'factory_production',
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
    CANCELLED: 'cancelled'
  };
  return {
    ...plan,
    submittedText: formatDate(plan.submitted_at),
    statusClass: statusClassMap[plan.status] || 'pending',
    canOpen: !!plan.detail_link,
    items: (plan.items || []).map(item => ({
      ...item,
      bomVersion: item.bom_confirmation
        ? item.bom_confirmation.version
        : '待配套确认',
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
    activeStatus: '',
    filters: [
      { key: '', label: '全部' },
      { key: 'MATCHING_PENDING', label: '待配套' },
      { key: 'MATCHING_COMPLETED', label: '配套完成' },
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
          supplier_participating: '仅显示本供应商实际参与的型号和物料',
          supplier_responsibility: '仅显示负责人分配给您的品类或物料'
        };
        this.setData({
          loading: false,
          viewer: payload.viewer || null,
          visibility: payload.visibility || '',
          visibilityText: visibilityTextMap[payload.visibility] || '',
          plans: (payload.items || []).map(preparePlan)
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
  }
});
