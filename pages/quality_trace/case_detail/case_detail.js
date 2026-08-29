const qt = require('../../../utils/quality_trace');
Page({
  data: { id: 0, item: {}, loading: true, error: '', reason: '', durationHours: 24, submitting: false },
  onLoad(options) { this.setData({ id: Number(options.id) }); },
  onShow() { if (this.data.id) this.load(); },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const item = await qt.request(`/cases/${this.data.id}/`);
      const actionLabels = { TEMPORARY_HOLD: '临时拦截', FORMAL_HOLD: '正式拦截', RECALL: '召回', RELEASE: '解除管控', WARN: '风险提示' };
      const statusLabels = { ACTIVE: '生效中', COMPLETED: '已完成', EXPIRED: '已到期', REVOKED: '已解除' };
      item.control_actions = (item.control_actions || []).map(action => ({
        ...action,
        action_label: actionLabels[action.action_type] || action.action_type,
        status_label: statusLabels[action.status] || action.status
      }));
      item.has_active_temporary = item.control_actions.some(action => action.action_type === 'TEMPORARY_HOLD' && action.status === 'ACTIVE');
      item.has_active_formal = item.control_actions.some(action => action.action_type === 'FORMAL_HOLD' && action.status === 'ACTIVE');
      item.has_active_recall = item.control_actions.some(action => action.action_type === 'RECALL' && action.status === 'ACTIVE');
      this.setData({ item });
    }
    catch (e) { this.setData({ error: e.message }); }
    this.setData({ loading: false });
  },
  inputReason(e) { this.setData({ reason: e.detail.value }); },
  inputDuration(e) { this.setData({ durationHours: Number(e.detail.value) || 0 }); },
  temporaryHold() { this.caseAction(`/cases/${this.data.id}/temporary-hold/`, { reason: this.data.reason, duration_hours: this.data.durationHours }, '执行临时拦截'); },
  formalHold() { this.caseAction(`/cases/${this.data.id}/formal-hold/`, { reason: this.data.reason }, this.data.item.has_active_temporary ? '升级为正式拦截' : '执行正式拦截'); },
  startRecall() { this.caseAction(`/cases/${this.data.id}/recall/`, { reason: this.data.reason }, this.data.item.has_active_temporary || this.data.item.has_active_formal ? '在拦截生效期间追加召回' : '启动召回行动'); },
  goRecalls() { wx.navigateTo({ url: '/pages/quality_trace/recall_list/recall_list' }); },
  revokeTemporary() { this.caseAction(`/control-actions/${this.data.item.available_actions.revoke_temporary_action_id}/revoke/`, { reason: this.data.reason }, '解除临时拦截'); },
  releaseFormal() { this.caseAction(`/control-actions/${this.data.item.available_actions.release_formal_action_id}/release/`, { reason: this.data.reason }, '解除正式拦截'); },
  completeRecall() { this.caseAction(`/control-actions/${this.data.item.available_actions.complete_recall_action_id}/complete-recall/`, { reason: this.data.reason }, '完成召回控制动作'); },
  async caseAction(path, payload, title) {
    const reason = this.data.reason.trim();
    if (!reason) return wx.showToast({ title: '请填写操作理由', icon: 'none' });
    const confirmed = await new Promise(resolve => wx.showModal({ title, content: '该操作将写入质量审计记录，请确认。', success: r => resolve(r.confirm) }));
    if (!confirmed) return;
    try { this.setData({ submitting: true }); await qt.request(path, 'POST', { ...payload, reason }); wx.showToast({ title: '操作成功' }); this.setData({ reason: '' }); await this.load(); }
    catch (e) { wx.showModal({ title: '操作失败', content: e.message, showCancel: false }); }
    this.setData({ submitting: false });
  }
});
