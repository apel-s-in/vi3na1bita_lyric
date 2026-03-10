// FILE: /ke-dom.js
'use strict';
/* ── ke-dom.js: DOM cache, dynamic DOM registries ── */
Object.assign(App, {

  /* ── static DOM cache (moved from ke-state.js cache()) ── */
  cache(){
    const g = id => document.getElementById(id);
    this.ui = {
      audioUpload:        g('audio-upload'),
      lineUpload:         g('line-upload'),
      wordsUpload:        g('words-upload'),
      sessionUpload:      g('session-upload'),
      btnExportActive:    g('btn-export-active'),
      btnExportLine:      g('btn-export-line'),
      btnExportWords:     g('btn-export-words'),
      btnExportAll:       g('btn-export-all'),
      btnExportZip:       g('btn-export-zip'),
      btnSaveSession:     g('btn-save-session'),
      btnLoadSession:     g('btn-load-session'),
      btnValidate:        g('btn-validate'),
      btnRestoreSession:  g('btn-restore-session'),
      btnRecent:          g('btn-recent'),
      btnHotkeys:         g('btn-hotkeys'),
      btnHelp:            g('btn-help'),
      btnPlay:            g('btn-play'),
      btnStop:            g('btn-stop'),
      btnLoop:            g('btn-loop'),
      btnLoopClear:       g('btn-loop-clear'),
      btnCenterPlayhead:  g('btn-center-playhead'),
      btnUndo:            g('btn-undo'),
      btnRedo:            g('btn-redo'),
      btnSelectAll:       g('btn-select-all'),
      btnDeselect:        g('btn-deselect'),
      btnSplit:           g('btn-split'),
      btnMergePrev:       g('btn-merge-prev'),
      btnMerge:           g('btn-merge'),
      btnDuplicate:       g('btn-duplicate'),
      btnAddLine:         g('btn-add-line'),
      btnAddWord:         g('btn-add-word'),
      btnDelete:          g('btn-delete'),
      btnMute:            g('btn-mute'),
      zoomSlider:         g('zoom-slider'),
      zoomReadout:        g('zoom-readout'),
      vzoomSlider:        g('vzoom-slider'),
      vzoomReadout:       g('vzoom-readout'),
      snapSelect:         g('snap-select'),
      dragMode:           g('drag-mode'),
      layerMode:          g('layer-mode'),
      autoScroll:         g('auto-scroll'),
      autosaveEnabled:    g('autosave-enabled'),
      autosaveInterval:   g('autosave-interval'),
      volumeSlider:       g('volume-slider'),
      volumeReadout:      g('volume-readout'),
      btnFitSong:         g('btn-fit-song'),
      btnZoomSelection:   g('btn-zoom-selection'),
      btnScrollSelection: g('btn-scroll-selection'),
      btnGotoSelection:   g('btn-goto-selection'),
      modeIndicator:      g('mode-indicator'),
      timeDisplay:        g('time-display'),
      saveStatus:         g('save-status'),
      timelineContainer:  g('timeline-container'),
      scrollArea:         g('timeline-scroll-area'),
      rulerCanvas:        g('ruler-canvas'),
      gridCanvas:         g('grid-canvas'),
      waveCanvas:         g('waveform-canvas'),
      tracksContainer:    g('tracks-container'),
      trackHeaders:       g('track-headers'),
      playhead:           g('playhead'),
      playheadHandle:     g('playhead-handle'),
      loopRegion:         g('loop-region'),
      selectionBox:       g('selection-box'),
      sidebar:            g('sidebar'),
      sidebarResizer:     g('sidebar-resizer'),
      inspectorPanel:     g('inspector'),
      inspectorContent:   g('inspector-content'),
      previewResizer:     g('preview-resizer'),
      lyricsContainer:    g('lyrics-container'),
      contextMenu:        g('context-menu'),
      ctxEdit:            g('ctx-edit'),
      ctxSplit:           g('ctx-split'),
      ctxSplitCursor:     g('ctx-split-cursor'),
      ctxMergePrev:       g('ctx-merge-prev'),
      ctxMergeNext:       g('ctx-merge-next'),
      ctxDuplicate:       g('ctx-duplicate'),
      ctxAddLine:         g('ctx-add-line'),
      ctxAddWord:         g('ctx-add-word'),
      ctxBatchClose:      g('ctx-batch-close'),
      ctxBatchDist:       g('ctx-batch-dist'),
      ctxBatchNorm:       g('ctx-batch-norm'),
      ctxMovePlayhead:    g('ctx-move-playhead'),
      ctxZoomSelection:   g('ctx-zoom-selection'),
      ctxScrollSelection: g('ctx-scroll-selection'),
      ctxSelTrack:        g('ctx-sel-track'),
      ctxDelete:          g('ctx-delete'),
      ctxDeleteTrack:     g('ctx-delete-track'),
      restoreModal:       g('restore-modal'),
      restoreModalDesc:   g('restore-modal-desc'),
      btnRestoreYes:      g('btn-restore-yes'),
      btnRestoreNo:       g('btn-restore-no'),
      btnRestoreDelete:   g('btn-restore-delete'),
      recentModal:        g('recent-modal'),
      recentList:         g('recent-list'),
      btnRecentClearAll:  g('btn-recent-clear-all'),
      btnRecentClose:     g('btn-recent-close'),
      hotkeysModal:       g('hotkeys-modal'),
      hotkeysList:        g('hotkeys-list'),
      hotkeysConflicts:   g('hotkeys-conflicts'),
      hkSearch:           g('hk-search'),
      btnHotkeysSave:     g('btn-hotkeys-save'),
      btnHotkeysReset:    g('btn-hotkeys-reset'),
      btnHotkeysClose:    g('btn-hotkeys-close'),
      validationModal:    g('validation-modal'),
      validationList:     g('validation-list'),
      btnValidationClose: g('btn-validation-close'),
      btnValidationExport:g('btn-validation-export'),
      btnValidationFix:   g('btn-validation-fix'),
      btnValidationRerun: g('btn-validation-rerun'),
      helpModal:          g('help-modal'),
      helpList:           g('help-list'),
      btnHelpClose:       g('btn-help-close'),
      vkbdModal:          g('vkbd-modal'),
      vkbdDisplay:        g('vkbd-display'),
      vkbdHint:           g('vkbd-hint'),
      btnVkbd:            g('btn-vkbd'),
      btnVkbdClose:       g('btn-vkbd-close'),
      renameModal:        g('rename-modal'),
      renameInput:        g('rename-input'),
      renameColor:        g('rename-color'),
      btnRenameOk:        g('btn-rename-ok'),
      btnRenameCancel:    g('btn-rename-cancel'),
      loopModal:          g('loop-modal'),
      loopInVal:          g('loop-in-val'),
      loopOutVal:         g('loop-out-val'),
      btnLoopOk:          g('btn-loop-ok'),
      btnLoopCancel:      g('btn-loop-cancel'),
      playbackRate:       g('playback-rate'),
      exportPreviewModal: g('export-preview-modal'),
      exportPreviewText:  g('export-preview-text'),
      btnExportPreviewCopy:     g('btn-export-preview-copy'),
      btnExportPreviewDownload: g('btn-export-preview-download'),
      btnExportPreviewClose:    g('btn-export-preview-close'),
      loader:             g('loader'),
      audioPlayer:        g('audio-player'),
      workspace:          g('workspace'),
      workspaceMain:      g('workspace-main'),
      timelineResizer:    g('timeline-resizer'),
      sidebarCollapseBtn: g('sidebar-collapse-btn'),
      inspectorCollapseBtn: g('inspector-collapse-btn'),
      previewCollapseBtn: g('preview-collapse-btn'),
      inspectorBody:      g('inspector-body'),
      previewBody:        g('preview-body'),
      previewPanel:       g('preview-panel'),
      toolbarCompactBtn:  g('toolbar-compact-btn'),
      btnLayoutLock:      g('btn-layout-lock'),
      toolbar:            g('toolbar'),
    };
  },

  /* ── dynamic DOM maps ── */

  // Map keys are "trackId::itemId" to avoid collisions across tracks
  _timelineDomMap: new Map(),   // trackId::itemId → timeline item element
  _previewLineDomMap: new Map(),// trackId::itemId → preview lyric-line element
  _previewWordDomMap: new Map(),// trackId::itemId → preview lyric-word element
  _trackHeaderDomMap: new Map(),// trackId        → track header element

  /* ── key helpers ── */
  makeDomKey(trackId, itemId) {
    return trackId + '::' + itemId;
  },

  /* ── timeline item map ── */
  clearTimelineDomMap() {
    this._timelineDomMap.clear();
  },
  registerTimelineItemEl(trackId, itemId, el) {
    this._timelineDomMap.set(this.makeDomKey(trackId, itemId), el);
  },
  getTimelineItemEl(trackId, itemId) {
    return this._timelineDomMap.get(this.makeDomKey(trackId, itemId)) || null;
  },

  /* ── preview line map ── */
  clearPreviewDomMap() {
    this._previewLineDomMap.clear();
    this._previewWordDomMap.clear();
  },
  registerPreviewLineEl(trackId, itemId, el) {
    this._previewLineDomMap.set(this.makeDomKey(trackId, itemId), el);
  },
  getPreviewLineEl(trackId, itemId) {
    return this._previewLineDomMap.get(this.makeDomKey(trackId, itemId)) || null;
  },
  registerPreviewWordEl(trackId, itemId, el) {
    this._previewWordDomMap.set(this.makeDomKey(trackId, itemId), el);
  },
  getPreviewWordEl(trackId, itemId) {
    return this._previewWordDomMap.get(this.makeDomKey(trackId, itemId)) || null;
  },

  /* ── track header map ── */
  clearTrackHeaderDomMap() {
    this._trackHeaderDomMap.clear();
  },
  registerTrackHeaderEl(trackId, el) {
    this._trackHeaderDomMap.set(trackId, el);
  },
  getTrackHeaderEl(trackId) {
    return this._trackHeaderDomMap.get(trackId) || null;
  },

  /* ── safe attribute update helper ──
     Updates an element's attribute/property only if the value actually changed.
     Avoids unnecessary DOM mutations in hot paths.                            */
  safeSetAttr(el, attr, value) {
    if (!el) return;
    const str = String(value);
    if (el.getAttribute(attr) !== str) el.setAttribute(attr, str);
  },
  safeSetClass(el, cls, enabled) {
    if (!el) return;
    if (enabled) { if (!el.classList.contains(cls)) el.classList.add(cls); }
    else         { if (el.classList.contains(cls))  el.classList.remove(cls); }
  },
  safeSetStyle(el, prop, value) {
    if (!el) return;
    if (el.style[prop] !== value) el.style[prop] = value;
  },
});
