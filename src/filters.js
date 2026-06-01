// filters.js — global look filters via CSS `filter` on the render stage.
import { log } from './logger.js';
import { FILTER_PRESETS, NEUTRAL } from './presets.js';

const SLIDERS = {
  bright: { id: 'f-bright', unit: '%' },
  contrast: { id: 'f-contrast', unit: '%' },
  sat: { id: 'f-sat', unit: '%' },
  hue: { id: 'f-hue', unit: '°' },
  blur: { id: 'f-blur', unit: '' },
  sepia: { id: 'f-sepia', unit: '%' },
  gray: { id: 'f-gray', unit: '%' },
};

export class FilterController {
  constructor(stageEl, onChange) {
    this.stage = stageEl;
    this.onChange = onChange || (() => {});
    this.state = { ...NEUTRAL };
    this.presetsEl = document.getElementById('filter-presets');
  }

  css() {
    const s = this.state;
    return `brightness(${s.bright}%) contrast(${s.contrast}%) saturate(${s.sat}%) ` +
           `hue-rotate(${s.hue}deg) blur(${s.blur}px) sepia(${s.sepia}%) grayscale(${s.gray}%)`;
  }
  apply() { this.stage.style.filter = this.css(); this.onChange(this.state); }

  _label(key) {
    const cfg = SLIDERS[key];
    const el = document.querySelector(`[data-val="${cfg.id}"]`);
    if (el) el.textContent = this.state[key] + cfg.unit;
  }
  syncUI() {
    for (const key of Object.keys(SLIDERS)) {
      const input = document.getElementById(SLIDERS[key].id);
      if (input) input.value = this.state[key];
      this._label(key);
    }
  }

  setValue(key, val) {
    this.state[key] = Number(val);
    this._label(key);
    this.apply();
    this._clearActive();
  }
  applyPreset(p) {
    this.state = { ...p.v };
    this.syncUI();
    this.apply();
    this._markActive(p.id);
    log.info('滤镜：' + p.name);
  }
  reset() {
    this.state = { ...NEUTRAL };
    this.syncUI();
    this.apply();
    this._markActive('none');
  }

  _clearActive() { this.presetsEl && this.presetsEl.querySelectorAll('.tag').forEach(t => t.classList.remove('active')); }
  _markActive(id) { this._clearActive(); const t = this.presetsEl && this.presetsEl.querySelector(`[data-fp="${id}"]`); if (t) t.classList.add('active'); }

  mount() {
    // preset chips
    if (this.presetsEl) {
      this.presetsEl.innerHTML = '';
      for (const p of FILTER_PRESETS) {
        const b = document.createElement('button');
        b.className = 'tag'; b.textContent = p.name; b.dataset.fp = p.id;
        b.addEventListener('click', () => this.applyPreset(p));
        this.presetsEl.appendChild(b);
      }
    }
    // sliders
    for (const key of Object.keys(SLIDERS)) {
      const input = document.getElementById(SLIDERS[key].id);
      if (input) input.addEventListener('input', e => this.setValue(key, e.target.value));
    }
    const reset = document.getElementById('f-reset');
    if (reset) reset.addEventListener('click', () => this.reset());
    this.syncUI();
    this.apply();
  }

  serialize() { return { ...this.state }; }
  restore(state) { if (state) { this.state = { ...NEUTRAL, ...state }; this.syncUI(); this.apply(); } }
}
