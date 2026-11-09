const { statisticsAccessScope, statisticsAccessError } = require('../../../utils/statistics_access');
const app = getApp();
const DEFAULT_DASHBOARD_NAME = '岗位数据驾驶舱';

const DOMAIN_META = {
  FLOW: { title: '产品流转', subtitle: '生产、库存、安装与激活', icon: '流' },
  MATERIAL: { title: '物料配套', subtitle: '物料批次、供应商与故障关联', icon: '料' },
  AFTERSALES: { title: '售后服务', subtitle: '工单、维修台次、换件件次与结算依据', icon: '售' },
  QUALITY: { title: '质量追溯', subtitle: '质量风险与召回执行结果', icon: '质' },
  FINANCE: { title: '应收与应付', subtitle: '厂家应收与直属商家应付', icon: '款' }
};

const METRIC_NAMES = {
  receivable_outstanding_amount: '当前应收', payable_outstanding_amount: '当前应付',
  merchant_shipment_count:'累计向下发货单', merchant_shipped_device_count:'累计向下发货台次',
  repair_completed_visits: '已完工维修台次', repair_waiting_visits: '完工待确认／结案台次',
  repair_basis_visits: '具备结算依据维修台次', replacement_basis_pieces: '结算依据换件件次',
  repair_basis_review_visits: '结算依据待核对台次',

  produced_device_count: '生产设备', inventory_device_count: '当前库存',
  received_device_count: '入库设备', order_plan_count: '有效计划设备',
  order_plan_pending_production_device_count: '计划未完成生产',
  order_plan_produced_pending_outbound_device_count: '生产完成待出库',
  order_plan_outbounded_pending_ship_device_count: '已出库待确认发货',
  order_plan_shipped_device_count: '累计已发货',
  order_plan_shipped_pending_accounting_device_count: '发货待下账',
  order_plan_accounted_device_count: '物权已转移',
  channel_inventory_device_count: '链路库存',
  organization_inventory_device_count: '组织库存',
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

function formatMoney(value) {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value == null ? '' : value).trim());
  if (!match) return '--';
  return `${match[1]}${match[2].replace(/^0+(?=\d)/, '')}.${(match[3] || '').padEnd(2, '0')}`;
}

function selectedRootId() {
  const globalData = app.globalData || {};
  const id = Number((globalData.operationRoot || {}).id || globalData.factory_root_id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function normalizeSection(section = {}) {
  const meta = DOMAIN_META[section.domain] || { title: section.domain, subtitle: '', icon: '数' };
  const financial = section.domain === 'FINANCE';
  const sourceMetrics = financial && section.access_denied === true ? {} : (section.metrics || {});
  const metricCodes = Object.keys(sourceMetrics).filter(code => !(
    section.domain === 'FLOW'
    && code === 'inventory_device_count'
    && sourceMetrics.channel_inventory_device_count !== undefined
  ));
  const metrics = metricCodes.map(code => ({
    code,
    name: METRIC_NAMES[code] || code,
    value: financial ? formatMoney(sourceMetrics[code]) : sourceMetrics[code],
    unit: financial ? '元' : (code==='merchant_shipment_count'?'单':(code==='merchant_shipped_device_count'?'台次':(PERCENT_METRICS.includes(code) ? '%' : (code.endsWith('_visits') ? '台次' : (code.endsWith('_pieces') ? '件次' : '')))))
  }));
  return Object.assign({}, section, meta, {
    metrics, repairBasisScopeTitle:(section.repair_basis_scope || {}).title || '',
    subtitle: financial && (section.root_organization || {}).name
      ? `${meta.subtitle} · ${section.root_organization.name}` : meta.subtitle
  });
}

Page({
  data: {
    loading: true,
    error: '',
    dashboardName: DEFAULT_DASHBOARD_NAME,
    organizationName: '',
    roleName: '',
    generatedAt: '',
    sections: []
  },

  onShow() { this.loadDashboard(); },
  onPullDownRefresh() { this.loadDashboard(() => wx.stopPullDownRefresh()); },

  clearStatistics(error) {
    this._statisticsScope = null;
    this.setData({ loading: false, error, dashboardName: DEFAULT_DASHBOARD_NAME,
      organizationName: '', roleName: '', generatedAt: '', sections: [] });
  },

  loadDashboard(done) {
    const scope = statisticsAccessScope(app);
    if (this._dashboardRequest && this._dashboardRequest.scope === scope) { done && done(); return; }
    const request = { scope };
    this._dashboardRequest = request;
    const finish = () => {
      if (this._dashboardRequest === request) this._dashboardRequest = null;
      done && done();
    };
    const isCurrent = () => {
      if (this._dashboardRequest !== request) return false;
      if (request.scope === statisticsAccessScope(app)) return true;
      this.clearStatistics('统计身份已变更，请下拉刷新。');
      return false;
    };
    if (this._statisticsScope && this._statisticsScope !== scope) this.clearStatistics('');
    this.setData({ loading: true, error: '' });
    app.ensureLogin(ok => {
      if (this._dashboardRequest !== request) { finish(); return; }
      if (!ok) {
        this.clearStatistics('登录状态无效，请返回后重试。');
        finish();
        return;
      }
      request.scope = statisticsAccessScope(app);
      wx.request({
        url: `${app.globalData.apiBase}/data-statistics/dashboard/`,
        method: 'GET',
        header: app.authHeader(),
        data: selectedRootId() ? { root_organization_id: selectedRootId() } : {},
        success: res => {
          if (!isCurrent()) return;
          const body = res.data || {};
          const accessError = statisticsAccessError(res);
          if (accessError) {
            this.clearStatistics(accessError);
            if (res.statusCode === 401) app.reauthenticate();
            return;
          }
          if (body.code !== 0 || !body.data) {
            this.setData({ loading: false, error: body.msg || '统计数据加载失败。' });
            return;
          }
          const data = body.data;
          const organizationName = (data.identity || {}).organization_name || '';
          if (organizationName) {
            app.globalData.organization_name = organizationName;
            if (app.saveUserToCache) app.saveUserToCache();
          }
          this._statisticsScope = request.scope;
          this.setData({
            loading: false,
            dashboardName: data.dashboard_name || DEFAULT_DASHBOARD_NAME,
            organizationName,
            roleName: (data.identity || {}).role_name || '',
            generatedAt: (data.generated_at || '').replace('T', ' ').slice(0, 19),
            sections: (data.sections || []).map(normalizeSection)
          });
        },
        fail: () => {
          if (isCurrent()) this.setData({ loading: false, error: '网络连接失败，请下拉刷新。' });
        },
        complete: finish
      });
    });
  },

  openDomain(e) {
    const domain = e.currentTarget.dataset.domain;
    if (this.data.loading || this._statisticsScope !== statisticsAccessScope(app) || !domain
      || !this.data.sections.some(section => section.domain === domain)) return;
    wx.navigateTo({ url: `/pages/data_statistics/domain/domain?domain=${domain}` });
  }
});
