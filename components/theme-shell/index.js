const theme = require('../../utils/theme');
const { getRouteMeta } = require('../../utils/theme-routes');

function rootLabel(root) {
  if (root?.state === 'task_list') return '根组织 · 见任务卡片';
  const name = typeof root?.name === 'string' ? root.name.trim() : '';
  if (!name) return '';
  if (root.state === 'pending_creation') return `待建根组织 · ${name}`;
  return Number(root.id) > 0 ? `根组织 · ${name}` : '';
}

Component({
  options: {
    multipleSlots: true,
    styleIsolation: 'apply-shared'
  },

  properties: {
    title: {
      type: String,
      value: '',
      observer(value) {
        const pages = getCurrentPages();
        const currentPage = pages.length ? pages[pages.length - 1] : null;
        const routeMeta = getRouteMeta(currentPage ? currentPage.route : '');
        this.setData({ routeTitle: value || routeMeta.title });
      }
    },
    level: { type: String, value: '' },
    titleEyebrow: { type: String, value: '' },
    titleMetric: { type: String, value: '' },
    titleSubtitle: { type: String, value: '' },
    businessContext: { type: Boolean, value: false, observer: 'resolveOrganizationLine' },
    rootOrganization: { type: Object, value: null, observer: 'resolveOrganizationLine' },
    hideHeader: { type: Boolean, value: false }
  },

  data: {
    routeTitle: '',
    pageLevel: 'primary',
    themeClass: 'theme-color-jade theme-style-flow',
    themeStyle: '',
    statusHeight: 20,
    navHeight: 44,
    headerOffset: 0,
    titleTop: 0,
    bodyOffset: 0,
    capsuleRight: 96,
    canGoBack: false,
    organizationName: '',
    roleName: '',
    welcomeName: '',
    serviceStationApproved: false,
    serviceStationBadgeOrganizationId: null
  },

  lifetimes: {
    attached() {
      this.listenForTaskRoot();
      this.resolveRoute();
      this.resolveSystemMetrics();
      this.applyTheme(theme.get());
      this._unsubscribeTheme = theme.subscribe(value => this.applyTheme(value));
      const app = getApp();
      if (app && typeof app.onOperationRootChanged === 'function') {
        this._unsubscribeOperationRoot = app.onOperationRootChanged(() => this.resolveOrganizationLine());
      }
      this.refreshServiceStationBadge();
    },
    detached() {
      if (this._unsubscribeTheme) this._unsubscribeTheme();
      if (this._unsubscribeOperationRoot) this._unsubscribeOperationRoot();
      if (this._taskRootChannel && typeof this._taskRootChannel.off === 'function') {
        this._taskRootChannel.off('taskRootOrganization', this._onTaskRootOrganization);
      }
    }
  },

  pageLifetimes: {
    show() {
      this.resolveRoute();
      this.applyTheme(theme.get());
      this.refreshServiceStationBadge();
    }
  },

  methods: {
    listenForTaskRoot() {
      const pages = getCurrentPages();
      const page = pages[pages.length - 1];
      if (!page || typeof page.getOpenerEventChannel !== 'function') return;
      const channel = page.getOpenerEventChannel();
      if (!channel || typeof channel.on !== 'function') return;
      this._taskRootChannel = channel;
      this._onTaskRootOrganization = root => {
        // This navigation context belongs to this page instance only.
        this._openedFromTask = true;
        this._taskRootOrganization = root;
        this.resolveOrganizationLine();
      };
      channel.on('taskRootOrganization', this._onTaskRootOrganization);
    },

    resolveOrganizationLine() {
      const globalData = (getApp() || {}).globalData || {};
      const businessRoot = rootLabel(this.data.rootOrganization) || rootLabel(this._taskRootOrganization);
      const isBusinessPage = this.data.businessContext || this._openedFromTask;
      // General tabs show the selected workspace. Identity-scoped forms still
      // use the organization the backend will actually operate on.
      const workspaceRoot = this.data.pageLevel === 'tab'
        ? rootLabel(globalData.operationRoot)
        : rootLabel({ id: globalData.factory_root_id, name: globalData.factory_root_name });
      this.setData({
        organizationName: businessRoot || (isBusinessPage ? '根组织未确认' : workspaceRoot)
      });
    },

    resolveRoute() {
      const pages = getCurrentPages();
      const currentPage = pages.length ? pages[pages.length - 1] : null;
      const route = currentPage ? currentPage.route : '';
      const routeMeta = getRouteMeta(route);
      const app = getApp();
      const globalData = (app && app.globalData) || {};
      this.setData({
        routeTitle: this.data.title || routeMeta.title,
        pageLevel: this.data.level || routeMeta.level,
        canGoBack: pages.length > 1 && routeMeta.level !== 'tab',
        roleName: globalData.role_name || '游客',
        welcomeName: globalData.real_name || globalData.nickname || '用户'
      });
      this.resolveOrganizationLine();
    },

    resolveSystemMetrics() {
      let windowInfo = {};
      try {
        windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      } catch (e) {}
      let capsule = null;
      try { capsule = wx.getMenuButtonBoundingClientRect(); } catch (e) {}
      const statusHeight = Number(windowInfo.statusBarHeight) || 20;
      const navHeight = capsule && capsule.height
        ? capsule.height + Math.max(0, capsule.top - statusHeight) * 2
        : 44;
      const windowWidth = Number(windowInfo.windowWidth) || 375;
      const capsuleRight = capsule && capsule.left
        ? Math.max(88, windowWidth - capsule.left + 8)
        : 96;
      const themeValue = theme.get();
      const styleId = themeValue && themeValue.style_scheme ? themeValue.style_scheme : 'flow';
      const currentPages = getCurrentPages();
      const currentPage = currentPages.length ? currentPages[currentPages.length - 1] : null;
      const routeMeta = getRouteMeta(currentPage ? currentPage.route : '');
      const pageLevel = this.data.level || routeMeta.level || 'primary';
      const rpxToPx = windowWidth / 750;
      let headerOffset;
      if (this.data.hideHeader || pageLevel === 'none') {
        headerOffset = 0;
      } else {
        const heroHeightRpx = styleId === 'order' ? 166 : 186;
        headerOffset = statusHeight + heroHeightRpx * rpxToPx;
      }
      const hasPageTitle = pageLevel !== 'tab' && pageLevel !== 'none' && !this.data.hideHeader;
      const titleTop = headerOffset + 24 * rpxToPx;
      const bodyOffset = headerOffset + (hasPageTitle ? 200 * rpxToPx : 0);
      this.setData({ statusHeight, navHeight, capsuleRight, headerOffset, titleTop, bodyOffset });
    },

    applyTheme(value) {
      const vm = theme.viewModel(value);
      this.setData({
        themeClass: vm.className,
        themeStyle: vm.style
      });
      this.resolveSystemMetrics();
      this.resolveRoute();
    },

    refreshServiceStationBadge() {
      const app = getApp();
      const globalData = (app && app.globalData) || {};
      const organizationId = Number(globalData.organization_id) || 0;
      if (!organizationId) {
        this.setData({ serviceStationApproved: false, serviceStationBadgeOrganizationId: null });
        return;
      }
      if (Number(this.data.serviceStationBadgeOrganizationId) !== organizationId) {
        this.setData({ serviceStationApproved: false, serviceStationBadgeOrganizationId: organizationId });
      }
      if (this._badgeRequestInFlight || this._badgeLoginPending) return;

      if (!globalData.access_token) {
        if (typeof app.ensureLogin !== 'function') return;
        this._badgeLoginPending = true;
        app.ensureLogin(ok => {
          this._badgeLoginPending = false;
          if (ok) this.refreshServiceStationBadge();
        });
        return;
      }

      this._badgeRequestInFlight = true;
      wx.request({
        url: `${globalData.apiBase}/lifecycle/after-sales/service-station/organization-badge/`,
        method: 'GET',
        header: app.authHeader(null),
        success: res => {
          const body = res.data || {};
          const data = body.data || {};
          const currentOrganizationId = Number(app.globalData.organization_id) || 0;
          if (body.code === 0 && currentOrganizationId === organizationId
            && Number(data.organization_id) === organizationId) {
            this.setData({ serviceStationApproved: !!data.approved });
          }
        },
        complete: () => { this._badgeRequestInFlight = false; }
      });
    },

    goBack() {
      if (getCurrentPages().length > 1) {
        wx.navigateBack({ delta: 1 });
      } else {
        wx.switchTab({ url: '/pages/home/index/index' });
      }
    }
  }
});
