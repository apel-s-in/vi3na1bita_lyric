// FILE: /ke-audio.js
'use strict';
/* ── ke-audio.js: audio, waveform, playback, playhead, loop, zoom, volume ── */
Object.assign(App, {

  /* ═══════════════════════════════════════════
     AUDIO LOAD
  ═══════════════════════════════════════════ */
  async loadAudio(file) {
    if (!file) return;
    try {
      this.ui.loader.classList.remove('hidden');
      this.audioFileName = this.base(file.name);

      // Revoke previous ObjectURL to avoid memory leak
      if (this._audioObjectURL) {
        URL.revokeObjectURL(this._audioObjectURL);
        this._audioObjectURL = null;
      }

      this._audioObjectURL = URL.createObjectURL(file);
      this.audioElement.src = this._audioObjectURL;
      this.audioElement.load();

      if (!this.audioCtx)
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

      const buf = await file.arrayBuffer();
      this.audioBuffer = await this.audioCtx.decodeAudioData(buf.slice(0));
      this.duration    = this.audioBuffer.duration || 0;

      // Clear wave cache on new audio
      this._waveCache    = null;
      this._waveCacheKey = '';
      this._waveTiles    = null;

      // Rebuild playback index for new track data
      this.invalidatePlaybackIndex();

      this.fullRender();
    } catch (e) {
      console.error(e);
      alert('Не удалось загрузить аудио');
    } finally {
      this.ui.loader.classList.add('hidden');
    }
  },

  /* ═══════════════════════════════════════════
     WAVEFORM
     Uses tiled cache for long audio so we don't
     try to hold one enormous canvas in memory.
  ═══════════════════════════════════════════ */
  _waveCache:    null,
  _waveCacheKey: '',
  _waveTiles:    null,   // Map<tileIdx, OffscreenCanvas|canvas>
  _TILE_WIDTH:   2048,   // px per tile at current zoom

  drawWaveform() {
    const c   = this.ui.waveCanvas;
    const ctx = c.getContext('2d');
    const w   = Math.ceil(Math.max(1, (this.duration || 1) * this.zoom));
    const h   = Math.round(80 * this.verticalZoom);
    c.width   = w;
    c.height  = h;
    ctx.clearRect(0, 0, w, h);

    if (!this.audioBuffer) {
      ctx.fillStyle = '#3a3d46';
      ctx.fillRect(0, h / 2 - 1, w, 2);
      return;
    }

    const key = w + '_' + h;

    // Small waveforms: single-canvas cache (original behaviour)
    if (w <= this._TILE_WIDTH * 4) {
      if (this._waveCache && this._waveCacheKey === key) {
        ctx.drawImage(this._waveCache, 0, 0);
        return;
      }
      this._drawWaveSegment(ctx, this.audioBuffer.getChannelData(0), 0, w, h);
      try {
        const oc = document.createElement('canvas');
        oc.width = w; oc.height = h;
        oc.getContext('2d').drawImage(c, 0, 0);
        this._waveCache    = oc;
        this._waveCacheKey = key;
      } catch (e) { /* canvas too large */ }
      return;
    }

    // Large waveforms: tiled cache
    if (!this._waveTiles || this._waveCacheKey !== key) {
      this._waveTiles    = new Map();
      this._waveCacheKey = key;
    }
    const d        = this.audioBuffer.getChannelData(0);
    const tileW    = this._TILE_WIDTH;
    const numTiles = Math.ceil(w / tileW);

    // Only draw visible tiles (viewport culling)
    const sc        = this.ui.timelineContainer;
    const vpLeft    = sc.scrollLeft;
    const vpRight   = vpLeft + sc.clientWidth;
    const firstTile = Math.max(0, Math.floor(vpLeft / tileW));
    const lastTile  = Math.min(numTiles - 1, Math.ceil(vpRight / tileW));

    for (let ti = firstTile; ti <= lastTile; ti++) {
      const x0 = ti * tileW;
      const x1 = Math.min(x0 + tileW, w);

      if (!this._waveTiles.has(ti)) {
        // Render this tile into an offscreen canvas
        const tile = document.createElement('canvas');
        tile.width  = x1 - x0;
        tile.height = h;
        const tc = tile.getContext('2d');
        this._drawWaveSegment(tc, d, x0, x1, h);
        this._waveTiles.set(ti, tile);
      }
      ctx.drawImage(this._waveTiles.get(ti), x0, 0);
    }
  },

  /* Draw a waveform segment into ctx.
     x0..x1 are pixel coords in the full waveform space;
     ctx origin is assumed to be at x0 (tile-local coords).      */
  _drawWaveSegment(ctx, d, x0, x1, h) {
    const totalSamples = d.length;
    const totalPx      = Math.ceil((this.duration || 1) * this.zoom);
    const mid          = h / 2;

    ctx.clearRect(0, 0, x1 - x0, h);
    ctx.fillStyle = '#3a3d46';
    ctx.fillRect(0, mid - 1, x1 - x0, 2);
    ctx.fillStyle = '#6ec6f5';

    for (let px = x0; px < x1; px++) {
      const s0 = Math.floor( px      / totalPx * totalSamples);
      const s1 = Math.floor((px + 1) / totalPx * totalSamples);
      let min = 0, max = 0;
      for (let s = s0; s < s1 && s < totalSamples; s++) {
        if (d[s] < min) min = d[s];
        if (d[s] > max) max = d[s];
      }
      const yTop = Math.round((0.5 - max * 0.45) * h);
      const yBot = Math.round((0.5 - min * 0.45) * h);
      ctx.fillRect(px - x0, yTop, 1, Math.max(1, yBot - yTop));
    }
  },

  /* ═══════════════════════════════════════════
     PLAYBACK INDEX
     Sorted array of all timeline items across all tracks.
     Used for O(log n) active-item lookup instead of full scan.
  ═══════════════════════════════════════════ */
  _playbackIndex:     null,   // [{trackId, item}] sorted by start
  _playbackIndexDirty: true,

  invalidatePlaybackIndex() {
    this._playbackIndexDirty = true;
    this._playbackIndex = null;
  },

  _ensurePlaybackIndex() {
    if (!this._playbackIndexDirty && this._playbackIndex) return;
    const list = [];
    this.project.tracks.forEach(tr => {
      tr.items.forEach(item => {
        list.push({ trackId: tr.id, item });
      });
    });
    // Sort by start; secondary sort by end desc so long items come first
    list.sort((a, b) => a.item.start - b.item.start || b.item.end - a.item.end);
    this._playbackIndex = list;
    this._playbackIndexDirty = false;
  },

  /* Binary-search lower bound: first index where item.start <= t */
  _bisectRight(t) {
    let lo = 0, hi = this._playbackIndex.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this._playbackIndex[mid].item.start <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  },

  /* Return set of {trackId::itemId} keys that are active at time t */
  _getActiveKeys(t) {
    this._ensurePlaybackIndex();
    const idx    = this._playbackIndex;
    const active = new Set();
    // All items whose start <= t; we then filter end > t
    const bound  = this._bisectRight(t);
    // Walk backwards from bound; stop when start is so far back
    // that even the longest realistic item can't reach t.
    // We use a safe window of 600 s (10 min) as the max item length.
    const WINDOW = 600;
    for (let i = bound - 1; i >= 0; i--) {
      const { trackId, item } = idx[i];
      if (t - item.start > WINDOW) break;
      if (item.end > t) {
        active.add(this.makeDomKey(trackId, item.id));
      }
    }
    return active;
  },

  /* ═══════════════════════════════════════════
     PLAYING HIGHLIGHTS  (hot path — no querySelector)
  ═══════════════════════════════════════════ */
  _prevActiveKeys: new Set(),

  _updatePlayingHighlights(t) {
    const next = this._getActiveKeys(t);
    const prev = this._prevActiveKeys;

    // Remove .playing from items that are no longer active
    prev.forEach(key => {
      if (!next.has(key)) {
        const [trackId, itemId] = key.split('::');
        const el = this.getTimelineItemEl(trackId, itemId);
        if (el) el.classList.remove('playing');
      }
    });

    // Add .playing to newly active items
    next.forEach(key => {
      if (!prev.has(key)) {
        const [trackId, itemId] = key.split('::');
        const el = this.getTimelineItemEl(trackId, itemId);
        if (el) el.classList.add('playing');
      }
    });

    this._prevActiveKeys = next;
  },

  /* Called after a full timeline rerender so newly created DOM elements
     that are already in the playing window get the class immediately.   */
  _syncPlayingAfterRender() {
    if (!this.audioElement || this.audioElement.paused) return;
    const t = this.audioElement.currentTime;
    // Force a full diff against empty prev set so all active items are set
    this._prevActiveKeys = new Set();
    this._updatePlayingHighlights(t);
  },

  /* ═══════════════════════════════════════════
     PLAYBACK TICK
  ═══════════════════════════════════════════ */
  _rafId: null,

  _playbackTick() {
    if (!this.audioElement || this.audioElement.paused) return;
    const t = this.audioElement.currentTime;

    // Playhead position
    const px = t * this.zoom;
    this.ui.playhead.style.left = px + 'px';
    this.ui.timeDisplay.textContent = this.fmtTime(t);

    // Loop enforcement
    if (this.loop.enabled && this.loop.start !== null && this.loop.end !== null) {
      if (t >= this.loop.end) {
        this.audioElement.currentTime = this.loop.start;
        return this._scheduleRaf();
      }
    }

    // Auto-scroll
    if (this.autoScroll) this._autoScrollTick(px);

    // Highlights (no querySelector — uses DOM map)
    this._updatePlayingHighlights(t);

    // Preview sync (structural rebuild only when needed)
    this._syncPreviewPlayback(t);

    this._scheduleRaf();
  },

  _scheduleRaf() {
    this._rafId = requestAnimationFrame(() => this._playbackTick());
  },

  _stopRaf() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
  },

  _autoScrollTick(px) {
    const sc    = this.ui.timelineContainer;
    const vpW   = sc.clientWidth;
    const left  = sc.scrollLeft;
    const right = left + vpW;
    const pad   = vpW * 0.15;
    if (px > right - pad)       sc.scrollLeft = px - vpW + pad * 2;
    else if (px < left + pad)   sc.scrollLeft = px - pad;
  },

  /* ═══════════════════════════════════════════
     PLAY / PAUSE / STOP
  ═══════════════════════════════════════════ */
  play() {
    if (!this.audioBuffer) return;
    if (this.audioCtx?.state === 'suspended') this.audioCtx.resume();
    this.audioElement.play().then(() => {
      this.ui.btnPlay.textContent = '⏸';
      this._scheduleRaf();
    }).catch(console.warn);
  },

  pause() {
    this.audioElement.pause();
    this._stopRaf();
    this.ui.btnPlay.textContent = '▶';
    this._prevActiveKeys.forEach(key => {
      const [tid, iid] = key.split('::');
      const el = this.getTimelineItemEl(tid, iid);
      if (el) el.classList.remove('playing');
    });
    this._prevActiveKeys = new Set();
  },

  stop() {
    this.pause();
    this.audioElement.currentTime = 0;
    this.ui.playhead.style.left   = '0px';
    this.ui.timeDisplay.textContent = this.fmtTime(0);
  },

  togglePlay() {
    if (!this.audioElement.paused) this.pause();
    else this.play();
  },

  /* ═══════════════════════════════════════════
     SEEK
  ═══════════════════════════════════════════ */
  seekTo(t) {
    t = Math.max(0, Math.min(this.duration || 0, t));
    this.audioElement.currentTime = t;
    this.ui.playhead.style.left   = (t * this.zoom) + 'px';
    this.ui.timeDisplay.textContent = this.fmtTime(t);
    // Sync highlights immediately after seek (handles seek-back)
    this._prevActiveKeys = new Set();
    this._updatePlayingHighlights(t);
  },

  /* ═══════════════════════════════════════════
     VOLUME
  ═══════════════════════════════════════════ */
  applyVol() {
    this.audioElement.volume = this.muted ? 0 : Math.max(0, Math.min(1, this.volume));
    this.ui.volumeSlider.value = this.muted ? 0 : this.volume * 100;
  },
  updateVolumeReadout() {
    this.ui.volumeReadout.textContent =
      this.muted ? 'Mute' : Math.round(this.volume * 100) + '%';
  },

  /* ═══════════════════════════════════════════
     ZOOM
  ═══════════════════════════════════════════ */
  updateZoomReadout() {
    this.ui.zoomReadout.textContent = Math.round(this.zoom) + ' px/s';
  },
  updateVZoomReadout() {
    this.ui.vzoomReadout.textContent = Math.round(this.verticalZoom * 100) + '%';
  },

  applyZoom(z, anchorPx) {
    const sc     = this.ui.timelineContainer;
    const oldZ   = this.zoom;
    this.zoom    = Math.max(4, Math.min(4000, z));
    const ratio  = this.zoom / oldZ;
    const anchor = anchorPx !== undefined ? anchorPx : sc.scrollLeft + sc.clientWidth / 2;
    this.fullRender();
    sc.scrollLeft = anchor * ratio - (anchorPx === undefined ? sc.clientWidth / 2 : 0);
    this.updateZoomReadout();
    this.persistUiPrefs();
  },

  fitSong() {
    const sc = this.ui.timelineContainer;
    const w  = sc.clientWidth - 16;
    if (this.duration > 0) this.applyZoom(w / this.duration);
  },

  zoomToSelection() {
    const b = this.getSelectionBounds();
    if (!b || b.minStart >= b.maxEnd) return;
    const sc  = this.ui.timelineContainer;
    const dur = b.maxEnd - b.minStart;
    const z   = Math.max(4, (sc.clientWidth - 32) / dur);
    this.applyZoom(z);
    sc.scrollLeft = b.minStart * this.zoom;
  },

  scrollToSelection() {
    const b = this.getSelectionBounds();
    if (!b) return;
    const sc    = this.ui.timelineContainer;
    const mid   = ((b.minStart + b.maxEnd) / 2) * this.zoom;
    sc.scrollLeft = Math.max(0, mid - sc.clientWidth / 2);
  },

  /* ═══════════════════════════════════════════
     RULER
  ═══════════════════════════════════════════ */
  renderRuler() {
    const c   = this.ui.rulerCanvas;
    const ctx = c.getContext('2d');
    const sc  = this.ui.timelineContainer;
    const W   = Math.max(sc.clientWidth, Math.ceil((this.duration || 1) * this.zoom) + 200);
    const H   = c.parentElement.offsetHeight || 24;
    c.width = W; c.height = H;
    ctx.clearRect(0, 0, W, H);

    const step = this._rulerStep();
    ctx.strokeStyle = '#555';
    ctx.fillStyle   = '#aaa';
    ctx.font        = '11px monospace';
    ctx.lineWidth   = 1;

    for (let t = 0; t <= (this.duration || 60) + step; t += step) {
      const x = Math.round(t * this.zoom) + 0.5;
      const major = Math.abs(t % (step * 5)) < 0.001;
      ctx.beginPath();
      ctx.moveTo(x, major ? 0 : H / 2);
      ctx.lineTo(x, H);
      ctx.stroke();
      if (major) {
        ctx.fillText(this.fmtTime(t), x + 3, H - 3);
      }
    }
  },

  _rulerStep() {
    const pxPerSec = this.zoom;
    const steps = [.01,.02,.05,.1,.2,.5,1,2,5,10,15,30,60,120,300];
    return steps.find(s => s * pxPerSec >= 40) || 300;
  },

  /* ═══════════════════════════════════════════
     LOOP
  ═══════════════════════════════════════════ */
  renderLoopRegion() {
    const lr  = this.ui.loopRegion;
    const { enabled, start, end } = this.loop;
    if (!enabled || start === null || end === null || end <= start) {
      lr.style.display = 'none'; return;
    }
    lr.style.display = 'block';
    lr.style.left    = (start * this.zoom) + 'px';
    lr.style.width   = ((end - start) * this.zoom) + 'px';
  },

  setLoop(start, end) {
    this.loop.start   = start;
    this.loop.end     = end;
    this.loop.enabled = true;
    this.ui.btnLoop.classList.add('active');
    this.renderLoopRegion();
  },

  clearLoop() {
    this.loop = { enabled: false, start: null, end: null };
    this.ui.btnLoop.classList.remove('active');
    this.renderLoopRegion();
  },
});
