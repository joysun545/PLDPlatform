const qt = require('../../../utils/quality_trace');
Page({
  data: { items: [], loading: true, error: '' },
  onShow() { this.load(); },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const data = await qt.request('/recalls/');
      this.setData({ items: (data.items || []).map(x => ({ ...x, statusText: qt.statusLabels[x.status] || x.status })) });
    } catch (e) { this.setData({ error: e.message }); }
    this.setData({ loading: false });
  },
  open(e) { wx.navigateTo({ url: `/pages/quality_trace/recall_detail/recall_detail?campaign_id=${e.currentTarget.dataset.id}` }); }
});
