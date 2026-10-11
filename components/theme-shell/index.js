const theme = require('../../utils/theme');
const { getRouteMeta } = require('../../utils/theme-routes');

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
      this.resolveRoute();
      this.resolveSystemMetrics();
      this.applyTheme(theme.get());
      this._unsubscribeTheme = theme.subscribe(value => this.applyTheme(value));
      this.refreshServiceStationBadge();
    },
    detached() {
      if (this._unsubscribeTheme) this._unsubscribeTheme();
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
    resolveRoute() {
      const pages = getCurrentPages();
      const currentPage = pages.length ? pages[pages.length - 1] : null;
      const route = currentPage ? currentPage.route : '';
      const routeMeta = getRouteMeta(route);
      const app = getApp();
      const globalData = (app && app.globalData) || {};
      const appearance = globalData.appearance || {};
      this.setData({
        routeTitle: this.data.title || routeMeta.title,
        pageLevel: this.data.level || routeMeta.level,
        canGoBack: pages.length > 1 && routeMeta.level !== 'tab',
        organizationName: globalData.factory_root_name || appearance.owner_organization_name || '',
        roleName: globalData.role_name || '游客',
        welcomeName: globalData.real_name || globalData.nickname || '用户'
      });
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
