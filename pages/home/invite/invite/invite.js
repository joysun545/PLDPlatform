const app = getApp();

Page({
  data: {
    availableRoles: [],
    role_name: '',
    nickname: '',
    loading: true,
    creating: false,

    selectedRuleId: null,
    selectedRole: '',
    selectedRoleName: '',
    shareReady: false,
    sharePath: '',
    expiresAt: ''
  },

  onLoad() {
    this.setData({
      role_name: app.globalData.role_name || '',
      nickname: app.globalData.nickname || '用户'
    });

    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({ loading: false });
        wx.showToast({ title: '登录失败', icon: 'none' });
        return;
      }
      this.loadAvailableRoles();
    });
  },

  loadAvailableRoles() {
    this.setData({ loading: true });

    wx.request({
      url: `${app.globalData.apiBase}/account/invitation_roles/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        if (res.data && res.data.code === 0) {
          const items = (res.data.data && res.data.data.items) || [];
          this.setData({ availableRoles: items });
        } else {
          wx.showToast({
            title: res.data.msg || '无法获取邀请岗位',
            icon: 'none'
          });
        }
      },
      fail: () => {
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
      complete: () => {
        this.setData({ loading: false });
      }
    });
  },

  selectRole(e) {
    if (this.data.creating) return;

    const ruleId = e.currentTarget.dataset.ruleid;
    const role = e.currentTarget.dataset.role;
    const name = e.currentTarget.dataset.name;

    this.setData({ creating: true, shareReady: false });
    wx.showLoading({ title: '生成邀请...' });

    wx.request({
      url: `${app.globalData.apiBase}/account/invitations/create/`,
      method: 'POST',
      header: app.authHeader(),
      data: { rule_id: ruleId },
      success: res => {
        if (res.data && res.data.code === 0) {
          const data = res.data.data || {};
          this.setData({
            selectedRuleId: ruleId,
            selectedRole: role,
            selectedRoleName: name,
            shareReady: true,
            sharePath: data.share_path || '',
            expiresAt: data.expires_at || ''
          });

          wx.showShareMenu({
            withShareTicket: true,
            menus: ['shareAppMessage']
          });
          wx.showToast({ title: '邀请已生成', icon: 'success' });
        } else {
          wx.showToast({
            title: res.data.msg || '邀请生成失败',
            icon: 'none'
          });
        }
      },
      fail: () => {
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
      complete: () => {
        wx.hideLoading();
        this.setData({ creating: false });
      }
    });
  },

  onShareAppMessage() {
    if (!this.data.shareReady || !this.data.sharePath) {
      return {
        title: '产品全生命周期数据平台',
        path: '/pages/index/index'
      };
    }

    return {
      title: `${app.globalData.role_name || '上级'}邀请您成为${this.data.selectedRoleName}`,
      path: this.data.sharePath,
      imageUrl: '/images/default_avatar.png'
    };
  }
});
