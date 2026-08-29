const qt = require('../../../utils/quality_trace');
Page({
  data: { items: [], loading: true, error: '' },
  onShow() { this.load(); },
  async load() {
    this.setData({ loading: true, error: '' });
    try { const data = await qt.request('/rules/'); this.setData({ items: data.items || [] }); }
    catch (e) { this.setData({ error: e.message }); }
    this.setData({ loading: false });
  },
  openDetail(e) { wx.navigateTo({ url: `/pages/quality_trace/rule_detail/rule_detail?id=${e.currentTarget.dataset.id}` }); }
});
