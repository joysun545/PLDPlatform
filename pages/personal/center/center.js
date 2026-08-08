// pages/personal/center/center.js
const app = getApp();

Page({
  data: {
    avatar_url: '',
    avatar_initial: '微',
    nickname: '',
    role_name: '',
    region: '',
    phone: '',
    company_name: '',
    taskCount: 0
  },

  onLoad() {
    this.loadUserInfo();
    this.syncTasks();
    this._taskUpdatedHandler = () => this.syncTasks();
    app.onTaskUpdated(this._taskUpdatedHandler);
  },

  onShow() {
    this.loadUserInfo();
    this.syncTasks();

    app.ensureLogin((ok) => {
      if (!ok) return;
      app.refreshUserProfile(() => this.loadUserInfo());
      app.refreshTasks();
    });
  },

  onUnload() {
    app.offTaskUpdated(this._taskUpdatedHandler);
  },

  loadUserInfo() {
    const nickname = app.globalData.nickname || '';
    this.setData({
      avatar_url: app.globalData.avatar_url || '',
      avatar_initial: nickname ? nickname.substring(0, 1) : '微',
      nickname: nickname || '未设置',
      role_name: app.globalData.role_name || '游客',
      region: app.globalData.region || '未设置',
      phone: app.globalData.phone || '',
      company_name: app.globalData.company_name || ''
    });
  },

  syncTasks() {
    this.setData({
      taskCount: app.globalData.taskCount || 0
    });
  },

  gotoTaskList() {
    wx.navigateTo({
      url: '/pages/personal/task_list/task_list'
    });
  }
});
