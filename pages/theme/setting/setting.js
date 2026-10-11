const app = getApp();
const theme = require('../../../utils/theme');

const COLORS = [
  { code: 'jade', name: '翡翠绿', description: '稳健、生命力、适合制造与全生命周期管理' },
  { code: 'ocean', name: '深海蓝', description: '理性、精密、适合工业与技术型品牌' },
  { code: 'amber', name: '琥珀金', description: '温暖、品质感、适合强调服务与品牌价值' }
];
const STYLES = [
  { code: 'flow', name: '柔和流线', description: '大圆角、柔和渐变和轻盈卡片' },
  { code: 'order', name: '专业秩序', description: '规整边界、低阴影和信息密度优先' }
];
const ALLOWED_STYLE_CODES = new Set(STYLES.map(item => item.code));

Page({
  data: {
    loading: true,
    saving: false,
    canManage: false,
    colors: COLORS,
    styles: STYLES,
    selectedColor: 'jade',
    selectedStyle: 'flow',
    originalCode: 'jade-flow',
    errorMessage: ''
  },

  onLoad() {
    this.load();
  },

  load() {
    this.setData({ loading: true, errorMessage: '' });
    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({ loading: false, errorMessage: '登录状态无效，请重新进入小程序' });
        return;
      }
      wx.request({
        url: `${app.globalData.apiBase}/account/appearance/`,
        method: 'GET',
        header: app.authHeader(),
        success: res => {
          const body = res.data || {};
          const data = body.data || {};
          const appearance = theme.normalize(data.appearance);
          if (res.statusCode !== 200 || body.code !== 0) {
            this.setData({ errorMessage: body.msg || '主题配置加载失败' });
            return;
          }
          const serverStyles = data.options && Array.isArray(data.options.styles)
            ? data.options.styles
            : STYLES;
          const styles = serverStyles.filter(item => item && ALLOWED_STYLE_CODES.has(item.code));
          this.setData({
            canManage: !!data.can_manage,
            colors: data.options && data.options.colors || COLORS,
            styles: styles.length ? styles : STYLES,
            selectedColor: appearance.color_scheme,
            selectedStyle: appearance.style_scheme,
            originalCode: appearance.option_code
          });
        },
        fail: () => this.setData({ errorMessage: '网络请求失败，请稍后重试' }),
        complete: () => this.setData({ loading: false })
      });
    });
  },

  selectColor(event) {
    if (!this.data.canManage || this.data.saving) return;
    this.setData({ selectedColor: event.currentTarget.dataset.code });
  },

  selectStyle(event) {
    if (!this.data.canManage || this.data.saving) return;
    this.setData({ selectedStyle: event.currentTarget.dataset.code });
  },

  save() {
    if (!this.data.canManage || this.data.saving) return;
    this.setData({ saving: true, errorMessage: '' });
    wx.request({
      url: `${app.globalData.apiBase}/account/appearance/`,
      method: 'POST',
      header: app.authHeader('application/json'),
      data: {
        color_scheme: this.data.selectedColor,
        style_scheme: this.data.selectedStyle
      },
      success: res => {
        const body = res.data || {};
        const data = body.data || {};
        if (res.statusCode !== 200 || body.code !== 0 || !data.appearance) {
          this.setData({ errorMessage: body.msg || '全局主题保存失败' });
          return;
        }
        const appearance = theme.apply(data.appearance);
        app.globalData.appearance = appearance;
        app.saveUserToCache();
        this.setData({ originalCode: appearance.option_code });
        wx.showToast({ title: '全局主题已生效', icon: 'success' });
      },
      fail: () => this.setData({ errorMessage: '网络请求失败，请稍后重试' }),
      complete: () => this.setData({ saving: false })
    });
  }
});
