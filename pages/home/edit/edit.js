const app = getApp();

Page({
  data: {
    loading: true,
    loadError: '',
    channelError: '',
    manager: null,
    subordinates: [],
    brands: [],
    editingInvitationId: null,
    editingMerchantId: null,
    regionDraft: '',
    brandIndex: -1,
    saving: false
  },

  onLoad() {
    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({
          loading: false,
          loadError: '登录失败，请重新进入小程序'
        });
        return;
      }
      this.loadSubordinates();
    });
  },

  onPullDownRefresh() {
    this.loadSubordinates(() => wx.stopPullDownRefresh());
  },

  loadSubordinates(done) {
    this.setData({
      loading: true,
      loadError: '',
      channelError: '',
      editingInvitationId: null,
      editingMerchantId: null
    });

    wx.request({
      url: `${app.globalData.apiBase}/account/subordinates/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        if (res.statusCode === 401) {
          app.reauthenticate();
          this.setData({
            loading: false,
            loadError: '登录状态已失效，请重新进入小程序'
          });
          return;
        }

        const body = res.data || {};
        if (body.code !== 0 || !body.data) {
          this.setData({
            loading: false,
            loadError: body.msg || '下级账号加载失败'
          });
          return;
        }

        const subordinates = (body.data.items || []).map(item => ({
          ...item,
          channel: null
        }));
        this.setData({
          manager: body.data.manager || null,
          subordinates
        });

        if (subordinates.some(item => item.management_mode === 'merchant_channel')) {
          this.loadMerchantChannels(done);
          return;
        }

        this.setData({ loading: false });
      },
      fail: () => {
        this.setData({
          loading: false,
          loadError: '网络连接失败，请稍后重试'
        });
      },
      complete: res => {
        if (!(
          res &&
          res.data &&
          res.data.code === 0 &&
          res.data.data &&
          (res.data.data.items || []).some(
            item => item.management_mode === 'merchant_channel'
          )
        )) {
          done && done();
        }
      }
    });
  },

  loadMerchantChannels(done) {
    wx.request({
      url: `${app.globalData.apiBase}/sales/order-plans/options/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        const body = res.data || {};
        if (body.code !== 0 || !body.data) {
          this.setData({
            channelError: body.msg || '商家区域和品牌资料加载失败'
          });
          return;
        }

        const channelMap = {};
        (body.data.direct_merchants || []).forEach(item => {
          channelMap[item.id] = item;
        });
        this.setData({
          brands: body.data.brands || [],
          subordinates: this.data.subordinates.map(item => ({
            ...item,
            channel: channelMap[item.organization.id] || null
          }))
        });
      },
      fail: () => {
        this.setData({
          channelError: '商家区域和品牌资料暂时无法加载'
        });
      },
      complete: () => {
        this.setData({ loading: false });
        done && done();
      }
    });
  },

  retryLoad() {
    this.loadSubordinates();
  },

  goInvite() {
    wx.navigateTo({ url: '/pages/home/invite/invite/invite' });
  },

  startEdit(e) {
    const invitationId = Number(e.currentTarget.dataset.invitationId);
    const subordinate = this.data.subordinates.find(
      item => item.invitation_id === invitationId
    );
    if (!subordinate || subordinate.management_mode !== 'merchant_channel') {
      return;
    }
    if (!subordinate.channel) {
      wx.showToast({ title: '渠道资料尚未加载，请下拉刷新', icon: 'none' });
      return;
    }

    const brandIndex = subordinate.channel.brand
      ? this.data.brands.findIndex(
          item => item.id === subordinate.channel.brand.id
        )
      : -1;
    this.setData({
      editingInvitationId: invitationId,
      editingMerchantId: subordinate.organization.id,
      regionDraft: subordinate.channel.region || subordinate.organization.region || '',
      brandIndex
    });
  },

  cancelEdit() {
    if (this.data.saving) return;
    this.setData({
      editingInvitationId: null,
      editingMerchantId: null,
      regionDraft: '',
      brandIndex: -1
    });
  },

  onRegionInput(e) {
    this.setData({ regionDraft: e.detail.value });
  },

  onBrandChange(e) {
    this.setData({ brandIndex: Number(e.detail.value) });
  },

  saveMerchantChannel() {
    const invitationId = this.data.editingInvitationId;
    const merchantId = this.data.editingMerchantId;
    const region = (this.data.regionDraft || '').trim();
    const brand = this.data.brands[this.data.brandIndex];

    if (!invitationId || !merchantId) return;
    if (!region) {
      wx.showToast({ title: '请填写负责区域', icon: 'none' });
      return;
    }
    if (!brand) {
      wx.showToast({ title: '请选择授权品牌', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    wx.request({
      url: `${app.globalData.apiBase}/sales/direct-merchants/configure/`,
      method: 'POST',
      header: app.authHeader('application/json'),
      data: {
        merchant_id: merchantId,
        brand_id: brand.id,
        region
      },
      success: res => {
        if (res.statusCode === 401) {
          app.reauthenticate();
          wx.showToast({ title: '登录状态已失效', icon: 'none' });
          return;
        }

        const body = res.data || {};
        if (body.code !== 0 || !body.data) {
          wx.showToast({ title: body.msg || '保存失败', icon: 'none' });
          return;
        }

        const saved = body.data;
        this.setData({
          subordinates: this.data.subordinates.map(item => (
            item.invitation_id === invitationId
              ? {
                  ...item,
                  organization: {
                    ...item.organization,
                    region: saved.region
                  },
                  channel: {
                    ...(item.channel || {}),
                    configured: true,
                    region: saved.region,
                    brand: saved.brand
                  }
                }
              : item
          )),
          editingInvitationId: null,
          editingMerchantId: null,
          regionDraft: '',
          brandIndex: -1
        });
        wx.showToast({ title: '下级资料已保存', icon: 'success' });
      },
      fail: () => {
        wx.showToast({ title: '网络连接失败', icon: 'none' });
      },
      complete: () => this.setData({ saving: false })
    });
  }
});
