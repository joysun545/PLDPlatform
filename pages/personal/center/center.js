// pages/personal/center/center.js
const app = getApp();

/**
 * iOS 兼容的时间解析：
 * - 后端可能返回 "2026-02-04 12:45" 或 "2026-02-04 12:45:55"
 * - iOS 更稳：把 "-" 换成 "/"，并给缺失的秒补 ":00"
 */
function parseTime(s) {
  if (!s) return 0;

  let t = String(s).trim().replace(/-/g, '/');

  // "yyyy/MM/dd HH:mm" -> 补秒
  if (/^\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}$/.test(t)) {
    t += ':00';
  }

  const ms = Date.parse(t);
  return isNaN(ms) ? 0 : ms;
}

Page({
  data: {
    avatar_url: '',
    nickname: '',
    role_name: '',
    region: '',
    real_name: '',
    phone: '',
    company_name: '',
    taskCount: 0,
    taskList: [],
    showTaskModal: false
  },

  onLoad() {
    this.loadUserInfo();
    this.syncTasks();

    // ✅ 订阅全局任务更新（app.js 轮询刷新后会触发）
    app.onTaskUpdated(() => {
      this.syncTasks();
    });
  },

  onShow() {
    this.loadUserInfo();
    this.syncTasks();

    // ✅ 保险：每次进入页面也主动刷新一次任务
    if (app.refreshTasks) app.refreshTasks();
  },

  loadUserInfo() {
    this.setData({
      avatar_url: app.globalData.avatar_url || '',
      nickname: app.globalData.nickname || '未设置',
      role_name: app.globalData.role_name || '未设置',
      region: app.globalData.region || '未设置',
      real_name: app.globalData.real_name || '',
      phone: app.globalData.phone || '',
      company_name: app.globalData.company_name || ''
    });
  },

  // 同步任务到页面（并排序：最新在上）
  syncTasks() {
    const list = (app.globalData.taskList || []).slice();

    // ✅ 按 cursor_time 倒序（没有 cursor_time 就按 id 倒序兜底）
    // ✅ iOS 兼容：不要直接 new Date("2026-02-03 03:14")
    list.sort((a, b) => {
      const ta = a.cursor_time ? parseTime(a.cursor_time) : 0;
      const tb = b.cursor_time ? parseTime(b.cursor_time) : 0;

      // 时间都解析不到就用 id 兜底
      if (!ta && !tb) return (b.id || 0) - (a.id || 0);
      if (!ta) return 1;
      if (!tb) return -1;
      return tb - ta;
    });

    this.setData({
      taskList: list,
      taskCount: app.globalData.taskCount || 0
    });
  },

  openTaskModal() {
    this.setData({ showTaskModal: true });
  },

  closeTaskModal() {
    this.setData({ showTaskModal: false });
  },

  // 点开任务：✅ 后端 open -> 触发“知道类完成/或标记已读”
  openTaskDetail(e) {
    const task = e.currentTarget.dataset.task;
    if (!task) return;

    const usertaskId = task.id;

    // 先跳转（体验更顺）
    wx.navigateTo({
      url: task.url
        ? task.url
        : `/pages/personal/task_list/task_list`
    });

    // ✅ 通知后端“我点开了”
    if (app.openUserTask) {
      app.openUserTask(usertaskId, () => {
        // 打开弹窗列表时也能即时更新红点
        this.syncTasks();
      });
    } else {
      // 兼容旧逻辑
      app.markTaskRead && app.markTaskRead(usertaskId);
      this.syncTasks();
    }
  },

  gotoTaskList() {
    wx.navigateTo({ url: '/pages/personal/task_list/task_list' });
    this.closeTaskModal();
  }
});