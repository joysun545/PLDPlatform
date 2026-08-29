const qt = require('../../../utils/quality_trace');
Page({
  data: { items: [], loading: true, error: '' },
  onShow() { this.load(); },
  async load() {
    this.setData({ loading: true, error: '' });
    try { const data = await qt.request('/cases/'); this.setData({ items: data.items || [] }); }
    catch (e) { this.setData({ error: e.message }); }
    this.setData({ loading: false });
  },
  openDetail(event) { wx.navigateTo({ url: `/pages/quality_trace/case_detail/case_detail?id=${event.currentTarget.dataset.id}` }); }
});
