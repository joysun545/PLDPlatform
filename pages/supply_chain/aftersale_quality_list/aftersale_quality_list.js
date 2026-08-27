const app = getApp();

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

Page({
  data: { loading: true, errorMessage: '', items: [], count: 0 },

  onShow() {
    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({ loading: false, errorMessage: '登录失败，请重新进入小程序' });
        return;
      }
      this.loadList();
    });
  },

  onPullDownRefresh() {
    this.loadList(() => wx.stopPullDownRefresh());
  },

  loadList(done) {
    this.setData({ loading: true, errorMessage: '' });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/after-sales/supplier-quality-notices/`,
      method: 'GET',
      header: app.authHeader(),
      data: { limit: 100 },
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401 || body.code === 401) app.reauthenticate();
        if (body.code !== 0 || !body.data) {
          this.setData({ loading: false, errorMessage: body.msg || '质量通知列表加载失败' });
          return;
        }
        const items = (body.data.items || []).map(item => ({
          ...item,
          closedAtText: formatDate(item.closed_at),
          materialsText: (item.material_names || []).join('、') || '物料信息待确认'
        }));
        this.setData({ loading: false, items, count: items.length });
      },
      fail: () => this.setData({ loading: false, errorMessage: '网络连接失败，请稍后重试' }),
      complete: () => done && done()
    });
  },

  openNotice(e) {
    const applicationId = Number(e.currentTarget.dataset.applicationId || 0);
    const supplierId = Number(e.currentTarget.dataset.supplierId || 0);
    if (!applicationId || !supplierId) return;
    wx.navigateTo({
      url: `/pages/supply_chain/aftersale_quality_notice/aftersale_quality_notice?application_id=${applicationId}&supplier_id=${supplierId}`,
      fail: () => wx.showToast({ title: '质量通知详情打开失败', icon: 'none' })
    });
  },

  retryLoad() { this.loadList(); }
});
