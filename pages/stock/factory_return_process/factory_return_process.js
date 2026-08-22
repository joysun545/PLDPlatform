const app = getApp();

const MATERIAL_OPTIONS = [
  { label: '不需要更换物料', value: false },
  { label: '需要更换物料', value: true }
];

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

function preparePage(data, entryTaskId) {
  if (!data) return null;
  const options = data.classification_options || [];
  return {
    ...data,
    transfer: {
      ...(data.transfer || {}),
      submittedText: formatDate((data.transfer || {}).submitted_at),
      receivedText: formatDate((data.transfer || {}).received_at),
      completedText: formatDate((data.transfer || {}).completed_at)
    },
    process: {
      ...(data.process || {}),
      pickedText: formatDate((data.process || {}).picked_at),
      postedText: formatDate((data.process || {}).posted_at)
    },
    account_case: data.account_case ? {
      ...data.account_case,
      amount_recorded_at: formatDate(data.account_case.amount_recorded_at)
    } : null,
    logistics_documents: (data.logistics_documents || []).map(document => ({
      ...document,
      uploadedText: formatDate(document.uploaded_at)
    })),
    goods_list_documents: (data.goods_list_documents || []).map(document => ({
      ...document,
      uploadedText: formatDate(document.uploaded_at)
    })),
    workflow_tasks: (data.workflow_tasks || []).map(task => ({
      ...task,
      cursorText: formatDate(task.cursor_time),
      nodeClass: `${!task.published
        ? 'not-published'
        : (task.action_state === 'COMPLETED'
          ? 'completed'
          : (task.action_state === 'PENDING' ? 'pending' : 'published'))}${
            Number(task.task_id) === Number(entryTaskId) ? ' focused' : ''
          }`,
      readClass: task.read_state === 'UNREAD' ? 'unread' : 'read'
    })),
    items: (data.items || []).map(item => {
      const selectedIndex = options.findIndex(option => option.value === item.stock_status);
      const bomMaterialOptions = (item.bom_material_options || []).map(material => ({
        ...material,
        returnedSelected: !!material.returned_selected,
        faultSelected: !!material.fault_selected,
        selected: !!material.fault_selected,
        noteInput: material.original_note || '',
        repairSelected: !!material.repair_selected,
        repairNoteInput: material.repair_note || ''
      }));
      return {
        ...item,
        bom_material_options: bomMaterialOptions,
        classifiedText: formatDate(item.classified_at),
        productionProcessedText: formatDate(item.production_processed_at),
        matchingProcessedText: formatDate(item.matching_processed_at),
        selectedIndex: selectedIndex >= 0 ? selectedIndex : 0,
        selectedStatus: selectedIndex >= 0 ? item.stock_status : '',
        selectedLabel: selectedIndex >= 0
          ? options[selectedIndex].label
          : (item.stock_status_name || '状态待确认'),
        inputRemark: item.remark || '',
        productionRemarkInput: item.production_remark || '',
        materialRequirementInput: item.material_requirement || '',
        materialPlanInput: item.material_plan || '',
        disassemblyResultInput: item.disassembly_result || '',
        warrantyDispositionInput: item.warranty_disposition || '',
        matchingRemarkInput: item.matching_remark || '',
        needsMaterialIndex: item.needs_replacement_material === true ? 1 : 0,
        needsMaterialSelected: item.needs_replacement_material === true,
        warrantyMaterialIndex: item.has_warranty_material === true ? 1 : 0,
        warrantyMaterialSelected: item.has_warranty_material === true
      };
    })
  };
}

