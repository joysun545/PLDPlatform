// app.js
App({
  globalData: {
    openid: '',
    role: '',
    role_name: '',
    nickname: '',
    avatar_url: '',
    real_name: '',
    phone: '',
    company_name: '',

    // ✅ 品牌：兼容旧字段 brand（用来放 brand_name），新增 brand_id
    brand: '',
    brand_id: '',

    region: '',
    apiBase: 'https://joytest.site/pldp/api',   // ← 已改为新项目地址

    taskList: [],
    taskCount: 0,

    _isScanning: false,
    _taskTimer: null,
    _loginInFlight: false,
    _loginWaiters: [],
    _cacheKeyUser: 'PLDP_USER_PROFILE_CACHE_V1',
  },

  onLaunch() {
    this.restoreUserFromCache();
    this.autoRedirectIfLogged();
    this.login(() => {
      this.startTaskPolling();
    });
  },

  onShow() {
    if (this.globalData._isScanning) return;
    this.autoRedirectIfLogged();
    this.startTaskPolling();
  },

  onHide() {
    this.stopTaskPolling();
  },

  // =========================
  // 本地缓存
  // =========================
  restoreUserFromCache() {
    try {
      const data = wx.getStorageSync(this.globalData._cacheKeyUser);
      if (data && typeof data === 'object') {
        Object.assign(this.globalData, {
          openid: data.openid || '',
          role: data.role || '',
          role_name: data.role_name || '',
          nickname: data.nickname || '',
          avatar_url: data.avatar_url || '',
          real_name: data.real_name || '',
          phone: data.phone || '',
          brand: data.brand || '',
          brand_id: data.brand_id || '',
          company_name: data.company_name || '',
          region: data.region || ''
        });
      }
    } catch (e) {}
  },

  saveUserToCache() {
    try {
      const g = this.globalData;
      wx.setStorageSync(this.globalData._cacheKeyUser, {
        openid: g.openid || '',
        role: g.role || '',
        role_name: g.role_name || '',
        nickname: g.nickname || '',
        avatar_url: g.avatar_url || '',
        real_name: g.real_name || '',
        phone: g.phone || '',
        brand: g.brand || '',
        brand_id: g.brand_id || '',
        company_name: g.company_name || '',
        region: g.region || ''
      });
    } catch (e) {}
  },

  clearUserCache() {
    try {
      wx.removeStorageSync(this.globalData._cacheKeyUser);
    } catch (e) {}
  },

  // =========================
  // 登录保障
  // =========================
  ensureLogin(cb) {
    if (this.globalData.openid) {
      cb && cb(true);
      return;
    }
    if (this.globalData._loginInFlight) {
      this.globalData._loginWaiters.push(cb);
      return;
    }
    this.globalData._loginInFlight = true;
    this.globalData._loginWaiters.push(cb);

    this.login(() => {
      const waiters = this.globalData._loginWaiters.slice();
      this.globalData._loginWaiters = [];
      this.globalData._loginInFlight = false;
      waiters.forEach(fn => fn && fn(!!this.globalData.openid));
    });
  },

  autoRedirectIfLogged() {
    const role = this.globalData.role;
    if (!role) return;

    const pages = getCurrentPages();
    const currentRoute = pages.length ? pages[pages.length - 1].route : '';

    const protectedRoutes = [
      'pages/stock/batch_scan/batch_scan',
      'pages/scan/scan/scan',
      'pages/scan/scan_router/scan_router',
      'pages/scan/scan_result/public/public',
      'pages/scan/scan_result/installer/installer',
      'pages/scan/scan_result/user/user',
      'pages/scan/scan_result/other/other',
      'pages/aftersale/list/list',
      'pages/aftersale/detail/detail'
    ];
    if (protectedRoutes.includes(currentRoute)) return;

    const manageRoles = ['admin', 'factory_sales', 'dealer', 'dealer_sales'];
    if (manageRoles.includes(role)) {
      if (currentRoute !== 'pages/home/index/index') {
        wx.switchTab({ url: '/pages/home/index/index' });
      }
    }
  },

  updateTabBarBadge() {
    const count = this.globalData.taskCount;
    const index = 2;
    if (count > 0) {
      wx.setTabBarBadge({
        index,
        text: count > 99 ? '99+' : String(count)
      });
    } else {
      wx.removeTabBarBadge({ index });
    }
  },

  // =========================
  // 任务轮询
  // =========================
  startTaskPolling() {
    if (this.globalData._taskTimer) return;
    this.refreshTasks();
    this.globalData._taskTimer = setInterval(() => {
      this.refreshTasks();
    }, 15000);
  },

  stopTaskPolling() {
    if (this.globalData._taskTimer) {
      clearInterval(this.globalData._taskTimer);
      this.globalData._taskTimer = null;
    }
  },

  refreshTasks() {
    const openid = this.globalData.openid;
    if (!openid) return;

    wx.request({
      url: `${this.globalData.apiBase}/workflow/task/summary/`,
      method: 'GET',
      data: { openid },
      success: (res) => {
        if (!res.data || res.data.code !== 0) return;
        const unread = (res.data.data && res.data.data.unread_count) || 0;
        this.globalData.taskCount = unread;
        this.updateTabBarBadge();
        this._emitTaskUpdated();
      }
    });

    wx.request({
      url: `${this.globalData.apiBase}/workflow/task/list/`,
      method: 'GET',
      data: { openid, limit: 50 },
      success: (res) => {
        if (!res.data || res.data.code !== 0) return;
        const items = (res.data.data && res.data.data.items) || [];
        this.globalData.taskList = items.map(it => ({
          id: it.id,
          title: it.title,
          url: it.link || '',
          isNew: it.state === 'NEW',
          state: it.state,
          need_action: it.need_action,
          cursor_time: it.cursor_time
        }));
        this._emitTaskUpdated();
      }
    });
  },

  openUserTask(usertaskId, cb) {
    const openid = this.globalData.openid;
    if (!openid || !usertaskId) return;

    wx.request({
      url: `${this.globalData.apiBase}/workflow/task/open/`,
      method: 'POST',
      header: { 'content-type': 'application/x-www-form-urlencoded' },
      data: { openid, usertask_id: usertaskId },
      success: (res) => {
        cb && cb(res.data);
        this.refreshTasks();
      }
    });
  },

  onTaskUpdated(cb) {
    this._taskUpdatedCb = cb;
  },
  _emitTaskUpdated() {
    if (typeof this._taskUpdatedCb === 'function') {
      this._taskUpdatedCb();
    }
  },

  markTaskRead(taskId) {
    const task = this.globalData.taskList.find(t => t.id === taskId);
    if (task && task.isNew) {
      task.isNew = false;
      this.globalData.taskCount = Math.max(0, this.globalData.taskCount - 1);
      this.updateTabBarBadge();
      this._emitTaskUpdated();
    }
  },

  login(callback) {
    wx.login({
      success: res => {
        if (!res.code) return;
        console.log("LOGIN_URL =", `${this.globalData.apiBase}/account/login/`);

        wx.request({
          url: `${this.globalData.apiBase}/account/login/`,
          method: 'POST',
          data: { code: res.code },
          header: { 'content-type': 'application/x-www-form-urlencoded' },
          success: resp => {
            if (resp.data.code === 0 && resp.data.openid) {
              Object.assign(this.globalData, {
                openid: resp.data.openid,
                role: resp.data.role || 'tourist',
                role_name: resp.data.role_name || '',
                nickname: resp.data.nickname || '',
                avatar_url: resp.data.avatar_url || '',
                real_name: resp.data.real_name || '',
                phone: resp.data.phone || '',
                brand: resp.data.brand_name || resp.data.brand || '',
                brand_id: resp.data.brand_id || '',
                company_name: resp.data.company_name || '',
                region: resp.data.region || ''
              });

              this.saveUserToCache();

              if (!this.globalData._isScanning) {
                this.autoRedirectIfLogged();
              }

              this.refreshTasks();

              if (callback) callback();
            } else {
              wx.showToast({ title: resp.data.msg || '登录失败', icon: 'none' });
            }
          },
          fail: (e) => {
            wx.showToast({ title: e.errMsg || '网络错误', icon: 'none' });
          }
        });
      }
    });
  }
});
