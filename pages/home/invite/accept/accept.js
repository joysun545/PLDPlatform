// pages/home/invite/accept/accept.js
const app = getApp();

function safeDecode(s) {
  if (!s) return '';
  try {
    return decodeURIComponent(s);
  } catch (e) {
    return s;
  }
}

Page({
  data: {
    fromOpenid: '',
    targetRole: '',
    targetRoleName: '',

    inviterNickname: '加载中...',
    inviterAvatar: '/static/wx_icon/default-avatar.png',
    inviterRoleName: '',

    nickname: '',           // 用户选择的昵称
    avatarUrl: '',          // 用户选择的真实头像临时URL
    agreed: false,          // 是否同意协议

    // ===== 新增：继承参数 =====
    region: '',
    brand: '',
    category: ''
  },

  onLoad(options) {
    const { from, role, region, brand, category } = options || {};

    if (!from || !role) {
      wx.showToast({ title: '邀请链接无效', icon: 'none' });
      setTimeout(() => {
        wx.switchTab({ url: '/pages/index/index' });
      }, 1500);
      return;
    }

    this.setData({
      fromOpenid: from,
      targetRole: role,

      // ===== 新增：接收继承参数 =====
      region: safeDecode(region || ''),
      brand: (brand || '').trim(),
      category: (category || '').trim()
    });

    const roleMap = {
      'factory_sales': '厂家销售经理',
      'factory_stock': '厂家库管',
      'factory_aftersale': '厂家售后服务经理',
      'dealer': '商家管理员',
      'dealer_sales': '商家销售经理',
      'dealer_aftersale': '商家售后服务经理',
      'dealer_electrician': '商家电工',
      'factory_manager': '厂家管理员'
    };

    this.setData({
      targetRoleName: roleMap[role] || '成员'
    });

    if (!app.globalData.openid) {
      console.log('openid 未获取，强制登录');
      app.login(() => {
        this.loadInviterInfo(from);
      });
    } else {
      this.loadInviterInfo(from);
    }
  },

  loadInviterInfo(from) {
    wx.request({
      url: `${app.globalData.apiBase}/get_inviter_info/`,
      data: { inviter_openid: from },
      success: res => {
        if (res.data.code === 0) {
          this.setData({
            inviterNickname: res.data.nickname || '邀请人',
            inviterAvatar: res.data.avatar || '/static/wx_icon/default-avatar.png',
            inviterRoleName: res.data.role_name || ''
          });
        }
      },
      fail: () => {
        this.setData({ inviterNickname: '邀请人' });
      }
    });
  },

  // 用户输入昵称
  onNicknameInput(e) {
    this.setData({
      nickname: e.detail.value
    });
  },

  // 用户选择头像
  onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl;
    this.setData({
      avatarUrl: avatarUrl
    });
    console.log('用户选择头像临时URL:', avatarUrl);
  },

  // 同意协议 checkbox 变化
  onAgreeChange(e) {
    this.setData({
      agreed: e.detail.value.length > 0
    });
  },

  // 跳转协议页面
  openAgreement() {
    wx.navigateTo({
      url: '/pages/common/agreement/agreement'
    });
  },

  openPrivacy() {
    wx.navigateTo({
      url: '/pages/common/privacy/privacy'
    });
  },

  handleReject() {
    wx.showModal({
      title: '提示',
      content: '您拒绝了邀请，可稍后通过其他方式加入',
      showCancel: false,
      success: () => {
        wx.switchTab({ url: '/pages/index/index' });
      }
    });
  },

  handleAccept() {
    const that = this;

    if (!that.data.agreed) {
      wx.showToast({
        title: '请先阅读并同意协议',
        icon: 'none'
      });
      return;
    }

    if (!that.data.fromOpenid || !that.data.targetRole) {
      wx.showToast({ title: '邀请参数未准备好', icon: 'none' });
      return;
    }

    if (!app.globalData.openid) {
      wx.showToast({ title: '登录状态异常', icon: 'none' });
      return;
    }

    const nickname = that.data.nickname || '微信用户';
    const avatarUrl = that.data.avatarUrl || '';

    const postData = {
      openid: app.globalData.openid,
      inviter_openid: that.data.fromOpenid,
      target_role: that.data.targetRole,
      nickname: nickname,
      avatar: avatarUrl,

      // ===== 新增：继承参数 =====
      region: that.data.region || '',
      brand: that.data.brand || '',
      category: that.data.category || ''
    };

    console.log('提交 accept_staff_invite 参数:', postData);

    wx.request({
      url: app.globalData.apiBase + '/account/accept_staff_invite/',
      method: 'POST',
      header: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      data: postData,
      success: (res) => {
        console.log('后端返回:', res.data);

        if (res.data.code === 0) {
          // ===== 更新全局数据 =====
          app.globalData.nickname = nickname;
          app.globalData.avatarUrl = avatarUrl;
          app.globalData.role = that.data.targetRole;
          app.globalData.role_name = that.data.targetRoleName;

          // ===== 新增：把继承结果同步到全局 =====
          // 优先用后端返回，后端没回则回退用页面已有值
          app.globalData.region = (res.data.data && res.data.data.region) || that.data.region || '';
          app.globalData.brand_id = (res.data.data && res.data.data.brand) || that.data.brand || '';
          app.globalData.category_id = (res.data.data && res.data.data.category) || that.data.category || '';

          wx.showToast({ title: '加入成功！', icon: 'success' });

          setTimeout(() => {
            wx.switchTab({ url: '/pages/home/index/index' });
          }, 1000);
        } else {
          wx.showToast({ title: res.data.msg || '加入失败', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error('请求失败:', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  }
});