Page({
  data: {
    transferId: 0,
    taskGroupId: '',
    entryTaskId: 0,
    loading: true,
    errorMessage: '',
    pageData: null,
    postingRemark: '',
    creditAmount: '',
    confirmingPickup: false,
    posting: false,
    recordingCreditAmount: false,
    operationBusyKey: '',
    materialOptions: MATERIAL_OPTIONS
  },

  onLoad(options) {
    const transferId = Number((options || {}).transfer_id || 0);
    if (!transferId) {
      this.setData({ loading: false, errorMessage: '退货流转参数无效' });
      return;
    }
    this.setData({
      transferId,
      taskGroupId: (options || {}).task_group_id || '',
      entryTaskId: Number((options || {}).task_id || 0)
    });
    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({ loading: false, errorMessage: '登录失败，请重新进入小程序' });
        return;
      }
      this.loadData();
    });
  },

  onShow() {
    if (this.data.transferId && app.globalData.access_token && !this.data.loading) {
      this.loadData();
    }
  },

  onPullDownRefresh() {
    this.loadData(() => wx.stopPullDownRefresh());
  },

  loadData(done) {
    this.setData({ loading: true, errorMessage: '' });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/goods-transfers/${this.data.transferId}/factory-return/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401 || body.code === 401) app.reauthenticate();
        if (body.code !== 0 || !body.data) {
          this.setData({
            loading: false,
            errorMessage: body.msg || '厂家退货处理流程加载失败'
          });
          return;
        }
        const pageData = preparePage(body.data, this.data.entryTaskId);
        this.setData({
          loading: false,
          pageData,
          postingRemark: (pageData.process || {}).posting_remark || '',
          creditAmount: ((pageData.account_case || {}).confirmed_amount || '')
        });
      },
      fail: () => this.setData({
        loading: false,
        errorMessage: '网络连接失败，请稍后重试'
      }),
      complete: () => done && done()
    });
  },

  retryLoad() {
    this.loadData();
  },

  markWorkflowTaskRead(event) {
    const taskId = Number(event.currentTarget.dataset.taskId || 0);
    const canMarkRead = event.currentTarget.dataset.canMarkRead === true ||
      event.currentTarget.dataset.canMarkRead === 'true';
    if (!taskId || !canMarkRead) return;
    app.openUserTask(taskId, response => {
      if (!response || response.code !== 0) {
        wx.showToast({
          title: (response && response.msg) || '任务读取失败',
          icon: 'none'
        });
        return;
      }
      this.loadData();
      if (typeof app.refreshTasks === 'function') app.refreshTasks();
    });
  },

  confirmPickup() {
    const pageData = this.data.pageData;
    if (!pageData || !pageData.actions.can_confirm_pickup || this.data.confirmingPickup) return;
    wx.showModal({
      title: '确认退货已取回',
      content: `确认已从${pageData.transfer.from_organization_name}取回${pageData.total_count}台设备？确认后物权进入厂家、原二维码冻结，并解锁销售助理原有任务中的金额登记和分类入库操作。`,
      confirmText: '确认取回',
      success: modal => modal.confirm && this.doConfirmPickup()
    });
  },

  doConfirmPickup() {
    this.setData({ confirmingPickup: true });
    wx.showLoading({ title: '正在确认...', mask: true });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/goods-transfers/${this.data.transferId}/factory-return/pickup/`,
      method: 'POST',
      header: app.authHeader('application/json'),
      data: {},
      success: res => {
        const body = res.data || {};
        if (body.code !== 0 || !body.data) {
          wx.showToast({ title: body.msg || '确认取回失败', icon: 'none' });
          return;
        }
        this.setData({
          pageData: preparePage(body.data, this.data.entryTaskId)
        });
        if (typeof app.refreshTasks === 'function') app.refreshTasks();
        wx.showToast({ title: '已确认取回', icon: 'success' });
      },
      fail: () => wx.showToast({ title: '网络连接失败', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ confirmingPickup: false });
      }
    });
  },

  onCategoryChange(event) {
    const itemIndex = Number(event.currentTarget.dataset.index);
    const optionIndex = Number(event.detail.value);
    const options = (this.data.pageData || {}).classification_options || [];
    const option = options[optionIndex];
    if (!option || Number.isNaN(itemIndex)) return;
    this.setData({
      [`pageData.items[${itemIndex}].selectedIndex`]: optionIndex,
      [`pageData.items[${itemIndex}].selectedStatus`]: option.value,
      [`pageData.items[${itemIndex}].selectedLabel`]: option.label
    });
  },

  onItemRemarkInput(event) {
    const itemIndex = Number(event.currentTarget.dataset.index);
    if (Number.isNaN(itemIndex)) return;
    this.setData({
      [`pageData.items[${itemIndex}].inputRemark`]: event.detail.value
    });
  },

  onPostingRemarkInput(event) {
    this.setData({ postingRemark: event.detail.value });
  },

  onCreditAmountInput(event) {
    this.setData({ creditAmount: event.detail.value || '' });
  },

  recordCreditAmount() {
    const pageData = this.data.pageData;
    if (!pageData || !pageData.actions.can_record_credit_amount || this.data.recordingCreditAmount) return;
    const amount = String(this.data.creditAmount || '').trim();
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
      wx.showToast({ title: '请输入大于0且最多两位小数的金额', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '登记退货冲抵金额',
      content: `确认由厂家销售助理直接登记本批冲抵金额 ¥${Number(amount).toFixed(2)}？该操作不需要商家确认。`,
      confirmText: '确认登记',
      success: modal => modal.confirm && this.doRecordCreditAmount(amount)
    });
  },

  doRecordCreditAmount(amount) {
    this.setData({ recordingCreditAmount: true });
    wx.showLoading({ title: '正在登记...', mask: true });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/goods-transfers/${this.data.transferId}/factory-return/credit-amount/`,
      method: 'POST',
      header: app.authHeader('application/json'),
      data: { amount },
      success: res => {
        const body = res.data || {};
        if (body.code !== 0 || !body.data) {
          wx.showToast({ title: body.msg || '冲抵金额登记失败', icon: 'none' });
          return;
        }
        const pageData = preparePage(body.data, this.data.entryTaskId);
        this.setData({
          pageData,
          creditAmount: (pageData.account_case || {}).confirmed_amount || amount
        });
        if (typeof app.refreshTasks === 'function') app.refreshTasks();
        wx.showToast({ title: '冲抵金额已登记', icon: 'success' });
      },
      fail: () => wx.showToast({ title: '网络连接失败', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ recordingCreditAmount: false });
      }
    });
  },

  submitPosting() {
    const pageData = this.data.pageData;
    if (!pageData || !pageData.actions.can_post_inventory || this.data.posting) return;
    const missing = (pageData.items || []).find(item => !item.selectedStatus);
    if (missing) {
      wx.showToast({ title: `请先为${missing.device.sn}选择分类`, icon: 'none' });
      return;
    }
    wx.showModal({
      title: '确认分类入库',
      content: `将一次性完成本批${pageData.total_count}台设备的分类入库。冲抵金额可在此操作之前或之后由销售助理独立登记。`,
      confirmText: '确认入库',
      success: modal => modal.confirm && this.doSubmitPosting()
    });
  },

  doSubmitPosting() {
    const pageData = this.data.pageData;
    const payload = {
      posting_remark: this.data.postingRemark || '',
      items: (pageData.items || []).map(item => ({
        item_id: item.goods_transfer_item_id,
        stock_status: item.selectedStatus,
        remark: item.inputRemark || ''
      }))
    };
    this.setData({ posting: true });
    wx.showLoading({ title: '正在入库...', mask: true });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/goods-transfers/${this.data.transferId}/factory-return/posting/`,
      method: 'POST',
      header: app.authHeader('application/json'),
      data: payload,
      success: res => {
        const body = res.data || {};
        if (body.code !== 0 || !body.data) {
          wx.showToast({ title: body.msg || '分类入库失败', icon: 'none' });
          return;
        }
        this.setData({
          pageData: preparePage(body.data, this.data.entryTaskId)
        });
        if (typeof app.refreshTasks === 'function') app.refreshTasks();
        wx.showModal({
          title: '分类入库完成',
          content: '厂家库管已收到知晓任务；待拆机和待修复设备已分别向生产经理、配套经理推送后续操作任务。',
          showCancel: false
        });
      },
      fail: () => wx.showToast({ title: '网络连接失败', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ posting: false });
      }
    });
  },

  onOperationInput(event) {
    const itemIndex = Number(event.currentTarget.dataset.index);
    const field = event.currentTarget.dataset.field || '';
    if (Number.isNaN(itemIndex) || !field) return;
    this.setData({
      [`pageData.items[${itemIndex}].${field}`]: event.detail.value || ''
    });
  },

  onNeedsMaterialChange(event) {
    const itemIndex = Number(event.currentTarget.dataset.index);
    const optionIndex = Number(event.detail.value);
    const option = MATERIAL_OPTIONS[optionIndex];
    if (Number.isNaN(itemIndex) || !option) return;
    this.setData({
      [`pageData.items[${itemIndex}].needsMaterialIndex`]: optionIndex,
      [`pageData.items[${itemIndex}].needsMaterialSelected`]: option.value
    });
  },

  onReturnedMaterialSelectionChange(event) {
    const itemIndex = Number(event.currentTarget.dataset.index);
    if (Number.isNaN(itemIndex)) return;
    const selectedIds = new Set((event.detail.value || []).map(value => Number(value)));
    const materials = this.data.pageData.items[itemIndex].bom_material_options || [];
    materials.forEach((material, materialIndex) => {
      this.setData({
        [`pageData.items[${itemIndex}].bom_material_options[${materialIndex}].returnedSelected`]:
          selectedIds.has(Number(material.bom_item_id)),
        [`pageData.items[${itemIndex}].bom_material_options[${materialIndex}].faultSelected`]:
          selectedIds.has(Number(material.bom_item_id)) && !!material.faultSelected
      });
    });
  },

  onRepairMaterialSelectionChange(event) {
    const itemIndex = Number(event.currentTarget.dataset.index);
    if (Number.isNaN(itemIndex)) return;
    const selectedIds = new Set((event.detail.value || []).map(value => Number(value)));
    const materials = this.data.pageData.items[itemIndex].bom_material_options || [];
    materials.forEach((material, materialIndex) => {
      this.setData({
        [`pageData.items[${itemIndex}].bom_material_options[${materialIndex}].repairSelected`]:
          selectedIds.has(Number(material.bom_item_id))
      });
    });
  },

  onRepairMaterialNoteInput(event) {
    const itemIndex = Number(event.currentTarget.dataset.itemIndex);
    const materialIndex = Number(event.currentTarget.dataset.materialIndex);
    if (Number.isNaN(itemIndex) || Number.isNaN(materialIndex)) return;
    this.setData({
      [`pageData.items[${itemIndex}].bom_material_options[${materialIndex}].repairNoteInput`]:
        event.detail.value || ''
    });
  },

  onFaultMaterialNoteInput(event) {
    const itemIndex = Number(event.currentTarget.dataset.itemIndex);
    const materialIndex = Number(event.currentTarget.dataset.materialIndex);
    if (Number.isNaN(itemIndex) || Number.isNaN(materialIndex)) return;
    this.setData({
      [`pageData.items[${itemIndex}].bom_material_options[${materialIndex}].noteInput`]:
        event.detail.value || ''
    });
  },

  onFaultMaterialChange(event) {
    const itemIndex = Number(event.currentTarget.dataset.itemIndex);
    const materialIndex = Number(event.currentTarget.dataset.materialIndex);
    if (Number.isNaN(itemIndex) || Number.isNaN(materialIndex)) return;
    const material = this.data.pageData.items[itemIndex].bom_material_options[materialIndex];
    if (!material.returnedSelected && event.detail.value) {
      wx.showToast({ title: '请先勾选该实际退回物料', icon: 'none' });
      return;
    }
    this.setData({
      [`pageData.items[${itemIndex}].bom_material_options[${materialIndex}].faultSelected`]:
        !!event.detail.value
    });
  },

  submitProductionAction(event) {
    const itemIndex = Number(event.currentTarget.dataset.index);
    const action = event.currentTarget.dataset.action || '';
    const item = ((this.data.pageData || {}).items || [])[itemIndex];
    if (!item || !action || this.data.operationBusyKey) return;
    let content = '确认保存本台设备的生产处置结果？';
    if (action === 'REPAIR_DIAGNOSIS') {
      const selected = (item.bom_material_options || [])
        .filter(material => material.repairSelected);
      if (item.needsMaterialSelected && !selected.length) {
        wx.showToast({ title: '请从原BOM至少勾选一项物料', icon: 'none' });
        return;
      }
      content = item.needsMaterialSelected
        ? `确认提交${selected.length}项换料需求？配套经理将核对原供应商并完成关联推送。`
        : '提交后本台设备可由生产经理继续确认修复完成。';
    }
    if (action === 'DISASSEMBLY_COMPLETE') {
      const returned = (item.bom_material_options || [])
        .filter(material => material.returnedSelected);
      const faults = returned.filter(material => material.faultSelected);
      if (!returned.length) {
        wx.showToast({ title: '请至少勾选一项实际退回物料', icon: 'none' });
        return;
      }
      if (!faults.length) {
        wx.showToast({ title: '请至少标记一项故障原因物料', icon: 'none' });
        return;
      }
      content = `确认保存${returned.length}项实际退回物料和${faults.length}项故障件次，并结束本台旧生命周期？质保状态由系统自动计算，原始事实保存后不可覆盖。`;
    }
    wx.showModal({
      title: '确认生产处置',
      content,
      confirmText: '确认提交',
      success: modal => modal.confirm && this.doProductionAction(itemIndex, action)
    });
  },

  doProductionAction(itemIndex, action) {
    const item = this.data.pageData.items[itemIndex];
    const payload = {
      action,
      production_remark: item.productionRemarkInput || ''
    };
    if (action === 'REPAIR_DIAGNOSIS') {
      payload.needs_replacement_material = !!item.needsMaterialSelected;
      if (item.needsMaterialSelected) {
        payload.repair_materials = (item.bom_material_options || [])
          .filter(material => material.repairSelected)
          .map(material => ({
            bom_item_id: material.bom_item_id,
            note: material.repairNoteInput || ''
          }));
      }
    } else if (action === 'DISASSEMBLY_COMPLETE') {
      payload.returned_materials = (item.bom_material_options || [])
        .filter(material => material.returnedSelected)
        .map(material => ({
          bom_item_id: material.bom_item_id,
          note: material.noteInput || '',
          is_fault_material: !!material.faultSelected
        }));
    }
    const busyKey = `production-${item.id}-${action}`;
    this.setData({ operationBusyKey: busyKey });
    wx.showLoading({ title: '正在提交...', mask: true });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/goods-transfers/${this.data.transferId}/factory-return/items/${item.id}/production/`,
      method: 'POST',
      header: app.authHeader('application/json'),
      data: payload,
      success: res => this.handleOperationResponse(res, '生产处置已保存'),
      fail: () => wx.showToast({ title: '网络连接失败', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ operationBusyKey: '' });
      }
    });
  },

  submitMatchingAction(event) {
    const itemIndex = Number(event.currentTarget.dataset.index);
    const action = event.currentTarget.dataset.action || '';
    const item = ((this.data.pageData || {}).items || [])[itemIndex];
    if (!item || !action || this.data.operationBusyKey) return;
    if (action === 'REPAIR_MATERIAL_PLAN' && !item.actions.can_notify_repair_suppliers) {
      wx.showToast({ title: '存在原供应商待确认，暂不能推送', icon: 'none' });
      return;
    }
    if (
      action === 'DISASSEMBLY_MATERIAL_DISPOSITION' &&
      !item.actions.can_notify_warranty_suppliers
    ) {
      wx.showToast({ title: '存在供应商待确认，暂不能通知', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '确认配套处置',
      content: action === 'REPAIR_MATERIAL_PLAN'
        ? '确认原BOM换料清单并按原供应商推送？供应商负责人必收；原订单已配置责任销售经理时同步通知。完成后将解锁生产经理继续修复。'
        : '确认三包物料并按供应商分组通知？供应商负责人必收；原订单已配置责任销售经理时同步通知。',
      confirmText: '确认提交',
      success: modal => modal.confirm && this.doMatchingAction(itemIndex, action)
    });
  },

  doMatchingAction(itemIndex, action) {
    const item = this.data.pageData.items[itemIndex];
    const payload = {
      action,
      matching_remark: item.matchingRemarkInput || ''
    };
    if (action === 'REPAIR_MATERIAL_PLAN') {
      payload.material_plan = item.materialPlanInput || '';
    }
    const busyKey = `matching-${item.id}-${action}`;
    this.setData({ operationBusyKey: busyKey });
    wx.showLoading({ title: '正在提交...', mask: true });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/goods-transfers/${this.data.transferId}/factory-return/items/${item.id}/matching/`,
      method: 'POST',
      header: app.authHeader('application/json'),
      data: payload,
      success: res => this.handleOperationResponse(res, '配套处置已保存'),
      fail: () => wx.showToast({ title: '网络连接失败', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ operationBusyKey: '' });
      }
    });
  },

  handleOperationResponse(res, successTitle) {
    const body = res.data || {};
    if (body.code !== 0 || !body.data) {
      wx.showToast({ title: body.msg || '处置提交失败', icon: 'none' });
      return;
    }
    this.setData({
      pageData: preparePage(body.data, this.data.entryTaskId)
    });
    if (typeof app.refreshTasks === 'function') app.refreshTasks();
    wx.showToast({ title: successTitle, icon: 'success' });
  },

  openFactoryReturnInventory() {
    wx.navigateTo({
      url: '/pages/stock/factory_return_inventory/factory_return_inventory'
    });
  },

  openAccounts() {
    wx.navigateTo({
      url: `/pages/stock/goods_transfer_accounts/goods_transfer_accounts?transfer_id=${this.data.transferId}`
    });
  },

  previewReturnDocument(event) {
    const path = event.currentTarget.dataset.path || '';
    const fileType = event.currentTarget.dataset.type || 'IMAGE';
    if (!path) return;
    wx.showLoading({ title: '正在读取...', mask: true });
    wx.downloadFile({
      url: `${app.globalData.apiBase}${path}`,
      header: app.authHeader(null),
      success: res => {
        if (res.statusCode !== 200 || !res.tempFilePath) {
          wx.showToast({ title: '单据读取失败', icon: 'none' });
          return;
        }
        if (fileType === 'PDF') {
          wx.openDocument({
            filePath: res.tempFilePath,
            fileType: 'pdf',
            showMenu: true,
            fail: () => wx.showToast({ title: 'PDF打开失败', icon: 'none' })
          });
        } else {
          wx.previewImage({
            urls: [res.tempFilePath],
            current: res.tempFilePath
          });
        }
      },
      fail: () => wx.showToast({ title: '单据读取失败', icon: 'none' }),
      complete: () => wx.hideLoading()
    });
  }
});
