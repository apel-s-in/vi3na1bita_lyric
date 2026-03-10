// FILE: /ke-state.js
'use strict';
/* ── ke-state.js: constants, state, utils, history, ui-prefs (no DOM, no layout) ── */
const App = {
  /* ── constants ── */
  DRAFT_KEY:  'karaokeEditorDraftV5',
  UI_KEY:     'karaokeEditorUiStateV4',
  KM_KEY:     'karaokeEditorKeymapV3',
  RECENT_KEY: 'karaokeEditorRecentV1',
  MAX_HISTORY: 80,
  MAX_RECENT:  10,
  MIN_DUR:     .02,

  /* ── runtime state ── */
  audioCtx: null, audioBuffer: null, audioElement: null,
  duration: 0, audioFileName: 'audio',
  zoom: 80, verticalZoom: 1, snapStep: 0,
  autoScroll: true, volume: 1, muted: false,
  dirty: false, playbackRate: 1,
  autosaveEnabled: true, autosaveIntervalSec: 10, autosaveTimer: null,

  /* ── project state ── */
  project: { version: 2, tracks: [], activeTrackId: null },

  /* ── selection ── */
  selected: { trackId: null, ids: new Set() },

  /* ── history ── */
  history: [], historyIndex: -1,

  /* ── interaction state ── */
  drag:        { active: false, type: null, trackId: null, itemId: null,
                 startX: 0, initial: {}, sel: [], rollPair: null },
  marquee:     { active: false, startX: 0, startY: 0 },
  resize:      { active: false, target: null, startX: 0, startY: 0, startDim: 0 },
  playheadDrag:{ active: false },
  charDrag:    { active: false, itemId: null, trackId: null,
                 charIdx: null, side: null, startX: 0,
                 initialStart: 0, initialEnd: 0 },
  context:     { trackId: null, itemId: null, cursorX: 0 },
  loop:        { enabled: false, start: null, end: null },

  /* ── misc runtime ── */
  hotkeysWaiting: null,
  keymap: {},
  /* trackCollapsed: track-level collapse state (NOT panel layout) */
  collapsed: {},
  ui: {},
  commands: {},
  /* layoutUnlocked kept here only as a non-layout UI pref (lock flag).
     All panel/resize state lives in ke-layout.js layoutState.          */
  layoutUnlocked: false,

  _dragModeBadge: null,
  _dragClamped: false,
  _rippleAffected: new Set(),

  /* ═══════════════════════════════════════════
     UTILS
  ═══════════════════════════════════════════ */
  activeTrack()       { return this.trackById(this.project.activeTrackId) },
  trackById(id)       { return this.project.tracks.find(t => t.id === id) || null },
  trackByType(type)   { return this.project.tracks.find(t => t.type === type) || null },
  itemById(tid, id)   { const tr = this.trackById(tid); return tr ? tr.items.find(i => i.id === id) || null : null },
  sortTrack(tr)       { tr.items.sort((a, b) => a.start - b.start) },
  sortActiveTrack()   { const tr = this.activeTrack(); if (tr) this.sortTrack(tr) },
  uid()               { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4) },
  num(v, def = 0)     { const n = parseFloat(v); return isNaN(n) ? def : n },
  esc(s)              { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') },
  base(n)             { return n.replace(/\.[^/.]+$/, '') },
  fmtTime(t)          { const m = Math.floor(t / 60), s = (t % 60).toFixed(2); return m + ':' + (+s < 10 ? '0' : '') + s },
  hexToRgba(hex, a) {
    const r = parseInt(hex.slice(1,3), 16),
          g = parseInt(hex.slice(3,5), 16),
          b = parseInt(hex.slice(5,7), 16);
    return `rgba(${r},${g},${b},${a})`;
  },
  downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  },
  mergeTexts(a, b) {
    return (a.trim() + ' ' + b.trim()).replace(/\s{2,}/g, ' ').trim();
  },
  smartTextSplit(text, ratio) {
    const words = text.split(/\s+/);
    if (words.length <= 1) return { before: text, after: text };
    let idx = Math.max(1, Math.round(words.length * ratio));
    if (idx >= words.length) idx = words.length - 1;
    return { before: words.slice(0, idx).join(' '), after: words.slice(idx).join(' ') };
  },

  /* ═══════════════════════════════════════════
     HISTORY
  ═══════════════════════════════════════════ */
  pushHistory(label) {
    const snap = JSON.stringify(this.project);
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push({ label, snap });
    if (this.history.length > this.MAX_HISTORY) this.history.shift();
    this.historyIndex = this.history.length - 1;
  },
  undo() {
    if (this.historyIndex <= 0) return;
    this.historyIndex--;
    this.project = JSON.parse(this.history[this.historyIndex].snap);
    this.clearSelection(); this.fullRender(); this.markDirty();
  },
  redo() {
    if (this.historyIndex >= this.history.length - 1) return;
    this.historyIndex++;
    this.project = JSON.parse(this.history[this.historyIndex].snap);
    this.clearSelection(); this.fullRender(); this.markDirty();
  },

  /* ═══════════════════════════════════════════
     DIRTY / SAVE STATUS
  ═══════════════════════════════════════════ */
  markDirty(dirty = true) {
    this.dirty = dirty;
    this.updateSaveStatus(dirty ? 'Unsaved changes' : 'Saved', dirty);
    if (dirty && this.autosaveEnabled) {
      clearTimeout(this._dirtyDebounce);
      this._dirtyDebounce = setTimeout(() => this.saveAutoDraft(), 3000);
    }
  },
  updateSaveStatus(msg, isDirty) {
    const el = this.ui.saveStatus;
    el.textContent = msg;
    el.className = 'save-status' + (isDirty ? ' dirty' : '');
  },

  /* ═══════════════════════════════════════════
     UI PREFS  (non-layout: zoom, volume, etc.)
     Layout prefs (panel sizes, toolbar order, collapse) live in ke-layout.js
  ═══════════════════════════════════════════ */
  _uiPrefFields: [
    'zoom', 'verticalZoom', 'autoScroll', 'volume', 'muted',
    'autosaveEnabled', 'autosaveIntervalSec', 'snapStep', 'playbackRate'
  ],

  _syncUiToDOM() {
    const u = this.ui;
    u.zoomSlider.value   = this.zoom;
    u.vzoomSlider.value  = Math.round(this.verticalZoom * 100);
    u.autoScroll.checked = this.autoScroll;
    u.autosaveEnabled.checked = this.autosaveEnabled;
    u.autosaveInterval.value  = this.autosaveIntervalSec;
    u.snapSelect.value   = this.snapStep === 'items' ? 'items' : this.snapStep;
    u.playbackRate.value = this.playbackRate;
    this.audioElement.playbackRate = this.playbackRate;
    this.applyVol();
    this.updateVolumeReadout();
    this.updateZoomReadout();
    this.updateVZoomReadout();
  },

  persistUiPrefs() {
    try {
      const stored = JSON.parse(localStorage.getItem(this.UI_KEY) || '{}');
      // sidebarWidth управляется ke-layout.js через layout-блок — здесь не пишем
      const o = {
        dragMode:       this.ui.dragMode.value,
        layerMode:      this.ui.layerMode.value,
        layoutUnlocked: this.layoutUnlocked,
      };
      this._uiPrefFields.forEach(f => { o[f] = this[f]; });
      // Preserve existing layout block written by ke-layout.js
      if (stored.layout) o.layout = stored.layout;
      localStorage.setItem(this.UI_KEY, JSON.stringify(o));
    } catch (e) { console.warn(e); }
  },

  restoreUiPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(this.UI_KEY) || '{}');
      this._uiPrefFields.forEach(f => { if (p[f] !== undefined) this[f] = p[f]; });
      // sidebarWidth восстанавливается ke-layout.js через layout-блок
      if (p.dragMode)  this.ui.dragMode.value  = p.dragMode;
      if (p.layerMode) this.ui.layerMode.value = p.layerMode;
      if (p.layoutUnlocked !== undefined) this.layoutUnlocked = !!p.layoutUnlocked;
      this._syncUiToDOM();
    } catch (e) { console.warn(e); }
  },

  /* ═══════════════════════════════════════════
     SELECTION
  ═══════════════════════════════════════════ */
  selectItem(tid, id) {
    if (this.selected.trackId && this.selected.trackId !== tid) this.selected.ids.clear();
    this.selected.trackId = tid;
    this.selected.ids.add(id);
    this.renderInspector();
    this.renderTimeline();
  },
  clearSelection() {
    this.selected = { trackId: null, ids: new Set() };
    this.renderInspector();
    this.renderTimeline();
  },
  selectAll() {
    const tr = this.activeTrack(); if (!tr) return;
    this.selected.trackId = tr.id;
    this.selected.ids = new Set(this.visibleItems(tr, this.ui.layerMode.value).map(i => i.id));
    this.renderTimeline();
    this.renderInspector();
  },
  getSelectionBounds() {
    const tr = this.activeTrack();
    if (!tr || !this.selected.ids.size) return null;
    const items = [...this.selected.ids].map(id => this.itemById(tr.id, id)).filter(Boolean);
    if (!items.length) return null;
    return {
      items,
      minStart: Math.min(...items.map(i => i.start)),
      maxEnd:   Math.max(...items.map(i => i.end)),
      tr,
    };
  },

  /* ═══════════════════════════════════════════
     EDIT PIPELINE
  ═══════════════════════════════════════════ */
  applyTrackEdit(tr, label, fn) {
    if (!tr) return;
    this.pushHistory(label);
    fn();
    this.normalizeTrackAfterEdit(tr);
    this.markDirty();
    this.afterEdit();
  },
  afterEdit() {
    this.renderTimeline();
    this.renderInspector();
    this.renderPreview();
  },

  /* ═══════════════════════════════════════════
     NORMALIZATION
  ═══════════════════════════════════════════ */
  stableClampItem(item) {
    item.start = Math.max(0, item.start);
    if (item.end <= item.start) item.end = item.start + this.MIN_DUR;
  },
  enforceNoOverlapForKind(tr, kind) {
    const items = tr.items.filter(i => i.kind === kind).sort((a, b) => a.start - b.start);
    for (let i = 1; i < items.length; i++) {
      if (items[i].start < items[i-1].end) {
        items[i].start = items[i-1].end;
        if (items[i].end <= items[i].start) items[i].end = items[i].start + .05;
      }
    }
  },
  recomputeWordsLineBounds(tr) {
    if (tr.type !== 'words') return;
    tr.items.filter(i => i.kind === 'line').forEach(line => {
      const words = tr.items.filter(i => i.kind === 'word' && i.lineId === line.id);
      if (!words.length) return;
      line.start = Math.min(line.start, ...words.map(w => w.start));
      line.end   = Math.max(line.end,   ...words.map(w => w.end));
    });
  },
  normalizeTrackAfterEdit(tr) {
    if (!tr) return;
    tr.items.forEach(it => this.stableClampItem(it));
    this.sortTrack(tr);
    if (tr.type === 'words') this.recomputeWordsLineBounds(tr);
  },
  normalizeTrackForExport(tr) {
    const clone = JSON.parse(JSON.stringify(tr));
    clone.items.forEach(it => this.stableClampItem(it));
    ['line', 'word'].forEach(k => this.enforceNoOverlapForKind(clone, k));
    this.sortTrack(clone);
    if (clone.type === 'words') this.recomputeWordsLineBounds(clone);
    return clone;
  },
};
