const api = require('../../../utils/material_inventory');

Page({
  data: { items: [], query: '', nextCursor: null, loading: false, canManage: false, searched: false, error: '' },
  onShow() { if (this.data.searched) this.load(false); },
  onPullDownRefresh() { this.search(); },
  onReachBottom() { if (this.data.nextCursor) this.load(true); },
  inputQuery(e) {
    this.setData({ query: e.detail.value });
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.search(), 250);
  },
  search() {
    if (!this.data.query.trim()) {
      this.setData({ items: [], nextCursor: null, searched: false, loading: false, error: '' });
      wx.stopPullDownRefresh();
      return;
    }
    this.setData({ searched: true });
    this.load(false);
  },
  async load(append) {
    if (append && this.data.loading) return;
    const run = (this._run || 0) + 1;
    this._run = run;
    this.setData({ loading: true, error: '' });
    try {
      const result = await api.request('warranty/', 'GET', { q: this.data.query, cursor: append ? this.data.nextCursor : '' });
      if (run !== this._run) return;
      this.setData({
        items: append ? this.data.items.concat(result.items) : result.items,
        nextCursor: result.next_cursor, canManage: result.can_manage,
      });
    } catch (error) {
      if (run === this._run) this.setData({ error: error.message, ...(!append ? { items: [], nextCursor: null, canManage: false } : {}) });
    } finally {
      if (run === this._run) this.setData({ loading: false });
      wx.stopPullDownRefresh();
    }
  },
  open(e) {
    const data = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/material_inventory/detail/detail?id=${data.stockId}&tab=warranty&case_id=${data.caseId}` });
  }
});
