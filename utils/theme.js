const STORAGE_KEY = 'PLDP_UI_APPEARANCE_V1';

function palette(name, reference, primary, pageBg, tint, twoTone = false) {
  return {
    name, reference, primary, pageBg, tint, twoTone,
    primaryStrong: primary,
    primaryBright: primary,
    primarySoft: tint,
    primaryPale: tint,
    gradientStart: primary,
    gradientEnd: twoTone || reference === '#EB6127' ? primary : reference,
    surface: twoTone ? pageBg : '#FFFDF9',
    surfaceMuted: tint,
    fieldBg: twoTone ? pageBg : '#FFFDF9',
    ink: twoTone ? primary : '#222622',
    muted: twoTone ? primary : '#535952',
    border: twoTone ? primary : '#D9D3C8',
    onPrimary: twoTone ? pageBg : '#FFFFFF'
  };
}

const COLOR_SCHEMES = {
  amethyst: palette('晶石紫＋米白', '#690DAD', '#690DAD', '#F7F3EA', '#EFE1F8'),
  mars: palette('火星橙＋米白', '#EB6127', '#A43D15', '#F7F3EA', '#FBE7D9'),
  ash: palette('星灰绿＋米白', '#003D37', '#003D37', '#F7F3EA', '#E0ECE5'),
  splashed: palette('洒蓝＋米白', '#182876', '#182876', '#F7F3EA', '#E5E9F7'),
  navy_orange: palette('深蓝＋爱马仕橙', '#000026', '#000026', '#FF770F', '#FF770F', true),
  teal_rose: palette('马尔斯绿＋玫瑰粉', '#01847F', '#005C58', '#F9D2E4', '#F9D2E4', true),
  prussian_mist: palette('普鲁士蓝＋雾灰', '#003153', '#003153', '#E5DDD7', '#E5DDD7', true),
  klein_yellow: palette('克莱因蓝＋松花黄', '#002FA7', '#002FA7', '#FFE76F', '#FFE76F', true),
};

const RETIRED_COLORS = new Map([
  ['jade', 'ash'],
  ['ocean', 'splashed'],
  ['amber', 'mars']
]);

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
  color_scheme: 'ash',
  style_scheme: 'flow',
  option_code: 'ash-flow',
  owner_organization_id: null,
  owner_organization_name: ''
});

let current = Object.assign({}, DEFAULT_APPEARANCE);
const listeners = [];

function normalize(value) {
  const source = value && typeof value === 'object' ? value : {};
  const requestedColor = RETIRED_COLORS.get(source.color_scheme) || source.color_scheme;
  const color = typeof requestedColor === 'string'
    && Object.prototype.hasOwnProperty.call(COLOR_SCHEMES, requestedColor)
    ? requestedColor
    : DEFAULT_APPEARANCE.color_scheme;
  const style = typeof source.style_scheme === 'string'
    && Object.prototype.hasOwnProperty.call(STYLE_SCHEMES, source.style_scheme)
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

function personalSelection(value) {
  const { color_scheme, style_scheme } = value || {};
  if (typeof color_scheme !== 'string' || typeof style_scheme !== 'string'
    || !Object.prototype.hasOwnProperty.call(COLOR_SCHEMES, color_scheme)
    || !Object.prototype.hasOwnProperty.call(STYLE_SCHEMES, style_scheme)) return null;
  return { color_scheme, style_scheme };
}

function readPersonalAppearance(key) {
  if (!key) return null;
  try {
    const saved = wx.getStorageSync(key);
    if (!saved) return null;
    return personalSelection({
      ...saved,
      color_scheme: RETIRED_COLORS.get(saved.color_scheme) || saved.color_scheme
    });
  } catch (e) { return null; }
}

function savePersonalAppearance(key, value) {
  const selection = personalSelection(value);
  if (!key || !selection) return false;
  try {
    wx.setStorageSync(key, selection);
    return true;
  } catch (e) {
    return false;
  }
}

function styleVariables(appearance) {
  const selected = normalize(appearance);
  const color = COLOR_SCHEMES[selected.color_scheme];
  const style = STYLE_SCHEMES[selected.style_scheme];
  const variables = {
    '--ui-primary': color.primary,
    '--ui-on-primary': color.onPrimary,
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
    '--ui-card-shadow': color.twoTone ? 'none' : style.cardShadow,
    '--ui-border-width': color.twoTone ? '1rpx' : style.borderWidth
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
    className: `theme-color-${appearance.color_scheme} theme-style-${appearance.style_scheme}${COLOR_SCHEMES[appearance.color_scheme].twoTone ? ' theme-two-tone' : ''}`,
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
  readPersonalAppearance,
  savePersonalAppearance,
  apply,
  restore,
  get,
  subscribe,
  unsubscribe,
  viewModel,
  styleVariables
};
