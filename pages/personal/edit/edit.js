// pages/personal/edit/edit.js
const app = getApp();

Page({
  data: {
    avatar_url: '',
    selectedAvatarPath: '',
    nickname: '',
    phone: '',
    role_name: '',
    company_name: '',
    region: '',
    saving: false
  },

  onLoad() {
    this.loadProfile();
  },

  loadProfile() {
    this.setData({
      avatar_url: app.globalData.avatar_url || '',
      selectedAvatarPath: '',
      nickname: app.globalData.nickname || '',
      phone: app.globalData.phone || '',
      role_name: app.globalData.role_name || '游客',
      company_name: app.globalData.company_name || '未绑定组织',
      region: app.globalData.region || '未设置'
    });
  },

  onChooseAvatar(e) {
    const avatarPath = e.detail.avatarUrl || '';
    this.setData({
      avatar_url: avatarPath,
      selectedAvatarPath: avatarPath
    });
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value });
  },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value.replace(/\D/g, '') });
  },

  saveProfile() {
    if (this.data.saving) return;

    const nickname = this.data.nickname.trim();
    const phone = this.data.phone.trim();

    if (!nickname) {
      wx.showToast({ title: '请填写微信昵称', icon: 'none' });
      return;
    }
    if (phone && !/^\d{6,20}$/.test(phone)) {
      wx.showToast({ title: '请填写正确的电话号码', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    wx.showLoading({ title: '正在保存' });

    app.ensureLogin((ok) => {
      if (!ok) {
        this.finishSaving('登录状态异常');
        return;
      }

      if (this.data.selectedAvatarPath) {
        this.uploadProfileWithAvatar(nickname, phone);
      } else {
        this.saveProfileFields(nickname, phone);
      }
    });
  },

  saveProfileFields(nickname, phone) {
    wx.request({
      url: `${app.globalData.apiBase}/account/profile/`,
      method: 'POST',
      header: app.authHeader(),
      data: { nickname, phone },
      success: (res) => this.handleSaveResponse(res.data),
      fail: () => this.finishSaving('网络错误')
    });
  },

  uploadProfileWithAvatar(nickname, phone) {
    wx.uploadFile({
      url: `${app.globalData.apiBase}/account/profile/`,
      filePath: this.data.selectedAvatarPath,
      name: 'avatar',
      header: app.authHeader(null),
      formData: { nickname, phone },
      success: (res) => {
        let data = {};
        try {
          data = JSON.parse(res.data || '{}');
        } catch (error) {
          this.finishSaving('服务器返回数据格式错误');
          return;
        }
        this.handleSaveResponse(data);
      },
      fail: () => this.finishSaving('头像上传失败')
    });
  },

  handleSaveResponse(data) {
    if (!data || data.code !== 0 || !data.data) {
      if (data && data.code === 401) {
        app.reauthenticate();
      }
      this.finishSaving((data && data.msg) || '保存失败');
      return;
    }

    app.applyUserPayload(data.data);
    wx.hideLoading();
    this.setData({ saving: false });
    wx.showToast({ title: '保存成功', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 700);
  },

  finishSaving(message) {
    wx.hideLoading();
    this.setData({ saving: false });
    wx.showToast({ title: message, icon: 'none' });
  }
});
