function sync(page, selected, options = {}) {
  if (!page || typeof page.getTabBar !== 'function') return;
  const tabBar = page.getTabBar();
  if (!tabBar) return;
  const app = getApp();
  const globalData = (app && app.globalData) || {};
  tabBar.setData({
    selected,
    hidden: options.hidden === undefined
      ? globalData.role === 'tourist'
      : !!options.hidden,
    badge: Number(globalData.taskCount) || 0
  });
}

module.exports = { sync };
