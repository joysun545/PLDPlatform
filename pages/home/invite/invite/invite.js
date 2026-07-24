// pages/home/invite/invite/invite.js
const app = getApp();

Page({
  data: {
    availableRoles: [],
    role_name: '',     // 用于页面显示
    nickname: '',      // 用于页面显示

    canInviteEndUser: false,     // 是否显示“邀请终端用户”按钮
    showEndUserQrcode: false,    // 是否显示终端用户二维码弹层
    endUserQrcodeUrl: '',        // 终端用户二维码图片URL

    selectedRole: '',
    selectedRoleName: ''
  },

  onLoad() {
    // ============ 同步全局数据到页面 ============
    this.setData({
      role_name: app.globalData.role_name || '',
      nickname: app.globalData.nickname || '用户'
    });
    // ===================================================

    // 根据当前用户角色生成可邀请角色列表（原有逻辑不变）
    const roleMap = {
      'admin': [
        { role: 'factory_sales', name: '厂家销售经理' },
        { role: 'factory_stock', name: '厂家库管' },
        { role: 'factory_aftersale', name: '厂家售后服务经理' },
        { role: 'factory_manager', name: '厂家管理人员' }
      ],
      'factory_sales': [
        { role: 'dealer', name: '商家管理员' },
        { role: 'dealer_aftersale', name: '商家售后服务经理' }
      ],
      'dealer': [
        { role: 'dealer', name: '下一级商家管理员' },
        { role: 'dealer_sales', name: '商家销售经理' },
        { role: 'dealer_stock', name: '商家库管' },
        { role: 'dealer_electrician', name: '商家电工' }
      ],
      'dealer_sales': [
        { role: 'dealer', name: '下一级商家管理员' }
      ]
    };

    const currentRole = app.globalData.role;
    const roles = roleMap[currentRole] || [];

    this.setData({ availableRoles: roles });

    // 终端用户邀请权限（原有逻辑保留）
    const canInvite = ['dealer', 'dealer_sales', 'dealer_electrician'].includes(currentRole);
    this.setData({ canInviteEndUser: canInvite });
  },

  selectRole(e) {
    const { role, name } = e.currentTarget.dataset;

    this.setData({
      selectedRole: role,
      selectedRoleName: name
    });

    wx.showToast({
      title: '点击右上角「...」分享',
      icon: 'none',
      duration: 3000
    });

    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
  },

  // 邀请终端用户（生成临时二维码）
  inviteEndUser() {
    wx.showLoading({ title: '生成二维码...' });

    wx.request({
      url: `${app.globalData.apiBase}/account/generate_temp_invite_qrcode/`,
      method: 'POST',
      header: { 'content-type': 'application/x-www-form-urlencoded' },
      data: {
        inviter_openid: app.globalData.openid
      },
      success: (res) => {
        wx.hideLoading();
        if (res.data.code === 0 && res.data.qrcode_img_url) {
          this.setData({
            showEndUserQrcode: true,
            endUserQrcodeUrl: res.data.qrcode_img_url
          });
        } else {
          wx.showToast({ title: res.data.msg || '生成失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  // 关闭二维码弹层
  closeEndUserQrcode() {
    this.setData({ showEndUserQrcode: false });
  },

  onShareAppMessage() {
    if (!this.data.selectedRole) {
      return {
        title: '加入劲龙渠道管理系统',
        path: '/pages/index/index'
      };
    }

    // ===== 新增：继承参数 =====
    const region = app.globalData.region || '';
    const brand = String(app.globalData.brand_id || '').trim();
    const category = String(app.globalData.category_id || '').trim();

    const invitePath =
      `/pages/home/invite/accept/accept` +
      `?from=${app.globalData.openid}` +
      `&role=${this.data.selectedRole}` +
      `&region=${encodeURIComponent(region)}` +
      `&brand=${brand}` +
      `&category=${category}`;

    console.log('[invite share path]', invitePath);

    return {
      title: `${app.globalData.role_name || '上级'}邀请您成为${this.data.selectedRoleName}`,
      path: invitePath,
      imageUrl: 'images/default_avatar.png'
    };
  }
});


