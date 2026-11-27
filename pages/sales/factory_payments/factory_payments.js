const app = getApp();
const ROOT = '/sales/factory-payments/';

function request(path, method = 'GET', data, contentType = 'application/x-www-form-urlencoded') {
  return new Promise((resolve, reject) => wx.request({
    url: app.globalData.apiBase + path,
    method,
    data,
    header: app.authHeader(method === 'POST' ? contentType : null),
    success: ({ data: body }) => body && body.code === 0
      ? resolve(body.data) : reject(new Error((body || {}).msg || '往来账操作失败')),
    fail: () => reject(new Error('网络连接失败'))
  }));
}

Page({
  data: { accounts: [], title: '向厂家付款', error: '', loading: false, busy: false, draft: null, expanded: {}, quote: null },

  onLoad(options) {
    this.paymentId = Number(options.payment_id);
    this.orderId = Number(options.order_plan_id);
  },

  onShow() {
    app.ensureLogin(ok => {
      if (!ok) return this.setData({ error: '登录失败，请重新进入' });
      this.setData({ title: app.globalData.role === 'factory_sales_assistant' ? '直属商家往来账' : '向厂家付款' });
      this.load();
    });
  },

  load() {
    this.setData({ loading: true, error: '' });
    return request(ROOT).then(({ accounts }) => {
      const expanded = { ...this.data.expanded };
      const selected = accounts.find(row => row.payments.some(payment => payment.id === this.paymentId)
        || row.orders.some(order => order.id === this.orderId));
      if (selected) expanded[selected.merchant_id] = true;
      this.setData({
        expanded,
        accounts: accounts.map(row => ({ ...row, is_prepaid: Number(row.balance_amount) < 0 }))
      }, () => {
        if (selected && this.paymentId) wx.pageScrollTo({ selector: '#payment-' + this.paymentId });
        if (selected && this.orderId) this.loadQuote(this.orderId);
        this.paymentId = 0;
        this.orderId = 0;
      });
    }).catch(error => this.setData({ error: error.message })).finally(() => this.setData({ loading: false }));
  },

  toggleAccount(event) {
    const id = Number(event.currentTarget.dataset.id);
    this.setData({ expanded: { ...this.data.expanded, [id]: !this.data.expanded[id] } });
  },

  openQuote(event) {
    this.loadQuote(Number(event.currentTarget.dataset.id));
  },

  loadQuote(id) {
    if (!id || this.data.busy) return;
    this.setData({ busy: true, quote: null });
    request(ROOT + 'orders/' + id + '/quote/').then(quote => {
      this.setData({ quote: { ...quote, id } }, () => wx.pageScrollTo({ selector: '#order-' + id }));
    }).catch(error => wx.showToast({ title: error.message, icon: 'none' }))
      .finally(() => this.setData({ busy: false }));
  },

  confirmQuote() {
    const quote = this.data.quote;
    if (!quote || !quote.can_confirm || this.data.busy) return;
    wx.showModal({
      title: '确认订单应收',
      content: '按 ' + quote.version + ' 档确认应收 ¥' + quote.total + '？',
      success: ({ confirm }) => {
        if (!confirm || this.data.busy || this.data.quote !== quote) return;
        const expected = {};
        quote.lines.forEach(row => { expected[row.price_key || String(row.model_id)] = row.unit_price; });
        this.setData({ busy: true });
        request(ROOT + 'orders/' + quote.id + '/confirm/', 'POST', { tier: quote.tier, expected }, 'application/json')
          .then(() => {
            this.setData({ quote: null });
            if (app.refreshTasks) app.refreshTasks();
            return this.load();
          })
          .catch(error => wx.showToast({ title: error.message, icon: 'none' }))
          .finally(() => this.setData({ busy: false }));
      }
    });
  },

  copyPricingWebLink() {
    const url = app.globalData.apiBase.replace(/\/api\/?$/, '') + '/web/portal/';
    wx.setClipboardData({ data: url });
  },

  chooseVoucher(event) {
    const factoryId = Number(event.currentTarget.dataset.factory);
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: ({ tempFiles }) => this.setData({
        draft: { factoryId, filePath: tempFiles[0].tempFilePath,
          requestId: 'factory-' + Date.now() + '-' + Math.random().toString(36).slice(2) }
      })
    });
  },

  clearVoucher() {
    this.setData({ draft: null });
  },

  submitVoucher() {
    const draft = this.data.draft;
    if (!draft || this.data.busy) return;
    this.setData({ busy: true });
    wx.uploadFile({
      url: app.globalData.apiBase + ROOT + 'factory/' + draft.factoryId + '/',
      filePath: draft.filePath,
      name: 'file',
      header: app.authHeader(),
      formData: { client_request_id: draft.requestId },
      success: response => {
        let body;
        try { body = JSON.parse(response.data); } catch (_) { body = {}; }
        if (body.code !== 0) {
          wx.showToast({ title: body.msg || '凭证上传失败', icon: 'none' });
          return;
        }
        this.clearVoucher();
        this.load();
      },
      fail: () => wx.showToast({ title: '上传失败，请重试', icon: 'none' }),
      complete: () => this.setData({ busy: false })
    });
  },

  viewVoucher(event) {
    wx.downloadFile({
      url: app.globalData.apiBase + event.currentTarget.dataset.url,
      header: app.authHeader(),
      success: response => {
        if (response.statusCode === 200) wx.previewImage({ urls: [response.tempFilePath] });
        else wx.showToast({ title: '无法查看付款凭证', icon: 'none' });
      },
      fail: () => wx.showToast({ title: '无法查看付款凭证', icon: 'none' })
    });
  },

  confirmPayment(event) {
    const paymentId = Number(event.currentTarget.dataset.id);
    if (!paymentId || this.data.busy) return;
    wx.showModal({
      title: '确认实际到账金额',
      editable: true,
      placeholderText: '请输入实际到账金额',
      success: ({ confirm, content }) => {
        if (!confirm || this.data.busy) return;
        const amount = String(content || '').trim();
        if (!/^[0-9]{1,12}(\.[0-9]{1,2})?$/.test(amount) || Number(amount) <= 0) {
          wx.showToast({ title: '请输入有效金额', icon: 'none' });
          return;
        }
        this.setData({ busy: true });
        request(ROOT + paymentId + '/confirm/', 'POST', { confirmed_amount: amount })
          .then(() => {
            if (app.refreshTasks) app.refreshTasks();
            return this.load();
          })
          .catch(error => wx.showToast({ title: error.message, icon: 'none' }))
          .finally(() => this.setData({ busy: false }));
      }
    });
  }
});
