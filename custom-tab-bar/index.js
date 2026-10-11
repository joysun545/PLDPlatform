const theme = require('../utils/theme');

const ITEMS = [
  { pagePath: '/pages/home/index/index', text: '首页', icon: 'home' },
  { pagePath: '/pages/scan/scan/scan', text: '扫一扫', icon: 'scan' },
  { pagePath: '/pages/personal/center/center', text: '我的', icon: 'my' }
];

Component({
  data: {
    selected: 0,
    hidden: false,
    badge: 0,
    items: ITEMS,
    themeClass: 'theme-color-jade theme-style-flow',
    themeStyle: ''
  },

  lifetimes: {
    attached() {
      this.syncState();
      this.applyTheme(theme.get());
      this._unsubscribeTheme = theme.subscribe(value => this.applyTheme(value));
    },
    detached() {
      if (this._unsubscribeTheme) this._unsubscribeTheme();
    }
  },

  pageLifetimes: {
    show() { this.syncState(); }
  },

  methods: {
    applyTheme(value) {
      const vm = theme.viewModel(value);
      this.setData({ themeClass: vm.className, themeStyle: vm.style });
    },

    syncState() {
      const pages = getCurrentPages();
      const route = pages.length ? `/${pages[pages.length - 1].route}` : '';
      const selected = Math.max(0, ITEMS.findIndex(item => item.pagePath === route));
      const app = getApp();
      const globalData = (app && app.globalData) || {};
      this.setData({
        selected,
        hidden: globalData.role === 'tourist',
        badge: Number(globalData.taskCount) || 0
      });
    },

    switchTab(event) {
      const index = Number(event.currentTarget.dataset.index);
      const item = ITEMS[index];
      if (!item || index === this.data.selected) return;
      wx.switchTab({ url: item.pagePath });
    }
  }
});
