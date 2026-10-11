const STORAGE_KEY = 'PLDP_UI_APPEARANCE_V1';

const COLOR_SCHEMES = {
  jade: {
    name: '翡翠绿',
    primary: '#087F5B',
    primaryStrong: '#056146',
    primaryBright: '#07B66F',
    primarySoft: '#E7F7F0',
    primaryPale: '#F3FAF7',
    gradientStart: '#056146',
    gradientEnd: '#087F5B',
    pageBg: '#F3F7F5',
    surface: '#FFFFFF',
    surfaceMuted: '#EAF2ED',
    fieldBg: '#F7FAF8',
    ink: '#17211D',
    muted: '#718078',
    border: '#DDE8E2'
  },
  ocean: {
    name: '深海蓝',
    primary: '#155EEF',
    primaryStrong: '#0D3FA8',
    primaryBright: '#2E7CF6',
    primarySoft: '#E9F1FF',
    primaryPale: '#F5F8FF',
    gradientStart: '#0D3FA8',
    gradientEnd: '#155EEF',
    pageBg: '#F3F6FB',
    surface: '#FFFFFF',
    surfaceMuted: '#EAF0F9',
    fieldBg: '#F7F9FD',
    ink: '#172033',
    muted: '#6D788C',
    border: '#DBE3F0'
  },
  amber: {
    name: '琥珀金',
    primary: '#A85F08',
    primaryStrong: '#754105',
    primaryBright: '#D58A21',
    primarySoft: '#FFF1D9',
    primaryPale: '#FFF9EF',
    gradientStart: '#754105',
    gradientEnd: '#A85F08',
    pageBg: '#F8F5EF',
    surface: '#FFFFFF',
    surfaceMuted: '#F3EBDD',
    fieldBg: '#FCF9F4',
    ink: '#2C251B',
    muted: '#807568',
    border: '#E8DFD2'
  }
};

const STYLE_SCHEMES = {
  flow: {
    name: '柔和流线',
    cardRadius: '28rpx',
    panelRadius: '36rpx',
    controlRadius: '20rpx',
    cardShadow: '0 12rpx 34rpx rgba(17, 48, 38, 0.08)',
    borderWidth: '0rpx'
  },
  order: {
    name: '专业秩序',
    cardRadius: '12rpx',
    panelRadius: '16rpx',
    controlRadius: '8rpx',
    cardShadow: '0 4rpx 12rpx rgba(15, 35, 70, 0.05)',
    borderWidth: '1rpx'
  }
};

const DEFAULT_APPEARANCE = Object.freeze({
  color_scheme: 'jade',
  style_scheme: 'flow',
  option_code: 'jade-flow',
  owner_organization_id: null,
  owner_organization_name: ''
});

let current = Object.assign({}, DEFAULT_APPEARANCE);
const listeners = [];

function normalize(value) {
  const source = value && typeof value === 'object' ? value : {};
  const color = COLOR_SCHEMES[source.color_scheme]
    ? source.color_scheme
    : DEFAULT_APPEARANCE.color_scheme;
  const style = STYLE_SCHEMES[source.style_scheme]
    ? source.style_scheme
    : DEFAULT_APPEARANCE.style_scheme;
  return {
    color_scheme: color,
    style_scheme: style,
    option_code: `${color}-${style}`,
    owner_organization_id: source.owner_organization_id || null,
    owner_organization_name: source.owner_organization_name || ''
  };
}

function styleVariables(appearance) {
  const selected = normalize(appearance);
  const color = COLOR_SCHEMES[selected.color_scheme];
  const style = STYLE_SCHEMES[selected.style_scheme];
  const variables = {
    '--ui-primary': color.primary,
    '--ui-primary-strong': color.primaryStrong,
    '--ui-primary-bright': color.primaryBright,
    '--ui-primary-soft': color.primarySoft,
    '--ui-primary-pale': color.primaryPale,
    '--ui-gradient-start': color.gradientStart,
    '--ui-gradient-end': color.gradientEnd,
    '--ui-page-bg': color.pageBg,
    '--ui-surface': color.surface,
    '--ui-surface-muted': color.surfaceMuted,
    '--ui-field-bg': color.fieldBg,
    '--ui-ink': color.ink,
    '--ui-muted': color.muted,
    '--ui-border': color.border,
    '--ui-card-radius': style.cardRadius,
    '--ui-panel-radius': style.panelRadius,
    '--ui-control-radius': style.controlRadius,
    '--ui-card-shadow': style.cardShadow,
    '--ui-border-width': style.borderWidth
  };
  return Object.keys(variables)
    .map(key => `${key}:${variables[key]}`)
    .join(';');
}

function emit() {
  listeners.slice().forEach(listener => listener(get()));
}

function apply(value, options = {}) {
  current = normalize(value);
  if (options.persist !== false) {
    try { wx.setStorageSync(STORAGE_KEY, current); } catch (e) {}
  }
  emit();
  return get();
}

function restore() {
  try {
    const cached = wx.getStorageSync(STORAGE_KEY);
    if (cached) current = normalize(cached);
  } catch (e) {}
  return get();
}

function get() {
  return Object.assign({}, current);
}

function subscribe(listener) {
  if (typeof listener === 'function' && !listeners.includes(listener)) {
    listeners.push(listener);
  }
  return () => unsubscribe(listener);
}

function unsubscribe(listener) {
  const index = listeners.indexOf(listener);
  if (index >= 0) listeners.splice(index, 1);
}

function viewModel(value) {
  const appearance = normalize(value || current);
  return {
    appearance,
    className: `theme-color-${appearance.color_scheme} theme-style-${appearance.style_scheme}`,
    style: styleVariables(appearance),
    color: COLOR_SCHEMES[appearance.color_scheme],
    design: STYLE_SCHEMES[appearance.style_scheme]
  };
}

module.exports = {
  COLOR_SCHEMES,
  STYLE_SCHEMES,
  DEFAULT_APPEARANCE,
  normalize,
  apply,
  restore,
  get,
  subscribe,
  unsubscribe,
  viewModel,
  styleVariables
};
