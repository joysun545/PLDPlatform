const api = require('../../../utils/material_inventory');
const titles = {
  RECEIPT: '物料入库', SUPPLIER_RETURN: '退给供应商',
  WARRANTY_REGISTER: '三包故障件登记', WARRANTY_SEND: '三包退给供应商',
  WARRANTY_REPLACE: '三包换回件入库'
};
const hints = {
  RECEIPT: '请核对实际收到的合格物料数量。确认入库后生成新的厂家物料批次。',
  SUPPLIER_RETURN: '线下完成交接后登记实际退货数量。本次数量从所选批次可用库存中扣减。',
  WARRANTY_REGISTER: '故障件单独保管，登记后不计入正常可用库存。',
  WARRANTY_SEND: '线下退给供应商后，按本次实际退货数量确认。',
  WARRANTY_REPLACE: '请核对实际收到的合格换回件。确认后生成新批次并计入正常库存。'
};

Page({
  data: {
    kind: '', title: '', hint: '', source: '', stock: null, lot: null, warrantyCase: null,
    units: [], unitIndex: 0, quantity: '', supplierBatchCode: '',
    options: [], query: '', nextCursor: null, catalogLoading: false, choosing: false,
    ready: false, loading: false, submitting: false, pending: false, error: '', success: null
  },
  onLoad(options) { this.route = options; this.load(); },
  async load() {
    this.setData({ loading: true, ready: false, error: '' });
    try {
      const context = await api.request('form/', 'GET', this.route);
      this.requestId = api.uuid();
      this.setContext(this.route, context);
      const pending = api.readPending();
      if (pending) {
        const p = pending.payload;
        // Recheck role/scope before exposing a locally saved pending operation.
        await api.request('form/', 'GET', { kind: p.kind, stock_id: pending.context.stock.id || '', lot_id: p.lot_id || '', case_id: p.case_id || '' });
        this._pending = pending;
        this.requestId = p.request_id;
        this.setData(Object.assign({}, pending.context, { pending: true, choosing: false }));
      }
      this.setData({ ready: true });
      wx.setNavigationBarTitle({ title: this.data.title });
      if (!this.data.stock) await this.catalog(false);
    } catch (error) { this.setData({ error: error.message }); }
    finally { this.setData({ loading: false }); }
  },
  setContext(route, context) {
    const kind = route.kind;
    const source = kind === 'WARRANTY_REGISTER' ? (route.lot_id ? 'STOCK' : 'EXTERNAL') : '';
    this.setData({
      kind, source, factoryId: context.factory_id, title: titles[kind] || '物料出入库', hint: hints[kind] || '',
      stock: context.stock || null, lot: context.lot || null, warrantyCase: context.case || null,
      units: context.units || [], unitIndex: Math.max(0, (context.units || []).indexOf(context.stock && context.stock.unit)),
      choosing: !context.stock
    });
  },
  inputQuery(e) { this.setData({ query: e.detail.value }); },
  search() { this.catalog(false); },
  more() { if (this.data.nextCursor) this.catalog(true); },
  async catalog(append) {
    if (append && this.data.catalogLoading) return;
    const run = (this._catalogRun || 0) + 1;
    this._catalogRun = run;
    this.setData({ catalogLoading: true, error: '' });
    try {
      const result = await api.request('catalog/', 'GET', { q: this.data.query, cursor: append ? this.data.nextCursor : '' });
      if (this._catalogRun === run) this.setData({ options: append ? this.data.options.concat(result.items) : result.items, nextCursor: result.next_cursor });
    } catch (error) { if (this._catalogRun === run) this.setData({ error: error.message }); }
    finally { if (this._catalogRun === run) this.setData({ catalogLoading: false }); }
  },
  choose(e) {
    const selected = this.data.options.find(x => x.id === Number(e.currentTarget.dataset.id));
    if (!selected || this.data.pending) return;
    this.setData({ stock: Object.assign({}, selected, { id: selected.stock_id }), unitIndex: Math.max(0, this.data.units.indexOf(selected.unit)), choosing: false });
  },
  chooseAgain() { if (!this.data.pending) { this.setData({ choosing: true, stock: null }); this.catalog(false); } },
  unit(e) { if (!this.data.pending) this.setData({ unitIndex: Number(e.detail.value) }); },
  quantity(e) { if (!this.data.pending) this.setData({ quantity: e.detail.value }); },
  supplierBatch(e) { if (!this.data.pending) this.setData({ supplierBatchCode: e.detail.value }); },
  buildPayload() {
    const d = this.data;
    if (!d.stock) throw new Error('请先选择供应商和物料规格');
    if (!/^\d+(?:\.\d{1,3})?$/.test(d.quantity) || Number(d.quantity) <= 0 || Number(d.quantity) > 1000000000) {
      throw new Error('请输入大于0的数量，最多三位小数');
    }
    const p = { kind: d.kind, expected_factory_id: d.factoryId, request_id: this.requestId, quantity: d.quantity };
    if (d.kind === 'RECEIPT' || (d.kind === 'WARRANTY_REGISTER' && d.source === 'EXTERNAL')) {
      Object.assign(p, { supplier_id: d.stock.supplier_id, material_spec_id: d.stock.material_spec_id, unit: d.stock.unit || d.units[d.unitIndex] });
    } else if (d.kind === 'SUPPLIER_RETURN' || d.kind === 'WARRANTY_REGISTER') {
      p.lot_id = d.lot && d.lot.id;
    } else { p.case_id = d.warrantyCase && d.warrantyCase.id; }
    if (d.kind === 'WARRANTY_REGISTER') p.source = d.source;
    if (['RECEIPT', 'WARRANTY_REPLACE'].includes(d.kind)) p.supplier_batch_code = d.supplierBatchCode.trim();
    return p;
  },
  snapshot() {
    const d = this.data;
    return { kind: d.kind, factoryId: d.factoryId, title: d.title, hint: d.hint, source: d.source,
      stock: d.stock, lot: d.lot, warrantyCase: d.warrantyCase,
      units: d.units, unitIndex: d.unitIndex, quantity: d.quantity, supplierBatchCode: d.supplierBatchCode };
  },
  async submit() {
    if (this._busy || !this.data.ready || this.data.success) return;
    this._busy = true;
    this.setData({ error: '' });
    try {
      const payload = this._pending ? this._pending.payload : this.buildPayload();
      if (!this._pending) {
        const confirmed = await new Promise(resolve => wx.showModal({
          title: this.data.title,
          content: `${this.data.stock.material_name} · ${this.data.stock.spec_name}\n${this.data.stock.supplier_name}\n确认本次数量：${payload.quantity} ${this.data.stock.unit || this.data.units[this.data.unitIndex]}？`,
          confirmText: '确认记录', success: result => resolve(result.confirm), fail: () => resolve(false)
        }));
        if (!confirmed) return;
        const record = { payload, context: this.snapshot() };
        try { api.savePending(record); } catch (_) { throw new Error('无法暂存本次操作，尚未提交。请清理小程序存储后重试'); }
        this._pending = record;
      }
      this.setData({ submitting: true, pending: true });
      try {
        const result = await api.request('documents/', 'POST', payload);
        // A lost success response is retried with the same request ID.
        api.clearPending();
        this._pending = null;
        this.setData({ success: result.document, pending: false });
      } catch (error) {
        if (error.business) {
          api.clearPending(); this._pending = null;
          this.setData({ pending: false });
        }
        throw error;
      }
    } catch (error) { this.setData({ error: error.message }); }
    finally { this._busy = false; this.setData({ submitting: false }); }
  },
  done() {
    const id = this.data.success && this.data.success.stock_id;
    if (id) wx.redirectTo({ url: `/pages/material_inventory/detail/detail?id=${id}` });
  }
});
