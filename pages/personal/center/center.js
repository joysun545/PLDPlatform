// pages/personal/center/center.js
const app = getApp();
const tabBar = typeof require === 'function'
  ? require('../../../utils/tab-bar')
  : { sync() {} };

Page({
  data: {
    avatar_url: '',
    avatar_initial: '微',
    nickname: '',
    role_name: '',
    region: '',
    phone: '',
    company_name: '',
    taskCount: 0,
    operationRoot: null,
    operationRootIndex: 0,
    operationRoots: []
  },

  onLoad() {
    this.loadUserInfo();
    this.syncTasks();
    this._taskUpdatedHandler = () => this.syncTasks();
    app.onTaskUpdated(this._taskUpdatedHandler);
    this._unsubscribeOperationRoot = app.onOperationRootChanged(() => this.syncOperationRoot());
  },

  onShow() {
    tabBar.sync(this, 2);
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
    if (this._unsubscribeOperationRoot) this._unsubscribeOperationRoot();
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
    this.syncOperationRoot();
  },

  syncOperationRoot() {
    const operationRoot = app.globalData.operationRoot;
    const operationRoots = app.operationRootOptions();
    this.setData({
      operationRoot,
      operationRoots,
      operationRootIndex: Math.max(0, operationRoots.findIndex(root => root.id === operationRoot?.id))
    });
  },

  onOperationRootChange(event) {
    const selected = this.data.operationRoots[Number(event.detail.value)];
    if (selected && !app.selectOperationRoot(selected.id)) {
      wx.showToast({ title: '当前链路选项已变化，请重试', icon: 'none' });
    }
  },

  gotoTaskList() {
    wx.navigateTo({
      url: '/pages/personal/task_list/task_list'
    });
  }
});
