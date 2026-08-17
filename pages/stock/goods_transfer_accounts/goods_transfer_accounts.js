const app = getApp();

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function prepareDetail(detail) {
  if (!detail) return null;
  return {
    ...detail,
    cases: (detail.cases || []).map(item => ({
      ...item,
      submittedText: formatDate(item.submitted_at),
      confirmedText: formatDate(item.confirmed_at),
      amountInput: '',
      remarkInput: '',
      noAmount: false,
      selectedStatementPath: '',
      rejectionInput: '',
      selectedVoucherPath: '',
      allocation_candidates: (item.allocation_candidates || []).map(row => ({
        ...row,
        allocationInput: ''
      })),
      allocations: (item.allocations || []).map(row => ({
        ...row,
        allocatedText: formatDate(row.allocated_at)
      })),
      payments: (item.payments || []).map(row => ({
        ...row,
        uploadedText: formatDate(row.uploaded_at),
        confirmedText: formatDate(row.confirmed_at),
        confirmInput: ''
      }))
    }))
  };
}

Page({
  data: {
    transferId: 0,
    loading: true,
    errorMessage: '',
    detail: null,
    busyKey: ''
  },

  onLoad(options) {
    const transferId = Number((options || {}).transfer_id || 0);
    if (!transferId) {
      this.setData({ loading: false, errorMessage: '商品流转参数无效' });
      return;
    }
    this.setData({ transferId });
    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({ loading: false, errorMessage: '登录失败，请重新进入小程序' });
        return;
      }
      this.loadDetail();
    });
  },

  onPullDownRefresh() {
    this.loadDetail(() => wx.stopPullDownRefresh());
  },

  loadDetail(done) {
    this.setData({ loading: true, errorMessage: '' });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/goods-transfers/${this.data.transferId}/accounts/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401 || body.code === 401) app.reauthenticate();
        if (body.code !== 0 || !body.data) {
          this.setData({ loading: false, errorMessage: body.msg || '流转往来账加载失败' });
          return;
        }
        this.setData({ loading: false, detail: prepareDetail(body.data) });
      },
      fail: () => this.setData({ loading: false, errorMessage: '网络连接失败，请稍后重试' }),
      complete: () => done && done()
    });
  },

  retryLoad() {
    this.loadDetail();
  },

  onAmountInput(e) {
    this.setData({ [`detail.cases[${e.currentTarget.dataset.index}].amountInput`]: e.detail.value || '' });
  },

  onRemarkInput(e) {
    this.setData({ [`detail.cases[${e.currentTarget.dataset.index}].remarkInput`]: e.detail.value || '' });
  },

  onNoAmountChange(e) {
    this.setData({ [`detail.cases[${e.currentTarget.dataset.index}].noAmount`]: !!e.detail.value });
  },

  onRejectionInput(e) {
    this.setData({ [`detail.cases[${e.currentTarget.dataset.index}].rejectionInput`]: e.detail.value || '' });
  },

  chooseStatement(e) {
    const index = Number(e.currentTarget.dataset.index);
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: res => {
        const file = (res.tempFiles || [])[0];
        if (file && file.tempFilePath) {
          this.setData({ [`detail.cases[${index}].selectedStatementPath`]: file.tempFilePath });
        }
      }
    });
  },

  submitCase(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.detail.cases[index];
    if (!item || !item.actions.can_submit || this.data.busyKey) return;
    const amount = (item.amountInput || '').trim();
    if (!item.noAmount && !amount) {
      wx.showToast({ title: '请填写关联金额', icon: 'none' });
      return;
    }
    const content = item.noAmount
      ? `确认提交“${item.case_type_name}本次无款项”？仍需对方确认。`
      : `确认提交${item.case_type_name} ¥${amount}？仍需对方确认。`;
    wx.showModal({
      title: '提交往来金额',
      content,
      confirmText: '确认提交',
      success: modal => modal.confirm && this.doSubmitCase(index)
    });
  },

  doSubmitCase(index) {
    const item = this.data.detail.cases[index];
    const key = `submit-${item.id}`;
    this.setData({ busyKey: key });
    wx.showLoading({ title: '正在提交...', mask: true });
    const url = `${app.globalData.apiBase}/lifecycle/goods-transfers/${this.data.transferId}/accounts/${item.case_type}/submit/`;
    const formData = {
      amount: (item.amountInput || '').trim(),
      no_amount: item.noAmount ? 'true' : 'false',
      remark: (item.remarkInput || '').trim()
    };
    const finish = body => {
      if (body.code === 401) app.reauthenticate();
      if (body.code !== 0) {
        wx.showToast({ title: body.msg || '提交失败', icon: 'none' });
        return;
      }
      wx.showToast({ title: body.msg || '已提交', icon: 'success' });
      if (typeof app.refreshTasks === 'function') app.refreshTasks();
      this.setData({ detail: prepareDetail(body.data) });
    };
    if (item.selectedStatementPath) {
      wx.uploadFile({
        url,
        filePath: item.selectedStatementPath,
        name: 'statement_image',
        header: app.authHeader(null),
        formData,
        success: res => {
          let body = {};
          try { body = JSON.parse(res.data || '{}'); } catch (error) { body = { code: 1, msg: '服务器返回格式错误' }; }
          finish(body);
        },
        fail: () => wx.showToast({ title: '提交失败', icon: 'none' }),
        complete: () => { wx.hideLoading(); this.setData({ busyKey: '' }); }
      });
      return;
    }
    wx.request({
      url,
      method: 'POST',
      header: app.authHeader('application/json'),
      data: formData,
      success: res => finish(res.data || {}),
      fail: () => wx.showToast({ title: '提交失败', icon: 'none' }),
      complete: () => { wx.hideLoading(); this.setData({ busyKey: '' }); }
    });
  },

  confirmCase(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.detail.cases[index];
    if (!item || !item.actions.can_confirm || this.data.busyKey) return;
    const amountText = item.proposed_amount ? `¥${item.proposed_amount}` : '本次无款项';
    wx.showModal({
      title: `确认${item.case_type_name}`,
      content: `确认金额：${amountText}。确认后将正式进入上下级往来账。`,
      confirmText: '确认金额',
      success: modal => modal.confirm && this.submitCaseDecision(item.id, 'CONFIRM', '')
    });
  },

  rejectCase(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.detail.cases[index];
    const reason = (item.rejectionInput || '').trim();
    if (!reason) {
      wx.showToast({ title: '请先填写驳回原因', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '驳回金额',
      content: '确认驳回后，提交方需要重新填写金额。',
      confirmText: '确认驳回',
      success: modal => modal.confirm && this.submitCaseDecision(item.id, 'REJECT', reason)
    });
  },

  submitCaseDecision(caseId, action, reason) {
    const key = `confirm-${caseId}`;
    if (this.data.busyKey) return;
    this.setData({ busyKey: key });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/goods-transfers/${this.data.transferId}/accounts/${caseId}/confirm/`,
      method: 'POST',
      header: app.authHeader('application/json'),
      data: { action, rejection_reason: reason },
      success: res => this.handleJsonResponse(res, action === 'CONFIRM' ? '金额已确认' : '金额已驳回'),
      fail: () => wx.showToast({ title: '操作失败', icon: 'none' }),
      complete: () => this.setData({ busyKey: '' })
    });
  },

  onAllocationInput(e) {
    const caseIndex = Number(e.currentTarget.dataset.caseindex);
    const candidateIndex = Number(e.currentTarget.dataset.candidateindex);
    this.setData({ [`detail.cases[${caseIndex}].allocation_candidates[${candidateIndex}].allocationInput`]: e.detail.value || '' });
  },

  allocateCredit(e) {
    const caseIndex = Number(e.currentTarget.dataset.caseindex);
    const candidateIndex = Number(e.currentTarget.dataset.candidateindex);
    const item = this.data.detail.cases[caseIndex];
    const candidate = item.allocation_candidates[candidateIndex];
    const amount = (candidate.allocationInput || '').trim();
    if (!amount) {
      wx.showToast({ title: '请填写本次冲抵金额', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '关联应收批次',
      content: `确认将 ¥${amount} 冲抵到 ${candidate.flow_no}？`,
      confirmText: '确认冲抵',
      success: modal => modal.confirm && this.doAllocate(item.id, candidate, amount)
    });
  },

  doAllocate(caseId, candidate, amount) {
    const key = `allocate-${caseId}-${candidate.target_id}`;
    if (this.data.busyKey) return;
    this.setData({ busyKey: key });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/goods-transfers/${this.data.transferId}/accounts/${caseId}/allocations/`,
      method: 'POST',
      header: app.authHeader('application/json'),
      data: { target_kind: candidate.target_kind, target_id: candidate.target_id, amount },
      success: res => this.handleJsonResponse(res, '冲抵已完成'),
      fail: () => wx.showToast({ title: '冲抵失败', icon: 'none' }),
      complete: () => this.setData({ busyKey: '' })
    });
  },

  chooseVoucher(e) {
    const index = Number(e.currentTarget.dataset.index);
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: res => {
        const file = (res.tempFiles || [])[0];
        if (file && file.tempFilePath) {
          this.setData({ [`detail.cases[${index}].selectedVoucherPath`]: file.tempFilePath });
        }
      }
    });
  },

  uploadVoucher(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.detail.cases[index];
    if (!item.selectedVoucherPath) {
      wx.showToast({ title: '请先选择付款凭证', icon: 'none' });
      return;
    }
    const key = `payment-${item.id}`;
    if (this.data.busyKey) return;
    this.setData({ busyKey: key });
    wx.uploadFile({
      url: `${app.globalData.apiBase}/lifecycle/goods-transfers/${this.data.transferId}/accounts/${item.id}/payments/`,
      filePath: item.selectedVoucherPath,
      name: 'voucher_image',
      header: app.authHeader(null),
      formData: { client_request_id: `account-payment-${Date.now()}-${Math.random().toString(16).slice(2)}` },
      success: res => {
        let body = {};
        try { body = JSON.parse(res.data || '{}'); } catch (error) { body = { code: 1, msg: '服务器返回格式错误' }; }
        this.handleBody(body, '付款凭证已上传');
      },
      fail: () => wx.showToast({ title: '付款凭证上传失败', icon: 'none' }),
      complete: () => this.setData({ busyKey: '' })
    });
  },

  onConfirmPaymentInput(e) {
    const caseIndex = Number(e.currentTarget.dataset.caseindex);
    const paymentIndex = Number(e.currentTarget.dataset.paymentindex);
    this.setData({ [`detail.cases[${caseIndex}].payments[${paymentIndex}].confirmInput`]: e.detail.value || '' });
  },

  confirmPayment(e) {
    const caseIndex = Number(e.currentTarget.dataset.caseindex);
    const paymentIndex = Number(e.currentTarget.dataset.paymentindex);
    const item = this.data.detail.cases[caseIndex];
    const payment = item.payments[paymentIndex];
    const amount = (payment.confirmInput || '').trim();
    if (!amount) {
      wx.showToast({ title: '请填写实际到账金额', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '确认实际收款',
      content: `确认实际到账 ¥${amount}？`,
      confirmText: '确认收款',
      success: modal => modal.confirm && this.doConfirmPayment(item.id, payment.id, amount)
    });
  },

  doConfirmPayment(caseId, paymentId, amount) {
    const key = `payment-confirm-${paymentId}`;
    if (this.data.busyKey) return;
    this.setData({ busyKey: key });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/goods-transfers/${this.data.transferId}/accounts/${caseId}/payments/${paymentId}/confirm/`,
      method: 'POST',
      header: app.authHeader('application/json'),
      data: { confirmed_amount: amount },
      success: res => this.handleJsonResponse(res, '收款已确认'),
      fail: () => wx.showToast({ title: '确认收款失败', icon: 'none' }),
      complete: () => this.setData({ busyKey: '' })
    });
  },

  handleJsonResponse(res, successText) {
    const body = res.data || {};
    if (res.statusCode === 401 || body.code === 401) app.reauthenticate();
    this.handleBody(body, successText);
  },

  handleBody(body, successText) {
    if (body.code !== 0 || !body.data) {
      wx.showToast({ title: body.msg || '操作失败', icon: 'none' });
      return;
    }
    wx.showToast({ title: body.msg || successText, icon: 'success' });
    if (typeof app.refreshTasks === 'function') app.refreshTasks();
    this.setData({ detail: prepareDetail(body.data) });
  },

  previewFile(e) {
    const path = e.currentTarget.dataset.path || '';
    if (!path) return;
    wx.downloadFile({
      url: `${app.globalData.apiBase}${path}`,
      header: app.authHeader(null),
      success: res => {
        if (res.statusCode === 200 && res.tempFilePath) {
          wx.previewImage({ urls: [res.tempFilePath], current: res.tempFilePath });
        } else {
          wx.showToast({ title: '文件读取失败', icon: 'none' });
        }
      },
      fail: () => wx.showToast({ title: '文件读取失败', icon: 'none' })
    });
  }
});
