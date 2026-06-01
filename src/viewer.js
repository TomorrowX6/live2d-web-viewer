// viewer.js — PixiJS (v7) + pixi-live2d-display model controller.
import { log } from './logger.js';

const PIXI = window.PIXI;

export class Viewer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.app = new PIXI.Application({
      view: canvas,
      backgroundAlpha: 0,
      antialias: opts.antialias !== false,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      resizeTo: window,
      sharedTicker: true,
    });
    this.model = null;
    this.rawJson = null;
    this.name = '';
    this.format = '';
    this.t = { fx: 0, fy: 0, scale: 1, rot: 0, alpha: 1, base: 1 };
    this.trackMouse = true;
    this.tapMotion = false;
    this.lipsync = false;
    this.mouthValue = 0;

    if (PIXI.live2d && PIXI.live2d.Live2DModel && PIXI.live2d.Live2DModel.registerTicker) {
      try { PIXI.live2d.Live2DModel.registerTicker(PIXI.Ticker); } catch (e) { /* auto-registered */ }
    }
    // mouth driver runs every shared-ticker frame, just after the model's own update
    PIXI.Ticker.shared.add(this._applyMouth, this);

    window.addEventListener('pointermove', e => {
      if (this.model && this.trackMouse) this.model.focus(e.clientX, e.clientY);
    });
    canvas.addEventListener('pointerdown', e => {
      if (this.model && this.tapMotion) this.randomMotion();
    });
    window.addEventListener('resize', () => this.applyTransform());
    log.ok('PixiJS v' + PIXI.VERSION + ' Live2D 渲染器已就绪');
  }

  get screen() { return this.app.screen; }

  async load(target) {
    // target: { source: url|settings, rawJson?, name, format }
    this.clear();
    log.info(`正在加载模型：${target.name || target.source}`);
    let model;
    try {
      model = await PIXI.live2d.Live2DModel.from(target.source, { autoInteract: false });
    } catch (e) {
      log.error('模型加载失败：', e);
      throw e;
    }
    this.model = model;
    this.name = target.name || '模型';
    this.format = target.format || '';
    this.rawJson = target.rawJson || this._extractRaw(model);

    this.app.stage.addChild(model);
    model.x = this.screen.width / 2;
    model.y = this.screen.height / 2;

    await new Promise(r => requestAnimationFrame(r));
    this.fit();
    this._buildLabels();
    log.ok(`模型已加载：${this.name}`);
    return model;
  }

  _extractRaw(model) {
    try {
      const s = model.internalModel && model.internalModel.settings;
      return (s && (s.json || s._json)) || null;
    } catch { return null; }
  }

  _buildLabels() {
    this.exprLabel = {};
    const j = this.rawJson;
    const mo = j && j.FileReferences && j.FileReferences.Motions;
    if (mo && Array.isArray(mo.expressions)) {
      for (const it of mo.expressions) if (it && it.Expression) this.exprLabel[it.Expression] = it.Name || it.Expression;
    }
  }

  getActions() {
    const out = { expressions: [], motions: [] };
    const j = this.rawJson;
    if (j && j.FileReferences) {
      const exprs = j.FileReferences.Expressions;
      if (Array.isArray(exprs)) {
        for (const e of exprs) {
          const id = e.Name || e.name;
          if (id) out.expressions.push({ id, label: (this.exprLabel && this.exprLabel[id]) || id });
        }
      }
      // real motions: groups whose entries have a File
      const motions = j.FileReferences.Motions;
      if (motions && typeof motions === 'object') {
        for (const g of Object.keys(motions)) {
          const arr = motions[g];
          if (Array.isArray(arr) && arr.some(m => m && (m.File || m.file))) {
            out.motions.push({ group: g, count: arr.length });
          }
        }
      }
    }
    // fallback to runtime motion manager groups
    if (!out.motions.length) {
      try {
        const defs = this.model.internalModel.motionManager.definitions || {};
        for (const g of Object.keys(defs)) {
          const arr = defs[g];
          if (Array.isArray(arr) && arr.length && arr.some(m => m && (m.File || m.file))) out.motions.push({ group: g, count: arr.length });
        }
      } catch { /* ignore */ }
    }
    return out;
  }

  setExpression(id) {
    if (!this.model) return;
    try { this.model.expression(id); log.info('表情：' + ((this.exprLabel && this.exprLabel[id]) || id)); }
    catch (e) { log.warn('设置表情失败', e); }
  }
  resetExpression() { if (this.model) { try { this.model.expression(); } catch {} } }

  playMotion(group, index) {
    if (!this.model) return;
    try { this.model.motion(group, index); log.info(`动作：${group}${index != null ? ' #' + index : ''}`); }
    catch (e) { log.warn('播放动作失败', e); }
  }
  randomMotion() {
    const a = this.getActions();
    if (a.motions.length) {
      const m = a.motions[Math.floor(Math.random() * a.motions.length)];
      this.playMotion(m.group, Math.floor(Math.random() * m.count));
    } else if (a.expressions.length) {
      const e = a.expressions[Math.floor(Math.random() * a.expressions.length)];
      this.setExpression(e.id);
    }
  }

  /* transforms */
  fit() {
    if (!this.model) return;
    const b = this.model.getLocalBounds();
    const bw = Math.max(1, b.width), bh = Math.max(1, b.height);
    const availW = this.screen.width * 0.82, availH = this.screen.height * 0.92;
    let s = Math.min(availW / bw, availH / bh);
    this.t.base = Math.max(0.02, Math.min(s, 6));
    this.t.scale = 1; this.t.fx = 0; this.t.fy = 0; this.t.rot = 0;
    this.model.pivot.set(b.x + bw / 2, b.y + bh / 2);
    this.applyTransform();
  }
  applyTransform() {
    if (!this.model) return;
    const sc = this.t.base * this.t.scale;
    this.model.scale.set(sc);
    this.model.x = this.screen.width / 2 + this.t.fx * this.screen.width * 0.5;
    this.model.y = this.screen.height / 2 + this.t.fy * this.screen.height * 0.5;
    this.model.rotation = (this.t.rot * Math.PI) / 180;
    this.model.alpha = this.t.alpha;
  }
  set(prop, val) { this.t[prop] = val; this.applyTransform(); }
  reset() { this.t = { fx: 0, fy: 0, scale: 1, rot: 0, alpha: 1, base: this.t.base }; this.fit(); }

  setTrackMouse(on) {
    this.trackMouse = on;
    if (!on && this.model) this.model.focus(this.screen.width / 2, this.screen.height / 2);
  }
  setTapMotion(on) { this.tapMotion = on; }

  setBreath(on) {
    if (!this.model || !this.model.internalModel) return;
    const im = this.model.internalModel;
    try {
      if (!this._savedBlink) this._savedBlink = im.eyeBlink;
      if (!this._savedBreath) this._savedBreath = im.breath;
      im.eyeBlink = on ? this._savedBlink : undefined;
      im.breath = on ? this._savedBreath : undefined;
    } catch (e) { log.debug('breath toggle', e); }
  }

  /* lipsync */
  enableLipsync(on) { this.lipsync = on; if (!on) this.mouthValue = 0; }
  setMouth(v) { this.mouthValue = Math.max(0, Math.min(1, v)); }
  _applyMouth() {
    if (!this.model || !this.lipsync) return;
    const core = this.model.internalModel && this.model.internalModel.coreModel;
    if (!core) return;
    const v = this.mouthValue;
    try {
      if (typeof core.setParameterValueById === 'function') core.setParameterValueById('ParamMouthOpenY', v);
      else if (typeof core.setParamFloat === 'function') core.setParamFloat('PARAM_MOUTH_OPEN_Y', v);
    } catch { /* param missing */ }
  }

  screenshot() {
    try {
      // composite the bg canvas + live2d canvas
      const bg = document.getElementById('bg-canvas');
      const out = document.createElement('canvas');
      out.width = window.innerWidth; out.height = window.innerHeight;
      const ctx = out.getContext('2d');
      ctx.drawImage(bg, 0, 0, out.width, out.height);
      this.app.renderer.render(this.app.stage);
      ctx.drawImage(this.canvas, 0, 0, out.width, out.height);
      return out.toDataURL('image/png');
    } catch (e) { log.error('截图失败', e); return null; }
  }

  clear() {
    if (this.model) {
      this.app.stage.removeChild(this.model);
      try { this.model.destroy({ children: true }); } catch {}
      this.model = null; this.rawJson = null;
    }
  }
}
