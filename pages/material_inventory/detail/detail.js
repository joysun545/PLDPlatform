const api = require('../../../utils/material_inventory');

Page({
  data: { stock: null, items: [], tab: 'lots', canManage: false, nextCursor: null, loading: false, includeEmpty: false, error: '' },
  onLoad(options) {
    this.stockId = options.id;
    this.caseId = options.case_id || '';
    if (options.tab === 'warranty' || options.tab === 'documents' || options.tab === 'lots') {
      this.setData({ tab: options.tab });
    }
  },
  onShow() { this.load(false); },
  onPullDownRefresh() { this.load(false); },
  onReachBottom() { if (this.data.nextCursor) this.load(true); },
  retry() { this.load(false); },
  async load(append) {
    if (append && this.data.loading) return;
    const run = (this._run || 0) + 1;
    this._run = run;
    this.setData({ loading: true, error: '' });
    try {
      const result = await api.request(`${this.stockId}/`, 'GET', { tab: this.data.tab, cursor: append ? this.data.nextCursor : '', include_empty: this.data.includeEmpty ? '1' : '', case_id: this.data.tab === 'warranty' ? this.caseId : '' });
      if (run !== this._run) return;
      this.setData({ stock: result.stock, items: append ? this.data.items.concat(result.items) : result.items, nextCursor: result.next_cursor, canManage: result.can_manage });
    } catch (error) {
      if (run === this._run) this.setData({ error: error.message, ...(!append ? { stock: null, items: [], canManage: false, nextCursor: null } : {}) });
    } finally {
      if (run === this._run) this.setData({ loading: false });
      wx.stopPullDownRefresh();
    }
  },
  tab(e) { this.setData({ tab: e.currentTarget.dataset.tab, items: [], nextCursor: null }); this.load(false); },
  toggleEmpty(e) { this.setData({ includeEmpty: e.detail.value.length > 0 }); this.load(false); },
  action(e) {
    const data = e.currentTarget.dataset;
    const params = { stock_id: this.stockId };
    if (data.lot) params.lot_id = data.lot;
    if (data.case) params.case_id = data.case;
    wx.navigateTo({ url: api.formUrl(data.kind, params) });
  }
});
