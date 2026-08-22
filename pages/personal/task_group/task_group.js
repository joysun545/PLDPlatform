const app = getApp();

const DOMAIN_NAMES = {
  LOGISTICS: '物流',
  AFTERSALE: '售后',
  INSTALL: '装车',
  ACTIVATE: '激活',
  PROFILE: '资料',
  SALES: '销售订单',
  SUPPLY_CHAIN: '供应链',
  SYSTEM: '系统'
};

Page({
  data: {
    groupId: '',
    group: null,
    tasks: [],
    loading: true,
    openingId: null
  },

  onLoad(options) {
    this.setData({ groupId: decodeURIComponent(options.group_id || '') });
  },

  onShow() {
    app.ensureLogin((ok) => {
      if (!ok) {
        this.setData({ loading: false });
        return;
      }
      this.loadGroup();
    });
  },

  loadGroup() {
    if (!this.data.groupId) {
      this.setData({ loading: false });
      wx.showToast({ title: '任务组参数缺失', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    app.fetchTaskGroup(this.data.groupId, (response) => {
      if (!response || response.code !== 0) {
        this.setData({ loading: false });
        wx.showToast({
          title: (response && response.msg) || '任务详情加载失败',
          icon: 'none'
        });
        return;
      }

      const group = response.data || {};
      const tasks = (group.items || []).map(item => ({
        ...item,
        domainName: DOMAIN_NAMES[item.domain] || '任务',
        stateClass: item.state === 'DONE'
          ? 'done'
          : (item.state === 'READ' ? 'read' : 'new'),
        stateText: item.state === 'DONE'
          ? (item.need_action ? '已完成' : '已知晓')
          : (item.need_action
            ? (item.state === 'READ' ? '待处理' : '未读·待处理')
            : '未读'),
        actionText: item.state === 'DONE'
          ? (item.need_action ? '查看结果' : '已知晓，可再次查看')
          : (item.need_action ? '查看并处理' : '点击查看并知晓')
      }));

      this.setData({ group, tasks, loading: false });
    });
  },

  openChildTask(e) {
    const taskId = Number(e.currentTarget.dataset.id);
    const task = this.data.tasks.find(item => Number(item.id) === taskId);
    if (!taskId || !task || this.data.openingId) return;

    this.setData({ openingId: taskId });
    app.openUserTask(taskId, (response) => {
      this.setData({ openingId: null });
      if (!response || response.code !== 0) {
        wx.showToast({
          title: (response && response.msg) || '任务打开失败',
          icon: 'none'
        });
        return;
      }

      if (task.link) {
        this.navigateToTask(task.link);
        return;
      }

      wx.showToast({ title: '已记录知晓', icon: 'success' });
      this.loadGroup();
    });
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
        console.error('子任务页面跳转失败', normalizedUrl, error);
        wx.showModal({
          title: '页面打开失败',
          content: '请确认手机已加载最新预览版小程序后重试。',
          showCancel: false
        });
      }
    });
  }
});
