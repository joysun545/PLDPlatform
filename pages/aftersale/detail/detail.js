const app = getApp();

function uploadFailureMessage(res, body) {
  if (res && res.statusCode === 413) return '视频超过服务器上传限制，请联系管理员调整上传容量';
  if (res && (res.statusCode === 502 || res.statusCode === 504)) return '视频上传超时，请检查网络后重试';
  if (body && body.msg) return body.msg;
  return '附件上传失败（HTTP ' + ((res && res.statusCode) || '未知') + '）';
}

function apiRequest(url, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: app.globalData.apiBase + url,
      method,
      data,
      header: app.authHeader(data === null ? null : 'application/json'),
      success: res => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.code === 0) {
          resolve(res.data.data);
        } else {
          reject(new Error((res.data && res.data.msg) || '请求失败'));
        }
      },
      fail: () => reject(new Error('网络连接失败，请稍后重试'))
    });
  });
}

function localDateTime() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) +
    'T' + pad(now.getHours()) + ':' + pad(now.getMinutes());
}

Page({
  data: {
    applicationId: null,
    loading: true,
    error: '',
    detail: null,
    bomExpanded: false,
    mediaFiles: [],
    actionMedia: [],
    submitting: false,
    triage: {
      faultIndex: -1,
      routeIndex: -1,
      route: '',
      candidates: [],
      candidateIndex: -1,
      diagnosisNote: '',
      repairPlan: '',
      thirdPartyName: '',
      thirdPartyContactName: '',
      thirdPartyPhone: '',
      thirdPartyAddress: ''
    },
    shipmentCompany: '',
    shipmentTrackingNo: '',
    receiptNote: '',
    repairSummary: '',
    repairMaterialReplaced: false,
    repairMaterials: [],
    actualProcessedAt: localDateTime(),
    returnCompany: '',
    returnTrackingNo: '',
    applicantFeedback: '',
    finalForm: {
      faultIndex: -1,
      solutionIndex: -1,
      materials: [],
      solutionNote: ''
    },
    thirdCompany: '',
    thirdTrackingNo: '',
    thirdMaterials: [],
    thirdAmount: '',
    thirdRemark: '',
    thirdReturnCompany: '',
    thirdReturnTrackingNo: ''
  },

  onLoad(options) {
    const applicationId = Number(options && options.application_id);
    if (!applicationId) {
      this.setData({ loading: false, error: '售后申请参数缺失' });
      return;
    }
    this.setData({ applicationId });
    app.ensureLogin(ok => {
      if (!ok) return this.setData({ loading: false, error: '登录失败，请重新进入' });
      this.loadDetail();
    });
  },

  onShow() {
    if (this.data.applicationId && !this.data.submitting && this.data.detail) {
      this.loadDetail(true);
    }
  },

  loadDetail(silent = false) {
    if (!silent) this.setData({ loading: true, error: '' });
    return apiRequest('/lifecycle/after-sales/applications/' + this.data.applicationId + '/')
      .then(detail => {
        const dispatch = detail.dispatch || {};
        const currentTriage = this.data.triage;
        const nextData = {
          detail,
          mediaFiles: (detail.media || []).map(item => ({
            ...item,
            key: String(item.id),
            loading: false,
            localPath: ''
          })),
          loading: false,
          error: '',
          triage: {
            ...currentTriage,
            diagnosisNote: dispatch.diagnosis_note || currentTriage.diagnosisNote || '',
            repairPlan: dispatch.repair_plan || currentTriage.repairPlan || ''
          }
        };
        // Returning from the album/file picker can trigger onShow(). Preserve
        // the files selected for the current action during a silent refresh.
        if (!silent) nextData.actionMedia = [];
        this.setData(nextData);
      })
      .catch(err => {
        if (!silent) this.setData({ loading: false, error: err.message || '无法读取售后申请' });
      });
  },

  toggleBom() {
    this.setData({ bomExpanded: !this.data.bomExpanded });
  },

  getTriageOptions() {
    return (this.data.detail && this.data.detail.triage_options) || {
      preliminary_fault_types: [],
      routes: [],
      candidates: []
    };
  },

  onTriageFault(e) {
    this.setData({ 'triage.faultIndex': Number(e.detail.value) });
  },

  onTriageNote(e) {
    this.setData({ 'triage.diagnosisNote': e.detail.value });
  },

  onTriagePlan(e) {
    this.setData({ 'triage.repairPlan': e.detail.value });
  },

  onTriageRoute(e) {
    const routeIndex = Number(e.detail.value);
    const options = this.getTriageOptions();
    const route = (options.routes || [])[routeIndex] || {};
    const candidates = (options.candidates || []).filter(item => item.route === route.value);
    this.setData({
      'triage.routeIndex': routeIndex,
      'triage.route': route.value || '',
      'triage.candidates': candidates,
      'triage.candidateIndex': -1
    });
  },

  onTriageCandidate(e) {
    this.setData({ 'triage.candidateIndex': Number(e.detail.value) });
  },

  onTriageThirdInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['triage.' + field]: e.detail.value });
  },

  onActionMediaChange(e) {
    this.setData({ actionMedia: e.detail.files || [] });
  },

  onActionMediaRetry(e) {
    const index = Number(e.detail.index);
    const actionMedia = this.data.actionMedia.slice();
    if (actionMedia[index]) {
      actionMedia[index] = { ...actionMedia[index], status: 'PENDING', error: '' };
      this.setData({ actionMedia });
    }
  },

  updateActionMedia(index, patch) {
    const actionMedia = this.data.actionMedia.slice();
    if (!actionMedia[index]) return;
    actionMedia[index] = { ...actionMedia[index], ...patch };
    this.setData({ actionMedia });
  },

  uploadActionOne(purpose, item, index) {
    this.updateActionMedia(index, { status: 'UPLOADING', error: '' });
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: app.globalData.apiBase + '/lifecycle/after-sales/applications/' + this.data.applicationId + '/media/',
        filePath: item.path,
        name: 'file',
        timeout: 180000,
        header: app.authHeader(null),
        formData: {
          media_type: item.media_type,
          purpose,
          duration_seconds: item.duration_seconds || '',
          caption: ''
        },
        success: res => {
          let body = null;
          try {
            body = JSON.parse(res.data || '{}');
          } catch (err) {}
          if (res.statusCode >= 200 && res.statusCode < 300 && body && body.code === 0) {
            this.updateActionMedia(index, { status: 'SUCCESS', serverMediaId: body.data && body.data.id });
            resolve();
          } else {
            const message = uploadFailureMessage(res, body);
            this.updateActionMedia(index, { status: 'FAILED', error: message });
            reject(new Error(message));
          }
        },
        fail: err => {
          const message = (err && err.errMsg && err.errMsg.includes('timeout'))
            ? '视频上传超时，请保持网络稳定后重试'
            : '附件上传失败，请检查网络后重试';
          this.updateActionMedia(index, { status: 'FAILED', error: message });
          reject(new Error(message));
        }
      });
    });
  },

  uploadActionMedia(purpose) {
    if (!purpose) return Promise.resolve();
    const next = index => {
      const item = this.data.actionMedia[index];
      if (!item) return Promise.resolve();
      if (item.status === 'SUCCESS') return next(index + 1);
      return this.uploadActionOne(purpose, item, index).then(() => next(index + 1));
    };
    return next(0);
  },

  runAction(options) {
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    this.uploadActionMedia(options.purpose)
      .then(() => apiRequest(
        '/lifecycle/after-sales/applications/' + this.data.applicationId + options.endpoint,
        'POST',
        options.data
      ))
      .then(() => {
        wx.showToast({ title: options.success || '操作已完成', icon: 'success' });
        this.setData({ actionMedia: [] });
        return this.loadDetail();
      })
      .catch(err => wx.showToast({ title: err.message || '操作失败，请重试', icon: 'none' }))
      .finally(() => this.setData({ submitting: false }));
  },

  finalPayload() {
    const detail = this.data.detail || {};
    const finalForm = this.data.finalForm;
    const fault = (detail.final_fault_types || [])[finalForm.faultIndex];
    const solution = (detail.solution_types || [])[finalForm.solutionIndex];
    if (!fault || !solution || !finalForm.solutionNote.trim()) {
      wx.showToast({ title: '请完整选择最终故障类型、方案并填写说明', icon: 'none' });
      return null;
    }
    return {
      final_fault_type: fault.value,
      final_fault_materials: finalForm.materials || [],
      final_solution_type: solution.value,
      final_solution_note: finalForm.solutionNote.trim()
    };
  },

  submitTriage() {
    const triage = this.data.triage;
    const options = this.getTriageOptions();
    const fault = (options.preliminary_fault_types || [])[triage.faultIndex];
    const route = (options.routes || [])[triage.routeIndex];
    if (!fault || !route || !triage.diagnosisNote.trim() || !triage.repairPlan.trim()) {
      wx.showToast({ title: '请完整填写初步故障认定、依据、方案与处理路径', icon: 'none' });
      return;
    }
    const data = {
      preliminary_fault_type: fault.value,
      diagnosis_note: triage.diagnosisNote.trim(),
      repair_plan: triage.repairPlan.trim(),
      dispatch_route: route.value
    };
    if (['ORIGINAL_INSTALLER', 'MERCHANT_ELECTRICIAN', 'FACTORY_AFTERSALES'].includes(route.value)) {
      const candidate = triage.candidates[triage.candidateIndex];
      if (!candidate) {
        wx.showToast({ title: '请选择实际维修执行人', icon: 'none' });
        return;
      }
      if (!candidate.available) {
        wx.showToast({ title: candidate.unavailable_reason || '该执行人暂不可派送', icon: 'none' });
        return;
      }
      data.assigned_user_id = candidate.user_id;
    }
    if (route.value === 'THIRD_PARTY') {
      if (!triage.thirdPartyName.trim() || !triage.thirdPartyPhone.trim() || !triage.thirdPartyAddress.trim()) {
        wx.showToast({ title: '请填写第三方维修店名称、电话和详细地址', icon: 'none' });
        return;
      }
      data.third_party_name = triage.thirdPartyName.trim();
      data.third_party_contact_name = triage.thirdPartyContactName.trim();
      data.third_party_phone = triage.thirdPartyPhone.trim();
      data.third_party_address = triage.thirdPartyAddress.trim();
    }
    if (route.value === 'REMOTE') {
      const finalData = this.finalPayload();
      if (!finalData) return;
      Object.assign(data, finalData);
    }
    this.runAction({
      endpoint: '/triage/',
      data,
      success: route.value === 'REMOTE' ? '远程排障已结案' : '判断与派单已完成'
    });
  },

  onShipmentInput(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  submitApplicantShipment() {
    if (!this.data.shipmentCompany.trim() || !this.data.shipmentTrackingNo.trim()) {
      wx.showToast({ title: '请填写物流公司和物流单号', icon: 'none' });
      return;
    }
    this.runAction({
      purpose: 'APPLICANT_SHIPMENT_DOCUMENT',
      endpoint: '/applicant-shipment/',
      data: {
        logistics_company: this.data.shipmentCompany.trim(),
        tracking_no: this.data.shipmentTrackingNo.trim()
      },
      success: '寄送信息已提交'
    });
  },

  submitRepairReceipt() {
    this.runAction({
      endpoint: '/repair-receipt/',
      data: { receipt_note: this.data.receiptNote.trim() },
      success: '已确认收件'
    });
  },

  onRepairInput(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  onRepairReplaced(e) {
    this.setData({ repairMaterialReplaced: !!e.detail.value });
  },

  onRepairMaterials(e) {
    this.setData({ repairMaterials: e.detail.value || [] });
  },

  submitRepairComplete() {
    if (!this.data.repairSummary.trim()) {
      wx.showToast({ title: '请填写处理说明', icon: 'none' });
      return;
    }
    this.runAction({
      purpose: 'REPAIR_EVIDENCE',
      endpoint: '/repair-complete/',
      data: {
        repair_summary: this.data.repairSummary.trim(),
        repair_material_replaced: this.data.repairMaterialReplaced,
        repair_materials: this.data.repairMaterials,
        actual_processed_at: this.data.actualProcessedAt
      },
      success: '维修完成已提交'
    });
  },

  submitReturnShipment() {
    if (!this.data.returnCompany.trim() || !this.data.returnTrackingNo.trim()) {
      wx.showToast({ title: '请填写物流公司和物流单号', icon: 'none' });
      return;
    }
    this.runAction({
      purpose: 'REPAIR_RETURN_SHIPMENT_DOCUMENT',
      endpoint: '/return-shipment/',
      data: {
        logistics_company: this.data.returnCompany.trim(),
        tracking_no: this.data.returnTrackingNo.trim()
      },
      success: '返件信息已提交'
    });
  },

  onApplicantFeedback(e) {
    this.setData({ applicantFeedback: e.detail.value });
  },

  submitApplicantConfirm(e) {
    const confirmed = String(e.currentTarget.dataset.confirmed) !== 'false';
    this.runAction({
      endpoint: '/applicant-confirm/',
      data: {
        confirmed,
        feedback: this.data.applicantFeedback.trim()
      },
      success: confirmed ? '售后结果已确认' : '反馈已提交厂家复核'
    });
  },

  onFinalFault(e) {
    this.setData({ 'finalForm.faultIndex': Number(e.detail.value) });
  },

  onFinalSolution(e) {
    this.setData({ 'finalForm.solutionIndex': Number(e.detail.value) });
  },

  onFinalMaterials(e) {
    this.setData({ 'finalForm.materials': e.detail.value || [] });
  },

  onFinalNote(e) {
    this.setData({ 'finalForm.solutionNote': e.detail.value });
  },

  submitFactoryClose() {
    const data = this.finalPayload();
    if (!data) return;
    this.runAction({
      endpoint: '/factory-close/',
      data,
      success: '售后服务已结案'
    });
  },

  onThirdInput(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  onThirdMaterials(e) {
    this.setData({ thirdMaterials: e.detail.value || [] });
  },

  submitThirdMaterialShipment() {
    if (!this.data.thirdCompany.trim() || !this.data.thirdTrackingNo.trim() || !this.data.thirdMaterials.length) {
      wx.showToast({ title: '请填写物流信息并选择寄送物料', icon: 'none' });
      return;
    }
    this.runAction({
      purpose: 'THIRD_PARTY_MATERIAL_SHIPMENT_DOCUMENT',
      endpoint: '/third-party/material-shipment/',
      data: {
        logistics_company: this.data.thirdCompany.trim(),
        tracking_no: this.data.thirdTrackingNo.trim(),
        materials: this.data.thirdMaterials
      },
      success: '备件寄送已登记'
    });
  },

  submitThirdExpense() {
    if (!String(this.data.thirdAmount).trim()) {
      wx.showToast({ title: '请填写第三方维修费用', icon: 'none' });
      return;
    }
    this.runAction({
      purpose: 'THIRD_PARTY_FEE_VOUCHER',
      endpoint: '/third-party/expense/',
      data: {
        amount: this.data.thirdAmount,
        remark: this.data.thirdRemark.trim()
      },
      success: '第三方费用已登记'
    });
  },

  submitThirdFaultReturn() {
    if (!this.data.thirdReturnCompany.trim() || !this.data.thirdReturnTrackingNo.trim()) {
      wx.showToast({ title: '请填写故障物料返还物流信息', icon: 'none' });
      return;
    }
    this.runAction({
      purpose: 'THIRD_PARTY_FAULT_MATERIAL_RETURN_DOCUMENT',
      endpoint: '/third-party/fault-material-return/',
      data: {
        logistics_company: this.data.thirdReturnCompany.trim(),
        tracking_no: this.data.thirdReturnTrackingNo.trim()
      },
      success: '故障物料返还已登记'
    });
  },

  openMedia(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.mediaFiles[index];
    if (!item || item.loading) return;
    if (item.localPath) return this.showMedia(item);
    this.setData({ ['mediaFiles[' + index + '].loading']: true });
    const apiRoot = String(app.globalData.apiBase || '').replace(/\/api\/?$/, '');
    wx.downloadFile({
      url: apiRoot + item.url,
      header: app.authHeader(),
      success: res => {
        if (res.statusCode !== 200) {
          wx.showToast({ title: '附件读取失败', icon: 'none' });
          return;
        }
        const ready = { ...item, localPath: res.tempFilePath, loading: false };
        this.setData({ ['mediaFiles[' + index + ']']: ready });
        this.showMedia(ready);
      },
      fail: () => wx.showToast({ title: '附件读取失败', icon: 'none' }),
      complete: () => this.setData({ ['mediaFiles[' + index + '].loading']: false })
    });
  },

  showMedia(item) {
    if (item.media_type === 'IMAGE') {
      return wx.previewImage({ current: item.localPath, urls: [item.localPath] });
    }
    if (item.media_type === 'VIDEO' && wx.previewMedia) {
      return wx.previewMedia({ sources: [{ url: item.localPath, type: 'video' }] });
    }
    wx.openDocument({
      filePath: item.localPath,
      showMenu: true,
      fail: () => wx.showToast({ title: '当前文件无法预览', icon: 'none' })
    });
  },

  backHome() {
    wx.reLaunch({ url: '/pages/home/index/index' });
  }
});
