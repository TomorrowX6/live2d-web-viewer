// presets.js — built-in models, background skies, and filter looks.

export const BG_PRESETS = [
  { id: 'day', name: '晴空', pico: '☀️', top: '#4a90e2', mid: '#7fb8f0', bottom: '#cdeaff', celestial: 'sun', stars: false },
  { id: 'sunset', name: '黄昏', pico: '🌇', top: '#ff9a56', mid: '#ff5e7e', bottom: '#7a3b8f', celestial: 'sun', stars: false },
  { id: 'night', name: '星夜', pico: '🌙', top: '#0b1026', mid: '#1b2a4a', bottom: '#33476e', celestial: 'moon', stars: true },
  { id: 'sakura', name: '樱色', pico: '🌸', top: '#ffd0e2', mid: '#ffe0ec', bottom: '#fff2f7', celestial: 'none', stars: false },
  { id: 'mint', name: '薄荷', pico: '🍃', top: '#9be7d8', mid: '#bfeede', bottom: '#fde3ec', celestial: 'none', stars: false },
  { id: 'ocean', name: '海洋', pico: '🌊', top: '#1f8fb0', mid: '#3fb3d0', bottom: '#9fe3ef', celestial: 'sun', stars: false },
  { id: 'aurora', name: '极光', pico: '🌌', top: '#0f2027', mid: '#203a5a', bottom: '#2c8a78', celestial: 'moon', stars: true },
  { id: 'grape', name: '葡萄', pico: '🍇', top: '#5b4aa0', mid: '#9a6fbf', bottom: '#eaafc8', celestial: 'none', stars: false },
  { id: 'ember', name: '火烧云', pico: '🔥', top: '#cf1020', mid: '#f1571b', bottom: '#f5c542', celestial: 'sun', stars: false },
  { id: 'snowfield', name: '雪原', pico: '❄️', top: '#bcd6ff', mid: '#dceaff', bottom: '#ffffff', celestial: 'none', stars: false },
  { id: 'midnight', name: '深夜', pico: '🌃', top: '#06070d', mid: '#10131f', bottom: '#1c2336', celestial: 'moon', stars: true },
  { id: 'cotton', name: '棉花糖', pico: '🍬', top: '#a1c4fd', mid: '#c2b8fb', bottom: '#c2e9fb', celestial: 'none', stars: false },
];

export function bgSwatch(p) {
  const stops = p.mid ? `${p.top}, ${p.mid}, ${p.bottom}` : `${p.top}, ${p.bottom}`;
  return `linear-gradient(160deg, ${stops})`;
}

const NEUTRAL = { bright: 100, contrast: 100, sat: 100, hue: 0, blur: 0, sepia: 0, gray: 0 };

export const FILTER_PRESETS = [
  { id: 'none', name: '原图', v: { ...NEUTRAL } },
  { id: 'vivid', name: '鲜艳', v: { ...NEUTRAL, bright: 108, contrast: 110, sat: 150 } },
  { id: 'warm', name: '暖阳', v: { ...NEUTRAL, bright: 106, sat: 128, hue: 350, sepia: 22 } },
  { id: 'cool', name: '冷调', v: { ...NEUTRAL, bright: 103, contrast: 104, sat: 115, hue: 20 } },
  { id: 'noir', name: '黑白', v: { ...NEUTRAL, contrast: 118, gray: 100 } },
  { id: 'vintage', name: '怀旧', v: { ...NEUTRAL, bright: 104, contrast: 96, sat: 90, sepia: 58 } },
  { id: 'dreamy', name: '梦幻', v: { ...NEUTRAL, bright: 112, contrast: 92, sat: 124, blur: 1 } },
  { id: 'cyber', name: '赛博', v: { ...NEUTRAL, contrast: 122, sat: 165, hue: 210 } },
  { id: 'sakura', name: '樱粉', v: { ...NEUTRAL, bright: 108, sat: 135, hue: 330 } },
  { id: 'night', name: '夜幕', v: { ...NEUTRAL, bright: 78, contrast: 112, sat: 92 } },
  { id: 'film', name: '胶片', v: { ...NEUTRAL, bright: 98, contrast: 112, sat: 118, sepia: 20 } },
  { id: 'ice', name: '冰蓝', v: { ...NEUTRAL, bright: 104, sat: 120, hue: 175 } },
];

export { NEUTRAL };
