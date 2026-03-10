'use strict';
/* ── ke-state.js: constants, state, utils, history, ui-prefs ── */
const App = {
  /* constants */
  DRAFT_KEY:'karaokeEditorDraftV5', UI_KEY:'karaokeEditorUiStateV4',
  KM_KEY:'karaokeEditorKeymapV3',   RECENT_KEY:'karaokeEditorRecentV1',
  MAX_HISTORY:80, MAX_RECENT:10, MIN_DUR:.02,

  /* state */
  audioCtx:null, audioBuffer:null, audioElement:null, duration:0, audioFileName:'audio',
  zoom:80, verticalZoom:1, snapStep:0, autoScroll:true, volume:1, muted:false,
  dirty:false, playbackRate:1, autosaveEnabled:true, autosaveIntervalSec:10, autosaveTimer:null,
  project:{version:2,tracks:[],activeTrackId:null},
  selected:{trackId:null,ids:new Set()},
  history:[], historyIndex:-1,
  drag:{active:false,type:null,trackId:null,itemId:null,startX:0,initial:{},sel:[],rollPair:null},
  marquee:{active:false,startX:0,startY:0},
  resize:{active:false,target:null,startX:0,startY:0,startDim:0},
  playheadDrag:{active:false},
  charDrag:{active:false,itemId:null,trackId:null,charIdx:null,side:null,startX:0,initialStart:0,initialEnd:0},
  context:{trackId:null,itemId:null,cursorX:0},
  loop:{enabled:false,start:null,end:null},
  hotkeysWaiting:null,keymap:{},collapsed:{},ui:{},commands:{},layoutUnlocked:false,
  _dragModeBadge:null,_dragClamped:false,_rippleAffected:new Set(),

  /* ── utils ── */
  activeTrack(){ return this.trackById(this.project.activeTrackId) },
  trackById(id){ return this.project.tracks.find(t=>t.id===id)||null },
  trackByType(type){ return this.project.tracks.find(t=>t.type===type)||null },
  itemById(tid,id){ const tr=this.trackById(tid); return tr?tr.items.find(i=>i.id===id)||null:null },
  sortTrack(tr){ tr.items.sort((a,b)=>a.start-b.start) },
  sortActiveTrack(){ const tr=this.activeTrack(); if(tr)this.sortTrack(tr) },
  uid(){ return Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-4) },
  num(v,def=0){ const n=parseFloat(v); return isNaN(n)?def:n },
  esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') },
  base(n){ return n.replace(/\.[^/.]+$/,'') },
  fmtTime(t){ const m=Math.floor(t/60),s=(t%60).toFixed(2); return m+':'+(+s<10?'0':'')+s },
  hexToRgba(hex,a){
    const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${a})`;
  },
  downloadBlob(blob,name){
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),3000);
  },
  mergeTexts(a,b){ return(a.trim()+' '+b.trim()).replace(/\s{2,}/g,' ').trim() },
  smartTextSplit(text,ratio){
    const words=text.split(/\s+/); if(words.length<=1)return{before:text,after:text};
    let idx=Math.max(1,Math.round(words.length*ratio));
    if(idx>=words.length)idx=words.length-1;
    return{before:words.slice(0,idx).join(' '),after:words.slice(idx).join(' ')};
  },

  /* ── history ── */
  pushHistory(label){
    const snap=JSON.stringify(this.project);
    this.history=this.history.slice(0,this.historyIndex+1);
    this.history.push({label,snap});
    if(this.history.length>this.MAX_HISTORY)this.history.shift();
    this.historyIndex=this.history.length-1;
  },
  undo(){
    if(this.historyIndex<=0)return;
    this.historyIndex--;
    this.project=JSON.parse(this.history[this.historyIndex].snap);
    this.clearSelection(); this.fullRender(); this.markDirty();
  },
  redo(){
    if(this.historyIndex>=this.history.length-1)return;
    this.historyIndex++;
    this.project=JSON.parse(this.history[this.historyIndex].snap);
    this.clearSelection(); this.fullRender(); this.markDirty();
  },

  /* ── dirty / save-status ── */
  markDirty(dirty=true){
    this.dirty=dirty;
    this.updateSaveStatus(dirty?'Unsaved changes':'Saved',dirty);
    if(dirty&&this.autosaveEnabled){
      clearTimeout(this._dirtyDebounce);
      this._dirtyDebounce=setTimeout(()=>this.saveAutoDraft(),3000);
    }
  },
  updateSaveStatus(msg,isDirty){
    const el=this.ui.saveStatus; el.textContent=msg;
    el.className='save-status'+(isDirty?' dirty':'');
  },

  /* ── ui prefs ── */
  _uiPrefFields:['zoom','verticalZoom','autoScroll','volume','muted',
                 'autosaveEnabled','autosaveIntervalSec','snapStep','playbackRate'],
  _syncUiToDOM(){
    const u=this.ui;
    u.zoomSlider.value=this.zoom;
    u.vzoomSlider.value=Math.round(this.verticalZoom*100);
    u.autoScroll.checked=this.autoScroll;
    u.autosaveEnabled.checked=this.autosaveEnabled;
    u.autosaveInterval.value=this.autosaveIntervalSec;
    u.snapSelect.value=this.snapStep==='items'?'items':this.snapStep;
    u.playbackRate.value=this.playbackRate; this.audioElement.playbackRate=this.playbackRate;
    this.applyVol(); this.updateVolumeReadout(); this.updateZoomReadout(); this.updateVZoomReadout();
  },
  persistUiPrefs(){
    try{
      const o={sidebarWidth:this.ui.sidebar.style.width,
               dragMode:this.ui.dragMode.value,layerMode:this.ui.layerMode.value,
               layoutUnlocked:this.layoutUnlocked};
      this._uiPrefFields.forEach(f=>{o[f]=this[f]});
      localStorage.setItem(this.UI_KEY,JSON.stringify(o));
    }catch(e){console.warn(e)}
  },
  restoreUiPrefs(){
    try{
      const p=JSON.parse(localStorage.getItem(this.UI_KEY)||'{}');
      this._uiPrefFields.forEach(f=>{if(p[f]!==undefined)this[f]=p[f]});
      if(p.sidebarWidth)this.ui.sidebar.style.width=p.sidebarWidth;
      if(p.dragMode)this.ui.dragMode.value=p.dragMode;
      if(p.layerMode)this.ui.layerMode.value=p.layerMode;
      if(p.layoutUnlocked!==undefined)this.layoutUnlocked=!!p.layoutUnlocked;
      this._syncUiToDOM();
    }catch(e){console.warn(e)}
  },

  /* ── selection ── */
  selectItem(tid,id){
    if(this.selected.trackId&&this.selected.trackId!==tid)this.selected.ids.clear();
    this.selected.trackId=tid; this.selected.ids.add(id);
    this.renderInspector(); this.renderTimeline();
  },
  clearSelection(){
    this.selected={trackId:null,ids:new Set()};
    this.renderInspector(); this.renderTimeline();
  },
  selectAll(){
    const tr=this.activeTrack(); if(!tr)return;
    this.selected.trackId=tr.id;
    this.selected.ids=new Set(this.visibleItems(tr,this.ui.layerMode.value).map(i=>i.id));
    this.renderTimeline(); this.renderInspector();
  },
  getSelectionBounds(){
    const tr=this.activeTrack(); if(!tr||!this.selected.ids.size)return null;
    const items=[...this.selected.ids].map(id=>this.itemById(tr.id,id)).filter(Boolean);
    if(!items.length)return null;
    return{items,minStart:Math.min(...items.map(i=>i.start)),maxEnd:Math.max(...items.map(i=>i.end)),tr};
  },

  /* ── unified edit pipeline ── */
  applyTrackEdit(tr,label,fn){
    if(!tr)return;
    this.pushHistory(label); fn();
    this.normalizeTrackAfterEdit(tr); this.markDirty(); this.afterEdit();
  },
  afterEdit(){ this.renderTimeline(); this.renderInspector(); this.renderPreview() },

  /* ── normalization ── */
  stableClampItem(item){
    item.start=Math.max(0,item.start);
    if(item.end<=item.start)item.end=item.start+this.MIN_DUR;
  },
  enforceNoOverlapForKind(tr,kind){
    const items=tr.items.filter(i=>i.kind===kind).sort((a,b)=>a.start-b.start);
    for(let i=1;i<items.length;i++){
      if(items[i].start<items[i-1].end){
        items[i].start=items[i-1].end;
        if(items[i].end<=items[i].start)items[i].end=items[i].start+.05;
      }
    }
  },
  recomputeWordsLineBounds(tr){
    if(tr.type!=='words')return;
    tr.items.filter(i=>i.kind==='line').forEach(line=>{
      const words=tr.items.filter(i=>i.kind==='word'&&i.lineId===line.id);
      if(!words.length)return;
      line.start=Math.min(line.start,...words.map(w=>w.start));
      line.end=Math.max(line.end,...words.map(w=>w.end));
    });
  },
  normalizeTrackAfterEdit(tr){
    if(!tr)return;
    tr.items.forEach(it=>this.stableClampItem(it));
    this.sortTrack(tr);
    if(tr.type==='words')this.recomputeWordsLineBounds(tr);
  },
  normalizeTrackForExport(tr){
    const clone=JSON.parse(JSON.stringify(tr));
    clone.items.forEach(it=>this.stableClampItem(it));
    ['line','word'].forEach(k=>this.enforceNoOverlapForKind(clone,k));
    this.sortTrack(clone);
    if(clone.type==='words')this.recomputeWordsLineBounds(clone);
    return clone;
  },

  /* ── cache dom refs ── */
  cache(){
    const g=id=>document.getElementById(id);
    this.ui={
      audioUpload:g('audio-upload'),lineUpload:g('line-upload'),wordsUpload:g('words-upload'),
      sessionUpload:g('session-upload'),
      btnExportActive:g('btn-export-active'),btnExportLine:g('btn-export-line'),
      btnExportWords:g('btn-export-words'),btnExportAll:g('btn-export-all'),btnExportZip:g('btn-export-zip'),
      btnSaveSession:g('btn-save-session'),btnLoadSession:g('btn-load-session'),
      btnValidate:g('btn-validate'),btnRestoreSession:g('btn-restore-session'),
      btnRecent:g('btn-recent'),btnHotkeys:g('btn-hotkeys'),btnHelp:g('btn-help'),
      btnPlay:g('btn-play'),btnStop:g('btn-stop'),btnLoop:g('btn-loop'),btnLoopClear:g('btn-loop-clear'),
      btnCenterPlayhead:g('btn-center-playhead'),
      btnUndo:g('btn-undo'),btnRedo:g('btn-redo'),
      btnSelectAll:g('btn-select-all'),btnDeselect:g('btn-deselect'),
      btnSplit:g('btn-split'),btnMergePrev:g('btn-merge-prev'),btnMerge:g('btn-merge'),
      btnDuplicate:g('btn-duplicate'),btnAddLine:g('btn-add-line'),btnAddWord:g('btn-add-word'),
      btnDelete:g('btn-delete'),btnMute:g('btn-mute'),
      zoomSlider:g('zoom-slider'),zoomReadout:g('zoom-readout'),
      vzoomSlider:g('vzoom-slider'),vzoomReadout:g('vzoom-readout'),
      snapSelect:g('snap-select'),dragMode:g('drag-mode'),layerMode:g('layer-mode'),
      autoScroll:g('auto-scroll'),autosaveEnabled:g('autosave-enabled'),autosaveInterval:g('autosave-interval'),
      volumeSlider:g('volume-slider'),volumeReadout:g('volume-readout'),
      btnFitSong:g('btn-fit-song'),btnZoomSelection:g('btn-zoom-selection'),
      btnScrollSelection:g('btn-scroll-selection'),btnGotoSelection:g('btn-goto-selection'),
      modeIndicator:g('mode-indicator'),timeDisplay:g('time-display'),saveStatus:g('save-status'),
      timelineContainer:g('timeline-container'),scrollArea:g('timeline-scroll-area'),
      rulerCanvas:g('ruler-canvas'),gridCanvas:g('grid-canvas'),waveCanvas:g('waveform-canvas'),
      tracksContainer:g('tracks-container'),trackHeaders:g('track-headers'),
      playhead:g('playhead'),playheadHandle:g('playhead-handle'),
      loopRegion:g('loop-region'),selectionBox:g('selection-box'),
      sidebar:g('sidebar'),sidebarResizer:g('sidebar-resizer'),
      inspectorPanel:g('inspector'),inspectorContent:g('inspector-content'),
      previewResizer:g('preview-resizer'),lyricsContainer:g('lyrics-container'),
      contextMenu:g('context-menu'),
      ctxEdit:g('ctx-edit'),ctxSplit:g('ctx-split'),ctxSplitCursor:g('ctx-split-cursor'),
      ctxMergePrev:g('ctx-merge-prev'),ctxMergeNext:g('ctx-merge-next'),
      ctxDuplicate:g('ctx-duplicate'),ctxAddLine:g('ctx-add-line'),ctxAddWord:g('ctx-add-word'),
      ctxBatchClose:g('ctx-batch-close'),ctxBatchDist:g('ctx-batch-dist'),ctxBatchNorm:g('ctx-batch-norm'),
      ctxMovePlayhead:g('ctx-move-playhead'),ctxZoomSelection:g('ctx-zoom-selection'),
      ctxScrollSelection:g('ctx-scroll-selection'),ctxSelTrack:g('ctx-sel-track'),ctxDelete:g('ctx-delete'),
      ctxDeleteTrack:g('ctx-delete-track'),
      restoreModal:g('restore-modal'),restoreModalDesc:g('restore-modal-desc'),
      btnRestoreYes:g('btn-restore-yes'),btnRestoreNo:g('btn-restore-no'),btnRestoreDelete:g('btn-restore-delete'),
      recentModal:g('recent-modal'),recentList:g('recent-list'),
      btnRecentClearAll:g('btn-recent-clear-all'),btnRecentClose:g('btn-recent-close'),
      hotkeysModal:g('hotkeys-modal'),hotkeysList:g('hotkeys-list'),
      hotkeysConflicts:g('hotkeys-conflicts'),hkSearch:g('hk-search'),
      btnHotkeysSave:g('btn-hotkeys-save'),btnHotkeysReset:g('btn-hotkeys-reset'),
      btnHotkeysClose:g('btn-hotkeys-close'),
      validationModal:g('validation-modal'),validationList:g('validation-list'),
      btnValidationClose:g('btn-validation-close'),btnValidationExport:g('btn-validation-export'),
      btnValidationFix:g('btn-validation-fix'),btnValidationRerun:g('btn-validation-rerun'),
      helpModal:g('help-modal'),helpList:g('help-list'),btnHelpClose:g('btn-help-close'),
      vkbdModal:g('vkbd-modal'),vkbdDisplay:g('vkbd-display'),vkbdHint:g('vkbd-hint'),
      btnVkbd:g('btn-vkbd'),btnVkbdClose:g('btn-vkbd-close'),
      renameModal:g('rename-modal'),renameInput:g('rename-input'),renameColor:g('rename-color'),
      btnRenameOk:g('btn-rename-ok'),btnRenameCancel:g('btn-rename-cancel'),
      loopModal:g('loop-modal'),loopInVal:g('loop-in-val'),loopOutVal:g('loop-out-val'),
      btnLoopOk:g('btn-loop-ok'),btnLoopCancel:g('btn-loop-cancel'),
      playbackRate:g('playback-rate'),
      exportPreviewModal:g('export-preview-modal'),exportPreviewText:g('export-preview-text'),
      btnExportPreviewCopy:g('btn-export-preview-copy'),
      btnExportPreviewDownload:g('btn-export-preview-download'),
      btnExportPreviewClose:g('btn-export-preview-close'),
      loader:g('loader'),audioPlayer:g('audio-player'),
      workspace:g('workspace'),workspaceMain:g('workspace-main'),
      timelineResizer:g('timeline-resizer'),
      sidebarCollapseBtn:g('sidebar-collapse-btn'),
      inspectorCollapseBtn:g('inspector-collapse-btn'),previewCollapseBtn:g('preview-collapse-btn'),
      inspectorBody:g('inspector-body'),previewBody:g('preview-body'),previewPanel:g('preview-panel'),
      toolbarCompactBtn:g('toolbar-compact-btn'),btnLayoutLock:g('btn-layout-lock'),toolbar:g('toolbar'),
    };
  },
};
