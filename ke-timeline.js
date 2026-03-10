// FILE: /ke-timeline.js  (delta — changed sections only)
'use strict';
/* ── ke-timeline.js: render, drag, trim — no layout resize ── */
Object.assign(App, {

  /* ── full render entry point ── */
  fullRender() {
    this.renderRuler();
    this.renderGrid();
    this.drawWaveform();
    this.renderTimeline();
    this.renderTrackHeaders();
    this.renderPreview();
    this.renderLoopRegion();
    this.renderInspector();
    this.updateModeIndicator();
    // After DOM rebuild, sync playing class immediately (no flicker)
    this._syncPlayingAfterRender();
    // Playback index may be stale after structural change
    this.invalidatePlaybackIndex();
    // Preview map stale after structural change
    this.invalidatePreviewMap('fullRender');
  },

  /* ── timeline render ── */
  renderTimeline() {
    const tc = this.ui.tracksContainer;
    // Clear DOM maps before full rerender
    this.clearTimelineDomMap();

    const layerMode  = this.ui.layerMode.value;
    const trackH     = Math.round(48 * this.verticalZoom);
    const totalW     = Math.ceil(Math.max(1, (this.duration || 1) * this.zoom)) + 200;
    tc.style.width   = totalW + 'px';
    tc.style.minWidth= totalW + 'px';
    tc.innerHTML     = '';

    this.project.tracks.forEach((tr, ti) => {
      const isActive    = tr.id === this.project.activeTrackId;
      const isCollapsed = this.collapsed[tr.id];
      const height      = isCollapsed ? 20 : trackH;

      const lane = document.createElement('div');
      lane.className = 'track-lane' + (isActive ? ' active-track' : '');
      lane.style.cssText = `position:relative;height:${height}px;min-height:${height}px;overflow:hidden;`;
      lane.dataset.trackId = tr.id;

      if (!isCollapsed) {
        const visible = this.visibleItems(tr, layerMode);
        visible.forEach(item => {
          const el = this._buildItemEl(tr, item, height, isActive);
          lane.appendChild(el);
          // Register in DOM map for O(1) playback lookup
          this.registerTimelineItemEl(tr.id, item.id, el);
        });
      }

      tc.appendChild(lane);
    });

    // Sync playing state after DOM rebuild (no flicker)
    this._syncPlayingAfterRender();
  },

  /* ── item element builder ── */
  _buildItemEl(tr, item, height, isActive) {
    const x = item.start * this.zoom;
    const w = Math.max(2, (item.end - item.start) * this.zoom);
    const isSelected = this.selected.trackId === tr.id && this.selected.ids.has(item.id);

    const el = document.createElement('div');
    el.className = [
      'item-block',
      item.kind  || '',
      tr.type    || '',
      isSelected ? 'selected' : '',
    ].filter(Boolean).join(' ');

    el.style.cssText =
      `position:absolute;left:${x}px;width:${w}px;height:${height - 4}px;top:2px;` +
      `background:${this._itemColor(tr, item)};`;

    el.dataset.trackId = tr.id;
    el.dataset.itemId  = item.id;

    // Trim handles
    const lh = document.createElement('div');
    lh.className = 'trim-handle left';
    const rh = document.createElement('div');
    rh.className = 'trim-handle right';
    el.appendChild(lh);

    // Label
    const label = document.createElement('span');
    label.className = 'item-label';
    label.textContent = item.text || '';
    el.appendChild(label);

    el.appendChild(rh);
    return el;
  },

  _itemColor(tr, item) {
    const base = tr.color || (tr.type === 'line' ? '#4a7cdc' : '#7c4adc');
    return item.kind === 'line'
      ? base
      : this.hexToRgba(base, 0.75);
  },

  visibleItems(tr, layerMode) {
    if (layerMode === 'all') return tr.items;
    if (layerMode === 'line')  return tr.items.filter(i => i.kind === 'line');
    if (layerMode === 'word')  return tr.items.filter(i => i.kind === 'word');
    return tr.items;
  },

  /* ── track headers ── */
  renderTrackHeaders() {
    const th = this.ui.trackHeaders;
    this.clearTrackHeaderDomMap();
    th.innerHTML = '';

    const trackH      = Math.round(48 * this.verticalZoom);
    const layerMode   = this.ui.layerMode.value;

    this.project.tracks.forEach(tr => {
      const isActive    = tr.id === this.project.activeTrackId;
      const isCollapsed = this.collapsed[tr.id];
      const height      = isCollapsed ? 20 : trackH;

      const hdr = document.createElement('div');
      hdr.className = 'track-header' + (isActive ? ' active' : '');
      hdr.style.height = height + 'px';
      hdr.dataset.trackId = tr.id;

      hdr.innerHTML = `
        <span class="track-name" title="${this.esc(tr.name)}">${this.esc(tr.name)}</span>
        <span class="track-type-badge">${tr.type}</span>
        <div class="track-controls">
          <button class="track-btn solo-btn${tr.solo?' active':''}"
            data-tid="${tr.id}" title="Solo">S</button>
          <button class="track-btn mute-btn${tr.muted?' active':''}"
            data-tid="${tr.id}" title="Mute">M</button>
          <button class="track-btn lock-btn${tr.locked?' active':''}"
            data-tid="${tr.id}" title="Lock">L</button>
          <button class="track-btn collapse-btn"
            data-tid="${tr.id}" title="Collapse">
            ${isCollapsed ? '▼' : '▲'}</button>
        </div>`;

      this.registerTrackHeaderEl(tr.id, hdr);
      th.appendChild(hdr);
    });
  },

  /* ── grid ── */
  renderGrid() {
    const c   = this.ui.gridCanvas;
    const ctx = c.getContext('2d');
    const tc  = this.ui.tracksContainer;
    const W   = Math.ceil(Math.max(1, (this.duration || 1) * this.zoom)) + 200;
    const H   = tc.offsetHeight || 400;
    c.width = W; c.height = H;
    ctx.clearRect(0, 0, W, H);

    const step = this._rulerStep();
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth   = 1;

    for (let t = 0; t <= (this.duration || 60) + step; t += step) {
      const x = Math.round(t * this.zoom) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
  },

  /* ── playhead drag ── */
  initPlayheadDrag() {
    const handle = this.ui.playheadHandle;
    let active = false, startX = 0, startT = 0;

    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      active = true;
      startX = e.clientX;
      startT = this.audioElement.currentTime;
      document.body.style.cursor = 'ew-resize';
    });
    document.addEventListener('mousemove', e => {
      if (!active) return;
      const dx = e.clientX - startX;
      this.seekTo(startT + dx / this.zoom);
    });
    document.addEventListener('mouseup', () => {
      if (!active) return;
      active = false;
      document.body.style.cursor = '';
    });
  },

  /* ── DRAG / TRIM (unchanged core logic, layout-resize removed) ── */
  // NOTE: startResize / _handleResize removed — now in ke-layout.js
  //       All drag/trim/ripple/roll/keep logic below is preserved as-is.

  initDrag() {
    const tc = this.ui.tracksContainer;
    tc.addEventListener('mousedown', e => this._onItemMousedown(e));
    document.addEventListener('mousemove', e => this._onDragMove(e));
    document.addEventListener('mouseup',   e => this._onDragUp(e));
  },

  _onItemMousedown(e) {
    const el = e.target.closest('.item-block');
    if (!el) return;
    const trackId = el.dataset.trackId;
    const itemId  = el.dataset.itemId;
    const tr = this.trackById(trackId);
    if (!tr || tr.locked) return;

    e.preventDefault();
    e.stopPropagation();

    const item = this.itemById(trackId, itemId);
    if (!item) return;

    // Select
    if (!e.shiftKey) {
      if (!this.selected.ids.has(itemId)) {
        this.selected = { trackId, ids: new Set([itemId]) };
      }
    } else {
      if (this.selected.trackId === trackId) this.selected.ids.add(itemId);
    }
    this.setActiveTrack(trackId);
    this.renderInspector();
    this.renderTimeline();

    // Determine handle type
    const isTrimLeft  = e.target.classList.contains('trim-handle') &&
                         e.target.classList.contains('left');
    const isTrimRight = e.target.classList.contains('trim-handle') &&
                         e.target.classList.contains('right');
    const dragModeVal = this.ui.dragMode.value;

    this.drag = {
      active:  true,
      type:    isTrimLeft  ? 'trimL'
             : isTrimRight ? 'trimR'
             : dragModeVal,
      trackId, itemId,
      startX:  e.clientX,
      initial: JSON.parse(JSON.stringify(item)),
      sel:     [...this.selected.ids].map(id => ({
                 id, item: JSON.parse(JSON.stringify(this.itemById(trackId, id)))
               })).filter(s => s.item),
      rollPair: null,
    };

    this._dragModeBadge?.remove();
    this._dragModeBadge = null;
    this._dragClamped   = false;
    this._rippleAffected.clear();
  },

  _onDragMove(e) {
    if (!this.drag.active) return;
    const dx   = e.clientX - this.drag.startX;
    const dt   = dx / this.zoom;
    const snap = v => this._snap(v);
    const tr   = this.trackById(this.drag.trackId);
    if (!tr) return;

    const mode = this.drag.type;

    if (mode === 'trimL') {
      this._applyTrimL(tr, dt, snap);
    } else if (mode === 'trimR') {
      this._applyTrimR(tr, dt, snap);
    } else if (mode === 'roll') {
      this._applyRoll(tr, dt, snap);
    } else if (mode === 'ripple') {
      this._applyRipple(tr, dt, snap);
    } else if (mode === 'group') {
      this._applyGroupStretch(tr, dt, snap);
    } else {
      this._applyMove(tr, dt, snap, e.shiftKey, mode);
    }

    this.renderTimeline();
    this.renderInspector();
  },

  _onDragUp(e) {
    if (!this.drag.active) return;
    this.drag.active = false;
    this._rippleAffected.clear();
    this._dragModeBadge?.remove();
    this._dragModeBadge = null;

    const tr = this.trackById(this.drag.trackId);
    if (tr) {
      this.normalizeTrackAfterEdit(tr);
      this.pushHistory('drag');
      this.markDirty();
    }
    this.renderTimeline();
    this.renderInspector();
    // Invalidate playback index after structural move
    this.invalidatePlaybackIndex();
    this.invalidatePreviewMap('drag-up');
  },

  /* ── snap helper ── */
  _snap(v) {
    const s = this.snapStep;
    if (!s || s === 'items') return v;
    return Math.round(v / s) * s;
  },

  /* ── trim left ── */
  _applyTrimL(tr, dt, snap) {
    const ini = this.drag.initial;
    const item = this.itemById(tr.id, this.drag.itemId);
    if (!item) return;
    const newStart = snap(Math.max(0, ini.start + dt));
    if (newStart >= ini.end - this.MIN_DUR) return;
    item.start = newStart;
    if (item.end < item.start + this.MIN_DUR) item.end = item.start + this.MIN_DUR;
  },

  /* ── trim right ── */
  _applyTrimR(tr, dt, snap) {
    const ini = this.drag.initial;
    const item = this.itemById(tr.id, this.drag.itemId);
    if (!item) return;
    const newEnd = snap(Math.max(ini.start + this.MIN_DUR, ini.end + dt));
    item.end = newEnd;
  },

  /* ── roll trim ── */
  _applyRoll(tr, dt, snap) {
    const ini  = this.drag.initial;
    const item = this.itemById(tr.id, this.drag.itemId);
    if (!item) return;

    // Find adjacent item for roll
    if (!this.drag.rollPair) {
      const sorted  = tr.items.slice().sort((a, b) => a.start - b.start);
      const idx     = sorted.findIndex(i => i.id === item.id);
      this.drag.rollPair = sorted[idx - 1] || null;
    }

    const newEnd = snap(Math.max(ini.start + this.MIN_DUR, ini.end + dt));
    item.end = newEnd;
    if (this.drag.rollPair) {
      this.drag.rollPair.end = newEnd;
      if (this.drag.rollPair.end < this.drag.rollPair.start + this.MIN_DUR) {
        this.drag.rollPair.end = this.drag.rollPair.start + this.MIN_DUR;
      }
    }
  },

  /* ── ripple ── */
  _applyRipple(tr, dt, snap) {
    const item = this.itemById(tr.id, this.drag.itemId);
    if (!item) return;
    const ini  = this.drag.initial;
    const dSnap = snap(ini.start + dt) - ini.start;

    // Move selected items
    this.drag.sel.forEach(s => {
      const it = this.itemById(tr.id, s.id);
      if (!it) return;
      it.start = Math.max(0, s.item.start + dSnap);
      it.end   = s.item.end + dSnap;
    });

    // Push unselected items that come after
    const selEnds = this.drag.sel.map(s => {
      const it = this.itemById(tr.id, s.id); return it ? it.end : 0;
    });
    const maxSelEnd = Math.max(0, ...selEnds);
    const minSelStart = Math.min(...this.drag.sel.map(s => {
      const it = this.itemById(tr.id, s.id); return it ? it.start : Infinity;
    }));

    tr.items.forEach(it => {
      if (this.selected.ids.has(it.id)) return;
      const inRange = it.start >= Math.min(ini.start, ini.start + dSnap);
      if (inRange && !this._rippleAffected.has(it.id)) {
        this._rippleAffected.add(it.id);
      }
      if (this._rippleAffected.has(it.id)) {
        const origStart = it.start;
        it.start = Math.max(maxSelEnd, it.start + dSnap);
        it.end   = it.end + (it.start - origStart);
      }
    });
  },

  /* ── group stretch ── */
  _applyGroupStretch(tr, dt, snap) {
    if (this.drag.sel.length < 2) {
      this._applyMove(tr, dt, snap, false, 'move');
      return;
    }
    const origStarts = this.drag.sel.map(s => s.item.start);
    const origEnds   = this.drag.sel.map(s => s.item.end);
    const origMin    = Math.min(...origStarts);
    const origMax    = Math.max(...origEnds);
    const origSpan   = origMax - origMin;
    if (origSpan <= 0) return;

    const anchor = this.drag.initial.start;
    const ratio  = anchor === origMin
      ? (origSpan + dt) / origSpan
      : (origSpan - dt) / origSpan;

    if (ratio <= 0) return;

    this.drag.sel.forEach(s => {
      const it = this.itemById(tr.id, s.id);
      if (!it) return;
      const relStart = s.item.start - origMin;
      const relEnd   = s.item.end   - origMin;
      it.start = snap(origMin + relStart * ratio);
      it.end   = snap(origMin + relEnd   * ratio);
      if (it.end < it.start + this.MIN_DUR) it.end = it.start + this.MIN_DUR;
    });
  },

  /* ── move ── */
  _applyMove(tr, dt, snap, shiftKey, mode) {
    const isKeep = mode === 'keep';
    const isFree = mode === 'free';

    this.drag.sel.forEach(s => {
      const it = this.itemById(tr.id, s.id);
      if (!it) return;
      const dur    = s.item.end - s.item.start;
      let newStart = snap(Math.max(0, s.item.start + dt));

      if (isKeep) {
        // Keep: allow vertical visual movement but lock time
        // (visual only — time unchanged, just re-render)
        return;
      }

      it.start = newStart;
      it.end   = newStart + dur;
    });
  },

  /* ── active track ── */
  setActiveTrack(trackId) {
    this.project.activeTrackId = trackId;
  },

  /* ── selection box (marquee) ── */
  initMarquee() {
    const sc = this.ui.timelineContainer;
    const sb = this.ui.selectionBox;

    sc.addEventListener('mousedown', e => {
      if (e.target !== sc && !e.target.classList.contains('track-lane')) return;
      if (e.button !== 0) return;
      this.marquee.active = true;
      this.marquee.startX = e.clientX + sc.scrollLeft;
      this.marquee.startY = e.clientY;
      sb.style.display = 'block';
      sb.style.left = (e.clientX + sc.scrollLeft) + 'px';
      sb.style.top  = e.clientY + 'px';
      sb.style.width  = '0px';
      sb.style.height = '0px';
    });

    document.addEventListener('mousemove', e => {
      if (!this.marquee.active) return;
      const x0 = this.marquee.startX;
      const x1 = e.clientX + sc.scrollLeft;
      const y0 = this.marquee.startY;
      const y1 = e.clientY;
      sb.style.left   = Math.min(x0, x1) + 'px';
      sb.style.top    = Math.min(y0, y1) + 'px';
      sb.style.width  = Math.abs(x1 - x0) + 'px';
      sb.style.height = Math.abs(y1 - y0) + 'px';
    });

    document.addEventListener('mouseup', e => {
      if (!this.marquee.active) return;
      this.marquee.active = false;
      sb.style.display = 'none';

      const x0  = this.marquee.startX / this.zoom;
      const x1  = (e.clientX + sc.scrollLeft) / this.zoom;
      const t0  = Math.min(x0, x1);
      const t1  = Math.max(x0, x1);
      if (t1 - t0 < 0.02) return;

      const tr = this.activeTrack();
      if (!tr) return;
      const hits = tr.items.filter(i => i.start < t1 && i.end > t0);
      if (!hits.length) return;
      this.selected = { trackId: tr.id, ids: new Set(hits.map(i => i.id)) };
      this.renderTimeline();
      this.renderInspector();
    });
  },
});
