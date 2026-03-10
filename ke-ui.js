// FILE: /ke-ui.js  (delta — layout removed)
'use strict';
/* ── ke-ui.js: commands, hotkeys, modals, context menu, high-level init ── */
Object.assign(App, {

  /* ═══════════════════════════════════════════
     INIT ENTRY POINT
  ═══════════════════════════════════════════ */
  init() {
    // 1. Static DOM cache (ke-dom.js)
    this.cache();

    // 2. Audio element setup
    this.audioElement = this.ui.audioPlayer;
    this.audioElement.addEventListener('ended', () => {
      this._stopRaf();
      this.ui.btnPlay.textContent = '▶';
    });

    // 3. Layout (ke-layout.js)
    this.initLayout();

    // 4. Restore non-layout UI prefs (ke-state.js)
    this.restoreUiPrefs();

    // 5. Timeline interaction
    this.initPlayheadDrag();
    this.initDrag();
    this.initMarquee();

    // 6. Commands registry
    this._buildCommands();

    // 7. Keymap
    this._loadKeymap();
    this._bindHotkeys();

    // 8. High-level event bindings
    this._bindFileInputs();
    this._bindTransport();
    this._bindZoom();
    this._bindVolume();
    this._bindModeSelectors();
    this._bindTrackEvents();
    this._bindContextMenu();
    this._bindModals();
    this._bindAutosave();

    // 9. Initial render
    this.pushHistory('init');
    this.fullRender();

    // 10. Check for autosave restore
    this._checkAutosaveRestore();
  },

  /* ═══════════════════════════════════════════
     COMMANDS REGISTRY
  ═══════════════════════════════════════════ */
  _buildCommands() {
    this.commands = {
      play:             { label: 'Play / Pause',         fn: () => this.togglePlay() },
      stop:             { label: 'Stop',                 fn: () => this.stop() },
      loop:             { label: 'Toggle loop',          fn: () => this._cmdLoop() },
      loopClear:        { label: 'Clear loop',           fn: () => this.clearLoop() },
      undo:             { label: 'Undo',                 fn: () => this.undo() },
      redo:             { label: 'Redo',                 fn: () => this.redo() },
      selectAll:        { label: 'Select all',           fn: () => this.selectAll() },
      deselect:         { label: 'Deselect',             fn: () => this.clearSelection() },
      split:            { label: 'Split at playhead',    fn: () => this._cmdSplit() },
      mergePrev:        { label: 'Merge with previous',  fn: () => this._cmdMergePrev() },
      mergeNext:        { label: 'Merge with next',      fn: () => this._cmdMergeNext() },
      duplicate:        { label: 'Duplicate',            fn: () => this._cmdDuplicate() },
      delete:           { label: 'Delete',               fn: () => this._cmdDelete() },
      addLine:          { label: 'Add line at playhead', fn: () => this._cmdAddLine() },
      addWord:          { label: 'Add word at playhead', fn: () => this._cmdAddWord() },
      fitSong:          { label: 'Fit song',             fn: () => this.fitSong() },
      zoomIn:           { label: 'Zoom in',              fn: () => this.applyZoom(this.zoom * 1.25) },
      zoomOut:          { label: 'Zoom out',             fn: () => this.applyZoom(this.zoom / 1.25) },
      zoomSelection:    { label: 'Zoom to selection',    fn: () => this.zoomToSelection() },
      scrollSelection:  { label: 'Scroll to selection',  fn: () => this.scrollToSelection() },
      gotoSelection:    { label: 'Go to selection start',fn: () => this._cmdGotoSelection() },
      centerPlayhead:   { label: 'Center playhead',      fn: () => this._cmdCenterPlayhead() },
      exportActive:     { label: 'Export active track',  fn: () => this.exportActiveTrack() },
      exportAll:        { label: 'Export all tracks',    fn: () => this.exportAllTracks() },
      saveSession:      { label: 'Save session',         fn: () => this._cmdSaveSession() },
      loadSession:      { label: 'Load session',         fn: () => this.ui.sessionUpload.click() },
      validate:         { label: 'Validate',             fn: () => this._cmdValidate() },
      toggleFullscreen: { label: 'Toggle fullscreen timeline',
                                                         fn: () => this.toggleTimelineFullscreen() },
      mute:             { label: 'Toggle mute',          fn: () => this._cmdMute() },
      seekBack:         { label: 'Seek back 5s',         fn: () => this.seekTo(this.audioElement.currentTime - 5) },
      seekFwd:          { label: 'Seek forward 5s',      fn: () => this.seekTo(this.audioElement.currentTime + 5) },
      seekStart:        { label: 'Seek to start',        fn: () => this.seekTo(0) },
      seekEnd:          { label: 'Seek to end',          fn: () => this.seekTo(this.duration) },
      frameBack:        { label: 'Seek back 0.1s',       fn: () => this.seekTo(this.audioElement.currentTime - 0.1) },
      frameFwd:         { label: 'Seek forward 0.1s',    fn: () => this.seekTo(this.audioElement.currentTime + 0.1) },
    };
  },

  /* ═══════════════════════════════════════════
     COMMAND IMPLEMENTATIONS
  ═══════════════════════════════════════════ */
  _cmdSplit() {
    const { trackId, ids } = this.selected;
    if (!trackId || !ids.size) return;
    ids.forEach(id => this.splitItem(trackId, id));
  },

  _cmdMergePrev() {
    const { trackId, ids } = this.selected;
    if (!trackId || ids.size !== 1) return;
    this.mergeWithPrev(trackId, [...ids][0]);
  },

  _cmdMergeNext() {
    const { trackId, ids } = this.selected;
    if (!trackId || ids.size !== 1) return;
    this.mergeWithNext(trackId, [...ids][0]);
  },

  _cmdDuplicate() {
    const { trackId, ids } = this.selected;
    if (!trackId || !ids.size) return;
    const tr = this.trackById(trackId);
    if (!tr || tr.locked) return;
    this.applyTrackEdit(tr, 'duplicate', () => {
      const newIds = new Set();
      [...ids].forEach(id => {
        const item = this.itemById(trackId, id);
        if (!item) return;
        const clone = JSON.parse(JSON.stringify(item));
        clone.id    = this.uid();
        const dur   = item.end - item.start;
        clone.start = item.end;
        clone.end   = item.end + dur;
        tr.items.push(clone);
        newIds.add(clone.id);
      });
      this.selected = { trackId, ids: newIds };
      this.invalidatePlaybackIndex();
    });
  },

  _cmdDelete() {
    const { trackId, ids } = this.selected;
    if (!trackId || !ids.size) return;
    const tr = this.trackById(trackId);
    if (!tr || tr.locked) return;
    this.applyTrackEdit(tr, 'delete', () => {
      tr.items = tr.items.filter(i => !ids.has(i.id));
      this.selected = { trackId, ids: new Set() };
      this.invalidatePreviewMap('delete');
      this.invalidatePlaybackIndex();
    });
  },

  _cmdAddLine() {
    const tr = this.activeTrack();
    if (!tr || tr.locked) return;
    const t = this.audioElement.currentTime;
    this.applyTrackEdit(tr, 'add line', () => {
      const item = { id: this.uid(), kind: 'line', start: t, end: t + 2, text: '' };
      tr.items.push(item);
      this.selected = { trackId: tr.id, ids: new Set([item.id]) };
      this.invalidatePreviewMap('add-line');
      this.invalidatePlaybackIndex();
    });
  },

  _cmdAddWord() {
    const tr = this.activeTrack();
    if (!tr || tr.locked) return;
    if (tr.type !== 'words') return;
    const t = this.audioElement.currentTime;
    this.applyTrackEdit(tr, 'add word', () => {
      // Find enclosing line
      const line = tr.items.find(i =>
        i.kind === 'line' && i.start <= t && i.end >= t
      ) || null;
      const item = {
        id:     this.uid(),
        kind:   'word',
        start:  t,
        end:    t + 0.5,
        text:   '',
        lineId: line ? line.id : null,
      };
      tr.items.push(item);
      this.selected = { trackId: tr.id, ids: new Set([item.id]) };
      this.invalidatePreviewMap('add-word');
      this.invalidatePlaybackIndex();
    });
  },

  _cmdLoop() {
    if (this.loop.enabled) {
      this.clearLoop();
      return;
    }
    const b = this.getSelectionBounds();
    if (b) {
      this.setLoop(b.minStart, b.maxEnd);
    } else {
      // Default: loop from current position + 5s
      const t = this.audioElement.currentTime;
      this.setLoop(t, Math.min(this.duration, t + 5));
    }
  },

  _cmdMute() {
    this.muted = !this.muted;
    this.applyVol();
    this.updateVolumeReadout();
    this.ui.btnMute?.classList.toggle('active', this.muted);
    this.persistUiPrefs();
  },

  _cmdCenterPlayhead() {
    const sc  = this.ui.timelineContainer;
    const px  = this.audioElement.currentTime * this.zoom;
    sc.scrollLeft = Math.max(0, px - sc.clientWidth / 2);
  },

  _cmdGotoSelection() {
    const b = this.getSelectionBounds();
    if (!b) return;
    this.seekTo(b.minStart);
    const sc = this.ui.timelineContainer;
    sc.scrollLeft = Math.max(0, b.minStart * this.zoom - 40);
  },

  _cmdSaveSession() {
    const snap = {
      ts:      Date.now(),
      version: 2,
      audio:   this.audioFileName,
      project: this.project,
    };
    this.downloadBlob(
      new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' }),
      `${this.audioFileName}_session.json`
    );
    this.markDirty(false);
    this._addRecentEntry(snap);
  },

  _cmdValidate() {
    const issues = this._runValidation();
    this._showValidationModal(issues);
  },

  /* ═══════════════════════════════════════════
     KEYMAP
  ═══════════════════════════════════════════ */
  _defaultKeymap() {
    return {
      play:            'Space',
      stop:            'Escape',
      undo:            'ctrl+z',
      redo:            'ctrl+shift+z',
      selectAll:       'ctrl+a',
      deselect:        'ctrl+d',
      split:           's',
      mergePrev:       'ctrl+ArrowLeft',
      mergeNext:       'ctrl+ArrowRight',
      duplicate:       'ctrl+shift+d',
      delete:          'Delete',
      addLine:         'ctrl+l',
      addWord:         'ctrl+w',
      fitSong:         'f',
      zoomIn:          '=',
      zoomOut:         '-',
      zoomSelection:   'shift+z',
      scrollSelection: 'shift+s',
      gotoSelection:   'g',
      centerPlayhead:  'c',
      seekBack:        'ArrowLeft',
      seekFwd:         'ArrowRight',
      seekStart:       'Home',
      seekEnd:         'End',
      frameBack:       'shift+ArrowLeft',
      frameFwd:        'shift+ArrowRight',
      loop:            'l',
      loopClear:       'shift+l',
      mute:            'm',
      exportActive:    'ctrl+e',
      saveSession:     'ctrl+shift+s',
      validate:        'ctrl+shift+v',
      toggleFullscreen:'ctrl+shift+f',
    };
  },

  _loadKeymap() {
    try {
      const saved = JSON.parse(localStorage.getItem(this.KM_KEY) || 'null');
      this.keymap = Object.assign({}, this._defaultKeymap(), saved || {});
    } catch (e) {
      this.keymap = this._defaultKeymap();
    }
  },

  _saveKeymap() {
    try {
      localStorage.setItem(this.KM_KEY, JSON.stringify(this.keymap));
    } catch (e) { console.warn(e); }
  },

  _normalizeKeyStr(e) {
    const parts = [];
    if (e.ctrlKey  || e.metaKey)  parts.push('ctrl');
    if (e.altKey)                  parts.push('alt');
    if (e.shiftKey)                parts.push('shift');
    const k = e.key === ' ' ? 'Space' : e.key;
    parts.push(k);
    return parts.join('+');
  },

  _bindHotkeys() {
    document.addEventListener('keydown', e => {
      // Skip when editing text inputs
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (document.activeElement?.isContentEditable) return;

      // Hotkeys-waiting (remapping mode)
      if (this.hotkeysWaiting) {
        e.preventDefault();
        const key = this._normalizeKeyStr(e);
        this.keymap[this.hotkeysWaiting] = key;
        this.hotkeysWaiting = null;
        this._saveKeymap();
        this._renderHotkeysModal();
        return;
      }

      const key = this._normalizeKeyStr(e);
      for (const [cmdId, binding] of Object.entries(this.keymap)) {
        if (binding === key) {
          const cmd = this.commands[cmdId];
          if (cmd) {
            e.preventDefault();
            cmd.fn();
            return;
          }
        }
      }
    });
  },

  /* ═══════════════════════════════════════════
     FILE INPUT BINDINGS
  ═══════════════════════════════════════════ */
  _bindFileInputs() {
    this.ui.audioUpload.addEventListener('change', e => {
      const f = e.target.files[0];
      if (f) this.loadAudio(f);
      e.target.value = '';
    });

    this.ui.lineUpload.addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      this._readJSON(f, data => this._importLineTrack(data, f.name));
      e.target.value = '';
    });

    this.ui.wordsUpload.addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      this._readJSON(f, data => this._importWordsTrack(data, f.name));
      e.target.value = '';
    });

    this.ui.sessionUpload.addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      this._readJSON(f, data => this.loadSession(data));
      e.target.value = '';
    });
  },

  _readJSON(file, cb) {
    const fr = new FileReader();
    fr.onload = ev => {
      try { cb(JSON.parse(ev.target.result)); }
      catch (e) { alert('Ошибка разбора JSON: ' + e.message); }
    };
    fr.readAsText(file);
  },

  _importLineTrack(data, filename) {
    this.pushHistory('import line track');
    const items = Array.isArray(data) ? data : (data.items || []);
    const tr = {
      id:     this.uid(),
      name:   this.base(filename),
      type:   'line',
      color:  '#4a7cdc',
      items:  items.map(it => ({
        id:    it.id    || this.uid(),
        kind:  it.kind  || 'line',
        start: this.num(it.start),
        end:   this.num(it.end),
        text:  it.text  || '',
      })),
    };
    this.normalizeTrackAfterEdit(tr);
    this.project.tracks.push(tr);
    this.project.activeTrackId = tr.id;
    this.invalidatePreviewMap('import-line');
    this.invalidatePlaybackIndex();
    this.fullRender();
    this.markDirty();
  },

  _importWordsTrack(data, filename) {
    this.pushHistory('import words track');
    const raw = Array.isArray(data) ? data : (data.items || []);
    const tr = {
      id:    this.uid(),
      name:  this.base(filename),
      type:  'words',
      color: '#7c4adc',
      items: raw.map(it => ({
        id:     it.id     || this.uid(),
        kind:   it.kind   || (it.lineId ? 'word' : 'line'),
        start:  this.num(it.start),
        end:    this.num(it.end),
        text:   it.text   || '',
        lineId: it.lineId || null,
        chars:  it.chars  || undefined,
      })),
    };
    this.normalizeTrackAfterEdit(tr);
    this.project.tracks.push(tr);
    this.project.activeTrackId = tr.id;
    this.invalidatePreviewMap('import-words');
    this.invalidatePlaybackIndex();
    this.fullRender();
    this.markDirty();
  },

  /* ═══════════════════════════════════════════
     TRANSPORT BINDINGS
  ═══════════════════════════════════════════ */
  _bindTransport() {
    this.ui.btnPlay.addEventListener('click',  () => this.togglePlay());
    this.ui.btnStop.addEventListener('click',  () => this.stop());
    this.ui.btnLoop.addEventListener('click',  () => this._cmdLoop());
    this.ui.btnLoopClear.addEventListener('click', () => this.clearLoop());
    this.ui.btnCenterPlayhead.addEventListener('click', () => this._cmdCenterPlayhead());
    this.ui.btnUndo.addEventListener('click',  () => this.undo());
    this.ui.btnRedo.addEventListener('click',  () => this.redo());
    this.ui.btnSelectAll.addEventListener('click',  () => this.selectAll());
    this.ui.btnDeselect.addEventListener('click',   () => this.clearSelection());
    this.ui.btnSplit.addEventListener('click',      () => this._cmdSplit());
    this.ui.btnMergePrev.addEventListener('click',  () => this._cmdMergePrev());
    this.ui.btnMerge.addEventListener('click',      () => this._cmdMergeNext());
    this.ui.btnDuplicate.addEventListener('click',  () => this._cmdDuplicate());
    this.ui.btnDelete.addEventListener('click',     () => this._cmdDelete());
    this.ui.btnAddLine.addEventListener('click',    () => this._cmdAddLine());
    this.ui.btnAddWord.addEventListener('click',    () => this._cmdAddWord());
    this.ui.btnFitSong.addEventListener('click',    () => this.fitSong());
    this.ui.btnZoomSelection.addEventListener('click',   () => this.zoomToSelection());
    this.ui.btnScrollSelection.addEventListener('click', () => this.scrollToSelection());
    this.ui.btnGotoSelection.addEventListener('click',   () => this._cmdGotoSelection());
    this.ui.btnValidate.addEventListener('click',        () => this._cmdValidate());
    this.ui.btnSaveSession.addEventListener('click',     () => this._cmdSaveSession());
    this.ui.btnLoadSession.addEventListener('click',     () => this.ui.sessionUpload.click());
    this.ui.btnRestoreSession.addEventListener('click',  () => this._checkAutosaveRestore(true));
    this.ui.btnRecent.addEventListener('click',          () => this._showRecentModal());
    this.ui.btnHotkeys.addEventListener('click',         () => this._showHotkeysModal());
    this.ui.btnHelp.addEventListener('click',            () => this._showHelpModal());
    this.ui.btnExportActive.addEventListener('click',    () => this.exportActiveTrack());
    this.ui.btnExportAll.addEventListener('click',       () => this.exportAllTracks());
    this.ui.btnExportLine?.addEventListener('click',     () => this._exportByType('line'));
    this.ui.btnExportWords?.addEventListener('click',    () => this._exportByType('words'));
    this.ui.btnExportZip?.addEventListener('click',      () => this._exportZip());
  },

  /* ═══════════════════════════════════════════
     ZOOM / VOLUME BINDINGS
  ═══════════════════════════════════════════ */
  _bindZoom() {
    this.ui.zoomSlider.addEventListener('input', e => {
      this.applyZoom(parseFloat(e.target.value));
    });
    this.ui.vzoomSlider.addEventListener('input', e => {
      this.verticalZoom = Math.max(0.4, Math.min(4, parseFloat(e.target.value) / 100));
      this.updateVZoomReadout();
      this.fullRender();
      this.persistUiPrefs();
    });

    // Wheel zoom on timeline
    this.ui.timelineContainer.addEventListener('wheel', e => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect  = this.ui.timelineContainer.getBoundingClientRect();
      const anchorPx = e.clientX - rect.left + this.ui.timelineContainer.scrollLeft;
      const factor   = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      this.applyZoom(this.zoom * factor, anchorPx);
    }, { passive: false });
  },

  _bindVolume() {
    this.ui.volumeSlider.addEventListener('input', e => {
      this.volume = parseFloat(e.target.value) / 100;
      this.muted  = this.volume === 0;
      this.applyVol();
      this.updateVolumeReadout();
      this.persistUiPrefs();
    });
    this.ui.playbackRate.addEventListener('change', e => {
      this.playbackRate = parseFloat(e.target.value) || 1;
      this.audioElement.playbackRate = this.playbackRate;
      this.persistUiPrefs();
    });
    this.ui.autosaveEnabled.addEventListener('change', e => {
      this.autosaveEnabled = e.target.checked;
      this.persistUiPrefs();
    });
    this.ui.autosaveInterval.addEventListener('change', e => {
      this.autosaveIntervalSec = Math.max(5, parseInt(e.target.value, 10) || 10);
      this.persistUiPrefs();
      this._restartAutosaveTimer();
    });
  },

  /* ═══════════════════════════════════════════
     MODE SELECTORS
  ═══════════════════════════════════════════ */
  _bindModeSelectors() {
    this.ui.snapSelect.addEventListener('change', e => {
      const v = e.target.value;
      this.snapStep = v === 'items' ? 'items' : parseFloat(v) || 0;
      this.persistUiPrefs();
    });
    this.ui.dragMode.addEventListener('change', e => {
      this.updateModeIndicator();
      this.persistUiPrefs();
    });
    this.ui.layerMode.addEventListener('change', () => {
      this.renderTimeline();
      this.persistUiPrefs();
    });
    this.ui.autoScroll.addEventListener('change', e => {
      this.autoScroll = e.target.checked;
      this.persistUiPrefs();
    });
  },

  updateModeIndicator() {
    if (this.ui.modeIndicator) {
      this.ui.modeIndicator.textContent = this.ui.dragMode.value.toUpperCase();
    }
  },

  /* ═══════════════════════════════════════════
     TRACK EVENT BINDINGS (delegated)
  ═══════════════════════════════════════════ */
  _bindTrackEvents() {
    // Track header clicks (delegated)
    this.ui.trackHeaders.addEventListener('click', e => {
      const tid = e.target.closest('[data-tid]')?.dataset.tid;
      if (!tid) return;

      if (e.target.classList.contains('solo-btn')) {
        this._toggleTrackSolo(tid); return;
      }
      if (e.target.classList.contains('mute-btn')) {
        this._toggleTrackMute(tid); return;
      }
      if (e.target.classList.contains('lock-btn')) {
        this._toggleTrackLock(tid); return;
      }
      if (e.target.classList.contains('collapse-btn')) {
        this.collapsed[tid] = !this.collapsed[tid];
        this.fullRender(); return;
      }

      // Click on header background → set active track
      const hdr = e.target.closest('.track-header');
      if (hdr) {
        this.setActiveTrack(tid);
        this.renderTrackHeaders();
        this.renderTimeline();
      }
    });

    // Double-click on track name → rename
    this.ui.trackHeaders.addEventListener('dblclick', e => {
      const nameEl = e.target.closest('.track-name');
      if (!nameEl) return;
      const tid = nameEl.closest('[data-tid]')?.dataset.tid ||
                  nameEl.closest('.track-header')?.dataset.trackId;
      if (tid) this._showRenameModal(tid);
    });

    // Click on timeline lane → set active + deselect
    this.ui.tracksContainer.addEventListener('click', e => {
      const lane = e.target.closest('.track-lane');
      if (!lane || e.target.closest('.item-block')) return;
      const tid = lane.dataset.trackId;
      if (tid) {
        this.setActiveTrack(tid);
        if (!e.shiftKey) this.clearSelection();
        this.renderTrackHeaders();
      }
    });
  },

  _toggleTrackSolo(tid) {
    const tr = this.trackById(tid);
    if (!tr) return;
    tr.solo = !tr.solo;
    this.renderTrackHeaders();
  },

  _toggleTrackMute(tid) {
    const tr = this.trackById(tid);
    if (!tr) return;
    tr.muted = !tr.muted;
    this.renderTrackHeaders();
  },

  _toggleTrackLock(tid) {
    const tr = this.trackById(tid);
    if (!tr) return;
    tr.locked = !tr.locked;
    this.renderTrackHeaders();
  },

  /* ═══════════════════════════════════════════
     CONTEXT MENU
  ═══════════════════════════════════════════ */
  _bindContextMenu() {
    const cm  = this.ui.contextMenu;
    const tc  = this.ui.tracksContainer;

    // Show
    tc.addEventListener('contextmenu', e => {
      e.preventDefault();
      const el  = e.target.closest('.item-block');
      const tid = el?.dataset.trackId ||
                  e.target.closest('.track-lane')?.dataset.trackId ||
                  this.project.activeTrackId;
      const iid = el?.dataset.itemId || null;

      this.context = {
        trackId:  tid  || null,
        itemId:   iid  || null,
        cursorX:  e.clientX,
        cursorY:  e.clientY,
        timeAtCursor: (e.clientX - tc.getBoundingClientRect().left +
                       this.ui.timelineContainer.scrollLeft) / this.zoom,
      };

      // Select item if right-clicked on it
      if (tid && iid && !this.selected.ids.has(iid)) {
        this.selected = { trackId: tid, ids: new Set([iid]) };
        this.renderTimeline();
        this.renderInspector();
      }

      this._updateContextMenuState();
      cm.style.display = 'block';

      // Position so it stays on screen
      const cmW = cm.offsetWidth  || 200;
      const cmH = cm.offsetHeight || 300;
      let x = e.clientX, y = e.clientY;
      if (x + cmW > window.innerWidth)  x = window.innerWidth  - cmW - 4;
      if (y + cmH > window.innerHeight) y = window.innerHeight - cmH - 4;
      cm.style.left = x + 'px';
      cm.style.top  = y + 'px';
    });

    // Hide on outside click
    document.addEventListener('click', e => {
      if (!cm.contains(e.target)) cm.style.display = 'none';
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') cm.style.display = 'none';
    });

    // Menu item actions
    this._bindContextMenuItems();
  },

  _updateContextMenuState() {
    const hasItem     = !!this.context.itemId;
    const hasSelection = this.selected.ids.size > 0;
    const isBatch     = this.selected.ids.size > 1;

    const show = (el, cond) => { if (el) el.style.display = cond ? '' : 'none'; };

    show(this.ui.ctxEdit,          hasItem);
    show(this.ui.ctxSplit,         hasItem);
    show(this.ui.ctxSplitCursor,   true);
    show(this.ui.ctxMergePrev,     hasItem && !isBatch);
    show(this.ui.ctxMergeNext,     hasItem && !isBatch);
    show(this.ui.ctxDuplicate,     hasSelection);
    show(this.ui.ctxDelete,        hasSelection);
    show(this.ui.ctxAddLine,       true);
    show(this.ui.ctxAddWord,       true);
    show(this.ui.ctxBatchClose,    isBatch);
    show(this.ui.ctxBatchDist,     isBatch);
    show(this.ui.ctxBatchNorm,     isBatch);
    show(this.ui.ctxMovePlayhead,  true);
    show(this.ui.ctxZoomSelection, hasSelection);
    show(this.ui.ctxScrollSelection, hasSelection);
    show(this.ui.ctxSelTrack,      !!this.context.trackId);
    show(this.ui.ctxDeleteTrack,   !!this.context.trackId);
  },

  _bindContextMenuItems() {
    const cm = this.ui.contextMenu;
    const on = (el, fn) => el?.addEventListener('click', () => {
      cm.style.display = 'none';
      fn();
    });

    on(this.ui.ctxEdit, () => {
      const { trackId, itemId } = this.context;
      if (trackId && itemId) {
        this.selected = { trackId, ids: new Set([itemId]) };
        this.renderInspector();
      }
    });
    on(this.ui.ctxSplit, () => {
      const { trackId, itemId } = this.context;
      if (trackId && itemId) this.splitItem(trackId, itemId);
    });
    on(this.ui.ctxSplitCursor, () => {
      const { trackId, timeAtCursor } = this.context;
      if (!trackId) return;
      const tr = this.trackById(trackId);
      if (!tr) return;
      const hit = tr.items.find(i => timeAtCursor > i.start && timeAtCursor < i.end);
      if (hit) this.splitItem(trackId, hit.id, timeAtCursor);
    });
    on(this.ui.ctxMergePrev, () => {
      const { trackId, itemId } = this.context;
      if (trackId && itemId) this.mergeWithPrev(trackId, itemId);
    });
    on(this.ui.ctxMergeNext, () => {
      const { trackId, itemId } = this.context;
      if (trackId && itemId) this.mergeWithNext(trackId, itemId);
    });
    on(this.ui.ctxDuplicate,  () => this._cmdDuplicate());
    on(this.ui.ctxDelete,     () => this._cmdDelete());
    on(this.ui.ctxAddLine,    () => this._cmdAddLine());
    on(this.ui.ctxAddWord,    () => this._cmdAddWord());
    on(this.ui.ctxMovePlayhead, () => {
      this.seekTo(this.context.timeAtCursor || 0);
    });
    on(this.ui.ctxZoomSelection,   () => this.zoomToSelection());
    on(this.ui.ctxScrollSelection, () => this.scrollToSelection());
    on(this.ui.ctxSelTrack, () => {
      const tid = this.context.trackId;
      if (!tid) return;
      const tr = this.trackById(tid);
      if (!tr) return;
      this.selected = { trackId: tid, ids: new Set(tr.items.map(i => i.id)) };
      this.renderTimeline();
      this.renderInspector();
    });
    on(this.ui.ctxDeleteTrack, () => {
      const tid = this.context.trackId;
      if (!tid || !confirm('Удалить дорожку?')) return;
      this.pushHistory('delete track');
      this.project.tracks = this.project.tracks.filter(t => t.id !== tid);
      if (this.project.activeTrackId === tid) {
        this.project.activeTrackId = this.project.tracks[0]?.id || null;
      }
      this.invalidatePreviewMap('delete-track');
      this.invalidatePlaybackIndex();
      this.clearSelection();
      this.fullRender();
      this.markDirty();
    });
    on(this.ui.ctxBatchClose, () => {
      const { trackId } = this.context;
      if (!trackId || this.selected.ids.size < 2) return;
      const tr  = this.trackById(trackId);
      const its = [...this.selected.ids]
        .map(id => this.itemById(trackId, id)).filter(Boolean)
        .sort((a, b) => a.start - b.start);
      this.applyTrackEdit(tr, 'batch close gaps', () => {
        for (let i = 1; i < its.length; i++) {
          its[i].start = its[i - 1].end;
          if (its[i].end <= its[i].start) its[i].end = its[i].start + this.MIN_DUR;
        }
      });
    });
    on(this.ui.ctxBatchDist, () => {
      const { trackId } = this.context;
      if (!trackId || this.selected.ids.size < 2) return;
      const tr  = this.trackById(trackId);
      const its = [...this.selected.ids]
        .map(id => this.itemById(trackId, id)).filter(Boolean)
        .sort((a, b) => a.start - b.start);
      this.applyTrackEdit(tr, 'batch distribute', () => {
        const totalDur = its.reduce((s, i) => s + (i.end - i.start), 0);
        const span     = its[its.length - 1].end - its[0].start;
        const gap      = Math.max(0, (span - totalDur) / (its.length - 1));
        let cur = its[0].start;
        its.forEach(it => {
          const d = it.end - it.start;
          it.start = cur; it.end = cur + d;
          cur = it.end + gap;
        });
      });
    });
    on(this.ui.ctxBatchNorm, () => {
      const { trackId } = this.context;
      if (!trackId || this.selected.ids.size < 2) return;
      const tr  = this.trackById(trackId);
      const its = [...this.selected.ids]
        .map(id => this.itemById(trackId, id)).filter(Boolean);
      const avgDur = its.reduce((s, i) => s + (i.end - i.start), 0) / its.length;
      this.applyTrackEdit(tr, 'batch normalize duration', () => {
        its.forEach(it => { it.end = it.start + avgDur; });
      });
    });
  },

  /* ═══════════════════════════════════════════
     AUTOSAVE
  ═══════════════════════════════════════════ */
  _bindAutosave() {
    this._restartAutosaveTimer();
  },

  _restartAutosaveTimer() {
    clearInterval(this.autosaveTimer);
    if (!this.autosaveEnabled) return;
    const ms = (this.autosaveIntervalSec || 10) * 1000;
    this.autosaveTimer = setInterval(() => {
      if (this.dirty) this.saveAutoDraft();
    }, ms);
  },

  _checkAutosaveRestore(force) {
    try {
      const raw = localStorage.getItem(this.DRAFT_KEY);
      if (!raw) return;
      const snap = JSON.parse(raw);
      if (!snap?.project) return;
      if (!force && !this.dirty && !this.project.tracks.length) {
        this._showRestoreModal(snap);
        return;
      }
      if (force) this._showRestoreModal(snap);
    } catch (e) { console.warn('autosave check:', e); }
  },

  _showRestoreModal(snap) {
    const m = this.ui.restoreModal;
    const d = this.ui.restoreModalDesc;
    if (!m) return;
    const ts = snap.ts ? new Date(snap.ts).toLocaleString() : '?';
    d.textContent = `Автосохранение от ${ts}. Восстановить?`;
    m.classList.remove('hidden');

    const yes  = this.ui.btnRestoreYes;
    const no   = this.ui.btnRestoreNo;
    const del  = this.ui.btnRestoreDelete;

    const close = () => m.classList.add('hidden');

    const onYes = () => { close(); this.loadSession(snap); };
    const onNo  = () => { close(); };
    const onDel = () => {
      close();
      localStorage.removeItem(this.DRAFT_KEY);
    };

    // Remove previous listeners to avoid stacking
    yes.replaceWith(yes.cloneNode(true));
    no.replaceWith(no.cloneNode(true));
    del.replaceWith(del.cloneNode(true));
    this.ui.btnRestoreYes    = this.ui.restoreModal.querySelector('#btn-restore-yes');
    this.ui.btnRestoreNo     = this.ui.restoreModal.querySelector('#btn-restore-no');
    this.ui.btnRestoreDelete = this.ui.restoreModal.querySelector('#btn-restore-delete');
    this.ui.btnRestoreYes.addEventListener('click',    onYes);
    this.ui.btnRestoreNo.addEventListener('click',     onNo);
    this.ui.btnRestoreDelete.addEventListener('click', onDel);
  },

  /* ═══════════════════════════════════════════
     RECENT DRAFTS
  ═══════════════════════════════════════════ */
  _addRecentEntry(snap) {
    try {
      let list = JSON.parse(localStorage.getItem(this.RECENT_KEY) || '[]');
      list = list.filter(e => e.audio !== snap.audio || e.ts !== snap.ts);
      list.unshift({ ts: snap.ts, audio: snap.audio });
      if (list.length > this.MAX_RECENT) list = list.slice(0, this.MAX_RECENT);
      localStorage.setItem(this.RECENT_KEY, JSON.stringify(list));
    } catch (e) { console.warn(e); }
  },

  _showRecentModal() {
    const m  = this.ui.recentModal;
    const ul = this.ui.recentList;
    if (!m || !ul) return;

    let list = [];
    try { list = JSON.parse(localStorage.getItem(this.RECENT_KEY) || '[]'); }
    catch (_) {}

    ul.innerHTML = '';
    if (!list.length) {
      ul.innerHTML = '<li class="no-sel">Нет записей</li>';
    } else {
      list.forEach(entry => {
        const li = document.createElement('li');
        li.textContent = `${entry.audio || '?'} — ${new Date(entry.ts).toLocaleString()}`;
        ul.appendChild(li);
      });
    }

    m.classList.remove('hidden');
    this.ui.btnRecentClearAll.onclick = () => {
      localStorage.removeItem(this.RECENT_KEY);
      ul.innerHTML = '<li class="no-sel">Нет записей</li>';
    };
    this.ui.btnRecentClose.onclick = () => m.classList.add('hidden');
  },

  /* ═══════════════════════════════════════════
     MODALS
  ═══════════════════════════════════════════ */
  _bindModals() {
    // Close modals on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', e => {
        if (e.target === modal) modal.classList.add('hidden');
      });
    });
  },

  /* ── Hotkeys modal ── */
  _showHotkeysModal() {
    const m = this.ui.hotkeysModal;
    if (!m) return;
    this._renderHotkeysModal();
    m.classList.remove('hidden');

    this.ui.hkSearch.oninput = e => {
      const q = e.target.value.toLowerCase();
      m.querySelectorAll('.hk-row').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    };
    this.ui.btnHotkeysClose.onclick = () => m.classList.add('hidden');
    this.ui.btnHotkeysSave.onclick  = () => { this._saveKeymap(); m.classList.add('hidden'); };
    this.ui.btnHotkeysReset.onclick = () => {
      this.keymap = this._defaultKeymap();
      this._saveKeymap();
      this._renderHotkeysModal();
    };
  },

  _renderHotkeysModal() {
    const list = this.ui.hotkeysList;
    if (!list) return;
    list.innerHTML = '';
    Object.entries(this.commands).forEach(([cmdId, cmd]) => {
      const row = document.createElement('div');
      row.className = 'hk-row';

      const lbl = document.createElement('span');
      lbl.className   = 'hk-label';
      lbl.textContent = cmd.label;

      const key = document.createElement('kbd');
      key.className   = 'hk-key';
      key.textContent = this.keymap[cmdId] || '—';
      key.title       = 'Click to remap';
      key.style.cursor = 'pointer';
      key.addEventListener('click', () => {
        this.hotkeysWaiting = cmdId;
        key.textContent     = '⌨ Press key…';
        key.classList.add('waiting');
      });

      row.appendChild(lbl);
      row.appendChild(key);
      list.appendChild(row);
    });
  },

  /* ── Help modal ── */
  _showHelpModal() {
    const m = this.ui.helpModal;
    if (!m) return;
    m.classList.remove('hidden');
    this.ui.btnHelpClose.onclick = () => m.classList.add('hidden');
  },

  /* ── Rename modal ── */
  _showRenameModal(trackId) {
    const m  = this.ui.renameModal;
    const tr = this.trackById(trackId);
    if (!m || !tr) return;

    this.ui.renameInput.value = tr.name || '';
    this.ui.renameColor.value = tr.color || '#4a7cdc';
    m.classList.remove('hidden');
    this.ui.renameInput.focus();
    this.ui.renameInput.select();

    const apply = () => {
      tr.name  = this.ui.renameInput.value.trim() || tr.name;
      tr.color = this.ui.renameColor.value;
      m.classList.add('hidden');
      this.renderTrackHeaders();
      this.renderTimeline();
      this.markDirty();
    };

    this.ui.btnRenameOk.onclick     = apply;
    this.ui.btnRenameCancel.onclick = () => m.classList.add('hidden');
    this.ui.renameInput.onkeydown   = e => {
      if (e.key === 'Enter') apply();
      if (e.key === 'Escape') m.classList.add('hidden');
    };
  },

  /* ── Loop modal ── */
  _showLoopModal() {
    const m = this.ui.loopModal;
    if (!m) return;
    this.ui.loopInVal.value  = (this.loop.start ?? this.audioElement.currentTime).toFixed(3);
    this.ui.loopOutVal.value = (this.loop.end   ?? Math.min(this.duration, (this.loop.start ?? 0) + 5)).toFixed(3);
    m.classList.remove('hidden');

    this.ui.btnLoopOk.onclick = () => {
      const s = parseFloat(this.ui.loopInVal.value);
      const e = parseFloat(this.ui.loopOutVal.value);
      if (!isNaN(s) && !isNaN(e) && e > s) this.setLoop(s, e);
      m.classList.add('hidden');
    };
    this.ui.btnLoopCancel.onclick = () => m.classList.add('hidden');
  },

  /* ── Validation ── */
  _runValidation() {
    const issues = [];
    this.project.tracks.forEach(tr => {
      const sorted = tr.items.slice().sort((a, b) => a.start - b.start);
      sorted.forEach((it, i) => {
        if (it.end <= it.start)
          issues.push({ tr: tr.name, id: it.id, msg: `end ≤ start (${it.start}–${it.end})` });
        if (i > 0 && it.start < sorted[i-1].end && it.kind === sorted[i-1].kind)
          issues.push({ tr: tr.name, id: it.id, msg: `overlap with previous ${it.kind}` });
        if (!it.text?.trim())
          issues.push({ tr: tr.name, id: it.id, msg: 'empty text', severity: 'warn' });
      });
    });
    return issues;
  },

  _showValidationModal(issues) {
    const m  = this.ui.validationModal;
    const ul = this.ui.validationList;
    if (!m || !ul) return;

    ul.innerHTML = '';
    if (!issues.length) {
      ul.innerHTML = '<li class="ok">✓ Нет проблем</li>';
    } else {
      issues.forEach(iss => {
        const li = document.createElement('li');
        li.className   = iss.severity || 'error';
        li.textContent = `[${iss.tr}] ${iss.msg}`;
        li.dataset.id  = iss.id;
        li.style.cursor = 'pointer';
        li.addEventListener('click', () => {
          // Find item across tracks
          for (const tr of this.project.tracks) {
            const it = tr.items.find(i => i.id === iss.id);
            if (it) {
              this.setActiveTrack(tr.id);
              this.selected = { trackId: tr.id, ids: new Set([it.id]) };
              this.scrollToSelection();
              this.renderTimeline();
              this.renderInspector();
              break;
            }
          }
        });
        ul.appendChild(li);
      });
    }

    m.classList.remove('hidden');
    this.ui.btnValidationClose.onclick = () => m.classList.add('hidden');
    this.ui.btnValidationRerun.onclick = () => {
      this._showValidationModal(this._runValidation());
    };
    this.ui.btnValidationFix?.addEventListener('click', () => {
      this.pushHistory('auto-fix');
      this.project.tracks.forEach(tr => {
        this.normalizeTrackAfterEdit(tr);
      });
      this.markDirty();
      this.fullRender();
      this._showValidationModal(this._runValidation());
    }, { once: true });
    this.ui.btnValidationExport?.addEventListener('click', () => {
      const txt = issues.map(i => `[${i.tr}] ${i.msg}`).join('\n');
      this.downloadBlob(new Blob([txt], { type: 'text/plain' }), 'validation.txt');
    }, { once: true });
  },

  /* ═══════════════════════════════════════════
     EXPORT HELPERS
  ═══════════════════════════════════════════ */
  _exportByType(type) {
    const tr = this.project.tracks.find(t => t.type === type);
    if (!tr) return alert(`Дорожка типа "${type}" не найдена`);
    const data = this.normalizeTrackForExport(tr);
    this.downloadBlob(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      `${this.audioFileName}_${type}.json`
    );
  },

  async _exportZip() {
    if (typeof JSZip === 'undefined') {
      alert('JSZip не подключён');
      return;
    }
    const zip = new JSZip();
    this.project.tracks.forEach(tr => {
      const data = this.normalizeTrackForExport(tr);
      zip.file(`${tr.name || tr.type}.json`, JSON.stringify(data, null, 2));
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    this.downloadBlob(blob, `${this.audioFileName}_tracks.zip`);
  },
});
