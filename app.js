App({
  globalData: {
    openid: '',
    access_token: '',
    role: '',
    role_name: '',
    nickname: '',
    avatar_url: '',
    real_name: '',
    phone: '',
    company_name: '',
    organization_id: null,
    organization_type: '',

    brand: '',
    brand_id: '',
    category_id: '',
    region: '',
    apiBase: 'https://joytest.site/pldp/api',

    taskList: [],
    taskCount: 0,

    _isScanning: false,
    _taskTimer: null,
    _taskUpdatedListeners: [],
    _loginInFlight: false,
    _loginWaiters: [],
    _cacheKeyUser: 'PLDP_USER_PROFILE_CACHE_V2',
  },

  onLaunch() {
    this.restoreUserFromCache();
    // 冷启动时必须用 wx.login 换取新令牌，不盲信本地缓存的旧令牌。
    this.globalData.access_token = '';
    this.ensureLogin((ok) => {
      if (!ok) return;
      this.autoRedirectIfLogged();
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

  restoreUserFromCache() {
    try {
      const data = wx.getStorageSync(this.globalData._cacheKeyUser);
      if (data && typeof data === 'object') {
        Object.assign(this.globalData, {
          openid: data.openid || '',
          access_token: data.access_token || '',
          role: data.role || '',
          role_name: data.role_name || '',
          nickname: data.nickname || '',
          avatar_url: data.avatar_url || '',
          real_name: data.real_name || '',
          phone: data.phone || '',
          company_name: data.company_name || '',
          organization_id: data.organization_id || null,
          organization_type: data.organization_type || '',
          brand: data.brand || '',
          brand_id: data.brand_id || '',
          category_id: data.category_id || '',
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
        access_token: g.access_token || '',
        role: g.role || '',
        role_name: g.role_name || '',
        nickname: g.nickname || '',
        avatar_url: g.avatar_url || '',
        real_name: g.real_name || '',
        phone: g.phone || '',
        company_name: g.company_name || '',
        organization_id: g.organization_id || null,
        organization_type: g.organization_type || '',
        brand: g.brand || '',
        brand_id: g.brand_id || '',
        category_id: g.category_id || '',
        region: g.region || ''
      });
    } catch (e) {}
  },

  clearUserCache() {
    try {
      wx.removeStorageSync(this.globalData._cacheKeyUser);
    } catch (e) {}
  },

  reauthenticate() {
    this.globalData.access_token = '';
    this.saveUserToCache();
    this.ensureLogin();
  },

  applyUserPayload(data = {}) {
    Object.assign(this.globalData, {
      openid: data.openid || this.globalData.openid || '',
      role: data.role || 'tourist',
      role_name: data.role_name || '游客',
      nickname: data.nickname || '',
      avatar_url: data.avatar_url || '',
      real_name: '',
      phone: data.phone || '',
      company_name: data.company_name || '',
      organization_id: data.organization_id || null,
      organization_type: data.organization_type || '',
      brand: data.brand_name || data.brand || '',
      brand_id: data.brand_id || '',
      category_id: data.category_id || '',
      region: data.region || ''
    });
    this.saveUserToCache();
  },

  authHeader(contentType = 'application/x-www-form-urlencoded') {
    const header = {};
    if (contentType) {
      header['content-type'] = contentType;
    }
    if (this.globalData.access_token) {
      header.Authorization = `Bearer ${this.globalData.access_token}`;
    }
    return header;
  },

  refreshUserProfile(callback) {
    if (!this.globalData.access_token) {
      callback && callback(false);
      return;
    }

    wx.request({
      url: `${this.globalData.apiBase}/account/profile/`,
      method: 'GET',
      header: this.authHeader(),
      success: (res) => {
        if (res.statusCode === 401) {
          this.reauthenticate();
          callback && callback(false);
          return;
        }
        if (res.data && res.data.code === 0 && res.data.data) {
          this.applyUserPayload(res.data.data);
          callback && callback(true);
          return;
        }
        callback && callback(false);
      },
      fail: () => callback && callback(false)
    });
  },

  ensureLogin(cb) {
    if (this.globalData.openid && this.globalData.access_token) {
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
      const ok = !!(
        this.globalData.openid && this.globalData.access_token
      );
      waiters.forEach(fn => fn && fn(ok));
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
      'pages/aftersale/detail/detail',
      'pages/home/invite/invite/invite',
      'pages/home/invite/accept/accept',
      'pages/personal/center/center',
      'pages/personal/edit/edit',
      'pages/personal/task_list/task_list'
    ];
    if (protectedRoutes.includes(currentRoute)) return;

    const manageRoles = [
      'factory_admin',
      'factory_sales',
      'factory_matching',
      'merchant_owner',
      'merchant_senior_manager',
      'merchant_sales',
      'supplier_owner',
      'service_owner'
    ];
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
    if (!openid || !this.globalData.access_token) return;

    wx.request({
      url: `${this.globalData.apiBase}/workflow/task/summary/`,
      method: 'GET',
      header: this.authHeader(),
      success: (res) => {
        if (res.statusCode === 401) {
          this.reauthenticate();
          return;
        }
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
      header: this.authHeader(),
      data: { limit: 50 },
      success: (res) => {
        if (res.statusCode === 401) {
          this.reauthenticate();
          return;
        }
        if (!res.data || res.data.code !== 0) return;
        const items = (res.data.data && res.data.data.items) || [];
        this.globalData.taskList = items.map(it => ({
          id: it.id,
          title: it.title,
          summary: it.summary || '',
          url: it.link || '',
          isNew: it.state === 'NEW',
          state: it.state,
          need_action: it.need_action,
          cursor_time: it.cursor_time,
          domain: it.domain || '',
          action_mode: it.action_mode || ''
        }));
        this._emitTaskUpdated();
      }
    });
  },

  openUserTask(usertaskId, cb) {
    const openid = this.globalData.openid;
    const accessToken = this.globalData.access_token;
    if (!openid || !accessToken || !usertaskId) {
      cb && cb({ code: 401, msg: '登录状态已失效，请重新进入小程序' });
      return;
    }

    wx.request({
      url: `${this.globalData.apiBase}/workflow/task/open/`,
      method: 'POST',
      header: this.authHeader(),
      data: { usertask_id: usertaskId },
      success: (res) => {
        if (res.statusCode === 401) {
          this.reauthenticate();
        }
        cb && cb(res.data);
        this.refreshTasks();
      },
      fail: () => {
        cb && cb({ code: 1, msg: '网络请求失败' });
      }
    });
  },

  onTaskUpdated(cb) {
    if (
      typeof cb === 'function' &&
      !this.globalData._taskUpdatedListeners.includes(cb)
    ) {
      this.globalData._taskUpdatedListeners.push(cb);
    }
  },

  offTaskUpdated(cb) {
    this.globalData._taskUpdatedListeners =
      this.globalData._taskUpdatedListeners.filter(fn => fn !== cb);
  },

  _emitTaskUpdated() {
    this.globalData._taskUpdatedListeners
      .slice()
      .forEach(fn => fn());
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
        if (!res.code) {
          callback && callback(false);
          return;
        }

        wx.request({
          url: `${this.globalData.apiBase}/account/login/`,
          method: 'POST',
          data: { code: res.code },
          header: { 'content-type': 'application/x-www-form-urlencoded' },
          success: resp => {
            const responseData = resp.data || {};
            if (
              responseData.code === 0 &&
              responseData.openid &&
              responseData.access_token
            ) {
              this.globalData.access_token = responseData.access_token;
              this.applyUserPayload(responseData);

              if (!this.globalData._isScanning) {
                this.autoRedirectIfLogged();
              }

              this.refreshTasks();
              callback && callback(true);
            } else {
              wx.showToast({
                title: responseData.msg || '登录失败',
                icon: 'none'
              });
              callback && callback(false);
            }
          },
          fail: (e) => {
            wx.showToast({ title: e.errMsg || '网络错误', icon: 'none' });
            callback && callback(false);
          }
        });
      },
      fail: () => {
        callback && callback(false);
      }
    });
  }
});
