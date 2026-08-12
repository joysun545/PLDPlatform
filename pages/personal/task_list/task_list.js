// pages/personal/task_list/task_list.js
const app = getApp();

const DOMAIN_NAMES = {
  LOGISTICS: '物流',
  AFTERSALE: '售后',
  INSTALL: '装车',
  ACTIVATE: '激活',
  PROFILE: '资料',
  SALES: '销售订单',
  SYSTEM: '系统'
};

Page({
  data: {
    taskList: [],
    unreadCount: 0,
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
      stateText: task.state === 'DONE'
        ? '已完成'
        : (task.state === 'READ' ? '已读' : '未读'),
      stateClass: task.state === 'DONE'
        ? 'done'
        : (task.state === 'READ' ? 'read' : 'new'),
      domainName: DOMAIN_NAMES[task.domain] || '任务'
    }));

    this.setData({
      taskList,
      unreadCount: app.globalData.taskCount || 0,
      loading: false
    });
  },

  openTask(e) {
    const task = e.currentTarget.dataset.task;
    if (!task || this.data.openingId) return;

    this.setData({ openingId: task.id });
    app.openUserTask(task.id, (response) => {
      this.setData({ openingId: null });

      if (!response || response.code !== 0) {
        wx.showToast({
          title: (response && response.msg) || '任务打开失败',
          icon: 'none'
        });
        return;
      }

      if (task.url) {
        this.navigateToTask(task.url);
      } else {
        wx.showToast({ title: '任务已更新', icon: 'success' });
      }
    });
  },

  navigateToTask(url) {
    const tabPages = [
      '/pages/home/index/index',
      '/pages/scan/scan/scan',
      '/pages/personal/center/center'
    ];

    if (tabPages.includes(url)) {
      wx.switchTab({ url });
      return;
    }

    wx.navigateTo({
      url,
      fail: () => {
        wx.showToast({ title: '任务目标页面尚未开放', icon: 'none' });
      }
    });
  }
});
