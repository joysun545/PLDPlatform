const api = require('../../../utils/material_inventory');

Page({
  data: { items: [], query: '', nextCursor: null, loading: false, canManage: false, searched: false, error: '' },
  onShow() { if (this.data.searched) this.load(false); },
  onPullDownRefresh() { this.load(false); },
  onReachBottom() { if (this.data.nextCursor) this.load(true); },
  inputQuery(e) {
    this.setData({ query: e.detail.value });
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.search(), 250);
  },
  search() {
    if (!this.data.query.trim()) {
      this.setData({ items: [], nextCursor: null, searched: false, loading: false, error: '' });
      return;
    }
    this.setData({ searched: true }); this.load(false);
  },
  async load(append) {
    const run = (this._run || 0) + 1;
    if (append && this.data.loading) return;
    this._run = run;
    this.setData({ loading: true, error: '' });
    try {
      const result = await api.request('', 'GET', { q: this.data.query, cursor: append ? this.data.nextCursor : '' });
      if (this._run !== run) return;
      this.setData({ items: append ? this.data.items.concat(result.items) : result.items, nextCursor: result.next_cursor, canManage: result.can_manage });
    } catch (error) {
      if (this._run === run) this.setData({ error: error.message, ...(!append ? { items: [], canManage: false, nextCursor: null } : {}) });
    } finally {
      if (this._run === run) this.setData({ loading: false });
      wx.stopPullDownRefresh();
    }
  },
  open(e) { wx.navigateTo({ url: `/pages/material_inventory/detail/detail?id=${e.currentTarget.dataset.id}` }); },
  receipt() { wx.navigateTo({ url: api.formUrl('RECEIPT') }); },
  warranty() { wx.navigateTo({ url: '/pages/material_inventory/warranty_list/warranty_list' }); }
});
