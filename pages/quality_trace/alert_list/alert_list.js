const qt = require('../../../utils/quality_trace');
Page({
  data: {
    allItems: [], items: [], loading: true, error: '', activeFilter: 'pending',
    filters: [
      { key: 'pending', label: '待研判', count: 0 },
      { key: 'escalated', label: '已升级', count: 0 },
      { key: 'dismissed', label: '已排除', count: 0 },
      { key: 'all', label: '全部', count: 0 }
    ]
  },
  onLoad(options) { this.setData({ activeFilter: options.filter || 'pending' }); },
  onShow() { this.load(); },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const data = await qt.request('/alerts/');
      const allItems = (data.items || []).map(x => ({ ...x, time: qt.formatTime(x.last_triggered_at) }));
      this.setData({ allItems });
      this.applyFilter();
    } catch (e) { this.setData({ error: e.message }); }
    this.setData({ loading: false });
  },
  switchFilter(event) { this.setData({ activeFilter: event.currentTarget.dataset.key }); this.applyFilter(); },
  applyFilter() {
    const allItems = this.data.allItems || [];
    const groups = {
      pending: allItems.filter(item => ['OPEN', 'ASSESSING'].includes(item.status)),
      escalated: allItems.filter(item => item.status === 'ESCALATED'),
      dismissed: allItems.filter(item => ['DISMISSED', 'CLOSED'].includes(item.status)),
      all: allItems
    };
    const filters = this.data.filters.map(item => ({ ...item, count: groups[item.key].length }));
    this.setData({ items: groups[this.data.activeFilter] || groups.pending, filters });
    wx.setNavigationBarTitle({ title: `${filters.find(item => item.key === this.data.activeFilter).label}预警` });
  },
  openDetail(event) { wx.navigateTo({ url: `/pages/quality_trace/alert_detail/alert_detail?id=${event.currentTarget.dataset.id}` }); }
});
