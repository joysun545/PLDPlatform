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
    listContext: { state: 'task_list' },
    taskList: [],
    attentionCount: 0,
    unreadCount: 0,
    actionPendingCount: 0,
    loading: true,
    refreshing: false,
    loadingMore: false,
    hasMore: false,
    loadError: '',
    hasUpdates: false,
    loadedCount: 0,
    openingId: null
  },

  onLoad() {
    this._unloaded = false;
    this._hasShown = false;
    this._taskUpdatedHandler = () => this.syncTasks();
    app.onTaskUpdated(this._taskUpdatedHandler);
    this.syncTasks();
  },

  onShow() {
    const showGeneration = this._showGeneration = (this._showGeneration || 0) + 1;
    app.ensureLogin((ok) => {
      if (this._unloaded || this._showGeneration !== showGeneration) return;
      if (!ok) {
        this.setData({ loading: false });
        return;
      }
      const summaryOnly = this._hasShown
        && !!(app.globalData.taskListLoaded || app.globalData.taskListLoading);
      this._hasShown = true;
      app.refreshTasks({ summaryOnly });
    });
  },

  onHide() {
    this._showGeneration = (this._showGeneration || 0) + 1;
    if (this.data.openingId && typeof app.nextOperationRootAction === 'function') app.nextOperationRootAction();
    this._openRequestId = (this._openRequestId || 0) + 1;
    this.setData({ openingId: null });
  },

  onUnload() {
    if (this.data.openingId && typeof app.nextOperationRootAction === 'function') app.nextOperationRootAction();
    this._unloaded = true;
    this._showGeneration = (this._showGeneration || 0) + 1;
    this._openRequestId = (this._openRequestId || 0) + 1;
    app.offTaskUpdated(this._taskUpdatedHandler);
  },

  syncTasks() {
    if (this._unloaded) return;
    const generation = app.globalData.taskListGeneration;
    const changed = generation !== this._renderedTaskGeneration;
    this._renderedTaskGeneration = generation;
    const taskList = (app.globalData.taskList || []).map(task => ({
      ...task,
      cardKey: task.group_id || `task:${task.id}`,
      stateText: task.display_state || (task.grouped
        ? (task.unread_count > 0
          ? `${task.unread_count}项未读`
          : (task.action_pending_count > 0 ? '待处理' : '已完成'))
        : (task.state === 'DONE'
          ? '已完成'
          : (task.state === 'READ' ? '已读' : '未读'))),
      // A server stage describes the ongoing business, independently of the
      // inbox row's read/completed state. It never grants an action or badge.
      stateClass: task.display_state ? 'stage' : (task.state === 'DONE'
        ? 'done' : (task.state === 'READ' ? 'read' : 'new')),
      domainName: task.grouped || task.group_kind === 'GOODS_TRANSFER'
        ? (task.group_label || (task.domain === 'AFTERSALE' ? '售后工单' : '业务协同'))
        : (DOMAIN_NAMES[task.domain] || '任务'),
      isWorkorder: !!task.is_workorder,
      isRecallGroup: task.group_kind === 'QUALITY_RECALL',
      isGoodsTransfer: task.group_kind === 'GOODS_TRANSFER'
    }));

    this.setData({
      taskList,
      attentionCount: app.globalData.taskCount || 0,
      unreadCount: app.globalData.taskUnreadCount || 0,
      actionPendingCount: app.globalData.taskActionPendingCount || 0,
      loading: !!app.globalData.taskListLoading && taskList.length === 0,
      refreshing: !!app.globalData.taskListLoading && !app.globalData.taskListLoadingMore,
      loadingMore: !!app.globalData.taskListLoadingMore,
      hasMore: !!app.globalData.taskHasMore,
      loadError: app.globalData.taskListError || '',
      hasUpdates: !!app.globalData.taskListHasUpdates,
      loadedCount: taskList.length,
      openingId: changed ? null : this.data.openingId
    });
  },

  refreshTaskList() {
    if (!this._unloaded) app.refreshTasks();
  },

  loadMore() {
    if (!this._unloaded) app.getTaskList({ append: true });
  },

  retryTaskList() {
    if (app.globalData.taskListErrorIsAppend) this.loadMore();
    else this.refreshTaskList();
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadError) this.loadMore();
  },

  openTask(e) {
    const cardId = Number(e.currentTarget.dataset.id);
    const task = this.data.taskList.find(item => Number(item.id) === cardId);
    const taskId = Number((task || {}).entry_task_id || cardId);
    if (!cardId || !taskId || !task || this.data.openingId || this._unloaded) return;

    const requestId = this._openRequestId = (this._openRequestId || 0) + 1;
    const scope = typeof app.taskQueryScope === 'function' ? app.taskQueryScope() : '';
    const generation = app.globalData.taskListGeneration;

    this.setData({ openingId: cardId });
    const opensGroup = (task.url || '').split('?')[0].replace(/^\//, '') === 'pages/personal/task_group/task_group';
    app.openUserTask(taskId, (response) => {
      if (this._unloaded || requestId !== this._openRequestId
        || (typeof app.taskQueryScope === 'function' && app.taskQueryScope() !== scope)
        || app.globalData.taskListGeneration !== generation) return;
      this.setData({ openingId: null });

      if (!response || response.code !== 0) {
        wx.showToast({
          title: (response && response.msg) || '任务打开失败',
          icon: 'none'
        });
        return;
      }

      const targetUrl = this.resolveTaskUrl(task, response.data);
      if (targetUrl) {
        this.navigateToTask(targetUrl, response.data && response.data.root_organization);
      } else {
        wx.showToast({ title: '任务目标地址缺失', icon: 'none' });
      }
    }, { switchOperationRoot: !!task.url && !opensGroup });
  },

  resolveTaskUrl(task, opened) {
    // Opening a flow card acknowledges its notices and keeps domain actions
    // pending. Use the server's current action link if another collaborator
    // changed the receipt or payment state since this list was loaded.
    if (task.group_kind === 'GOODS_TRANSFER' && opened && opened.link) {
      return opened.link;
    }
    if (task.url) return task.url;
    return '';
  },

  navigateToTask(url, rootOrganization) {
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
      success: ({ eventChannel }) => {
        // A group may contain tasks from several roots. Its own response
        // supplies the group label when all of its children agree.
        const opensGroup = normalizedUrl.split('?')[0] === '/pages/personal/task_group/task_group';
        if (eventChannel && !opensGroup) {
          eventChannel.emit('taskRootOrganization', rootOrganization || null);
        }
      },
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
