// scene.js — three.js powered background: gradient skies, celestial bodies,
// stars, parallax, and rain / snow / sakura particle weather systems.
import { log } from './logger.js';

const THREE = window.THREE;

/* ---------- procedural sprite textures ---------- */
function makeCanvas(s = 64) { const c = document.createElement('canvas'); c.width = c.height = s; return c; }

function rainTexture() {
  const c = makeCanvas(32); const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 32);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(200,225,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(13, 0, 6, 32);
  return new THREE.CanvasTexture(c);
}
function snowTexture() {
  const c = makeCanvas(64); const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.beginPath(); x.arc(32, 32, 30, 0, Math.PI * 2); x.fill();
  return new THREE.CanvasTexture(c);
}
function sakuraTexture() {
  const c = makeCanvas(64); const x = c.getContext('2d');
  x.translate(32, 32);
  for (let i = 0; i < 5; i++) {
    x.rotate((Math.PI * 2) / 5);
    const g = x.createLinearGradient(0, 0, 0, -26);
    g.addColorStop(0, 'rgba(255,183,206,0.95)');
    g.addColorStop(1, 'rgba(255,228,236,0.7)');
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(0, 0);
    x.bezierCurveTo(7, -12, 6, -22, 0, -26);
    x.bezierCurveTo(-6, -22, -7, -12, 0, 0);
    x.fill();
  }
  return new THREE.CanvasTexture(c);
}
function discTexture(inner, outer) {
  const c = makeCanvas(128); const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, inner); g.addColorStop(0.55, outer); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.beginPath(); x.arc(64, 64, 62, 0, Math.PI * 2); x.fill();
  return new THREE.CanvasTexture(c);
}

