const app = getApp();

const DOMAIN_META = {
  FLOW: { title: '产品流转', subtitle: '生产、库存、安装与激活', icon: '流' },
  MATERIAL: { title: '物料配套', subtitle: '物料批次、供应商与故障关联', icon: '料' },
  AFTERSALES: { title: '售后服务', subtitle: '工单、故障率与结案状态', icon: '售' },
  QUALITY: { title: '质量追溯', subtitle: '质量风险与召回执行结果', icon: '质' }
};

const METRIC_NAMES = {
  produced_device_count: '生产设备', inventory_device_count: '当前库存',
  installed_device_count: '已安装', activated_device_count: '已激活',
  installation_rate: '安装率', activation_rate: '激活率',
  material_batch_count: '物料批次', material_usage_count: '配套记录',
  material_covered_device_count: '配套设备量', material_fault_device_count: '物料故障设备',
  aftersales_case_count: '售后工单', aftersales_fault_device_count: '故障设备',
  aftersales_open_count: '未结案售后', activated_exposure_device_count: '已激活暴露设备',
  aftersales_fault_rate: '售后故障率', active_recall_campaign_count: '召回中批次',
  active_recall_device_count: '召回中设备', completed_recall_campaign_count: '已完成召回批次'
};

const PERCENT_METRICS = ['installation_rate', 'activation_rate', 'aftersales_fault_rate'];

function normalizeSection(section = {}) {
  const meta = DOMAIN_META[section.domain] || { title: section.domain, subtitle: '', icon: '数' };
  const metrics = Object.keys(section.metrics || {}).map(code => ({
    code,
    name: METRIC_NAMES[code] || code,
    value: section.metrics[code],
    unit: PERCENT_METRICS.includes(code) ? '%' : ''
  }));
  return Object.assign({}, section, meta, { metrics });
}

Page({
  data: {
    loading: true,
    error: '',
    dashboardName: '岗位数据驾驶舱',
    organizationName: '',
    roleName: '',
    generatedAt: '',
    sections: []
  },

  onLoad() { this.loadDashboard(); },
  onShow() { if (!this.data.loading && this.data.sections.length) return; this.loadDashboard(); },
  onPullDownRefresh() { this.loadDashboard(() => wx.stopPullDownRefresh()); },

  loadDashboard(done) {
    this.setData({ loading: true, error: '' });
    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({ loading: false, error: '登录状态无效，请返回后重试。' });
        done && done();
        return;
      }
      wx.request({
        url: `${app.globalData.apiBase}/data-statistics/dashboard/`,
        method: 'GET',
        header: app.authHeader(),
        success: res => {
          const body = res.data || {};
          if (res.statusCode === 401) {
            app.reauthenticate();
            this.setData({ loading: false, error: '登录已失效，请重新进入。' });
            return;
          }
          if (body.code !== 0 || !body.data) {
            this.setData({ loading: false, error: body.msg || '统计数据加载失败。' });
            return;
          }
          const data = body.data;
          this.setData({
            loading: false,
            dashboardName: data.dashboard_name || '岗位数据驾驶舱',
            organizationName: (data.identity || {}).organization_name || '',
            roleName: (data.identity || {}).role_name || '',
            generatedAt: (data.generated_at || '').replace('T', ' ').slice(0, 19),
            sections: (data.sections || []).map(normalizeSection)
          });
        },
        fail: () => this.setData({ loading: false, error: '网络连接失败，请下拉刷新。' }),
        complete: () => { done && done(); }
      });
    });
  },

  openDomain(e) {
    const domain = e.currentTarget.dataset.domain;
    if (!domain) return;
    wx.navigateTo({ url: `/pages/data_statistics/domain/domain?domain=${domain}` });
  }
});
