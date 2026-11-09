const theme = typeof require === 'function'
  ? require('./utils/theme')
  : {
      normalize: value => value || { color_scheme: 'jade', style_scheme: 'flow' },
      readPersonalAppearance: () => null,
      savePersonalAppearance: () => false,
      apply: value => value || { color_scheme: 'jade', style_scheme: 'flow' }
    };

function confirmedRoot(root) {
  const id = Number(root && root.id);
  const name = root && typeof root.name === 'string' ? root.name.trim() : '';
  return Number.isSafeInteger(id) && id > 0 && name ? { id, name } : null;
}

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
    organization_name: '',
    organization_id: null,
    factory_root_id: null,
    factory_root_name: '',
    operationRoot: null,
    is_platform_admin: false,
    organization_type: '',
    delegated_role_codes: [],
    organizationAppearance: theme.normalize(),
    appearance: theme.normalize(),

    brand: '',
    brand_id: '',
    category_id: '',
    region: '',
    apiBase: 'https://joytest.site/pldp/api',

    taskList: [],
    taskUnreadCount: 0,
    taskActionPendingCount: 0,
    taskCount: 0,
    taskNextCursor: '',
    taskHasMore: false,
    taskListLoading: false,
    taskListLoadingMore: false,
    taskListLoaded: false,
    taskListError: '',
    taskListErrorIsAppend: false,
    taskListHasUpdates: false,
    taskListGeneration: 0,
    taskListRevision: '',
    taskGroupCount: 0,

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
          organization_name: data.organization_name || (data.appearance && data.appearance.owner_organization_name) || '',
          organization_id: data.organization_id || null,
          factory_root_id: data.factory_root_id || (data.appearance && data.appearance.owner_organization_id) || null,
          factory_root_name: data.factory_root_name || (data.appearance && data.appearance.owner_organization_name) || '',
          is_platform_admin: !!data.is_platform_admin,
          organization_type: data.organization_type || '',
          delegated_role_codes: Array.isArray(data.delegated_role_codes)
            ? data.delegated_role_codes
            : [],
          organizationAppearance: theme.normalize(data.appearance),
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
        organization_name: g.organization_name || '',
        organization_id: g.organization_id || null,
        factory_root_id: g.factory_root_id || null,
        factory_root_name: g.factory_root_name || '',
        is_platform_admin: !!g.is_platform_admin,
        organization_type: g.organization_type || '',
        delegated_role_codes: Array.isArray(g.delegated_role_codes)
          ? g.delegated_role_codes
          : [],
        appearance: theme.normalize(g.organizationAppearance),
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
    this._ensureTaskScope();
    this.saveUserToCache();
    this.ensureLogin();
  },

  applyUserPayload(data = {}) {
    const nextOrganizationId = data.organization_id || null;
    const sameOrganization = String(nextOrganizationId || '') === String(this.globalData.organization_id || '');
    const sameAccount = !data.openid || data.openid === this.globalData.openid;
    const appearance = theme.normalize(data.appearance
      || (sameAccount && sameOrganization ? this.globalData.organizationAppearance : null));
    Object.assign(this.globalData, {
      openid: data.openid || this.globalData.openid || '',
      role: data.role || 'tourist',
      role_name: data.role_name || '游客',
      nickname: data.nickname || '',
      avatar_url: data.avatar_url || '',
      real_name: '',
      phone: data.phone || '',
      company_name: data.company_name || '',
      organization_name: data.organization_name || (data.organization && data.organization.name) || (appearance && appearance.owner_organization_name) || (sameOrganization ? this.globalData.organization_name : ''),
      organization_id: nextOrganizationId,
      factory_root_id: data.factory_root_id || (appearance && appearance.owner_organization_id) || null,
      factory_root_name: data.factory_root_name || (appearance && appearance.owner_organization_name) || '',
      is_platform_admin: !!data.is_platform_admin,
      organization_type: data.organization_type || '',
      delegated_role_codes: Array.isArray(data.delegated_role_codes)
        ? data.delegated_role_codes
        : [],
      brand: data.brand_name || data.brand || '',
      brand_id: data.brand_id || '',
      category_id: data.category_id || '',
      region: data.region || '',
      organizationAppearance: appearance
    });
    this.syncOperationRoot(data);
    this._ensureTaskScope();
    this.saveUserToCache();
  },

  personalAppearanceKey() {
    const { openid, access_token: accessToken, operationRoot } = this.globalData;
    return openid && accessToken
      ? `PLDP_PERSONAL_APPEARANCE_V1:${JSON.stringify([openid, operationRoot?.id || null])}` : '';
  },

  refreshOperationAppearance() {
    const { operationRoot, organizationAppearance } = this.globalData;
    const inheritsOrganization = operationRoot
      && operationRoot.id === Number(organizationAppearance.owner_organization_id);
    const appearance = theme.normalize({
      ...(inheritsOrganization ? organizationAppearance : theme.normalize()),
      ...theme.readPersonalAppearance(this.personalAppearanceKey())
    });
    this.globalData.appearance = appearance;
    theme.apply(appearance, { persist: false });
  },

  savePersonalAppearance(key, value) {
    if (!key || key !== this.personalAppearanceKey() || !theme.savePersonalAppearance(key, value)) return false;
    this.refreshOperationAppearance();
    return true;
  },

  applyOrganizationAppearance(value) {
    this.globalData.organizationAppearance = theme.normalize(value);
    this.refreshOperationAppearance();
    this.saveUserToCache();
  },

  syncOperationRoot(profile) {
    const accountRoot = confirmedRoot({ id: profile.factory_root_id, name: profile.factory_root_name });
    const organizationId = Number(profile.organization_id);
    const openid = this.globalData.openid;
    const scope = accountRoot && openid && organizationId > 0
      ? JSON.stringify([openid, organizationId, accountRoot.id, this.globalData.role]) : '';

    if (this._operationRootScope === scope) {
      if (accountRoot) this._operationRootOptions.set(accountRoot.id, accountRoot);
      if (accountRoot && this.globalData.operationRoot?.id === accountRoot.id) {
        this.setOperationRoot(accountRoot, false);
      } else {
        this.refreshOperationAppearance();
      }
      return;
    }

    this._operationRootScope = scope;
    this._operationRootOptions = new Map();
    this.nextOperationRootAction();
    if (!scope) {
      this.setOperationRoot(null, false);
      return;
    }

    this._operationRootOptions.set(accountRoot.id, accountRoot);
    let previous = null;
    if (organizationId !== accountRoot.id) {
      try {
        previous = confirmedRoot(wx.getStorageSync(`PLDP_OPERATION_ROOT_V1:${scope}`));
      } catch (e) {}
    }
    this.setOperationRoot(previous && previous.id !== accountRoot.id ? previous : accountRoot, false);
  },

  nextOperationRootAction() {
    this._operationRootAction = (this._operationRootAction || 0) + 1;
    return this._operationRootAction;
  },

  setOperationRoot(root, remember = true) {
    if (root) this._operationRootOptions.set(root.id, root);
    this.globalData.operationRoot = root;
    if (remember && this._operationRootScope && root) {
      try {
        wx.setStorageSync(`PLDP_OPERATION_ROOT_V1:${this._operationRootScope}`, root);
      } catch (e) {}
    }
    this.refreshOperationAppearance();
    (this._operationRootListeners || []).slice().forEach(listener => listener());
  },

  operationRootOptions() {
    return this._operationRootOptions ? [...this._operationRootOptions.values()] : [];
  },

  selectOperationRoot(id) {
    const root = this._operationRootOptions?.get(Number(id));
    if (!this.globalData.access_token || !this._operationRootScope || !root) return false;
    this.nextOperationRootAction();
    this.setOperationRoot(root);
    return true;
  },

  onOperationRootChanged(listener) {
    if (!this._operationRootListeners) this._operationRootListeners = [];
    this._operationRootListeners.push(listener);
    return () => {
      this._operationRootListeners = this._operationRootListeners.filter(item => item !== listener);
    };
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
    const accessToken = this.globalData.access_token;
    if (!accessToken) {
      callback && callback(false);
      return;
    }
    const rootScope = this._operationRootScope;

    wx.request({
      url: `${this.globalData.apiBase}/account/profile/`,
      method: 'GET',
      header: this.authHeader(),
      success: (res) => {
        if (this.globalData.access_token !== accessToken || this._operationRootScope !== rootScope) {
          callback && callback(false);
          return;
        }
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

    // Material pages are explicit destinations, never the default landing
    // page. Keep an authorized reader here when the app returns to foreground.
    const materialRoutes = [
      'pages/material_inventory/list/list',
      'pages/material_inventory/detail/detail',
      'pages/material_inventory/form/form',
      'pages/material_inventory/warranty_list/warranty_list'
    ];
    if (materialRoutes.includes(currentRoute)) {
      const canManageMaterials = role === 'factory_material_stock';
      const canReadMaterials = canManageMaterials || ['supplier_owner', 'supplier_sales'].includes(role);
      const isMaterialForm = currentRoute === 'pages/material_inventory/form/form';
      if (!(isMaterialForm ? canManageMaterials : canReadMaterials)) {
        wx.switchTab({ url: role === 'tourist' ? '/pages/scan/scan/scan' : '/pages/home/index/index' });
      }
      return;
    }

    const protectedRoutes = [
      'pages/stock/batch_scan/batch_scan',
      'pages/stock/goods_transfer/goods_transfer',
      'pages/stock/goods_transfer_list/goods_transfer_list',
      'pages/stock/goods_transfer_detail/goods_transfer_detail',
      'pages/stock/goods_transfer_settlement/goods_transfer_settlement',
      'pages/stock/goods_transfer_accounts/goods_transfer_accounts',
      'pages/stock/factory_return_process/factory_return_process',
      'pages/stock/factory_return_inventory/factory_return_inventory',
      'pages/stock/recovered_machine/recovered_machine',
      'pages/scan/scan/scan',
      'pages/scan/result/result',
      'pages/aftersale/list/list',
      'pages/aftersale/detail/detail',
      'pages/aftersale/service_station/application/application',
      'pages/aftersale/service_station/review/review',
      'pages/aftersale/material_return/material_return',
      'pages/customer/aftersale/detail/detail',
      'pages/home/invite/invite/invite',
      'pages/home/invite/accept/accept',
      'pages/common/agreement/agreement',
      'pages/common/privacy/privacy',
      'pages/home/edit/edit',
      'pages/personal/center/center',
      'pages/personal/edit/edit',
      'pages/personal/task_list/task_list',
      'pages/personal/task_group/task_group',
      'pages/sales/create_plan/create_plan',
      'pages/sales/order_plan_list/order_plan_list',
      'pages/sales/order_plan_detail/order_plan_detail',
      'pages/sales/replacement_supply/replacement_supply',
      'pages/material_inventory/order_delivery_receipt/order_delivery_receipt',
      'pages/supply_chain/responsibility/responsibility',
      'pages/supply_chain/warranty_list/warranty_list',
      'pages/supply_chain/warranty_notice/warranty_notice',
      'pages/supply_chain/aftersale_quality_notice/aftersale_quality_notice',
      'pages/supply_chain/aftersale_quality_list/aftersale_quality_list',
      'pages/quality_trace/dashboard/dashboard',
      'pages/quality_trace/rule_list/rule_list',
      'pages/quality_trace/rule_detail/rule_detail',
      'pages/quality_trace/alert_list/alert_list',
      'pages/quality_trace/alert_detail/alert_detail',
      'pages/quality_trace/case_list/case_list',
      'pages/quality_trace/case_detail/case_detail',
      'pages/quality_trace/recall_list/recall_list',
      'pages/quality_trace/recall_detail/recall_detail',
      'pages/quality_trace/recall_handover_accept/recall_handover_accept',
      'pages/quality_trace/recall_task_detail/recall_task_detail',
      'pages/quality_trace/recall_disposition/recall_disposition',
      'pages/data_statistics/dashboard/dashboard',
      'pages/data_statistics/domain/domain',
      'pages/theme/setting/setting'
    ];
    if (protectedRoutes.includes(currentRoute)) return;

    if (this.globalData.is_platform_admin) {
      if (currentRoute !== 'pages/home/index/index') {
        wx.switchTab({ url: '/pages/home/index/index' });
      }
      return;
    }

    const manageRoles = [
      'factory_admin',
      'factory_sales',
      'factory_aftersales',
      'factory_matching',
      'factory_production',
      'factory_logistics',
      'factory_stock',
      'factory_material_stock',
      'merchant_owner',
      'merchant_senior_manager',
      'merchant_sales',
      'merchant_stock',
      'supplier_owner',
      'supplier_sales',
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
    const pages = getCurrentPages();
    const currentPage = pages.length ? pages[pages.length - 1] : null;
    const customTabBar = currentPage && currentPage.getTabBar
      ? currentPage.getTabBar()
      : null;
    if (customTabBar) {
      customTabBar.setData({ badge: count > 0 ? count : 0 });
      return;
    }
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
    this.refreshTasks({ summaryOnly: this.globalData.taskListLoaded || this.globalData.taskListLoading });
    this.globalData._taskTimer = setInterval(() => {
      this.refreshTasks({ summaryOnly: true });
    }, 15000);
  },

  stopTaskPolling() {
    if (this.globalData._taskTimer) {
      clearInterval(this.globalData._taskTimer);
      this.globalData._taskTimer = null;
    }
  },

  taskQueryScope() {
    const g = this.globalData;
    if (!g.openid || !g.access_token) return '';
    // The inbox spans the account's visible roots. A manually selected
    // operationRoot is a display/navigation choice, never a list filter.
    return JSON.stringify([g.openid, g.access_token, this._operationRootScope || '',
      g.organization_id || null, g.factory_root_id || null, g.role || '',
      (g.delegated_role_codes || []).slice().sort()]);
  },

  _clearTaskData(error = '') {
    this._taskSummaryRequestId = (this._taskSummaryRequestId || 0) + 1;
    this._taskListRequestId = (this._taskListRequestId || 0) + 1;
    Object.assign(this.globalData, {
      taskList: [], taskUnreadCount: 0, taskActionPendingCount: 0, taskCount: 0,
      taskNextCursor: '', taskHasMore: false, taskListLoading: false,
      taskListLoadingMore: false, taskListLoaded: false, taskListError: error,
      taskListErrorIsAppend: false, taskListHasUpdates: false, taskGroupCount: 0,
      taskListRevision: '',
      taskListGeneration: (this.globalData.taskListGeneration || 0) + 1
    });
    this.updateTabBarBadge();
    this._emitTaskUpdated();
  },

  _ensureTaskScope() {
    const scope = this.taskQueryScope();
    if (scope !== this._taskQueryScope) {
      this._taskQueryScope = scope;
      this._clearTaskData();
    }
    return scope;
  },

  refreshTasks({ summaryOnly = false } = {}) {
    this._ensureTaskScope();
    if (!summaryOnly || (!this.globalData.taskListLoaded
      && !this.globalData.taskListLoading && !this.globalData.taskListError)) this.getTaskList();
    this.refreshTaskSummary();
  },

  refreshTaskSummary() {
    const scope = this._ensureTaskScope();
    const { openid, access_token: accessToken } = this.globalData;
    if (!openid || !accessToken) return;
    const requestId = this._taskSummaryRequestId = (this._taskSummaryRequestId || 0) + 1;
    const listGeneration = this.globalData.taskListGeneration;
    const listRevision = this.globalData.taskListRevision;
    const isCurrent = () => this.taskQueryScope() === scope && requestId === this._taskSummaryRequestId
      && this.globalData.taskListGeneration === listGeneration;

    wx.request({
      url: `${this.globalData.apiBase}/workflow/task/summary/`,
      method: 'GET',
      header: this.authHeader(),
      success: (res) => {
        if (!isCurrent()) return;
        if (res.statusCode === 401 || res.data?.code === 401) {
          this.reauthenticate();
          return;
        }
        if (res.statusCode === 403 || res.data?.code === 403) {
          this._clearTaskData(res.data?.msg || '当前账号无权读取任务，请刷新登录状态');
          return;
        }
        if (!res.data || res.data.code !== 0) return;
        const summary = (res.data && res.data.data) || {};
        const unread = Number(summary.unread_count) || 0;
        const actionPending = Number(summary.action_pending_count) || 0;
        const attention = summary.attention_count === undefined
          ? Math.max(unread, actionPending)
          : (Number(summary.attention_count) || 0);

        const sameList = this.globalData.taskListGeneration === listGeneration
          && this.globalData.taskListRevision === listRevision;
        const revision = typeof summary.revision === 'string' ? summary.revision : '';
        // A page-one response may have replaced the revision while this
        // same-generation summary was in flight. Opaque revisions cannot be
        // ordered, so only a matching new-page summary may update its badges.
        if (!sameList && this.globalData.taskListRevision
          && revision !== this.globalData.taskListRevision) return;
        if (sameList && this.globalData.taskListLoaded && (revision && listRevision
          ? revision !== listRevision
          : (unread !== this.globalData.taskUnreadCount
            || actionPending !== this.globalData.taskActionPendingCount
            || attention !== this.globalData.taskCount))) this.globalData.taskListHasUpdates = true;
        this.globalData.taskUnreadCount = unread;
        this.globalData.taskActionPendingCount = actionPending;
        this.globalData.taskCount = attention;
        this.updateTabBarBadge();
        this._emitTaskUpdated();
      }
    });

  },

  mapTaskItem(it) {
    return {
      ...it,
      id: it.id,
      group_id: it.group_id || '',
      entry_task_id: Number(it.entry_task_id) || Number(it.id),
      entry_task_type: it.entry_task_type || it.type || '',
      grouped: !!it.grouped,
      group_kind: it.group_kind || '',
      group_label: it.group_label || '',
      root_organization: it.root_organization || null,
      is_workorder: !!it.is_workorder,
      child_count: Number(it.child_count) || 1,
      unread_count: Number(it.unread_count) || 0,
      action_pending_count: Number(it.action_pending_count) || 0,
      completed_count: Number(it.completed_count) || 0,
      title: it.title,
      summary: it.summary || '',
      latest_summary: it.latest_summary || '',
      display_state: typeof it.display_state === 'string' ? it.display_state : '',
      url: it.link || '',
      isNew: it.state === 'NEW',
      state: it.state,
      need_action: it.need_action,
      cursor_time: it.cursor_time,
      domain: it.domain || '',
      type: it.type || '',
      biz_id: it.biz_id || '',
      action_mode: it.action_mode || ''
    };
  },

  getTaskList({ append = false } = {}) {
    const scope = this._ensureTaskScope();
    if (!scope) return;
    const g = this.globalData;
    if (append && (g.taskListLoading || !g.taskHasMore || !g.taskNextCursor)) return;
    if (!append) {
      g.taskListGeneration++;
      g.taskNextCursor = '';
      g.taskHasMore = false;
    }
    const generation = g.taskListGeneration;
    const cursor = append ? g.taskNextCursor : '';
    const requestId = this._taskListRequestId = (this._taskListRequestId || 0) + 1;
    const isCurrent = () => this.taskQueryScope() === scope
      && g.taskListGeneration === generation && this._taskListRequestId === requestId;
    g.taskListLoading = true;
    g.taskListLoadingMore = append;
    g.taskListError = '';
    g.taskListErrorIsAppend = false;
    this._emitTaskUpdated();
    const failed = (message, refreshRequired = false) => {
      if (!isCurrent()) return;
      g.taskListLoading = false;
      g.taskListLoadingMore = false;
      g.taskListError = message || '任务加载失败，请重试';
      g.taskListErrorIsAppend = append && !refreshRequired;
      if (refreshRequired) {
        g.taskListGeneration++;
        g.taskNextCursor = '';
        g.taskHasMore = false;
        g.taskListHasUpdates = true;
      }
      this._emitTaskUpdated();
    };
    return wx.request({
      url: `${this.globalData.apiBase}/workflow/task/list/`,
      method: 'GET',
      header: this.authHeader(),
      data: cursor ? { limit: 50, cursor } : { limit: 50 },
      success: (res) => {
        if (!isCurrent()) return;
        if (res.statusCode === 401 || res.data?.code === 401) {
          this.reauthenticate();
          return;
        }
        if (res.statusCode === 403 || res.data?.code === 403) {
          this._clearTaskData(res.data?.msg || '当前账号无权读取任务，请刷新登录状态');
          return;
        }
        const data = res.data && res.data.data;
        if (res.statusCode !== 200 || !res.data || res.data.code !== 0 || !Array.isArray(data?.items)) {
          failed(res.data?.msg, !!data?.refresh_required);
          return;
        }
        const items = data.items;
        if (this._operationRootScope) {
          for (const item of items) {
            const root = confirmedRoot(item.root_organization);
            if (root && !this._operationRootOptions.has(root.id)) {
              this._operationRootOptions.set(root.id, root);
            }
          }
        }
        const byGroup = new Map();
        const key = item => item.group_id || `task:${item.id}`;
        if (append) g.taskList.forEach(item => byGroup.set(key(item), item));
        items.map(it => this.mapTaskItem(it)).forEach(item => byGroup.set(key(item), item));
        g.taskList = [...byGroup.values()];
        g.taskNextCursor = typeof data.next_cursor === 'string' ? data.next_cursor : '';
        g.taskHasMore = !!data.has_more && !!g.taskNextCursor;
        g.taskGroupCount = Number(data.group_count) || 0;
        g.taskListLoaded = true;
        g.taskListLoading = false;
        g.taskListLoadingMore = false;
        g.taskListError = '';
        g.taskListErrorIsAppend = false;
        const revision = typeof data.revision === 'string' ? data.revision : '';
        g.taskListHasUpdates = !!data.updates_available || (append && (
          g.taskListHasUpdates || (!!revision && !!g.taskListRevision && revision !== g.taskListRevision)
        ));
        if (!append) g.taskListRevision = revision;
        this._emitTaskUpdated();
      },
      fail: () => failed('网络请求失败，请重试')
    });
  },

  fetchTaskGroup(groupId, cb) {
    if (!this.globalData.access_token || !groupId) {
      cb && cb({ code: 401, msg: '登录状态已失效，请重新进入小程序' });
      return;
    }

    wx.request({
      url: `${this.globalData.apiBase}/workflow/task/group/`,
      method: 'GET',
      header: this.authHeader(),
      data: { group_id: groupId },
      success: (res) => {
        if (res.statusCode === 401) {
          this.reauthenticate();
        }
        cb && cb(res.data);
      },
      fail: () => cb && cb({ code: 1, msg: '网络请求失败' })
    });
  },

  openUserTask(usertaskId, cb, { switchOperationRoot = false } = {}) {
    const queryScope = this._ensureTaskScope();
    const openid = this.globalData.openid;
    const accessToken = this.globalData.access_token;
    if (!openid || !accessToken || !usertaskId) {
      cb && cb({ code: 401, msg: '登录状态已失效，请重新进入小程序' });
      return;
    }
    const rootScope = this._operationRootScope;
    const listGeneration = this.globalData.taskListGeneration;
    const action = switchOperationRoot ? this.nextOperationRootAction() : null;
    const isCurrent = () => this.taskQueryScope() === queryScope
      && this.globalData.taskListGeneration === listGeneration;

    wx.request({
      url: `${this.globalData.apiBase}/workflow/task/open/`,
      method: 'POST',
      header: this.authHeader(),
      data: { usertask_id: usertaskId },
      success: (res) => {
        if (!isCurrent()) {
          cb && cb({ code: 401, msg: '账号状态已变化，请重新打开任务' });
          return;
        }
        if (res.statusCode === 401) {
          this.reauthenticate();
        }
        if (res.statusCode === 403) {
          this._clearTaskData(res.data?.msg || '当前账号无权打开任务');
        }
        if (res.statusCode === 200 && res.data?.code === 0
          && switchOperationRoot && rootScope && this._operationRootAction === action) {
          const root = confirmedRoot(res.data.data?.root_organization);
          if (root) this.setOperationRoot(root);
        }
        cb && cb(res.data);
        if (res.statusCode === 200 && res.data?.code === 0) this.refreshTasks();
      },
      fail: () => {
        if (!isCurrent()) {
          cb && cb({ code: 401, msg: '账号或任务列表状态已变化，请重新打开任务' });
          return;
        }
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
      task.state = 'READ';
      this.globalData.taskUnreadCount = Math.max(
        0,
        this.globalData.taskUnreadCount - 1
      );
      if (!task.need_action) {
        this.globalData.taskCount = Math.max(0, this.globalData.taskCount - 1);
      }
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
