// pages/personal/task_list/task_list.js
const app = getApp();

const DOMAIN_NAMES = {
  LOGISTICS: '物流',
  AFTERSALE: '售后服务',
  INSTALL: '装车',
  ACTIVATE: '激活',
  PROFILE: '资料',
  SALES: '销售订单',
  SUPPLY_CHAIN: '供应链',
  SYSTEM: '系统'
};

Page({
  data: {
    taskList: [],
    attentionCount: 0,
    unreadCount: 0,
    actionPendingCount: 0,
    loading: true,
    openingId: null
  },

  onLoad() {
    this._taskUpdatedHandler = () => this.syncTasks();
    app.onTaskUpdated(this._taskUpdatedHandler);
    this.syncTasks();
  },

  onShow() {
    app.ensureLogin((ok) => {
      if (!ok) {
        this.setData({ loading: false });
        return;
      }
      this.setData({ loading: true });
      app.refreshTasks();
    });
  },

  onUnload() {
    app.offTaskUpdated(this._taskUpdatedHandler);
  },

  syncTasks() {
    const taskList = (app.globalData.taskList || []).map(task => ({
      ...task,
      stateText: task.grouped
        ? (task.unread_count > 0
          ? `${task.unread_count}项未读`
          : (task.action_pending_count > 0 ? '待处理' : '已完成'))
        : (task.state === 'DONE'
          ? '已完成'
          : (task.state === 'READ' ? '已读' : '未读')),
      stateClass: task.state === 'DONE'
        ? 'done'
        : (task.state === 'READ' ? 'read' : 'new'),
      domainName: task.grouped
        ? (task.group_label || (task.domain === 'AFTERSALE' ? '售后工单' : '业务协同'))
        : (DOMAIN_NAMES[task.domain] || '任务'),
      isWorkorder: !!task.is_workorder
    }));

    this.setData({
      taskList,
      attentionCount: app.globalData.taskCount || 0,
      unreadCount: app.globalData.taskUnreadCount || 0,
      actionPendingCount: app.globalData.taskActionPendingCount || 0,
      loading: false
    });
  },

  openTask(e) {
    const cardId = Number(e.currentTarget.dataset.id);
    const task = this.data.taskList.find(item => Number(item.id) === cardId);
    const taskId = Number((task || {}).entry_task_id || cardId);
    if (!cardId || !taskId || !task || this.data.openingId) return;

    this.setData({ openingId: cardId });
    app.openUserTask(taskId, (response) => {
      this.setData({ openingId: null });

      if (!response || response.code !== 0) {
        wx.showToast({
          title: (response && response.msg) || '任务打开失败',
          icon: 'none'
        });
        return;
      }

      const targetUrl = this.resolveTaskUrl(task);
      if (targetUrl) {
        this.navigateToTask(targetUrl);
      } else {
        wx.showToast({ title: '任务目标地址缺失', icon: 'none' });
      }
    });
  },

  resolveTaskUrl(task) {
    if (task.url) return task.url;

    // 兼容部署物流功能前已经进入本地任务缓存、但尚未携带 link 的任务。
    if (
      task.type === 'ORDER_PLAN_LOGISTICS_DOCUMENT_UPLOAD' &&
      Number(task.biz_id)
    ) {
      return (
        '/pages/sales/order_logistics/order_logistics' +
        `?order_plan_id=${Number(task.biz_id)}`
      );
    }

    return '';
  },

  navigateToTask(url) {
    const normalizedUrl = url.startsWith('/') ? url : `/${url}`;
    const tabPages = [
      '/pages/home/index/index',
      '/pages/scan/scan/scan',
      '/pages/personal/center/center'
    ];

    if (tabPages.includes(normalizedUrl)) {
      wx.switchTab({ url: normalizedUrl });
      return;
    }

    wx.navigateTo({
      url: normalizedUrl,
      fail: error => {
        console.error('任务页面跳转失败', normalizedUrl, error);
        wx.showModal({
          title: '页面打开失败',
          content: '请确认手机已加载最新预览版小程序后重试。',
          showCancel: false
        });
      }
    });
  }
});
