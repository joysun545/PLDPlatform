const app = getApp();

Page({
  data: {
    token: '',
    loading: true,
    accepting: false,
    invitationReady: false,

    inviterNickname: '加载中...',
    inviterAvatar: '/images/default_avatar.png',
    inviterRoleName: '',
    sourceOrganizationName: '',

    targetRole: '',
    targetRoleName: '',
    targetOrganizationTypeName: '',
    requiresOrganizationProfile: false,

    nickname: '',
    avatarUrl: '',
    phone: '',
    organizationName: '',
    region: '',
    address: '',
    agreed: false
  },

  onLoad(options) {
    const token = ((options && options.token) || '').trim();
    if (!token) {
      this.showInvalidInvitation('邀请链接无效');
      return;
    }

    this.setData({
      token,
      nickname: app.globalData.nickname || '',
      avatarUrl: app.globalData.avatar_url || '',
      phone: app.globalData.phone || ''
    });

    app.ensureLogin(ok => {
      if (!ok) {
        this.showInvalidInvitation('登录失败，请重新打开邀请');
        return;
      }
      this.loadInvitation();
    });
  },

  loadInvitation() {
    this.setData({ loading: true });

    wx.request({
      url: `${app.globalData.apiBase}/account/invitations/detail/`,
      method: 'GET',
      header: app.authHeader(),
      data: { token: this.data.token },
      success: res => {
        if (!res.data || res.data.code !== 0) {
          this.showInvalidInvitation(res.data.msg || '邀请链接无效');
          return;
        }

        const data = res.data.data || {};
        const inviter = data.inviter || {};
        const targetRole = data.target_role || {};
        const targetType = data.target_organization_type || {};
        const sourceOrganization = data.source_organization || {};

        if (!data.can_accept) {
          this.showInvalidInvitation('当前微信账号已经拥有组织身份');
          return;
        }

        this.setData({
          invitationReady: true,
          inviterNickname: inviter.nickname || '邀请人',
          inviterAvatar: inviter.avatar || '/images/default_avatar.png',
          inviterRoleName: inviter.role_name || '',
          sourceOrganizationName: sourceOrganization.name || '',
          targetRole: targetRole.code || '',
          targetRoleName: targetRole.name || '成员',
          targetOrganizationTypeName: targetType.name || '',
          requiresOrganizationProfile: !!data.requires_organization_profile,
          region: sourceOrganization.region || ''
        });
      },
      fail: () => {
        this.showInvalidInvitation('网络错误，请稍后重试');
      },
      complete: () => {
        this.setData({ loading: false });
      }
    });
  },

  showInvalidInvitation(message) {
    this.setData({ loading: false, invitationReady: false });
    wx.showModal({
      title: '无法接受邀请',
      content: message,
      showCancel: false,
      success: () => {
        wx.reLaunch({ url: '/pages/index/index' });
      }
    });
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value });
  },

  onChooseAvatar(e) {
    this.setData({ avatarUrl: e.detail.avatarUrl || '' });
  },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value });
  },

  onOrganizationNameInput(e) {
    this.setData({ organizationName: e.detail.value });
  },

  onRegionInput(e) {
    this.setData({ region: e.detail.value });
  },

  onAddressInput(e) {
    this.setData({ address: e.detail.value });
  },

  onAgreeChange(e) {
    this.setData({ agreed: e.detail.value.length > 0 });
  },

  openAgreement() {
    wx.navigateTo({ url: '/pages/common/agreement/agreement' });
  },

  openPrivacy() {
    wx.navigateTo({ url: '/pages/common/privacy/privacy' });
  },

  handleReject() {
    wx.showModal({
      title: '提示',
      content: '您暂未接受邀请，可在链接有效期内再次打开',
      showCancel: false,
      success: () => {
        wx.reLaunch({ url: '/pages/index/index' });
      }
    });
  },

  handleAccept() {
    if (this.data.accepting || !this.data.invitationReady) return;

    if (!this.data.agreed) {
      wx.showToast({ title: '请先阅读并同意协议', icon: 'none' });
      return;
    }

    if (
      this.data.requiresOrganizationProfile &&
      !this.data.organizationName.trim()
    ) {
      wx.showToast({ title: '请填写组织名称', icon: 'none' });
      return;
    }

    if (
      this.data.requiresOrganizationProfile &&
      !this.data.region.trim()
    ) {
      wx.showToast({ title: '请填写所在或负责区域', icon: 'none' });
      return;
    }

    this.setData({ accepting: true });
    wx.showLoading({ title: '正在加入...' });

    wx.request({
      url: `${app.globalData.apiBase}/account/invitations/accept/`,
      method: 'POST',
      header: app.authHeader(),
      data: {
        token: this.data.token,
        nickname: this.data.nickname || '',
        avatar: this.data.avatarUrl || '',
        phone: this.data.phone || '',
        organization_name: this.data.organizationName || '',
        region: this.data.region || '',
        address: this.data.address || ''
      },
      success: res => {
        if (!res.data || res.data.code !== 0) {
          wx.showToast({
            title: res.data.msg || '加入失败',
            icon: 'none'
          });
          return;
        }

        const profile = res.data.data || {};
        Object.assign(app.globalData, {
          role: profile.role || this.data.targetRole,
          role_name: profile.role_name || this.data.targetRoleName,
          nickname: profile.nickname || this.data.nickname,
          avatar_url: profile.avatar_url || app.globalData.avatar_url || '',
          phone: profile.phone || this.data.phone || '',
          company_name: profile.company_name || '',
          organization_id: profile.organization_id || null,
          organization_type: profile.organization_type || '',
          region: profile.region || this.data.region || ''
        });
        app.saveUserToCache();

        wx.showToast({ title: '加入成功', icon: 'success' });
        setTimeout(() => {
          wx.switchTab({ url: '/pages/home/index/index' });
        }, 1000);
      },
      fail: () => {
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
      complete: () => {
        wx.hideLoading();
        this.setData({ accepting: false });
      }
    });
  }
});
