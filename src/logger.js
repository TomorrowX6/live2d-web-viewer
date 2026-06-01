// logger.js — in-app console / log output with level filtering.
const LEVELS = { debug: 0, info: 1, ok: 1, warn: 2, error: 3 };

class Logger {
  constructor() {
    this.entries = [];
    this.max = 500;
    this.filter = 'all';
    this.autoscroll = true;
    this.out = null;
    this._patchConsole();
    this._catchGlobal();
  }

  attach(outputEl) {
    this.out = outputEl;
    this.render();
  }

  _stamp() {
    const d = new Date();
    const p = (n, l = 2) => String(n).padStart(l, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
  }

  push(level, args) {
    const msg = args.map(a => {
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === 'object') { try { return JSON.stringify(a); } catch { return String(a); } }
      return String(a);
    }).join(' ');
    const entry = { t: this._stamp(), level, msg };
    this.entries.push(entry);
    if (this.entries.length > this.max) this.entries.shift();
    this._append(entry);
  }

  debug(...a) { this.push('debug', a); }
  info(...a) { this.push('info', a); }
  ok(...a) { this.push('ok', a); }
  warn(...a) { this.push('warn', a); }
  error(...a) { this.push('error', a); }

  _visible(level) {
    if (this.filter === 'all') return true;
    return LEVELS[level] >= LEVELS[this.filter];
  }

  _row(entry) {
    const div = document.createElement('div');
    div.className = `log-line ${entry.level}`;
    const t = document.createElement('span'); t.className = 'lt'; t.textContent = entry.t;
    const m = document.createElement('span'); m.className = 'lm'; m.textContent = entry.msg;
    div.append(t, m);
    return div;
  }

  _append(entry) {
    if (!this.out || !this._visible(entry.level)) return;
    this.out.appendChild(this._row(entry));
    while (this.out.childElementCount > this.max) this.out.removeChild(this.out.firstChild);
    if (this.autoscroll) this.out.scrollTop = this.out.scrollHeight;
  }

  render() {
    if (!this.out) return;
    this.out.textContent = '';
    for (const e of this.entries) if (this._visible(e.level)) this.out.appendChild(this._row(e));
    if (this.autoscroll) this.out.scrollTop = this.out.scrollHeight;
  }

  setFilter(f) { this.filter = f; this.render(); }
  setAutoscroll(v) { this.autoscroll = v; if (v) this.render(); }
  clear() { this.entries = []; if (this.out) this.out.textContent = ''; }
  text() { return this.entries.map(e => `[${e.t}] ${e.level.toUpperCase()} ${e.msg}`).join('\n'); }

  _patchConsole() {
    const orig = {};
    for (const k of ['log', 'info', 'warn', 'error', 'debug']) {
      orig[k] = console[k].bind(console);
      console[k] = (...args) => {
        orig[k](...args);
        const lvl = k === 'log' ? 'debug' : (k === 'info' ? 'info' : k);
        // Avoid echoing our own already-formatted lines twice
        this.push(lvl, args);
      };
    }
    this._orig = orig;
  }

  _catchGlobal() {
    window.addEventListener('error', e => {
      this.push('error', [`未捕获错误: ${e.message}`, e.filename ? `@ ${e.filename}:${e.lineno}` : '']);
    });
    window.addEventListener('unhandledrejection', e => {
      const r = e.reason;
      this.push('error', ['未处理的 Promise 拒绝:', r && (r.stack || r.message || r) || r]);
    });
  }
}

export const log = new Logger();
