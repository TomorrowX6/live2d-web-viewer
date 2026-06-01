// ui.js — dock, draggable glass panels, toasts, fullscreen, layout persistence.
const LS_LAYOUT = 'l2d.layout';
const LS_OPEN = 'l2d.open';

export class UIManager {
  constructor() {
    this.panels = {};
    this.docks = {};
    this.z = 36;
    this._initialCss = {};
    document.querySelectorAll('[data-panel]').forEach(p => {
      const id = p.dataset.panel;
      this.panels[id] = p;
      this._initialCss[id] = p.getAttribute('style') || '';
    });
    document.querySelectorAll('[data-toggle]').forEach(d => { this.docks[d.dataset.toggle] = d; });
    this._wire();
    this._restore();
  }

  _wire() {
    document.querySelectorAll('[data-toggle]').forEach(d => {
      d.addEventListener('click', () => this.toggle(d.dataset.toggle));
    });
    document.querySelectorAll('[data-close]').forEach(b => {
      b.addEventListener('click', () => { const p = b.closest('[data-panel]'); if (p) this.close(p.dataset.panel); });
    });
    for (const id of Object.keys(this.panels)) this._makeDraggable(this.panels[id]);

    const fs = document.getElementById('btn-fullscreen');
    if (fs) fs.addEventListener('click', () => this._toggleFullscreen());
  }

  _toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  open(id) {
    const p = this.panels[id]; if (!p) return;
    p.style.display = 'flex';
    this.bringToFront(p);
    this.docks[id]?.classList.add('active');
    this._saveOpen();
  }
  close(id) {
    const p = this.panels[id]; if (!p) return;
    p.style.display = 'none';
    this.docks[id]?.classList.remove('active');
    this._saveOpen();
  }
  toggle(id) {
    const p = this.panels[id]; if (!p) return;
    (p.style.display === 'none' || !p.style.display) ? this.open(id) : this.close(id);
  }

  bringToFront(p) { p.style.zIndex = String(++this.z); }

  _makeDraggable(panel) {
    const head = panel.querySelector('.panel-head');
    if (!head) return;
    let sx, sy, ox, oy, dragging = false;
    const down = e => {
      if (e.target.closest('button, select, input, .head-tools')) return;
      dragging = true;
      this.bringToFront(panel);
      const r = panel.getBoundingClientRect();
      // switch to absolute left/top positioning
      panel.style.left = r.left + 'px';
      panel.style.top = r.top + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.transform = 'none';
      sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      head.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    };
    const move = e => {
      if (!dragging) return;
      const w = panel.offsetWidth, h = panel.offsetHeight;
      let nx = ox + (e.clientX - sx), ny = oy + (e.clientY - sy);
      nx = Math.max(4, Math.min(window.innerWidth - w - 4, nx));
      ny = Math.max(70, Math.min(window.innerHeight - 56, ny));
      panel.style.left = nx + 'px';
      panel.style.top = ny + 'px';
    };
    const up = e => {
      if (!dragging) return;
      dragging = false;
      head.releasePointerCapture?.(e.pointerId);
      this._saveLayout();
    };
    head.addEventListener('pointerdown', down);
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', up);
    head.addEventListener('pointercancel', up);
  }

  _saveLayout() {
    const data = {};
    for (const id of Object.keys(this.panels)) {
      const p = this.panels[id];
      if (p.style.left && p.style.left !== 'auto') data[id] = { left: p.style.left, top: p.style.top };
    }
    try { localStorage.setItem(LS_LAYOUT, JSON.stringify(data)); } catch {}
  }
  _saveOpen() {
    const open = Object.keys(this.panels).filter(id => this.panels[id].style.display === 'flex');
    try { localStorage.setItem(LS_OPEN, JSON.stringify(open)); } catch {}
  }
  _restore() {
    try {
      const layout = JSON.parse(localStorage.getItem(LS_LAYOUT) || '{}');
      for (const id of Object.keys(layout)) {
        const p = this.panels[id]; if (!p) continue;
        p.style.left = layout[id].left; p.style.top = layout[id].top;
        p.style.right = 'auto'; p.style.bottom = 'auto'; p.style.transform = 'none';
      }
    } catch {}
    try {
      const open = JSON.parse(localStorage.getItem(LS_OPEN) || 'null');
      if (Array.isArray(open)) {
        for (const id of Object.keys(this.panels)) {
          if (open.includes(id)) this.open(id); else this.close(id);
        }
      }
    } catch {}
  }

  resetLayout() {
    for (const id of Object.keys(this.panels)) {
      const p = this.panels[id];
      p.setAttribute('style', this._initialCss[id]);
      this.docks[id]?.classList.remove('active');
    }
    try { localStorage.removeItem(LS_LAYOUT); localStorage.removeItem(LS_OPEN); } catch {}
    this.toast('面板布局已重置');
  }

  toast(msg, ms = 2200) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }
}
