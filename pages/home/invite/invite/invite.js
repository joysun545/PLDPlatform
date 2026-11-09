const theme = require('../../../../utils/theme');
const app = getApp();

Page({
  data: {
    themeStyle: '',
    availableRoles: [],
    isPlatformAdmin: false,
    factoryInvitationForm: { organization_name: '', region: '', address: '' },
    role_name: '',
    nickname: '',
    loading: true,
    creating: false,

    selectedRuleId: null,
    selectedRole: '',
    selectedRoleName: '',
    managerConfigVisible: false,
    managerJobTitle: '',
    managerRoleOptions: [],
    selectedManagerRoleCodes: [],
    selectedManagerRoleNames: '',
    invitationError: '',
    invitationRootOrganization: null,
    shareReady: false,
    sharePanelVisible: false,
    sharePath: '',
    expiresAt: ''
  },

  onLoad() {
    this.syncThemeStyle();
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
      const isPlatformAdmin = !!app.globalData.is_platform_admin;
      this.setData({
        isPlatformAdmin,
        role_name: app.globalData.role_name || '',
        nickname: app.globalData.nickname || '用户'
      });
      if (isPlatformAdmin) {
        this.setData({ loading: false });
      } else {
        this.loadAvailableRoles();
      }
    });
  },

  onShow() {
    this.syncThemeStyle();
  },

  syncThemeStyle() {
    const appearance = app.globalData.appearance || theme.get();
    this.setData({ themeStyle: theme.styleVariables(appearance) });
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

  onFactoryInvitationInput(e) {
    if (this.data.creating) return;
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`factoryInvitationForm.${field}`]: e.detail.value || '',
      shareReady: false,
      sharePanelVisible: false,
      sharePath: '',
      invitationRootOrganization: null,
      invitationError: ''
    });
  },

  createFactoryInvitation() {
    if (!app.globalData.is_platform_admin || this.data.creating) return;
    const { organization_name, region, address } = this.data.factoryInvitationForm;
    if (!organization_name.trim()) {
      wx.showToast({ title: '请填写厂家组织名称', icon: 'none' });
      return;
    }
    this.createInvitation({
      role: 'factory_admin',
      name: '厂家负责人',
      factoryInvitation: {
        organization_name: organization_name.trim(),
        region: region.trim(),
        address: address.trim()
      }
    });
  },

  selectRole(e) {
    if (this.data.creating) return;

    const ruleId = e.currentTarget.dataset.ruleid;
    const role = e.currentTarget.dataset.role;
    const name = e.currentTarget.dataset.name;

    const selected = this.data.availableRoles.find(
      item => String(item.rule_id) === String(ruleId)
    );
    const managerOptions =
      (selected && selected.senior_manager_setup &&
        selected.senior_manager_setup.managed_role_options) || [];
    if (role === 'factory_senior_manager' || role === 'merchant_senior_manager') {
      if (!managerOptions.length) {
        wx.showToast({ title: '当前没有可分管的系统岗位', icon: 'none' });
        return;
      }
      this.setData({
        selectedRuleId: ruleId,
        selectedRole: role,
        selectedRoleName: name,
        shareReady: false,
        invitationRootOrganization: null,
        sharePanelVisible: false,
        invitationError: '',
        managerConfigVisible: true,
        managerJobTitle: '',
        managerRoleOptions: managerOptions.map(item => ({ ...item, checked: false })),
        selectedManagerRoleCodes: []
      });
      return;
    }

    this.createInvitation({ ruleId, role, name });
  },

  onManagerJobTitleInput(e) {
    this.setData({ managerJobTitle: e.detail.value || '' });
  },

  onManagedRolesChange(e) {
    const selectedCodes = e.detail.value || [];
    this.setData({
      selectedManagerRoleCodes: selectedCodes,
      managerRoleOptions: this.data.managerRoleOptions.map(item => ({
        ...item,
        checked: selectedCodes.includes(item.code)
      }))
    });
  },

  cancelManagerConfig() {
    if (this.data.creating) return;
    this.setData({
      managerConfigVisible: false,
      invitationError: '',
      sharePanelVisible: this.data.shareReady
    });
  },

  confirmManagerConfig() {
    if (this.data.creating) return;
    if (!this.data.selectedManagerRoleCodes.length) {
      wx.showToast({ title: '请至少选择一个分管系统岗位', icon: 'none' });
      return;
    }
    this.setData({ invitationError: '' });
    this.createInvitation({
      ruleId: this.data.selectedRuleId,
      role: this.data.selectedRole,
      name: this.data.selectedRoleName,
      seniorManagerJobTitle: this.data.managerJobTitle.trim(),
      seniorManagerManagedRoleCodes: this.data.selectedManagerRoleCodes
    });
  },

  createInvitation({
    ruleId,
    role,
    name,
    seniorManagerJobTitle = '',
    seniorManagerManagedRoleCodes = [],
    factoryInvitation = null
  }) {

    this.setData({
      creating: true,
      shareReady: false,
      invitationRootOrganization: null,
      sharePanelVisible: false,
      invitationError: ''
    });
    wx.showLoading({ title: '生成邀请...' });

    const isSeniorManagerInvitation =
      role === 'factory_senior_manager' || role === 'merchant_senior_manager';
    const requestData = factoryInvitation || { rule_id: ruleId };
    if (isSeniorManagerInvitation) {
      requestData.senior_manager_job_title = seniorManagerJobTitle;
      requestData.senior_manager_managed_role_codes = seniorManagerManagedRoleCodes;
    }

    const endpoint = factoryInvitation
      ? '/account/platform/factory-invitations/create/'
      : '/account/invitations/create/';
    wx.request({
      url: `${app.globalData.apiBase}${endpoint}`,
      method: 'POST',
      // The backend reads array-valued delegation fields from JSON. Keep the
      // existing form encoding for ordinary role invitations.
      header: isSeniorManagerInvitation
        ? app.authHeader('application/json')
        : app.authHeader(),
      data: requestData,
      success: res => {
        if (res.data && res.data.code === 0) {
          const data = res.data.data || {};
          const sharePath = data.share_path || '';
          if (!sharePath) {
            this.setData({ invitationError: '服务器未返回分享链接，请稍后重试或联系管理员。' });
            return;
          }
          const managerRoleNames = seniorManagerManagedRoleCodes
            .map(code => {
              const item = this.data.managerRoleOptions.find(row => row.code === code);
              return item ? item.name : code;
            })
            .join('、');
          this.setData({
            managerConfigVisible: seniorManagerManagedRoleCodes.length > 0,
            invitationError: '',
            selectedRuleId: ruleId,
            selectedRole: role,
            selectedRoleName: factoryInvitation ? (data.target_role_name || name) : name,
            invitationRootOrganization: data.root_organization || null,
            shareReady: true,
            sharePanelVisible: seniorManagerManagedRoleCodes.length === 0,
            sharePath,
            expiresAt: data.expires_at || '',
            managerJobTitle: seniorManagerJobTitle,
            selectedManagerRoleCodes: seniorManagerManagedRoleCodes,
            selectedManagerRoleNames: managerRoleNames
          });

          wx.showShareMenu({
            withShareTicket: true,
            menus: ['shareAppMessage']
          });
          wx.showToast({ title: '邀请已生成', icon: 'success' });
        } else {
          const message = (res.data && res.data.msg) || '邀请生成失败';
          this.setData({ invitationError: message });
          wx.showToast({ title: message, icon: 'none' });
        }
      },
      fail: () => {
        const message = '网络请求失败，请检查网络后重试';
        this.setData({ invitationError: message });
        wx.showToast({ title: message, icon: 'none' });
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
      title: this.data.isPlatformAdmin
        ? `邀请您成为${this.data.factoryInvitationForm.organization_name.trim()}的${this.data.selectedRoleName}`
        : `${app.globalData.role_name || '上级'}邀请您成为${this.data.selectedRoleName}`,
      path: this.data.sharePath,
      imageUrl: '/images/default_avatar.png'
    };
  }
});