export class Scene3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: false });
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 4000);
    this.camera.position.set(0, 0, 600);

    this.maxDpr = 2;
    this.weatherType = 'none';
    this.params = { amount: 900, speed: 100, wind: 20, size: 100 };
    this.parallax = true;
    this.celestialOn = true;
    this._mouse = { x: 0, y: 0 };
    this._target = { x: 0, y: 0 };
    this.half = { w: 700, h: 500 };

    this.tex = { rain: rainTexture(), snow: snowTexture(), sakura: sakuraTexture() };
    this.groupCelestial = new THREE.Group();
    this.scene.add(this.groupCelestial);
    this.points = null;            // active weather Points
    this.geo = null;
    this.attrs = null;             // {pos, vel, seed}
    this.stars = null;

    this._clock = new THREE.Clock();
    this._raf = 0;
    this._onResize = () => this.resize();
    this._onMove = e => {
      const w = window.innerWidth, h = window.innerHeight;
      this._target.x = (e.clientX / w - 0.5) * 2;
      this._target.y = (e.clientY / h - 0.5) * 2;
    };
    window.addEventListener('resize', this._onResize);
    window.addEventListener('pointermove', this._onMove);
    this.resize();
    log.ok('three.js 背景引擎已就绪');
  }

  setQuality(q) {
    const dpr = window.devicePixelRatio || 1;
    if (q === 'low') this.maxDpr = 1;
    else if (q === 'ultra') this.maxDpr = 2;
    else if (q === 'high') this.maxDpr = Math.min(dpr, 1.75);
    else this.maxDpr = Math.min(dpr, 2); // auto
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.maxDpr));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // spawn box that covers the frustum near z=0 with margin
    const vH = 2 * Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.position.z;
    this.half.h = (vH / 2) * 1.25;
    this.half.w = this.half.h * this.camera.aspect * 1.25;
  }

  /* ---------- background sky ---------- */
  applyBackground(def) {
    this.currentBg = def;
    const cvs = document.createElement('canvas');
    cvs.width = 16; cvs.height = 512;
    const x = cvs.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, def.top);
    if (def.mid) g.addColorStop(0.5, def.mid);
    g.addColorStop(1, def.bottom);
    x.fillStyle = g; x.fillRect(0, 0, 16, 512);
    const tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace || tex.colorSpace;
    if (this.scene.background && this.scene.background.dispose) this.scene.background.dispose();
    this.scene.background = tex;
    this._buildCelestial(def);
    log.info(`背景已切换：${def.name}`);
  }

  setCustomGradient(c1, c2) {
    this.applyBackground({ name: '自定义渐变', top: c1, bottom: c2, celestial: 'none', stars: false });
  }

  setBackgroundImage(url, name = '自定义图片') {
    new THREE.TextureLoader().load(url, tex => {
      tex.colorSpace = THREE.SRGBColorSpace || tex.colorSpace;
      if (this.scene.background && this.scene.background.dispose) this.scene.background.dispose();
      this.scene.background = tex;
      this._clearCelestial();
      log.ok(`背景图片已应用：${name}`);
    }, undefined, err => log.error('背景图片加载失败', err));
  }

  _clearCelestial() {
    while (this.groupCelestial.children.length) {
      const o = this.groupCelestial.children.pop();
      o.material && o.material.dispose && o.material.dispose();
      this.groupCelestial.remove(o);
    }
    if (this.stars) { this.scene.remove(this.stars); this.stars.geometry.dispose(); this.stars.material.dispose(); this.stars = null; }
  }

  _buildCelestial(def) {
    this._clearCelestial();
    if (!this.celestialOn) return;
    if (def.celestial === 'sun') {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTexture('rgba(255,250,220,1)', 'rgba(255,210,130,0.7)'), transparent: true, depthWrite: false }));
      s.scale.set(260, 260, 1); s.position.set(this.half.w * 0.45, this.half.h * 0.5, -300);
      this.groupCelestial.add(s);
    } else if (def.celestial === 'moon') {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTexture('rgba(245,247,255,1)', 'rgba(180,200,240,0.55)'), transparent: true, depthWrite: false }));
      s.scale.set(180, 180, 1); s.position.set(-this.half.w * 0.42, this.half.h * 0.52, -300);
      this.groupCelestial.add(s);
    }
    if (def.stars) this._buildStars();
  }

  _buildStars() {
    const n = 380;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * this.half.w * 3.2;
      pos[i * 3 + 1] = Math.random() * this.half.h * 1.6 - this.half.h * 0.1;
      pos[i * 3 + 2] = -260 - Math.random() * 200;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 3.2, transparent: true, opacity: 0.85, sizeAttenuation: true, depthWrite: false });
    this.stars = new THREE.Points(geo, mat);
    this.scene.add(this.stars);
  }

  setCelestial(on) { this.celestialOn = on; if (this.currentBg) this._buildCelestial(this.currentBg); }
  setParallax(on) { this.parallax = on; if (!on) { this.groupCelestial.position.set(0, 0, 0); } }

  /* ---------- weather ---------- */
  setWeather(type) {
    this.weatherType = type;
    this._buildWeather();
    log.info(`天气特效：${({ none: '关闭', rain: '雨', snow: '雪', sakura: '樱花' })[type] || type}`);
  }
  setWeatherParams(p) { Object.assign(this.params, p); this._buildWeather(); }

  _disposeWeather() {
    if (this.points) { this.scene.remove(this.points); this.geo.dispose(); this.points.material.dispose(); this.points = null; this.geo = null; this.attrs = null; }
  }

  _buildWeather() {
    this._disposeWeather();
    const type = this.weatherType;
    if (type === 'none') return;
    const n = Math.max(50, Math.floor(this.params.amount));
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n);    // base fall speed factor
    const seed = new Float32Array(n);   // phase for sway
    const ext = this.half;
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * ext.w * 2.4;
      pos[i * 3 + 1] = (Math.random() - 0.5) * ext.h * 2.4;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 500 + 60;
      vel[i] = 0.6 + Math.random() * 0.8;
      seed[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const sizeMul = this.params.size / 100;
    let mat;
    if (type === 'rain') {
      mat = new THREE.PointsMaterial({ map: this.tex.rain, size: 26 * sizeMul, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    } else if (type === 'snow') {
      mat = new THREE.PointsMaterial({ map: this.tex.snow, size: 13 * sizeMul, transparent: true, opacity: 0.9, depthWrite: false, sizeAttenuation: true });
    } else { // sakura
      mat = new THREE.PointsMaterial({ map: this.tex.sakura, size: 22 * sizeMul, transparent: true, opacity: 0.95, depthWrite: false, sizeAttenuation: true });
    }
    this.points = new THREE.Points(geo, mat);
    this.geo = geo;
    this.attrs = { pos, vel, seed, n };
    this.scene.add(this.points);
  }

  _updateWeather(dt, t) {
    if (!this.points) return;
    const { pos, vel, seed, n } = this.attrs;
    const ext = this.half;
    const type = this.weatherType;
    const sp = (this.params.speed / 100);
    const wind = this.params.wind / 100;
    const fallBase = type === 'rain' ? 820 : type === 'snow' ? 90 : 70;
    const sway = type === 'rain' ? 0 : (type === 'snow' ? 24 : 46);
    for (let i = 0; i < n; i++) {
      const j = i * 3;
      pos[j + 1] -= fallBase * sp * vel[i] * dt;
      pos[j] += (wind * 160 * dt) + (sway * Math.sin(t * 1.3 + seed[i]) * dt);
      if (type === 'sakura') pos[j] += Math.cos(t * 0.8 + seed[i]) * 18 * dt;
      if (pos[j + 1] < -ext.h * 1.2) { pos[j + 1] = ext.h * 1.2; pos[j] = (Math.random() - 0.5) * ext.w * 2.4; }
      if (pos[j] > ext.w * 1.3) pos[j] = -ext.w * 1.3;
      else if (pos[j] < -ext.w * 1.3) pos[j] = ext.w * 1.3;
    }
    this.geo.attributes.position.needsUpdate = true;
  }

  start() {
    if (this._raf) return;
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(this._clock.getDelta(), 0.05);
      const t = this._clock.elapsedTime;
      // parallax easing
      this._mouse.x += (this._target.x - this._mouse.x) * 0.05;
      this._mouse.y += (this._target.y - this._mouse.y) * 0.05;
      if (this.parallax) {
        this.groupCelestial.position.x = -this._mouse.x * 26;
        this.groupCelestial.position.y = this._mouse.y * 18;
        this.camera.position.x = this._mouse.x * 12;
        this.camera.position.y = -this._mouse.y * 8;
        this.camera.lookAt(0, 0, 0);
      }
      if (this.stars) this.stars.material.opacity = 0.65 + Math.sin(t * 0.8) * 0.2;
      this._updateWeather(dt, t);
      this.renderer.render(this.scene, this.camera);
    };
    this._raf = requestAnimationFrame(loop);
  }
}
