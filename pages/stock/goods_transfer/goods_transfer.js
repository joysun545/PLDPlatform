const app = getApp();

const FLOW_TYPE_NAMES = {
  SHIPMENT: '发货',
  RETURN: '退货',
  TRANSFER: '调货'
};

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = number => String(number).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function prepareDetail(detail) {
  if (!detail) return null;
  return {
    ...detail,
    createdText: formatDate(detail.created_at),
    items: (detail.items || []).map(item => ({
      ...item,
      scannedText: formatDate(item.scanned_at)
    }))
  };
}

Page({
  data: {
    flowTypes: [
      { code: 'SHIPMENT', name: '发货', hint: '发给直属下级商家' },
      { code: 'RETURN', name: '退货', hint: '退给直属上级或厂家' },
      { code: 'TRANSFER', name: '调货', hint: '直属下级 B 调至 C' }
    ],
    selectedFlowType: 'SHIPMENT',
    flowTypeName: '发货',
    loading: true,
    errorMessage: '',
    options: null,
    sourceIndex: -1,
    targetIndex: -1,
    selectedSource: null,
    selectedTarget: null,
    remark: '',
    creating: false,
    scanning: false,
    submitting: false,
    transferId: 0,
    scanReady: false,
    detail: null,
    scanConflict: null,
    goodsListSelectedPath: '',
    goodsListSelectedName: '',
    returnSubmitRemark: ''
  },

  onLoad(options) {
    const transferId = Number((options || {}).transfer_id || 0);
    this.setData({ transferId });
    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({ loading: false, errorMessage: '登录失败，请重新进入小程序' });
        return;
      }
      if (transferId) {
        this.loadDetail();
      } else {
        this.loadAvailableFlowTypes();
      }
    });
  },

  onUnload() {
    // Keep scanned rows attached to this server-side draft. Leaving this page
    // must not release the draft's device records; the list can resume it by ID.
    this._goodsTransferPageUnloading = true;
  },

  onPullDownRefresh() {
    const done = () => wx.stopPullDownRefresh();
    if (this.data.transferId) {
      this.loadDetail(done);
    } else if (this.data.scanReady) {
      done();
    } else if (!this.data.selectedFlowType) {
      this.loadAvailableFlowTypes(done);
    } else {
      this.loadOptions(this.data.selectedFlowType, done);
    }
  },

  chooseFlowType(e) {
    if (this.data.transferId || this.data.scanReady || this.data.creating) return;
    const flowType = e.currentTarget.dataset.type;
    if (!FLOW_TYPE_NAMES[flowType] || flowType === this.data.selectedFlowType) return;
    this.setData({
      selectedFlowType: flowType,
      flowTypeName: FLOW_TYPE_NAMES[flowType],
      sourceIndex: -1,
      targetIndex: -1,
      selectedSource: null,
      selectedTarget: null
    });
    this.loadOptions(flowType);
  },

  loadOptions(flowType, done) {
    this.setData({ loading: true, errorMessage: '', options: null });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/goods-transfers/options/?flow_type=${flowType}`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401 || body.code === 401) app.reauthenticate();
        if (body.code !== 0 || !body.data) {
          this.setData({
            loading: false,
            errorMessage: body.msg || '可选业务关系加载失败'
          });
          return;
        }
        this.setData({ loading: false, options: body.data });
      },
      fail: () => this.setData({ loading: false, errorMessage: '网络连接失败，请稍后重试' }),
      complete: () => done && done()
    });
  },

  loadAvailableFlowTypes(done) {
    this.setData({ loading: true, errorMessage: '', options: null });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/goods-transfers/options/?flow_type=CAPABILITIES`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401 || body.code === 401) app.reauthenticate();
        if (body.code !== 0 || !body.data) {
          this.setData({
            loading: false,
            errorMessage: body.msg || '商品流转权限加载失败'
          });
          if (done) done();
          return;
        }
        const allowed = new Set(body.data.available_flow_types || []);
        const flowTypes = this.data.flowTypes.filter(item => allowed.has(item.code));
        if (!flowTypes.length) {
          this.setData({
            flowTypes: [],
            selectedFlowType: '',
            flowTypeName: '',
            loading: false,
            errorMessage: '当前岗位未配置商品流转操作权限'
          });
          if (done) done();
          return;
        }
        const selected = flowTypes.find(
          item => item.code === this.data.selectedFlowType
        ) || flowTypes[0];
        this.setData({
          flowTypes,
          selectedFlowType: selected.code,
          flowTypeName: selected.name,
          errorMessage: ''
        });
        this.loadOptions(selected.code, done);
      },
      fail: () => {
        this.setData({ loading: false, errorMessage: '网络连接失败，请稍后重试' });
        if (done) done();
      }
    });
  },

  retryLoad() {
    if (this.data.transferId) {
      this.loadDetail();
    } else if (this.data.scanReady) {
      return;
    } else if (!this.data.selectedFlowType) {
      this.loadAvailableFlowTypes();
    } else {
      this.loadOptions(this.data.selectedFlowType);
    }
  },

  onSourceChange(e) {
    const index = Number(e.detail.value);
    const sources = (this.data.options && this.data.options.sources) || [];
    this.setData({
      sourceIndex: index,
      selectedSource: sources[index] || null
    });
  },

  onTargetChange(e) {
    const index = Number(e.detail.value);
    const targets = (this.data.options && this.data.options.targets) || [];
    this.setData({
      targetIndex: index,
      selectedTarget: targets[index] || null
    });
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value || '' });
  },

  buildUnpersistedDetail() {
    const flowType = this.data.selectedFlowType;
    const options = this.data.options || {};
    const source = flowType === 'TRANSFER'
      ? this.data.selectedSource
      : options.source_organization;
    const target = this.data.selectedTarget;
    const organization = item => ({
      id: item ? Number(item.organization_id || item.id || 0) : 0,
      name: item ? (item.organization_name || item.name || '') : '',
      type: item ? (item.organization_type || item.type || '') : ''
    });
    return prepareDetail({
      id: 0,
      flow_type: flowType,
      flow_type_name: FLOW_TYPE_NAMES[flowType] || this.data.flowTypeName,
      status: 'SCANNING',
      status_name: '待扫码',
      flow_no: '',
      from_organization: organization(source),
      to_organization: organization(target),
      initiated_by_name: '',
      created_at: '',
      item_count: 0,
      items: [],
      actions: { can_scan: true, can_submit: false },
      receipt_required: flowType !== 'TRANSFER'
    });
  },

  createTransfer() {
    if (this.data.creating || this.data.scanReady || this.data.transferId) return;
    const flowType = this.data.selectedFlowType;
    const target = this.data.selectedTarget;
    const source = this.data.selectedSource;
    if (!target) {
      wx.showToast({ title: flowType === 'SHIPMENT' ? '请选择下级商家负责人' : '请选择收货方账号', icon: 'none' });
      return;
    }
    if (flowType === 'TRANSFER') {
      if (!source) {
        wx.showToast({ title: '请选择调出商家负责人', icon: 'none' });
        return;
      }
      if (Number(source.organization_id) === Number(target.organization_id)) {
        wx.showToast({ title: '调出和调入商家不能相同', icon: 'none' });
        return;
      }
    }
    const payload = {
      flow_type: flowType,
      client_request_id: `goods-flow-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      target_account_id: target.user_id,
      remark: (this.data.remark || '').trim()
    };
    if (flowType === 'TRANSFER') payload.source_account_id = source.user_id;
    this._pendingTransferPayload = payload;
    this.setData({
      scanReady: true,
      detail: this.buildUnpersistedDetail(),
      scanConflict: null,
      errorMessage: ''
    });
  },

  loadDetail(done) {
    if (!this.data.transferId) {
      done && done();
      return;
    }
    this.setData({ loading: true, errorMessage: '' });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/goods-transfers/${this.data.transferId}/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401 || body.code === 401) app.reauthenticate();
        if (body.code !== 0 || !body.data) {
          this.setData({ loading: false, errorMessage: body.msg || '商品流转单加载失败' });
          return;
        }
        this.setData({
          loading: false,
          selectedFlowType: body.data.flow_type,
          flowTypeName: body.data.flow_type_name,
          detail: prepareDetail(body.data),
          returnSubmitRemark: body.data.remark || ''
        });
      },
      fail: () => this.setData({ loading: false, errorMessage: '网络连接失败，请稍后重试' }),
      complete: () => done && done()
    });
  },

  scanDevice() {
    const detail = this.data.detail;
    if (!detail || !detail.actions || !detail.actions.can_scan || this.data.scanning || this.data.creating) return;

    if (typeof wx === 'undefined' || typeof wx.scanCode !== 'function') {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '当前环境不支持扫码', icon: 'none' });
      }
      return;
    }

    let scanningFinished = false;
    const finishScanning = () => {
      if (scanningFinished) return;
      scanningFinished = true;
      app.globalData._isScanning = false;
      this.setData({ scanning: false });
    };

    this.setData({ scanning: true });
    app.globalData._isScanning = true;
    try {
      wx.scanCode({
        onlyFromCamera: true,
        scanType: ['qrCode'],
        success: scan => {
          const qrText = String((scan && (scan.result || scan.path)) || '').trim();
          if (!qrText) {
            wx.showToast({ title: '二维码内容为空', icon: 'none' });
            return;
          }
          try {
            this.addScannedDevice(qrText);
          } catch (error) {
            wx.showToast({ title: '设备加入失败，请重试', icon: 'none' });
          }
        },
        fail: error => {
          const message = String((error && error.errMsg) || '');
          if (!/cancel/i.test(message)) {
            wx.showToast({ title: '二维码扫描失败', icon: 'none' });
          }
        },
        complete: finishScanning
      });
    } catch (error) {
      finishScanning();
      wx.showToast({ title: '扫码功能暂不可用，请重试', icon: 'none' });
    }
  },

  addScannedDevice(qrText) {
    if (!qrText) {
      wx.showToast({ title: '二维码内容为空', icon: 'none' });
      return;
    }
    if (!this.data.transferId) {
      this.createTransferAndAddFirstDevice(qrText);
      return;
    }
    this.postScannedDevice(qrText, false);
  },

  createTransferAndAddFirstDevice(qrText) {
    const payload = this._pendingTransferPayload;
    if (!payload || this.data.creating || this.data.transferId) return;
    this.setData({ creating: true, scanConflict: null });
    this._goodsTransferScanRequestPending = true;
    wx.showLoading({ title: '正在加入...', mask: true });
    let firstScanRequestStarted = false;
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/goods-transfers/`,
      method: 'POST',
      header: app.authHeader(),
      data: payload,
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401 || body.code === 401) app.reauthenticate();
        if (body.code !== 0 || !body.data || !Number(body.data.id)) {
          wx.showToast({ title: body.msg || '商品流转单创建失败', icon: 'none' });
          return;
        }
        firstScanRequestStarted = true;
        this.setData({
          transferId: Number(body.data.id),
          detail: prepareDetail(body.data),
          scanReady: true,
          errorMessage: ''
        }, () => this.postScannedDevice(qrText, true));
      },
      fail: () => wx.showToast({ title: '网络连接失败，请重新扫码', icon: 'none' }),
      complete: () => {
        // A successful create starts the first device request in the callback;
        // that request owns loading/creating cleanup. Failed creates stop here.
        if (!firstScanRequestStarted) {
          this._goodsTransferScanRequestPending = false;
          this.setData({ creating: false });
          wx.hideLoading();
        }
      }
    });
  },

  postScannedDevice(qrText, isFirstScan) {
    if (!qrText || !this.data.transferId) return;
    const transferId = Number(this.data.transferId);
    this._goodsTransferScanRequestPending = true;
    if (!isFirstScan) wx.showLoading({ title: '正在加入...', mask: true });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/goods-transfers/${transferId}/scan/`,
      method: 'POST',
      header: app.authHeader(),
      data: { qr_text: qrText },
      success: res => {
        const body = res.data || {};
        if (body.code !== 0) {
          const errorData = body.data || {};
          if (errorData.reason_code === 'DEVICE_IN_UNFINISHED_GOODS_TRANSFER') {
            const conflict = errorData.conflict_transfer || {};
            const scanConflict = {
              message: body.msg || '此设备已在未完成的商品流转中，请先处理该流转。',
              transferId: conflict.can_continue ? Number(conflict.id || 0) : 0,
              flowNo: conflict.flow_no || ''
            };
            if (isFirstScan) {
              this.deleteEmptyFirstScanDraft(transferId, () => this.showScanConflict(scanConflict));
            } else {
              this.showScanConflict(scanConflict);
            }
            return;
          }
          if (isFirstScan) {
            wx.showToast({ title: body.msg || '设备加入失败', icon: 'none' });
            this.deleteEmptyFirstScanDraft(transferId);
            return;
          }
          wx.showToast({ title: body.msg || '设备加入失败', icon: 'none' });
          return;
        }
        this._pendingTransferPayload = null;
        wx.showToast({ title: `已加入第 ${body.data.item_count} 台`, icon: 'none' });
        if (!this._goodsTransferPageUnloading) this.loadDetail();
      },
      fail: () => {
        wx.showToast({ title: '网络连接失败，请刷新确认设备状态', icon: 'none' });
        if (isFirstScan) this.reconcileFirstScanAfterNetworkError(transferId);
      },
      complete: () => {
        this._goodsTransferScanRequestPending = false;
        if (isFirstScan) this.setData({ creating: false });
        wx.hideLoading();
      }
    });
  },

  showScanConflict(scanConflict) {
    this.setData({ scanConflict }, () => {
      if (typeof wx.pageScrollTo === 'function') {
        wx.pageScrollTo({ scrollTop: 0, duration: 180 });
      }
    });
  },

  deleteEmptyFirstScanDraft(transferId, done) {
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/goods-transfers/${transferId}/`,
      method: 'DELETE',
      header: app.authHeader(),
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401 || body.code === 401) app.reauthenticate();
        if (body.code === 0) {
          this.setData({
            transferId: 0,
            detail: this.buildUnpersistedDetail(),
            scanReady: true
          });
          if (done) done();
          return;
        }
        this.loadDetail(() => done && done());
      },
      fail: () => this.loadDetail(() => done && done())
    });
  },

  reconcileFirstScanAfterNetworkError(transferId) {
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/goods-transfers/${transferId}/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        const body = res.data || {};
        if (body.code === 0 && body.data) {
          this.setData({ detail: prepareDetail(body.data) });
          if (Number(body.data.item_count || 0) > 0) {
            this._pendingTransferPayload = null;
          } else {
            this.deleteEmptyFirstScanDraft(transferId);
          }
        }
      }
    });
  },

  submitTransfer() {
    const detail = this.data.detail;
    if (!detail || !detail.actions || !detail.actions.can_submit || this.data.submitting) return;
    const isTransfer = detail.flow_type === 'TRANSFER';
    const isFactoryReturn = (
      detail.flow_type === 'RETURN' &&
      detail.to_organization &&
      detail.to_organization.type === 'OWNER'
    );
    if (isFactoryReturn && !this.data.goodsListSelectedPath) {
      wx.showToast({ title: '请先上传本批退货货品清单', icon: 'none' });
      return;
    }
    wx.showModal({
      title: `确认完成${detail.flow_type_name}`,
      content: isFactoryReturn
        ? `确认退回 ${detail.item_count} 台设备？货品清单和退货说明将随本次退货一并提交；厂家物流取回后才会解锁销售助理操作。`
        : isTransfer
        ? `确认将 ${detail.from_organization.name} 的 ${detail.item_count} 台设备调至 ${detail.to_organization.name}？确认后物权立即转移，双方只收到知晓任务。`
        : `确认提交 ${detail.item_count} 台设备？提交后等待 ${detail.to_organization.name} 确认入库，确认后才转移物权。`,
      confirmText: '确认提交',
      success: modal => modal.confirm && this.doSubmitTransfer()
    });
  },

  doSubmitTransfer() {
    this.setData({ submitting: true });
    wx.showLoading({ title: '正在提交...', mask: true });
    const detail = this.data.detail || {};
    const isFactoryReturn = (
      detail.flow_type === 'RETURN' &&
      detail.to_organization &&
      detail.to_organization.type === 'OWNER'
    );
    if (isFactoryReturn) {
      wx.uploadFile({
        url: `${app.globalData.apiBase}/lifecycle/goods-transfers/${this.data.transferId}/submit/`,
        filePath: this.data.goodsListSelectedPath,
        name: 'goods_list_file',
        header: app.authHeader(null),
        formData: {
          goods_list_client_request_id: `return-goods-list-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          return_remark: (this.data.returnSubmitRemark || '').trim()
        },
        success: res => this.handleSubmitResponse(res, true),
        fail: () => wx.showToast({ title: '退货提交失败，请检查网络', icon: 'none' }),
        complete: () => this.finishSubmitting()
      });
      return;
    }
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/goods-transfers/${this.data.transferId}/submit/`,
      method: 'POST',
      header: app.authHeader(),
      data: {},
      success: res => this.handleSubmitResponse(res, false),
      fail: () => wx.showToast({ title: '网络连接失败', icon: 'none' }),
      complete: () => this.finishSubmitting()
    });
  },

  handleSubmitResponse(res, uploaded) {
    let body = res.data || {};
    if (uploaded) {
      try {
        body = JSON.parse(res.data || '{}');
      } catch (error) {
        wx.showToast({ title: '服务器返回数据格式错误', icon: 'none' });
        return;
      }
    }
    if (res.statusCode === 401 || body.code === 401) app.reauthenticate();
    if (body.code !== 0 || !body.data) {
      wx.showToast({ title: body.msg || '商品流转提交失败', icon: 'none' });
      return;
    }
    this._goodsTransferSubmitted = true;
    this.setData({ detail: prepareDetail(body.data) });
    if (typeof app.refreshTasks === 'function') app.refreshTasks();
    wx.showModal({
      title: '提交成功',
      content: body.data.flow_type === 'RETURN' && body.data.to_organization.type === 'OWNER'
        ? '退厂退货已提交。货品清单和退货说明已随批次保存；物流单据可随后补传，不影响厂家物流取回。'
        : body.data.receipt_required
        ? '已通知收货方确认入库；确认前物权仍属于发出组织。'
        : '调货已经完成，物权已转移，调出和调入商家均已收到知晓任务。',
      showCancel: false,
      success: () => wx.redirectTo({
        url: `/pages/stock/goods_transfer_detail/goods_transfer_detail?transfer_id=${this.data.transferId}`
      })
    });
  },

  finishSubmitting() {
    wx.hideLoading();
    this.setData({ submitting: false });
  },

  chooseGoodsListImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: res => {
        const file = (res.tempFiles || [])[0];
        if (file && file.tempFilePath) {
          this.setData({
            goodsListSelectedPath: file.tempFilePath,
            goodsListSelectedName: '退货货品清单图片'
          });
        }
      }
    });
  },

  chooseGoodsListPdf() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['pdf'],
      success: res => {
        const file = (res.tempFiles || [])[0];
        if (file && file.path) {
          this.setData({
            goodsListSelectedPath: file.path,
            goodsListSelectedName: file.name || '退货货品清单.pdf'
          });
        }
      }
    });
  },

  onReturnSubmitRemarkInput(event) {
    this.setData({ returnSubmitRemark: event.detail.value || '' });
  },

  openDetail() {
    if (!this.data.transferId) return;
    wx.navigateTo({
      url: `/pages/stock/goods_transfer_detail/goods_transfer_detail?transfer_id=${this.data.transferId}`
    });
  },

  openConflictTransfer() {
    const conflict = this.data.scanConflict || {};
    const conflictTransferId = Number(conflict.transferId || 0);
    if (!conflictTransferId || this._resumingConflictTransfer) return;

    const currentTransferId = Number(this.data.transferId || 0);
    const currentDetail = this.data.detail || {};
    const continueExistingDraft = () => wx.redirectTo({
      url: `/pages/stock/goods_transfer/goods_transfer?transfer_id=${conflictTransferId}`
    });

    // A fresh scan attempt may have created an empty transfer before finding
    // this existing draft. Remove only that empty shell before resuming the
    // original transfer, so the list does not gain a duplicate task.
    if (
      currentTransferId &&
      currentTransferId !== conflictTransferId &&
      Number(currentDetail.item_count || 0) === 0
    ) {
      this._resumingConflictTransfer = true;
      wx.request({
        url: `${app.globalData.apiBase}/lifecycle/goods-transfers/${currentTransferId}/`,
        method: 'DELETE',
        header: app.authHeader(),
        success: res => {
          const body = res.data || {};
          if (res.statusCode === 401 || body.code === 401) app.reauthenticate();
          if (body.code !== 0) {
            wx.showToast({
              title: body.msg || '空白流转单未删除，可稍后在列表中清理',
              icon: 'none'
            });
          }
        },
        fail: () => wx.showToast({ title: '空白流转单清理失败', icon: 'none' }),
        complete: () => {
          this._resumingConflictTransfer = false;
          continueExistingDraft();
        }
      });
      return;
    }

    continueExistingDraft();
  },

  cancelScanConflict() {
    this.setData({ scanConflict: null });
  }
});
