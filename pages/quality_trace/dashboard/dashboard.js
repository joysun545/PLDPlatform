const app = getApp();
const qt = require('../../../utils/quality_trace');

Page({
  data: { loading: true, error: '', overview: {}, recallCount: 0 },
  onShow() { app.ensureLogin(ok => ok ? this.load() : this.setData({ loading: false, error: '登录失败' })); },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()); },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const [overview, recalls] = await Promise.all([
        qt.request('/overview/'), qt.request('/recalls/')
      ]);
      this.setData({ overview, recallCount: (recalls.items || []).length, loading: false });
    } catch (error) { this.setData({ loading: false, error: error.message }); }
  },
  goAlerts() { wx.navigateTo({ url: '/pages/quality_trace/alert_list/alert_list?filter=pending' }); },
  goCases() { wx.navigateTo({ url: '/pages/quality_trace/case_list/case_list' }); },
  goRecalls() { wx.navigateTo({ url: '/pages/quality_trace/recall_list/recall_list' }); },
  goRules() { wx.navigateTo({ url: '/pages/quality_trace/rule_list/rule_list' }); }
});
