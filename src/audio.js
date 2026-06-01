// audio.js — local music playback, spectrum visualizer, and volume→mouth lip-sync.
import { log } from './logger.js';

const fmt = s => {
  if (!isFinite(s)) return '00:00';
  const m = Math.floor(s / 60), x = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`;
};

export class AudioPlayer {
  constructor({ onMouth }) {
    this.onMouth = onMouth || (() => {});
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.playlist = [];
    this.index = -1;
    this.ctx = null; this.analyser = null; this.freq = null; this.time = null;
    this.mouth = 0;
    this._seeking = false;
    this._raf = 0;
    this.el = {};
  }

  mount() {
    const $ = id => document.getElementById(id);
    this.el = {
      pick: $('music-pick'), file: $('file-music'), play: $('music-play'),
      prev: $('music-prev'), next: $('music-next'), seek: $('music-seek'),
      vol: $('music-vol'), track: $('music-track'), viz: $('music-viz'),
      lipsync: $('music-lipsync'), loop: $('music-loop'),
      timeLbl: document.querySelector('[data-val="music-time"]'),
      volLbl: document.querySelector('[data-val="music-vol"]'),
    };
    this.vctx = this.el.viz ? this.el.viz.getContext('2d') : null;

    this.el.pick.addEventListener('click', () => this.el.file.click());
    this.el.file.addEventListener('change', e => this.addFiles(e.target.files));
    this.el.play.addEventListener('click', () => this.toggle());
    this.el.prev.addEventListener('click', () => this.prev());
    this.el.next.addEventListener('click', () => this.next());
    this.el.vol.addEventListener('input', e => { this.audio.volume = e.target.value / 100; if (this.el.volLbl) this.el.volLbl.textContent = e.target.value + '%'; });
    this.el.loop.addEventListener('change', e => { this.audio.loop = e.target.checked; });
    this.el.seek.addEventListener('input', e => {
      this._seeking = true;
      if (this.audio.duration) this._seekPreview = (e.target.value / 1000) * this.audio.duration;
    });
    this.el.seek.addEventListener('change', e => {
      if (this.audio.duration) this.audio.currentTime = (e.target.value / 1000) * this.audio.duration;
      this._seeking = false;
    });

    this.audio.volume = (this.el.vol?.value ?? 80) / 100;
    this.audio.addEventListener('timeupdate', () => this._onTime());
    this.audio.addEventListener('ended', () => { if (!this.audio.loop) this.next(); });
    this.audio.addEventListener('play', () => { this.el.play.textContent = '⏸'; });
    this.audio.addEventListener('pause', () => { this.el.play.textContent = '▶'; });
    this.audio.addEventListener('error', () => log.error('音频播放错误'));
  }

  addFiles(fileList) {
    const files = Array.from(fileList || []).filter(f => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(f.name));
    if (!files.length) { log.warn('未选择有效的音频文件'); return; }
    for (const f of files) this.playlist.push({ name: f.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(f) });
    log.ok(`已添加 ${files.length} 首曲目，共 ${this.playlist.length} 首`);
    if (this.index < 0) this.load(0, true);
  }

  load(i, autoplay) {
    if (!this.playlist.length) return;
    this.index = (i + this.playlist.length) % this.playlist.length;
    const t = this.playlist[this.index];
    this.audio.src = t.url;
    if (this.el.track) this.el.track.textContent = `♪ ${t.name}  (${this.index + 1}/${this.playlist.length})`;
    if (autoplay) this.play();
  }

  _ensureGraph() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      const src = this.ctx.createMediaElementSource(this.audio);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.7;
      this.freq = new Uint8Array(this.analyser.frequencyBinCount);
      this.time = new Uint8Array(this.analyser.fftSize);
      src.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      this._renderLoop();
      log.ok('音频分析链路已建立（口型同步 / 频谱）');
    } catch (e) { log.warn('无法建立音频分析链路', e); }
  }

  async play() {
    if (this.index < 0 && this.playlist.length) this.load(0, false);
    this._ensureGraph();
    if (this.ctx && this.ctx.state === 'suspended') { try { await this.ctx.resume(); } catch {} }
    try { await this.audio.play(); } catch (e) { log.warn('播放被拒绝（需用户交互）', e); }
  }
  pause() { this.audio.pause(); }
  toggle() { this.audio.paused ? this.play() : this.pause(); }
  next() { if (this.playlist.length) this.load(this.index + 1, true); }
  prev() { if (this.playlist.length) this.load(this.index - 1, true); }

  _onTime() {
    if (this._seeking || !this.audio.duration) return;
    const p = this.audio.currentTime / this.audio.duration;
    if (this.el.seek) this.el.seek.value = Math.round(p * 1000);
    if (this.el.timeLbl) this.el.timeLbl.textContent = `${fmt(this.audio.currentTime)} / ${fmt(this.audio.duration)}`;
  }

  _renderLoop() {
    const draw = () => {
      this._raf = requestAnimationFrame(draw);
      if (!this.analyser) return;
      this.analyser.getByteFrequencyData(this.freq);
      this.analyser.getByteTimeDomainData(this.time);

      // lip-sync: RMS of waveform
      let sum = 0;
      for (let i = 0; i < this.time.length; i++) { const d = (this.time[i] - 128) / 128; sum += d * d; }
      const rms = Math.sqrt(sum / this.time.length);
      const target = this.audio.paused ? 0 : Math.min(1, rms * 3.6);
      this.mouth += (target - this.mouth) * 0.45;
      this.onMouth(this.mouth);

      // spectrum bars
      const c = this.vctx, cv = this.el.viz;
      if (c && cv) {
        c.clearRect(0, 0, cv.width, cv.height);
        const n = 48, step = Math.floor(this.freq.length / n);
        const bw = cv.width / n;
        for (let i = 0; i < n; i++) {
          const v = this.freq[i * step] / 255;
          const h = v * cv.height;
          const g = c.createLinearGradient(0, cv.height, 0, cv.height - h);
          g.addColorStop(0, '#7cc7ff'); g.addColorStop(1, '#ff9bd0');
          c.fillStyle = g;
          c.fillRect(i * bw + 1, cv.height - h, bw - 2, h);
        }
      }
    };
    this._raf = requestAnimationFrame(draw);
  }
}
