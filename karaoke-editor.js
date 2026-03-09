'use strict';
const App={
/* ─── state ─────────────────────────────────────────────────────── */
audioCtx:null,audioBuffer:null,audioElement:null,duration:0,audioFileName:'audio',
zoom:80,verticalZoom:1,snapStep:0,autoScroll:true,volume:1,muted:false,dirty:false,
autosaveEnabled:true,autosaveIntervalSec:10,autosaveTimer:null,
autosaveKey:'karaokeEditorDraftV4',uiStateKey:'karaokeEditorUiStateV4',keymapKey:'karaokeEditorKeymapV2',
project:{tracks:[],activeTrackId:null},
selected:{trackId:null,ids:new Set()},
history:[],historyIndex:-1,
drag:{active:false,type:null,trackId:null,itemId:null,startX:0,initial:{},sel:[],rollPair:null,rollAnchor:null},
marquee:{active:false,startX:0,startY:0},
resize:{active:false,target:null,startX:0,startY:0,startDim:0},
playheadDrag:{active:false},
context:{trackId:null,itemId:null},
loop:{enabled:false,start:null,end:null},
hotkeysWaiting:null,
keymap:{},
collapsed:{},   // trackId -> bool
trackColors:{}, // trackId -> hex color string
ui:{},

/* ─── boot ───────────────────────────────────────────────────────── */
init(){
  this.cache();
  this.audioElement=this.ui.audioPlayer;
  this.initKeymap();
  this.restoreUiPrefs();
  this.bind();
  this.applyVol();
  this.updateZoomReadout();
  this.updateVZoomReadout();
  this.updateVolumeReadout();
  this.updateSaveStatus('Saved',false);
  this.checkDraftOnLaunch();
  this.startAutosaveLoop();
  this.fullRender();
},

cache(){
  const g=id=>document.getElementById(id);
  this.ui={
    audioUpload:g('audio-upload'),lineUpload:g('line-upload'),wordsUpload:g('words-upload'),
    btnExportActive:g('btn-export-active'),btnExportLine:g('btn-export-line'),
    btnExportWords:g('btn-export-words'),btnExportAll:g('btn-export-all'),
    btnValidate:g('btn-validate'),btnRestoreSession:g('btn-restore-session'),
    btnHotkeys:g('btn-hotkeys'),btnHelp:g('btn-help'),
    btnPlay:g('btn-play'),btnStop:g('btn-stop'),btnCenterPlayhead:g('btn-center-playhead'),btnLoop:g('btn-loop'),
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
    playhead:g('playhead'),playheadHandle:g('playhead-handle'),selectionBox:g('selection-box'),
    sidebar:g('sidebar'),sidebarResizer:g('sidebar-resizer'),
    inspectorPanel:g('inspector'),inspectorContent:g('inspector-content'),
    previewResizer:g('preview-resizer'),lyricsContainer:g('lyrics-container'),
    contextMenu:g('context-menu'),
    ctxEdit:g('ctx-edit'),ctxSplit:g('ctx-split'),ctxSplitCursor:g('ctx-split-cursor'),
    ctxMergePrev:g('ctx-merge-prev'),ctxMergeNext:g('ctx-merge-next'),
    ctxDuplicate:g('ctx-duplicate'),ctxAddLine:g('ctx-add-line'),ctxAddWord:g('ctx-add-word'),
    ctxMovePlayhead:g('ctx-move-playhead'),ctxZoomSelection:g('ctx-zoom-selection'),
    ctxScrollSelection:g('ctx-scroll-selection'),ctxDelete:g('ctx-delete'),
    restoreModal:g('restore-modal'),btnRestoreYes:g('btn-restore-yes'),
    btnRestoreNo:g('btn-restore-no'),btnRestoreDelete:g('btn-restore-delete'),
    hotkeysModal:g('hotkeys-modal'),hotkeysList:g('hotkeys-list'),
    hotkeysConflicts:g('hotkeys-conflicts'),
    btnHotkeysSave:g('btn-hotkeys-save'),btnHotkeysReset:g('btn-hotkeys-reset'),
    btnHotkeysClose:g('btn-hotkeys-close'),
    validationModal:g('validation-modal'),validationList:g('validation-list'),
    btnValidationClose:g('btn-validation-close'),btnValidationExport:g('btn-validation-export'),
    helpModal:g('help-modal'),helpList:g('help-list'),btnHelpClose:g('btn-help-close'),
    renameModal:g('rename-modal'),renameInput:g('rename-input'),renameColor:g('rename-color'),
    btnRenameOk:g('btn-rename-ok'),btnRenameCancel:g('btn-rename-cancel'),
    loader:g('loader'),audioPlayer:g('audio-player')
  };
},

bind(){
  // File
  this.ui.audioUpload.onchange=e=>this.loadAudio(e.target.files[0]);
  this.ui.lineUpload.onchange=e=>this.loadTrackJSON(e.target.files[0],'line');
  this.ui.wordsUpload.onchange=e=>this.loadTrackJSON(e.target.files[0],'words');

  // Export
  this.ui.btnExportActive.onclick=()=>this.exportTrack(this.activeTrack());
  this.ui.btnExportLine.onclick=()=>this.exportTrack(this.trackByType('line'));
  this.ui.btnExportWords.onclick=()=>this.exportTrack(this.trackByType('words'));
  this.ui.btnExportAll.onclick=()=>this.exportAll();

  // Validate / Restore / Help / Hotkeys
  this.ui.btnValidate.onclick=()=>this.openValidationModal();
  this.ui.btnRestoreSession.onclick=()=>this.restoreDraftFromStorage(true);
  this.ui.btnHotkeys.onclick=()=>this.openHotkeysModal();
  this.ui.btnHelp.onclick=()=>this.openHelpModal();

  // Hotkeys modal
  this.ui.btnHotkeysClose.onclick=()=>this.closeHotkeysModal();
  this.ui.btnHotkeysSave.onclick=()=>this.saveKeymap();
  this.ui.btnHotkeysReset.onclick=()=>{this.keymap=this.defaultKeymap();this.renderHotkeysModal()};

  // Validation modal
  this.ui.btnValidationClose.onclick=()=>this.ui.validationModal.classList.add('hidden');
  this.ui.btnValidationExport.onclick=()=>{this.ui.validationModal.classList.add('hidden');this.exportTrack(this.activeTrack())};

  // Help modal
  this.ui.btnHelpClose.onclick=()=>this.ui.helpModal.classList.add('hidden');

  // Rename modal
  this.ui.btnRenameCancel.onclick=()=>this.ui.renameModal.classList.add('hidden');

  // Transport
  this.ui.btnPlay.onclick=()=>this.togglePlay();
  this.ui.btnStop.onclick=()=>{this.audioElement.pause();this.audioElement.currentTime=0;this.syncPlayhead()};
  this.ui.btnCenterPlayhead.onclick=()=>this.centerOnPlayhead();
  this.ui.btnLoop.onclick=()=>this.toggleLoopSelection();

  // Edit
  this.ui.btnUndo.onclick=()=>this.undo();
  this.ui.btnRedo.onclick=()=>this.redo();
  this.ui.btnSelectAll.onclick=()=>this.selectAll();
  this.ui.btnDeselect.onclick=()=>this.clearSelection();
  this.ui.btnSplit.onclick=()=>this.splitAtPlayhead();
  this.ui.btnMergePrev.onclick=()=>this.mergeSelectedWithPrev();
  this.ui.btnMerge.onclick=()=>this.mergeSelectedWithNext();
  this.ui.btnDuplicate.onclick=()=>this.duplicateSelected();
  this.ui.btnAddLine.onclick=()=>this.addNewLine();
  this.ui.btnAddWord.onclick=()=>this.addNewWord();
  this.ui.btnDelete.onclick=()=>this.deleteSelected();

  // Navigation
  this.ui.btnFitSong.onclick=()=>this.fitSong();
  this.ui.btnZoomSelection.onclick=()=>this.zoomToSelection();
  this.ui.btnScrollSelection.onclick=()=>this.scrollToSelection();
  this.ui.btnGotoSelection.onclick=()=>this.gotoSelectionStart();

  // Sliders
  this.ui.zoomSlider.oninput=e=>this.setZoom(+e.target.value,true);
  this.ui.vzoomSlider.oninput=e=>this.setVerticalZoom(+e.target.value/100);
  this.ui.snapSelect.onchange=e=>this.snapStep=+e.target.value;
  this.ui.autoScroll.onchange=e=>{this.autoScroll=e.target.checked;this.persistUiPrefs()};
  this.ui.autosaveEnabled.onchange=e=>{this.autosaveEnabled=e.target.checked;this.persistUiPrefs()};
  this.ui.autosaveInterval.onchange=e=>{this.autosaveIntervalSec=+e.target.value;this.persistUiPrefs();this.restartAutosaveLoop()};
  this.ui.volumeSlider.oninput=e=>this.setVolume(+e.target.value/100);
  this.ui.btnMute.onclick=()=>this.toggleMute();

  // Audio / Playhead
  this.audioElement.addEventListener('timeupdate',()=>{this.syncPlayhead();this.handleLoopTick()});
  this.audioElement.addEventListener('loadedmetadata',()=>{this.duration=this.audioElement.duration||this.duration||0;this.fullRender()});
  this.ui.scrollArea.addEventListener('mousedown',e=>this.handleTimelineMouseDown(e));
  this.ui.playheadHandle.addEventListener('mousedown',e=>this.startPlayheadDrag(e));
  document.addEventListener('mousemove',e=>this.handleGlobalMouseMove(e));
  document.addEventListener('mouseup',()=>this.handleGlobalMouseUp());

  // Resizers
  this.ui.sidebarResizer.addEventListener('mousedown',e=>this.startResize(e,'sidebar'));
  this.ui.previewResizer.addEventListener('mousedown',e=>this.startResize(e,'preview'));

  // Context menu
  this.ui.scrollArea.addEventListener('contextmenu',e=>this.showContextMenu(e));
  document.addEventListener('click',e=>{
    if(!e.target.closest('#context-menu'))this.ui.contextMenu.classList.add('hidden');
    if(e.target===this.ui.hotkeysModal)this.closeHotkeysModal();
    if(e.target===this.ui.validationModal)this.ui.validationModal.classList.add('hidden');
    if(e.target===this.ui.helpModal)this.ui.helpModal.classList.add('hidden');
    if(e.target===this.ui.renameModal)this.ui.renameModal.classList.add('hidden');
  });
  this.setupContext();

  // Keyboard
  document.addEventListener('keydown',e=>this.handleHotkeys(e));

  // Restore modal
  this.ui.btnRestoreYes.onclick=()=>{this.restoreDraftFromStorage(true);this.ui.restoreModal.classList.add('hidden')};
  this.ui.btnRestoreNo.onclick=()=>this.ui.restoreModal.classList.add('hidden');
  this.ui.btnRestoreDelete.onclick=()=>{localStorage.removeItem(this.autosaveKey);this.ui.restoreModal.classList.add('hidden')};

  // Dirty warning
  window.addEventListener('beforeunload',e=>{if(this.dirty){e.preventDefault();e.returnValue=''}});
},

/* ─── audio ──────────────────────────────────────────────────────── */
async loadAudio(file){
  if(!file)return;
  try{
    this.ui.loader.classList.remove('hidden');
    this.audioFileName=this.base(file.name);
    this.audioElement.src=URL.createObjectURL(file);
    this.audioElement.load();
    if(!this.audioCtx)this.audioCtx=new(window.AudioContext||window.webkitAudioContext)();
    const buf=await file.arrayBuffer();
    this.audioBuffer=await this.audioCtx.decodeAudioData(buf.slice(0));
    this.duration=this.audioBuffer.duration||0;
    this.fullRender();
  }catch(e){console.error(e);alert('Не удалось загрузить аудио')}
  finally{this.ui.loader.classList.add('hidden')}
},

/* ─── track loading ──────────────────────────────────────────────── */
async loadTrackJSON(file,forceType){
  if(!file)return;
  try{
    const txt=await file.text(),raw=JSON.parse(txt);
    const track=this.normalizeTrack(raw,forceType,this.base(file.name));
    const idx=this.project.tracks.findIndex(t=>t.type===track.type);
    if(idx>=0)this.project.tracks[idx]=track;else this.project.tracks.push(track);
    if(!this.project.activeTrackId||!this.activeTrack()||this.activeTrack().locked)
      this.project.activeTrackId=track.id;
    this.pushHistory('Load Track');this.markDirty(false);this.fullRender();
  }catch(e){console.error(e);alert('Невалидный JSON: '+e.message)}
},

normalizeTrack(raw,forceType,name){
  const t={id:'T_'+this.id(),type:forceType,name:name||forceType,visible:true,solo:false,locked:false,editable:true,items:[]};
  if(forceType==='line'){
    if(!Array.isArray(raw)||!raw.length||!('time'in raw[0]))throw Error('bad line json');
    raw.forEach((d,i)=>{
      const s=this.num(d.time,0),n=raw[i+1]?this.num(raw[i+1].time,s+2):s+2;
      t.items.push({id:'L_'+this.id(),kind:'line',start:s,end:Math.max(s+.15,n-.05),text:typeof d.line==='string'?d.line:''});
    });
  }else{
    if(!Array.isArray(raw)||!raw.length||!('start'in raw[0])||!('words'in raw[0]))throw Error('bad words json');
    raw.forEach(line=>{
      const lid='L_'+this.id(),ls=this.num(line.start,0),le=this.num(line.end,ls+.5);
      t.items.push({id:lid,kind:'line',start:ls,end:Math.max(ls+.05,le),text:typeof line.line==='string'?line.line:'',lineId:lid});
      (line.words||[]).forEach(w=>{
        const ws=this.num(w.start,ls),we=this.num(w.end,ws+.1);
        t.items.push({id:'W_'+this.id(),kind:'word',lineId:lid,start:ws,end:Math.max(ws+.03,we),text:typeof w.w==='string'?w.w:'',chars:Array.isArray(w.chars)?w.chars:[]});
      });
    });
    this.recalcTrackLines(t);
  }
  this.sortTrack(t);return t;
},

/* ─── render core ────────────────────────────────────────────────── */
fullRender(){
  this.applyVerticalZoom();
  this.drawWaveform();
  this.renderHeaders();
  this.renderTimeline();
  this.renderRuler();
  this.renderPreview();
  this.syncPlayhead();
  this.ui.modeIndicator.textContent=`TRACKS: ${this.project.tracks.length}`;
},

applyVerticalZoom(){
  const wh=Math.round(80*this.verticalZoom),row=Math.round(56*this.verticalZoom),lh=Math.round(34*this.verticalZoom);
  this.ui.waveCanvas.style.height=wh+'px';
  this.ui.tracksContainer.style.top=(wh+60)+'px';
  this.ui.tracksContainer.style.minHeight=((this.project.tracks.length||2)*row+220)+'px';
  document.documentElement.style.setProperty('--trkH',lh+'px');
  document.documentElement.style.setProperty('--trkGap',row+'px');
},

drawWaveform(){
  const c=this.ui.waveCanvas,x=c.getContext('2d'),
        w=Math.ceil(Math.max(1,(this.duration||1)*this.zoom)),
        h=Math.round(80*this.verticalZoom);
  c.width=w;c.height=h;x.clearRect(0,0,w,h);
  if(!this.audioBuffer){x.fillStyle='#3a3d46';x.fillRect(0,h/2-1,w,2);return}
  const d=this.audioBuffer.getChannelData(0),step=Math.max(1,Math.ceil(d.length/w)),amp=h/2;
  x.fillStyle='#5a7fa8';
  for(let i=0;i<w;i++){
    let mn=1,mx=-1,s=i*step,e2=Math.min(s+step,d.length);
    for(let j=s;j<e2;j++){const v=d[j];if(v<mn)mn=v;if(v>mx)mx=v}
    x.fillRect(i,(1+mn)*amp,1,Math.max(1,(mx-mn)*amp));
  }
},

renderRuler(){
  if(!this.duration){this.clearCanvas(this.ui.rulerCanvas);this.clearCanvas(this.ui.gridCanvas);return}
  const r=this.ui.rulerCanvas,g=this.ui.gridCanvas,rx=r.getContext('2d'),gx=g.getContext('2d'),
        w=Math.ceil(this.duration*this.zoom),
        gh=this.ui.tracksContainer.offsetTop+this.ui.tracksContainer.offsetHeight+200,
        step=this.rulerStep();
  r.width=w;r.height=30;g.width=w;g.height=gh;
  rx.clearRect(0,0,w,30);gx.clearRect(0,0,w,gh);
  rx.fillStyle='#b1b8c7';rx.font='10px Segoe UI';rx.textBaseline='top';
  gx.strokeStyle='rgba(255,255,255,.05)';
  for(let t=0;t<=this.duration+.0001;t+=step){
    const px=t*this.zoom,major=Math.abs((t/(step*2))-Math.round(t/(step*2)))<.001||step>=1,top=major?12:18;
    rx.fillRect(Math.round(px)+.5,top,1,30-top);
    if(major)rx.fillText(this.rulerTime(t),px+3,2);
    gx.beginPath();gx.moveTo(Math.round(px)+.5,0);gx.lineTo(Math.round(px)+.5,gh);gx.stroke();
  }
},

/* ─── track headers ──────────────────────────────────────────────── */
renderHeaders(){
  const box=this.ui.trackHeaders;box.innerHTML='';
  const top=this.ui.tracksContainer.offsetTop,row=Math.round(56*this.verticalZoom);
  this.project.tracks.forEach((t,i)=>{
    const color=this.trackColors[t.id]||(t.type==='line'?'#1e88e5':'#4caf50');
    const coll=!!this.collapsed[t.id];
    const d=document.createElement('div');
    d.className='track-head'+(this.project.activeTrackId===t.id?' active':'')+(coll?' collapsed':'');
    d.style.top=(top+i*row)+'px';

    d.innerHTML=`
      <span class="track-color-dot" style="background:${color}" title="Click to change color"></span>
      <span class="nm" title="Double-click to rename">${this.esc(t.name)}</span>
      <span class="tp">[${t.type.toUpperCase()}]</span>
      <button data-a="vis" class="${t.visible?'on':''}" title="Visible">V</button>
      <button data-a="solo" class="${t.solo?'sol':''}" title="Solo">S</button>
      <button data-a="lock" class="${t.locked?'locked':''}" title="Lock">L</button>
      <button data-a="act" class="${this.project.activeTrackId===t.id?'on':''}" title="Edit target">E</button>
      <button data-a="coll" class="col-btn" title="${coll?'Expand':'Collapse'}">${coll?'▸':'▾'}</button>`;

    // rename on double-click of name
    d.querySelector('.nm').ondblclick=e=>{e.stopPropagation();this.openRenameModal(t.id)};
    // color dot click
    d.querySelector('.track-color-dot').onclick=e=>{e.stopPropagation();this.openRenameModal(t.id)};
    // button actions
    d.querySelectorAll('button[data-a]').forEach(b=>b.onclick=e=>{e.stopPropagation();this.trackAction(t.id,b.dataset.a)});
    // header click = set active
    d.onclick=()=>this.setActiveTrack(t.id);
    box.appendChild(d);
  });
},

openRenameModal(trackId){
  const t=this.track(trackId);if(!t)return;
  const color=this.trackColors[trackId]||(t.type==='line'?'#1e88e5':'#4caf50');
  this.ui.renameInput.value=t.name;
  this.ui.renameColor.value=color;
  this.ui.renameModal.classList.remove('hidden');
  this.ui.btnRenameOk.onclick=()=>{
    t.name=this.ui.renameInput.value.trim()||t.name;
    this.trackColors[trackId]=this.ui.renameColor.value;
    this.ui.renameModal.classList.add('hidden');
    this.markDirty(true);this.renderHeaders();
  };
},

trackAction(id,a){
  const t=this.track(id);if(!t)return;
  if(a==='vis')t.visible=!t.visible;
  else if(a==='solo')t.solo=!t.solo;
  else if(a==='lock'){
    t.locked=!t.locked;
    if(t.locked&&this.project.activeTrackId===t.id){
      const n=this.project.tracks.find(x=>!x.locked&&x.visible);
      if(n)this.project.activeTrackId=n.id;
    }
  }else if(a==='act'&&!t.locked){
    this.project.activeTrackId=t.id;
  }else if(a==='coll'){
    this.collapsed[id]=!this.collapsed[id];
  }
  this.markDirty(true);this.fullRender();
},

setActiveTrack(id){
  const t=this.track(id);
  if(t&&!t.locked){this.project.activeTrackId=id;this.clearSelection(false);this.fullRender();this.updateInspector()}
},

visibleTracks(){
  const solo=this.project.tracks.filter(t=>t.solo&&t.visible);
  const out=solo.length?solo:this.project.tracks.filter(t=>t.visible);
  return out;
},

/* ─── timeline render ────────────────────────────────────────────── */
renderTimeline(){
  const c=this.ui.tracksContainer;c.innerHTML='';
  const tracks=this.visibleTracks(),row=Math.round(56*this.verticalZoom),
        lh=Math.round(34*this.verticalZoom),wh=Math.round(28*this.verticalZoom);
  const layerMode=this.ui.layerMode.value;
  const conflicts=this.findConflicts();

  tracks.forEach((t,ti)=>{
    if(this.collapsed[t.id])return;
    const base=ti*row;
    const color=this.trackColors[t.id]||(t.type==='line'?'#1e88e5':'#4caf50');
    const isActive=this.project.activeTrackId===t.id&&!t.locked;

    t.items.forEach(it=>{
      // layer mode filter
      if(t.type==='words'){
        if(layerMode==='line'&&it.kind==='word')return;
        if(layerMode==='word'&&it.kind==='line')return;
        if(layerMode==='char')return; // chars handled separately
      }

      const d=document.createElement('div');
      const isWord=it.kind==='word';
      d.className=`track-item item-${isWord?'word':'line'}`;
      if(this.selected.trackId===t.id&&this.selected.ids.has(it.id))d.classList.add('selected');
      if(!isActive)d.classList.add('ghost');
      if(conflicts.has(it.id))d.classList.add('conflict');
      d.id=`DOM_${t.id}_${it.id}`;
      d.dataset.tid=t.id;d.dataset.id=it.id;d.dataset.kind=it.kind;
      d.textContent=it.text;

      // custom track color tint
      if(t.type==='line'){
        d.style.borderColor=color;
        d.style.background=this.hexToRgba(color,.35);
      }else if(isWord){
        d.style.borderColor=color;
        d.style.background=this.hexToRgba(color,.35);
      }

      d.style.left=it.start*this.zoom+'px';
      d.style.width=Math.max(4,(it.end-it.start)*this.zoom)+'px';
      d.style.top=(base+(isWord?lh+8:0))+'px';
      d.style.height=(isWord?wh:lh)+'px';

      const l=document.createElement('div'),r=document.createElement('div');
      l.className='handle left';l.dataset.handle='start';
      r.className='handle right';r.dataset.handle='end';
      if(isActive){d.appendChild(l);d.appendChild(r)}

      d.addEventListener('mousedown',e=>this.onItemMouseDown(e,t.id,it.id));
      l.addEventListener('mousedown',e=>this.onHandleMouseDown(e,t.id,it.id,'start'));
      r.addEventListener('mousedown',e=>this.onHandleMouseDown(e,t.id,it.id,'end'));
      c.appendChild(d);
    });
  });

  this.updateTimelineWidth();
},

findConflicts(){
  const set=new Set();
  this.project.tracks.forEach(t=>{
    const items=[...t.items].sort((a,b)=>a.start-b.start);
    for(let i=1;i<items.length;i++){
      if(items[i].start<items[i-1].end-0.001){set.add(items[i].id);set.add(items[i-1].id)}
    }
  });
  return set;
},

updateTimelineWidth(){
  const w=Math.ceil((this.duration||1)*this.zoom+300);
  [this.ui.rulerCanvas,this.ui.gridCanvas,this.ui.waveCanvas].forEach(c=>{if(c.width<w)c.style.width=w+'px'});
  this.ui.tracksContainer.style.minWidth=w+'px';
  this.ui.scrollArea.style.minWidth=w+'px';
},

/* ─── playhead ───────────────────────────────────────────────────── */
syncPlayhead(){
  const t=this.audioElement.currentTime||0,px=t*this.zoom;
  this.ui.playhead.style.left=px+'px';
  const dur=this.duration||0,fmt=v=>this.rulerTime(v,true);
  this.ui.timeDisplay.textContent=`${fmt(t)} / ${fmt(dur)}`;
  this.markPlayingItems(t);
  if(this.autoScroll&&!this.audioElement.paused&&!this.drag.active&&!this.playheadDrag.active)
    this.autoScrollToTime(t);
  this.renderPreview();
},

startPlayheadDrag(e){
  e.stopPropagation();e.preventDefault();
  this.playheadDrag.active=true;
  this.audioElement.pause();
  document.body.style.cursor='ew-resize';
},

handlePlayheadDragMove(e){
  if(!this.playheadDrag.active)return;
  const rect=this.ui.scrollArea.getBoundingClientRect();
  const scrollLeft=this.ui.timelineContainer.scrollLeft;
  const x=e.clientX-rect.left+scrollLeft;
  const t=Math.max(0,Math.min(this.duration||0,x/this.zoom));
  this.audioElement.currentTime=this.snap(t);
  this.syncPlayhead();
},

stopPlayheadDrag(){
  if(!this.playheadDrag.active)return;
  this.playheadDrag.active=false;
  document.body.style.cursor='';
},

/* ─── zoom ───────────────────────────────────────────────────────── */
setZoom(val,focusPlayhead=true){
  const oldZoom=this.zoom,newZoom=Math.max(10,Math.min(320,val)),t=this.audioElement.currentTime||0;
  this.zoom=newZoom;
  this.ui.zoomSlider.value=newZoom;
  this.updateZoomReadout();
  if(focusPlayhead){
    const visW=this.ui.timelineContainer.clientWidth;
    this.ui.timelineContainer.scrollLeft=Math.max(0,t*newZoom-visW/2);
  }
  this.fullRender();
},

setVerticalZoom(val){
  this.verticalZoom=Math.max(.7,Math.min(2.2,val));
  this.ui.vzoomSlider.value=Math.round(this.verticalZoom*100);
  this.updateVZoomReadout();
  this.fullRender();
},

fitSong(){
  if(!this.duration)return;
  const w=this.ui.timelineContainer.clientWidth-20;
  this.setZoom(Math.max(10,Math.floor(w/this.duration)),false);
  this.ui.timelineContainer.scrollLeft=0;
},

zoomToSelection(){
  const items=this.selectedItems();if(!items.length)return;
  const mn=Math.min(...items.map(i=>i.start)),mx=Math.max(...items.map(i=>i.end));
  const span=mx-mn;if(span<=0)return;
  const w=this.ui.timelineContainer.clientWidth-40;
  this.zoom=Math.max(10,Math.min(320,Math.floor(w/span)));
  this.ui.zoomSlider.value=this.zoom;this.updateZoomReadout();
  this.ui.timelineContainer.scrollLeft=Math.max(0,mn*this.zoom-20);
  this.fullRender();
},

scrollToSelection(){
  const items=this.selectedItems();if(!items.length)return;
  const mn=Math.min(...items.map(i=>i.start));
  const px=mn*this.zoom,vw=this.ui.timelineContainer.clientWidth;
  this.ui.timelineContainer.scrollLeft=Math.max(0,px-vw/4);
},

gotoSelectionStart(){
  const items=this.selectedItems();if(!items.length)return;
  const t=Math.min(...items.map(i=>i.start));
  this.audioElement.currentTime=t;this.syncPlayhead();
},

centerOnPlayhead(){
  const t=this.audioElement.currentTime||0,vw=this.ui.timelineContainer.clientWidth;
  this.ui.timelineContainer.scrollLeft=Math.max(0,t*this.zoom-vw/2);
},

autoScrollToTime(t){
  const px=t*this.zoom,sl=this.ui.timelineContainer.scrollLeft,vw=this.ui.timelineContainer.clientWidth;
  if(px<sl||px>sl+vw*.85)this.ui.timelineContainer.scrollLeft=Math.max(0,px-vw/3);
},

updateZoomReadout(){this.ui.zoomReadout.textContent=this.zoom+' px/s'},
updateVZoomReadout(){this.ui.vzoomReadout.textContent=Math.round(this.verticalZoom*100)+'%'},
updateVolumeReadout(){this.ui.volumeReadout.textContent=Math.round(this.volume*100)+'%'},

/* ─── volume ─────────────────────────────────────────────────────── */
setVolume(v){
  this.volume=Math.max(0,Math.min(1,v));
  this.ui.volumeSlider.value=Math.round(this.volume*100);
  this.updateVolumeReadout();this.applyVol();
},

toggleMute(){
  this.muted=!this.muted;
  this.ui.btnMute.textContent=this.muted?'🔇':'🔊';
  this.applyVol();
},

applyVol(){this.audioElement.volume=this.muted?0:this.volume},

/* ─── play / loop ────────────────────────────────────────────────── */
togglePlay(){
  if(!this.audioElement.src||this.audioElement.src==='about:blank'){alert('Загрузите аудио');return}
  if(this.audioElement.paused){
    if(!this.audioCtx)this.audioCtx=new(window.AudioContext||window.webkitAudioContext)();
    if(this.audioCtx.state==='suspended')this.audioCtx.resume();
    this.audioElement.play().catch(console.error);
    this.ui.btnPlay.textContent='⏸ Pause';
  }else{
    this.audioElement.pause();this.ui.btnPlay.textContent='▶ Play';
  }
},

toggleLoopSelection(){
  this.loop.enabled=!this.loop.enabled;
  this.ui.btnLoop.classList.toggle('pri',this.loop.enabled);
  if(this.loop.enabled){
    const items=this.selectedItems();
    if(items.length){this.loop.start=Math.min(...items.map(i=>i.start));this.loop.end=Math.max(...items.map(i=>i.end))}
    else{this.loop.start=0;this.loop.end=this.duration}
  }
},

handleLoopTick(){
  if(!this.loop.enabled||this.loop.start===null)return;
  if(this.audioElement.currentTime>=this.loop.end)this.audioElement.currentTime=this.loop.start;
},

/* ─── mouse on timeline ──────────────────────────────────────────── */
handleTimelineMouseDown(e){
  if(e.target.closest('#track-headers'))return;
  if(e.target.closest('.handle')||e.target.closest('.track-item')||e.target===this.ui.playheadHandle)return;
  if(e.button===2)return;

  if(e.target===this.ui.rulerCanvas||e.target===this.ui.scrollArea||e.target===this.ui.tracksContainer||e.target===this.ui.gridCanvas||e.target===this.ui.waveCanvas){
    const rect=this.ui.scrollArea.getBoundingClientRect();
    const sl=this.ui.timelineContainer.scrollLeft;
    const x=e.clientX-rect.left+sl;
    const t=this.snap(Math.max(0,x/this.zoom));
    if(e.target===this.ui.rulerCanvas){this.audioElement.currentTime=t;this.syncPlayhead();return}
    // begin marquee
    this.marquee={active:true,startX:e.clientX,startY:e.clientY};
    this.ui.selectionBox.style.left=(x-sl)+'px';
    this.ui.selectionBox.style.top=e.clientY-this.ui.scrollArea.getBoundingClientRect().top+'px';
    this.ui.selectionBox.style.width='0px';this.ui.selectionBox.style.height='0px';
    this.ui.selectionBox.classList.remove('hidden');
    if(!e.shiftKey)this.clearSelection(false);
  }
},

onItemMouseDown(e,trackId,itemId){
  if(e.button===2)return;e.stopPropagation();e.preventDefault();
  const t=this.track(trackId);if(!t||t.locked)return;
  if(this.project.activeTrackId!==trackId)return;

  const multi=e.shiftKey||e.ctrlKey||e.metaKey;
  if(!this.selected.ids.has(itemId)||!multi){
    if(!multi)this.clearSelection(false);
    this.select(trackId,itemId,multi);
  }
  const sel=this.selectedItems();
  this.drag={
    active:true,type:'body',trackId,itemId,
    startX:e.clientX,
    initial:Object.fromEntries(sel.map(it=>[it.id,{start:it.start,end:it.end}])),
    sel:[...this.selected.ids],
    rollPair:null,rollAnchor:null
  };
  document.body.style.cursor='grabbing';
  this.updateInspector();
},

onHandleMouseDown(e,trackId,itemId,side){
  if(e.button===2)return;e.stopPropagation();e.preventDefault();
  const t=this.track(trackId);if(!t||t.locked||this.project.activeTrackId!==trackId)return;
  if(!this.selected.ids.has(itemId))this.select(trackId,itemId,false);

  const it=this.item(trackId,itemId),mode=this.ui.dragMode.value;
  let rollPair=null,rollAnchor=null;
  if(mode==='roll'){
    const sib=this.rollSibling(trackId,itemId,side);
    if(sib){rollPair=sib.id;rollAnchor=side==='end'?it.end:it.start}
  }
  this.drag={
    active:true,type:side==='start'?'trim-start':'trim-end',
    trackId,itemId,startX:e.clientX,
    initial:{[itemId]:{start:it.start,end:it.end},
             ...(rollPair?{[rollPair]:this.item(trackId,rollPair)}:{})},
    sel:[itemId],rollPair,rollAnchor
  };
  document.body.style.cursor='ew-resize';
},

handleGlobalMouseMove(e){
  if(this.playheadDrag.active){this.handlePlayheadDragMove(e);return}
  if(this.marquee.active){this.updateMarquee(e);return}
  if(this.resize.active){this.handleResizeMove(e);return}
  if(!this.drag.active)return;

  const dx=(e.clientX-this.drag.startX)/this.zoom,mode=this.ui.dragMode.value;

  if(this.drag.type==='body'){
    this.drag.sel.forEach(id=>{
      const it=this.item(this.drag.trackId,id);if(!it)return;
      const ini=this.drag.initial[id],dur=ini.end-ini.start;
      let ns=this.snap(ini.start+dx),ne=ns+dur;
      ns=Math.max(0,ns);ne=Math.max(ne,ns+.03);
      it.start=ns;it.end=ne;
    });
    if(mode!=='free')this.resolveNoOverlap(this.drag.trackId,new Set(this.drag.sel),mode);
  }else{
    const it=this.item(this.drag.trackId,this.drag.itemId);if(!it)return;
    const ini=this.drag.initial[this.drag.itemId];
    if(this.drag.type==='trim-start'){
      it.start=Math.max(0,Math.min(ini.end-0.03,this.snap(ini.start+dx)));
      if(mode==='roll'&&this.drag.rollPair){
        const p=this.item(this.drag.trackId,this.drag.rollPair);
        if(p)p.end=it.start;
      }else if(mode!=='free')this.resolveSingleOverlap(this.drag.trackId,this.drag.itemId,'start',mode);
    }else{
      it.end=Math.max(ini.start+0.03,this.snap(ini.end+dx));
      if(mode==='roll'&&this.drag.rollPair){
        const p=this.item(this.drag.trackId,this.drag.rollPair);
        if(p)p.start=it.end;
      }else if(mode!=='free')this.resolveSingleOverlap(this.drag.trackId,this.drag.itemId,'end',mode);
    }
    if(this.track(this.drag.trackId)?.type==='words')this.recalcTrackLines(this.track(this.drag.trackId));
  }
  this.renderTimeline();this.updateInspector();this.markDirty(true);
},

handleGlobalMouseUp(){
  if(this.playheadDrag.active){this.stopPlayheadDrag();return}
  if(this.marquee.active){this.finalizeMarquee();return}
  if(this.resize.active){this.stopResize();return}
  if(!this.drag.active)return;
  this.sortTrack(this.track(this.drag.trackId));
  this.pushHistory('Drag');
  this.drag.active=false;document.body.style.cursor='';
  this.renderTimeline();this.updateInspector();
},

updateMarquee(e){
  const rect=this.ui.scrollArea.getBoundingClientRect();
  const sl=this.ui.timelineContainer.scrollLeft;
  const x=Math.min(Math.max(e.clientX,rect.left),rect.right)-rect.left;
  const y=Math.min(Math.max(e.clientY,rect.top),rect.bottom)-rect.top;
  const sx=this.marquee.startX-rect.left,sy=this.marquee.startY-rect.top;
  const l=Math.min(x,sx),t2=Math.min(y,sy),w=Math.abs(x-sx),h=Math.abs(y-sy);
  this.ui.selectionBox.style.left=l+'px';this.ui.selectionBox.style.top=t2+'px';
  this.ui.selectionBox.style.width=w+'px';this.ui.selectionBox.style.height=h+'px';
},

finalizeMarquee(){
  this.marquee.active=false;
  this.ui.selectionBox.classList.add('hidden');
  const box=this.ui.selectionBox.getBoundingClientRect();
  const sl=this.ui.timelineContainer.scrollLeft;
  const at=this.activeTrack();if(!at)return;
  const tl=(box.left+sl)/this.zoom,tr=(box.right+sl)/this.zoom;
  at.items.forEach(it=>{
    if(it.start<tr&&it.end>tl)this.selected.ids.add(it.id);
  });
  this.selected.trackId=at.id;
  this.renderTimeline();this.updateInspector();
},

/* ─── selection ──────────────────────────────────────────────────── */
select(trackId,itemId,add=false){
  if(!add||(this.selected.trackId&&this.selected.trackId!==trackId)){
    this.selected.ids.clear();this.selected.trackId=trackId;
  }
  this.selected.ids.add(itemId);
  this.renderTimeline();this.updateInspector();
},

clearSelection(render=true){
  this.selected.ids.clear();this.selected.trackId=null;
  if(render){this.renderTimeline();this.updateInspector()}
},

selectAll(){
  const at=this.activeTrack();if(!at)return;
  this.selected.trackId=at.id;at.items.forEach(it=>this.selected.ids.add(it.id));
  this.renderTimeline();this.updateInspector();
},

selectedItems(){
  const t=this.track(this.selected.trackId);if(!t)return[];
  return t.items.filter(it=>this.selected.ids.has(it.id));
},

/* ─── no-overlap resolver ────────────────────────────────────────── */
resolveNoOverlap(trackId,movedIds,mode){
  const t=this.track(trackId);if(!t)return;
  this.sortTrack(t);
  const items=t.items.filter(it=>it.kind!=='word'||t.type==='words');// all items same level
  // separate by kind for words-track
  const resolveGroup=(list)=>{
    for(let i=1;i<list.length;i++){
      const prev=list[i-1],cur=list[i];
      if(cur.start<prev.end-0.001){
        if(movedIds.has(cur.id)&&!movedIds.has(prev.id)){
          // cur moved into prev — push back
          if(mode==='ripple'){
            const shift=prev.end-cur.start;
            for(let j=i;j<list.length;j++){list[j].start+=shift;list[j].end+=shift}
          }else{cur.start=prev.end}
        }else if(!movedIds.has(cur.id)&&movedIds.has(prev.id)){
          // prev extended into cur — trim cur or push
          if(mode==='ripple'){
            const shift=prev.end-cur.start;
            for(let j=i;j<list.length;j++){list[j].start+=shift;list[j].end+=shift}
          }else{cur.start=Math.min(cur.end-0.03,prev.end)}
        }else{
          cur.start=prev.end;
        }
      }
    }
  };
  if(t.type==='words'){
    const lines=items.filter(it=>it.kind==='line'),words=items.filter(it=>it.kind==='word');
    resolveGroup(lines);resolveGroup(words);
  }else{resolveGroup(items)}
},

resolveSingleOverlap(trackId,itemId,side,mode){
  const t=this.track(trackId);if(!t)return;
  this.sortTrack(t);
  const it=this.item(trackId,itemId);if(!it)return;
  const sameKind=t.items.filter(x=>x.kind===it.kind&&x.id!==itemId).sort((a,b)=>a.start-b.start);
  const idx=sameKind.findIndex(x=>x.start>it.start);
  if(side==='end'&&idx>=0){
    const nxt=sameKind[idx];
    if(it.end>nxt.start){
      if(mode==='ripple'){
        const sh=it.end-nxt.start;
        sameKind.slice(idx).forEach(x=>{x.start+=sh;x.end+=sh});
      }else{it.end=nxt.start}
    }
  }else if(side==='start'&&idx-1>=0){
    const prv=sameKind[idx-1>=-1?sameKind.length-1:idx-1];
    if(prv&&it.start<prv.end){
      if(mode==='ripple'){
        const sh=prv.end-it.start;it.start+=sh;it.end+=sh;
      }else{it.start=prv.end}
    }
  }
},

rollSibling(trackId,itemId,side){
  const t=this.track(trackId);if(!t)return null;
  const it=this.item(trackId,itemId);
  const sameKind=t.items.filter(x=>x.kind===it.kind).sort((a,b)=>a.start-b.start);
  const idx=sameKind.findIndex(x=>x.id===itemId);
  if(side==='end'&&idx<sameKind.length-1)return sameKind[idx+1];
  if(side==='start'&&idx>0)return sameKind[idx-1];
  return null;
},

/* ─── editing ops ────────────────────────────────────────────────── */
splitAtPlayhead(){
  const t=this.activeTrack();if(!t)return;
  const time=this.audioElement.currentTime,sel=this.selectedItems();
  const targets=sel.length?sel.filter(it=>it.start<time&&it.end>time):t.items.filter(it=>it.start<time&&it.end>time);
  if(!targets.length){alert('Нет элементов под playhead');return}
  targets.forEach(it=>{
    const left={...it,id:'L_'+this.id(),end:time};
    const right={...it,id:'R_'+this.id(),start:time,chars:[]};
    const idx=t.items.indexOf(it);t.items.splice(idx,1,left,right);
    if(it.kind==='word')this.recalcTrackLines(t);
  });
  this.sortTrack(t);this.pushHistory('Split');this.markDirty(true);this.fullRender();this.updateInspector();
},

splitAtCursor(trackId,itemId,cursorX){
  const t=this.track(trackId);if(!t)return;
  const it=this.item(trackId,itemId);if(!it)return;
  const sl=this.ui.timelineContainer.scrollLeft,rect=this.ui.scrollArea.getBoundingClientRect();
  const px=cursorX-rect.left+sl,time=this.snap(px/this.zoom);
  if(time<=it.start||time>=it.end)return;
  const left={...it,id:'L_'+this.id(),end:time};
  const right={...it,id:'R_'+this.id(),start:time,chars:[]};
  const idx=t.items.indexOf(it);t.items.splice(idx,1,left,right);
  if(t.type==='words')this.recalcTrackLines(t);
  this.sortTrack(t);this.pushHistory('SplitCursor');this.markDirty(true);this.fullRender();
},

mergeSelectedWithNext(){
  const items=this.selectedItems().sort((a,b)=>a.start-b.start);
  if(!items.length)return;
  this.mergeItemWithSibling(this.selected.trackId,items[items.length-1].id,'next');
},

mergeSelectedWithPrev(){
  const items=this.selectedItems().sort((a,b)=>a.start-b.start);
  if(!items.length)return;
  this.mergeItemWithSibling(this.selected.trackId,items[0].id,'prev');
},

mergeItemWithSibling(trackId,itemId,dir){
  const t=this.track(trackId);if(!t)return;
  const it=this.item(trackId,itemId);if(!it)return;
  const sameKind=t.items.filter(x=>x.kind===it.kind).sort((a,b)=>a.start-b.start);
  const idx=sameKind.findIndex(x=>x.id===itemId);
  const sib=dir==='next'?sameKind[idx+1]:sameKind[idx-1];
  if(!sib){alert('Нет соседнего элемента');return}
  const merged={
    ...it,
    id:'M_'+this.id(),
    start:Math.min(it.start,sib.start),
    end:Math.max(it.end,sib.end),
    text:dir==='next'?it.text+' '+sib.text:sib.text+' '+it.text,
    chars:[...((dir==='next'?it.chars||[]:sib.chars||[])),
           ...((dir==='next'?sib.chars||[]:it.chars||[]))]
  };
  t.items=t.items.filter(x=>x.id!==it.id&&x.id!==sib.id);t.items.push(merged);
  if(t.type==='words')this.recalcTrackLines(t);
  this.sortTrack(t);this.clearSelection(false);this.selected.trackId=trackId;this.selected.ids.add(merged.id);
  this.pushHistory('Merge');this.markDirty(true);this.fullRender();this.updateInspector();
},

duplicateSelected(){
  const t=this.activeTrack();if(!t)return;
  const items=this.selectedItems().sort((a,b)=>a.start-b.start);if(!items.length)return;
  const gap=0.05,newIds=new Set();
  items.forEach(it=>{
    const dur=it.end-it.start,ns=it.end+gap;
    const copy={...it,id:'D_'+this.id(),start:ns,end:ns+dur,chars:[...(it.chars||[])]};
    t.items.push(copy);newIds.add(copy.id);
  });
  if(t.type==='words')this.recalcTrackLines(t);
  this.sortTrack(t);this.selected.ids=newIds;
  this.pushHistory('Duplicate');this.markDirty(true);this.fullRender();this.updateInspector();
},

addNewLine(){
  const t=this.activeTrack();if(!t)return;
  const time=this.audioElement.currentTime||0;
  const it={id:'NL_'+this.id(),kind:'line',start:time,end:time+2,text:'New Line'};
  t.items.push(it);
  if(t.type==='words')it.lineId=it.id;
  this.sortTrack(t);this.clearSelection(false);this.selected.trackId=t.id;this.selected.ids.add(it.id);
  this.pushHistory('AddLine');this.markDirty(true);this.fullRender();this.updateInspector();
},

addNewWord(){
  const t=this.activeTrack();if(!t||t.type==='line')return;
  const items=this.selectedItems().filter(i=>i.kind==='line');
  if(!items.length&&t.type==='words'){
    const lines=t.items.filter(i=>i.kind==='line').sort((a,b)=>a.start-b.start);
    if(!lines.length){alert('Сначала добавьте строку');return}
    const time=this.audioElement.currentTime||0;
    const line=lines.find(l=>l.start<=time&&l.end>=time)||lines[lines.length-1];
    const word={id:'NW_'+this.id(),kind:'word',lineId:line.id,start:line.start,end:line.start+.5,text:'word',chars:[]};
    t.items.push(word);this.sortTrack(t);this.recalcTrackLines(t);
    this.clearSelection(false);this.selected.trackId=t.id;this.selected.ids.add(word.id);
    this.pushHistory('AddWord');this.markDirty(true);this.fullRender();this.updateInspector();
    return;
  }
  if(!items.length){alert('Выберите строку на words-дорожке');return}
  const line=items[0];
  const word={id:'NW_'+this.id(),kind:'word',lineId:line.id,start:line.start,end:Math.min(line.start+.5,line.end),text:'word',chars:[]};
  t.items.push(word);this.sortTrack(t);this.recalcTrackLines(t);
  this.clearSelection(false);this.selected.trackId=t.id;this.selected.ids.add(word.id);
  this.pushHistory('AddWord');this.markDirty(true);this.fullRender();this.updateInspector();
},

deleteSelected(){
  const t=this.activeTrack();if(!t||!this.selected.ids.size)return;
  const ids=this.selected.ids;
  t.items=t.items.filter(it=>!ids.has(it.id));
  if(t.type==='words')this.recalcTrackLines(t);
  this.clearSelection(false);this.pushHistory('Delete');this.markDirty(true);this.fullRender();this.updateInspector();
},

/* ─── words rebuild ──────────────────────────────────────────────── */
recalcTrackLines(t){
  if(t.type!=='words')return;
  const lines=t.items.filter(i=>i.kind==='line').sort((a,b)=>a.start-b.start);
  lines.forEach(l=>{
    const words=t.items.filter(i=>i.kind==='word'&&i.lineId===l.id).sort((a,b)=>a.start-b.start);
    if(words.length){
      l.start=Math.min(l.start,words[0].start);
      l.end=Math.max(l.end,words[words.length-1].end);
      l.text=words.map(w=>w.text).join(' ');
    }
  });
},

rebuildParentLine(t,wordId){
  if(!t)return;
  const w=this.item(t.id,wordId);if(!w)return;
  const line=t.items.find(l=>l.id===w.lineId);if(!line)return;
  const words=t.items.filter(i=>i.kind==='word'&&i.lineId===line.id).sort((a,b)=>a.start-b.start);
  if(words.length){line.start=words[0].start;line.end=words[words.length-1].end;line.text=words.map(w=>w.text).join(' ')}
},

/* ─── batch ops ──────────────────────────────────────────────────── */
batchMoveSelected(deltaSec){
  const t=this.activeTrack();if(!t)return;
  const ids=this.selected.ids,mode=this.ui.dragMode.value;
  const moved=new Set(ids);
  t.items.filter(it=>ids.has(it.id)).forEach(it=>{
    it.start=Math.max(0,it.start+deltaSec);
    it.end=Math.max(it.start+.03,it.end+deltaSec);
  });
  if(mode!=='free')this.resolveNoOverlap(t.id,moved,mode);
  if(t.type==='words')this.recalcTrackLines(t);
  this.sortTrack(t);this.pushHistory('BatchMove');this.markDirty(true);this.fullRender();this.updateInspector();
},

batchSetGap(gapSec){
  const t=this.activeTrack();if(!t)return;
  const items=[...this.selectedItems()].sort((a,b)=>a.start-b.start);if(items.length<2)return;
  let cursor=items[0].end;
  for(let i=1;i<items.length;i++){
    const dur=items[i].end-items[i].start;items[i].start=cursor+gapSec;items[i].end=items[i].start+dur;cursor=items[i].end;
  }
  if(t.type==='words')this.recalcTrackLines(t);
  this.sortTrack(t);this.pushHistory('BatchGap');this.markDirty(true);this.fullRender();this.updateInspector();
},

batchNormalize(durSec){
  const t=this.activeTrack();if(!t)return;
  this.selectedItems().forEach(it=>{it.end=it.start+durSec});
  if(t.type==='words')this.recalcTrackLines(t);
  this.sortTrack(t);this.pushHistory('Normalize');this.markDirty(true);this.fullRender();this.updateInspector();
},

batchCloseGaps(){
  const t=this.activeTrack();if(!t)return;
  const items=[...this.selectedItems()].sort((a,b)=>a.start-b.start);if(items.length<2)return;
  for(let i=1;i<items.length;i++){const dur=items[i].end-items[i].start;items[i].start=items[i-1].end;items[i].end=items[i].start+dur}
  if(t.type==='words')this.recalcTrackLines(t);
  this.sortTrack(t);this.pushHistory('CloseGaps');this.markDirty(true);this.fullRender();this.updateInspector();
},

batchDistributeEvenly(){
  const t=this.activeTrack();if(!t)return;
  const items=[...this.selectedItems()].sort((a,b)=>a.start-b.start);if(items.length<3)return;
  const totalDur=items.reduce((s,i)=>s+(i.end-i.start),0);
  const span=items[items.length-1].end-items[0].start,gap=(span-totalDur)/(items.length-1);
  let cursor=items[0].start;
  items.forEach(it=>{const dur=it.end-it.start;it.start=cursor;it.end=cursor+dur;cursor+=dur+gap});
  if(t.type==='words')this.recalcTrackLines(t);
  this.sortTrack(t);this.pushHistory('Distribute');this.markDirty(true);this.fullRender();this.updateInspector();
},

/* ─── inspector ──────────────────────────────────────────────────── */
updateInspector(){
  const el=this.ui.inspectorContent,items=this.selectedItems(),at=this.activeTrack();
  if(!items.length){el.innerHTML='<p class="muted">Select element(s)</p>';return}

  if(items.length>1){this.renderBatchInspector(el,items);return}
  const it=items[0],t=at||this.track(this.selected.trackId);

  const charsHtml=this.renderCharsInspector(it);
  el.innerHTML=`
    <div class="igr"><label>Text</label><input id="inp-text" type="text" value="${this.esc(it.text)}" style="width:100%"></div>
    <div class="irow">
      <div class="igr"><label>Start (s)</label><input id="inp-start" type="number" step="0.01" value="${it.start.toFixed(3)}"></div>
      <div class="igr"><label>End (s)</label><input id="inp-end" type="number" step="0.01" value="${it.end.toFixed(3)}"></div>
    </div>
    <div class="igr"><label>Duration</label><span>${(it.end-it.start).toFixed(3)}s</span></div>
    <div class="igr"><label>Kind</label><span>${it.kind}${t?` [${t.type}]`:''}</span></div>
    ${charsHtml}
    <div class="iact">
      <button class="btn" id="ins-apply">✓ Apply</button>
      <button class="btn" id="ins-split">✂ Split</button>
      <button class="btn" id="ins-dup">⧉ Dup</button>
      <button class="btn" id="ins-del">🗑 Del</button>
      ${it.kind==='word'?'<button class="btn" id="ins-rebuild">↻ Rebuild Line</button>':''}
    </div>`;

  const applyFn=()=>{
    it.text=document.getElementById('inp-text').value;
    const ns=this.num(document.getElementById('inp-start').value,it.start);
    const ne=this.num(document.getElementById('inp-end').value,it.end);
    if(ns>=0&&ne>ns){it.start=ns;it.end=ne}
    if(t?.type==='words')this.recalcTrackLines(t);
    this.sortTrack(t);this.pushHistory('InspEdit');this.markDirty(true);this.fullRender();this.updateInspector();
  };

  const inp=document.getElementById('inp-text');inp.onkeydown=e=>{if(e.key==='Enter')applyFn()};
  document.getElementById('inp-start').onkeydown=e=>{if(e.key==='Enter')applyFn()};
  document.getElementById('inp-end').onkeydown=e=>{if(e.key==='Enter')applyFn()};
  document.getElementById('inp-text').onblur=applyFn;
  document.getElementById('ins-apply').onclick=applyFn;
  document.getElementById('ins-split').onclick=()=>this.splitAtPlayhead();
  document.getElementById('ins-dup').onclick=()=>this.duplicateSelected();
  document.getElementById('ins-del').onclick=()=>this.deleteSelected();
  const rb=document.getElementById('ins-rebuild');
  if(rb)rb.onclick=()=>{this.rebuildParentLine(t,it.id);this.pushHistory('Rebuild');this.markDirty(true);this.fullRender();this.updateInspector()};
  this.bindCharsInspector(it,t);
},

renderCharsInspector(it){
  if(!it.chars||!it.chars.length)return`
    <div class="igr"><label>Chars</label>
      <button class="btn" id="ins-chars-gen" style="font-size:11px">Generate from word</button>
    </div>`;
  const rows=it.chars.map((ch,i)=>`
    <div class="char-row" data-ci="${i}">
      <input class="chr-t" type="text" value="${this.esc(ch.char||'')}">
      <input class="chr-s" type="number" step="0.001" value="${(ch.start||0).toFixed(3)}">
      <input class="chr-e" type="number" step="0.001" value="${(ch.end||0).toFixed(3)}">
      <button class="btn chr-del" style="padding:2px 4px;font-size:10px" data-ci="${i}">✕</button>
    </div>`).join('');
  return`<div class="igr"><label>Chars (${it.chars.length})</label>
    <div style="max-height:140px;overflow:auto;border:1px solid var(--br);border-radius:4px;padding:4px">${rows}</div>
    <div style="margin-top:4px;display:flex;gap:5px">
      <button class="btn" id="ins-chars-add" style="font-size:11px">+ Add Char</button>
      <button class="btn" id="ins-chars-rebuild" style="font-size:11px">↻ Auto-rebuild</button>
      <button class="btn" id="ins-chars-apply" style="font-size:11px">✓ Apply Chars</button>
    </div></div>`;
},

bindCharsInspector(it,t){
  const gen=document.getElementById('ins-chars-gen');
  if(gen)gen.onclick=()=>{
    it.chars=[...it.text].map((c,i)=>{const frac=it.start+(it.end-it.start)*i/it.text.length,fe=it.start+(it.end-it.start)*(i+1)/it.text.length;return{char:c,start:parseFloat(frac.toFixed(3)),end:parseFloat(fe.toFixed(3))};});
    this.updateInspector();
  };

  const addBtn=document.getElementById('ins-chars-add');
  if(addBtn)addBtn.onclick=()=>{
    const last=it.chars[it.chars.length-1];
    it.chars.push({char:'',start:last?last.end:it.start,end:last?last.end+.1:it.end});
    this.updateInspector();
  };

  const rebuildBtn=document.getElementById('ins-chars-rebuild');
  if(rebuildBtn)rebuildBtn.onclick=()=>{
    const chars=[...it.text];const dur=(it.end-it.start)/Math.max(1,chars.length);
    it.chars=chars.map((c,i)=>({char:c,start:parseFloat((it.start+i*dur).toFixed(3)),end:parseFloat((it.start+(i+1)*dur).toFixed(3))}));
    this.updateInspector();
  };

  const applyCharsBtn=document.getElementById('ins-chars-apply');
  if(applyCharsBtn)applyCharsBtn.onclick=()=>{
    document.querySelectorAll('.char-row').forEach((row,i)=>{
      if(!it.chars[i])return;
      it.chars[i].char=row.querySelector('.chr-t').value;
      it.chars[i].start=this.num(row.querySelector('.chr-s').value,it.chars[i].start);
      it.chars[i].end=this.num(row.querySelector('.chr-e').value,it.chars[i].end);
    });
    this.pushHistory('CharsEdit');this.markDirty(true);this.updateInspector();
  };

  document.querySelectorAll('.chr-del').forEach(b=>b.onclick=e=>{
    const i=+e.currentTarget.dataset.ci;it.chars.splice(i,1);this.updateInspector();
  });
},

renderBatchInspector(el,items){
  const sorted=items.sort((a,b)=>a.start-b.start);
  el.innerHTML=`<div class="muted">Selected: ${items.length} items</div>
    <div class="batch-box">
      <h4>Move by (seconds)</h4>
      <div class="batch-row">
        <input id="batch-move-val" type="number" step="0.01" value="0.1">
        <button class="btn" id="batch-move-l">← Left</button>
        <button class="btn" id="batch-move-r">Right →</button>
      </div>
      <h4>Set gap between items</h4>
      <div class="batch-row">
        <input id="batch-gap-val" type="number" step="0.01" value="0.05">
        <button class="btn" id="batch-gap-set">Set Gap</button>
      </div>
      <h4>Normalize durations</h4>
      <div class="batch-row">
        <input id="batch-dur-val" type="number" step="0.01" value="1.0">
        <button class="btn" id="batch-dur-set">Apply</button>
      </div>
      <h4>Close / Distribute</h4>
      <div class="batch-row">
        <button class="btn" id="batch-close">Close Gaps</button>
        <button class="btn" id="batch-dist">Distribute</button>
      </div>
    </div>`;

  document.getElementById('batch-move-l').onclick=()=>this.batchMoveSelected(-Math.abs(this.num(document.getElementById('batch-move-val').value,.1)));
  document.getElementById('batch-move-r').onclick=()=>this.batchMoveSelected(Math.abs(this.num(document.getElementById('batch-move-val').value,.1)));
  document.getElementById('batch-gap-set').onclick=()=>this.batchSetGap(this.num(document.getElementById('batch-gap-val').value,.05));
  document.getElementById('batch-dur-set').onclick=()=>this.batchNormalize(this.num(document.getElementById('batch-dur-val').value,1));
  document.getElementById('batch-close').onclick=()=>this.batchCloseGaps();
  document.getElementById('batch-dist').onclick=()=>this.batchDistributeEvenly();
},

markPlayingItems(t){
  document.querySelectorAll('.track-item.playing').forEach(el=>el.classList.remove('playing'));
  this.project.tracks.filter(tr=>tr.visible).forEach(tr=>{
    tr.items.filter(it=>it.start<=t&&it.end>t).forEach(it=>{
      const el=document.getElementById(`DOM_${tr.id}_${it.id}`);if(el)el.classList.add('playing');
    });
  });
},

/* ─── preview ────────────────────────────────────────────────────── */
renderPreview(){
  const c=this.ui.lyricsContainer,t=this.audioElement.currentTime||0;
  const lt=this.trackByType('line'),wt=this.trackByType('words');
  const visL=lt&&lt.visible,visW=wt&&wt.visible;

  if(!visL&&!visW){c.innerHTML='<p class="muted">No visible tracks</p>';return}

  const soloL=lt&&lt.solo,soloW=wt&&wt.solo;
  const showL=(soloW&&!soloL)?false:visL;
  const showW=(soloL&&!soloW)?false:visW;

  if(!showL&&!showW){c.innerHTML='<p class="muted">Solo mode: nothing visible</p>';return}

  if(showL&&!showW){this.renderPreviewLines(c,lt,t,false);return}
  if(showW&&!showL){this.renderPreviewWords(c,wt,t);return}
  this.renderPreviewDual(c,lt,wt,t);
},

renderPreviewLines(c,t,time,wordOverlay){
  const lines=t.items.filter(i=>i.kind==='line').sort((a,b)=>a.start-b.start);
  c.innerHTML=lines.map(l=>{
    const playing=l.start<=time&&l.end>time,sel=this.selected.ids.has(l.id);
    return`<div class="lyric-line${playing?' playing':''}${sel?' selected-ui':''}" data-id="${l.id}">${this.esc(l.text)}</div>`;
  }).join('');
  c.querySelectorAll('.lyric-line').forEach(el=>el.onclick=()=>{
    const id=el.dataset.id;const it=t.items.find(i=>i.id===id);if(it)this.audioElement.currentTime=it.start;
  });
},

renderPreviewWords(c,t,time){
  const lines=t.items.filter(i=>i.kind==='line').sort((a,b)=>a.start-b.start);
  c.innerHTML=lines.map(l=>{
    const words=t.items.filter(i=>i.kind==='word'&&i.lineId===l.id).sort((a,b)=>a.start-b.start);
    const playing=l.start<=time&&l.end>time,sel=this.selected.ids.has(l.id);
    const wordsHtml=words.map(w=>{
      const wp=w.start<=time&&w.end>time;
      return`<span class="lyric-word${wp?' playing':''}">${this.esc(w.text)}</span>`;
    }).join(' ');
    return`<div class="lyric-line${playing?' playing':''}${sel?' selected-ui':''}">${wordsHtml||this.esc(l.text)}</div>`;
  }).join('');
},

renderPreviewDual(c,lt,wt,time){
  const llines=lt.items.filter(i=>i.kind==='line').sort((a,b)=>a.start-b.start);
  const wlines=wt.items.filter(i=>i.kind==='line').sort((a,b)=>a.start-b.start);
  const wwords=wt.items.filter(i=>i.kind==='word');

  c.innerHTML=llines.map(l=>{
    const playing=l.start<=time&&l.end>time,sel=this.selected.ids.has(l.id);
    const overlayLine=wlines.find(wl=>wl.start<l.end&&wl.end>l.start);
    let overlay='';
    if(overlayLine){
      const words=wwords.filter(w=>w.lineId===overlayLine.id).sort((a,b)=>a.start-b.start);
      overlay=`<div class="preview-subline preview-overlay">${words.map(w=>`<span class="lyric-word${w.start<=time&&w.end>time?' playing':''}">${this.esc(w.text)}</span>`).join(' ')}</div>`;
    }
    return`<div class="lyric-line${playing?' playing':''}${sel?' selected-ui':''}">
      <div class="preview-subline preview-underlay">${this.esc(l.text)}</div>${overlay}</div>`;
  }).join('');
},

/* ─── context menu ───────────────────────────────────────────────── */
showContextMenu(e){
  e.preventDefault();
  const item=e.target.closest('.track-item');
  this.context={trackId:item?.dataset.tid||null,itemId:item?.dataset.id||null,cursorX:e.clientX};
  const menu=this.ui.contextMenu;
  menu.style.left=e.clientX+'px';menu.style.top=e.clientY+'px';menu.classList.remove('hidden');
},

setupContext(){
  this.ui.ctxEdit.onclick=()=>{
    const it=this.item(this.context.trackId,this.context.itemId);if(!it)return;
    const text=prompt('Edit text:',it.text);if(text!==null){it.text=text;this.markDirty(true);this.pushHistory('EditText');this.fullRender();this.updateInspector()}
    this.ui.contextMenu.classList.add('hidden');
  };
  this.ui.ctxSplit.onclick=()=>{this.splitAtPlayhead();this.ui.contextMenu.classList.add('hidden')};
  this.ui.ctxSplitCursor.onclick=()=>{
    if(this.context.itemId)this.splitAtCursor(this.context.trackId,this.context.itemId,this.context.cursorX);
    this.ui.contextMenu.classList.add('hidden');
  };
  this.ui.ctxMergePrev.onclick=()=>{
    if(this.context.itemId){this.select(this.context.trackId,this.context.itemId,false);this.mergeSelectedWithPrev()}
    this.ui.contextMenu.classList.add('hidden');
  };
  this.ui.ctxMergeNext.onclick=()=>{
    if(this.context.itemId){this.select(this.context.trackId,this.context.itemId,false);this.mergeSelectedWithNext()}
    this.ui.contextMenu.classList.add('hidden');
  };
  this.ui.ctxDuplicate.onclick=()=>{
    if(this.context.itemId){this.select(this.context.trackId,this.context.itemId,false);this.duplicateSelected()}
    this.ui.contextMenu.classList.add('hidden');
  };
  this.ui.ctxAddLine.onclick=()=>{this.addNewLine();this.ui.contextMenu.classList.add('hidden')};
  this.ui.ctxAddWord.onclick=()=>{this.addNewWord();this.ui.contextMenu.classList.add('hidden')};
  this.ui.ctxMovePlayhead.onclick=()=>{
    const it=this.item(this.context.trackId,this.context.itemId);
    if(it)this.audioElement.currentTime=it.start;this.syncPlayhead();
    this.ui.contextMenu.classList.add('hidden');
  };
  this.ui.ctxZoomSelection.onclick=()=>{
    if(this.context.itemId)this.select(this.context.trackId,this.context.itemId,false);
    this.zoomToSelection();this.ui.contextMenu.classList.add('hidden');
  };
  this.ui.ctxScrollSelection.onclick=()=>{
    if(this.context.itemId)this.select(this.context.trackId,this.context.itemId,false);
    this.scrollToSelection();this.ui.contextMenu.classList.add('hidden');
  };
  this.ui.ctxDelete.onclick=()=>{
    if(this.context.itemId){this.select(this.context.trackId,this.context.itemId,false);this.deleteSelected()}
    this.ui.contextMenu.classList.add('hidden');
  };
},

/* ─── export ─────────────────────────────────────────────────────── */
exportTrack(t){
  if(!t){alert('Дорожка не найдена');return}
  const json=t.type==='line'?this.buildLineJson(t):this.buildWordsJson(t);
  this.download(JSON.stringify(json,null,2),`${t.name}_export_${Date.now()}.json`,'application/json');
  this.markDirty(false);
},

exportAll(){
  this.project.tracks.forEach(t=>this.exportTrack(t));
},

buildLineJson(t){
  return t.items.filter(i=>i.kind==='line').sort((a,b)=>a.start-b.start).map(i=>({time:parseFloat(i.start.toFixed(3)),line:i.text}));
},

buildWordsJson(t){
  const lines=t.items.filter(i=>i.kind==='line').sort((a,b)=>a.start-b.start);
  return lines.map(l=>{
    const words=t.items.filter(i=>i.kind==='word'&&i.lineId===l.id).sort((a,b)=>a.start-b.start);
    return{start:parseFloat(l.start.toFixed(3)),end:parseFloat(l.end.toFixed(3)),line:l.text,
           words:words.map(w=>({w:w.text,start:parseFloat(w.start.toFixed(3)),end:parseFloat(w.end.toFixed(3)),...(w.chars?.length?{chars:w.chars}:{})}))};
  });
},

download(content,name,mime){
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type:mime}));a.download=name;a.click();
},

/* ─── validation ─────────────────────────────────────────────────── */
openValidationModal(){
  const issues=this.runValidation();
  const el=this.ui.validationList;
  if(!issues.length){el.innerHTML='<div class="validation-item ok"><span class="vi-badge">OK</span>Проблем не найдено!</div>';
  }else{
    el.innerHTML=issues.map(v=>`<div class="validation-item ${v.type}"><span class="vi-badge">${v.type.toUpperCase()}</span><span>${v.msg}</span></div>`).join('');
  }
  this.ui.validationModal.classList.remove('hidden');
},

runValidation(){
  const issues=[];
  this.project.tracks.forEach(t=>{
    const sorted=[...t.items].sort((a,b)=>a.start-b.start);
    sorted.forEach((it,i)=>{
      if(it.start<0)issues.push({type:'err',msg:`[${t.name}] "${it.text}" start < 0`});
      if(it.end<=it.start)issues.push({type:'err',msg:`[${t.name}] "${it.text}" end <= start`});
      if(it.end>this.duration+.01&&this.duration)issues.push({type:'warn',msg:`[${t.name}] "${it.text}" выходит за длительность трека`});
      if(isNaN(it.start)||isNaN(it.end))issues.push({type:'err',msg:`[${t.name}] "${it.text}" NaN в таймингах`});
      if(i>0&&it.start<sorted[i-1].end-0.001&&it.kind===sorted[i-1].kind)
        issues.push({type:'warn',msg:`[${t.name}] "${sorted[i-1].text}" перекрывает "${it.text}"`});
      if(!it.text.trim())issues.push({type:'warn',msg:`[${t.name}] Пустой текст у элемента [${it.start.toFixed(2)}-${it.end.toFixed(2)}]`});
    });
    if(t.type==='words'){
      const wids=t.items.filter(i=>i.kind==='word').map(i=>i.lineId);
      const lids=new Set(t.items.filter(i=>i.kind==='line').map(i=>i.id));
      wids.forEach((lid,i)=>{
        if(!lids.has(lid))issues.push({type:'err',msg:`[${t.name}] Слово без валидной строки (lineId="${lid}")`});
      });
    }
  });
  return issues;
},

/* ─── hotkey manager ─────────────────────────────────────────────── */
defaultKeymap(){
  return{
    'play':           {key:'Space',         desc:'Воспроизведение / пауза'},
    'stop':           {key:'Escape',        desc:'Стоп и возврат к началу'},
    'zoomIn':         {key:'+',            desc:'Увеличить масштаб (горизонтально)'},
    'zoomOut':        {key:'-',            desc:'Уменьшить масштаб (горизонтально)'},
    'vzoomIn':        {key:'Alt++',        desc:'Увеличить вертикальный масштаб'},
    'vzoomOut':       {key:'Alt+-',        desc:'Уменьшить вертикальный масштаб'},
    'seekLeft':       {key:'ArrowLeft',     desc:'Перемотать влево на 0.5s'},
    'seekRight':      {key:'ArrowRight',    desc:'Перемотать вправо на 0.5s'},
    'seekLargeLeft':  {key:'Shift+ArrowLeft',  desc:'Перемотать влево на 5s'},
    'seekLargeRight': {key:'Shift+ArrowRight', desc:'Перемотать вправо на 5s'},
    'splitAtPlayhead':{key:'S',             desc:'Разрезать элемент по playhead'},
    'mergePrev':      {key:'Shift+M',       desc:'Слить с предыдущим элементом'},
    'mergeNext':      {key:'M',             desc:'Слить со следующим элементом'},
    'duplicate':      {key:'Shift+D',       desc:'Дублировать выделенные элементы'},
    'deleteSelected': {key:'Delete',        desc:'Удалить выделенные элементы'},
    'selectAll':      {key:'Ctrl+A',        desc:'Выделить все элементы активной дорожки'},
    'deselect':       {key:'Ctrl+D',        desc:'Снять выделение'},
    'nudgeLeft':      {key:'Shift+ArrowLeft', desc:'Сдвинуть выделение влево на шаг'},
    'nudgeRight':     {key:'Shift+ArrowRight',desc:'Сдвинуть выделение вправо на шаг'},
    'undo':           {key:'Ctrl+Z',        desc:'Отменить последнее действие'},
    'redo':           {key:'Ctrl+Y',        desc:'Повторить отменённое действие'},
    'centerPlayhead': {key:'C',             desc:'Центрировать вид на playhead'},
    'fitSong':        {key:'F',             desc:'Уместить всю песню в экран'},
    'scrollToSel':    {key:'G',             desc:'Прокрутить к выделению'},
    'zoomToSel':      {key:'Shift+G',       desc:'Zoom к выделению'},
    'gotoSel':        {key:'Home',          desc:'Перейти к началу выделения'},
    'toggleSnap':     {key:'N',             desc:'Включить / выключить привязку'},
    'toggleAutoScroll':{key:'L',            desc:'Включить / выключить авто-прокрутку'},
    'toggleLoop':     {key:'Shift+L',       desc:'Включить / выключить петлю'},
    'saveExport':     {key:'Ctrl+S',        desc:'Экспортировать активную дорожку'},
    'openHotkeys':    {key:'Ctrl+K',        desc:'Открыть редактор горячих клавиш'},
    'openHelp':       {key:'Ctrl+H',        desc:'Открыть справку'},
    'openValidation': {key:'Ctrl+Shift+V',  desc:'Открыть панель валидации'},
    'switchTrack':    {key:'Tab',           desc:'Переключить активную дорожку'},
    'toggleLineVis':  {key:'Shift+1',       desc:'Показать/скрыть Line-дорожку'},
    'toggleWordsVis': {key:'Shift+2',       desc:'Показать/скрыть Words-дорожку'},
    'toggleSolo':     {key:'Shift+S',       desc:'Solo активной дорожки'},
    'toggleLock':     {key:'Shift+L',       desc:'Заблокировать активную дорожку'},
    'addLine':        {key:'Ctrl+Shift+N',  desc:'Добавить новую строку в позиции playhead'},
    'addWord':        {key:'Ctrl+N',        desc:'Добавить новое слово'},
    'collapseTrack':  {key:'Shift+C',       desc:'Свернуть / развернуть активную дорожку'},
  };
},

initKeymap(){
  const def=this.defaultKeymap();
  try{const saved=JSON.parse(localStorage.getItem(this.keymapKey)||'null');
    if(saved)Object.keys(def).forEach(k=>{if(saved[k]?.key)def[k].key=saved[k].key});
  }catch(e){}
  this.keymap=def;
},

saveKeymap(){
  // apply edits from hotkeys modal inputs before save
  document.querySelectorAll('.hk-row').forEach(row=>{
    const cmd=row.dataset.cmd;if(!cmd||!this.keymap[cmd])return;
    const kspan=row.querySelector('.hk-key');if(kspan)this.keymap[cmd].key=kspan.dataset.val||this.keymap[cmd].key;
  });
  localStorage.setItem(this.keymapKey,JSON.stringify(
    Object.fromEntries(Object.entries(this.keymap).map(([k,v])=>[k,{key:v.key}]))
  ));
  this.closeHotkeysModal();
},

openHotkeysModal(){
  this.renderHotkeysModal();
  this.ui.hotkeysModal.classList.remove('hidden');
},

closeHotkeysModal(){
  this.hotkeysWaiting=null;
  this.ui.hotkeysModal.classList.add('hidden');
},

renderHotkeysModal(){
  const conflicts=this.findKeymapConflicts();
  const conflictKeys=new Set(Object.values(conflicts).flat());

  this.ui.hotkeysConflicts.textContent=
    conflictKeys.size
      ? '⚠ Конфликты: '+[...new Set(Object.values(conflicts).map(v=>v.join(' & ')))].join(' | ')
      : '';

  this.ui.hotkeysList.innerHTML=Object.entries(this.keymap).map(([cmd,v])=>{
    const hasConflict=conflictKeys.has(cmd);
    return`<div class="hk-row" data-cmd="${cmd}">
      <span class="hk-name">${cmd}</span>
      <span class="hk-key${hasConflict?' conflict':''}" data-val="${this.esc(v.key)}">${this.esc(v.key)||'—'}</span>
      <button class="btn hk-set-btn" data-cmd="${cmd}" style="font-size:11px">Set</button>
      <button class="btn hk-clr-btn" data-cmd="${cmd}" style="font-size:11px;background:#5a1e1e;border-color:#a44">Clear</button>
      <span class="hk-desc">${v.desc}</span>
    </div>`;
  }).join('');

  this.ui.hotkeysList.querySelectorAll('.hk-set-btn').forEach(btn=>{
    btn.onclick=()=>this.startHotkeyCapture(btn.dataset.cmd);
  });
  this.ui.hotkeysList.querySelectorAll('.hk-clr-btn').forEach(btn=>{
    btn.onclick=()=>this.clearHotkey(btn.dataset.cmd);
  });
},

findKeymapConflicts(){
  // returns {cmd:[conflictingCmd,...]} for each cmd that shares a key with another
  const keyToCommands={};
  Object.entries(this.keymap).forEach(([cmd,v])=>{
    if(!v.key)return;
    if(!keyToCommands[v.key])keyToCommands[v.key]=[];
    keyToCommands[v.key].push(cmd);
  });
  const result={};
  Object.entries(keyToCommands).forEach(([key,cmds])=>{
    if(cmds.length>1)cmds.forEach(cmd=>{result[cmd]=cmds.filter(c=>c!==cmd)});
  });
  return result;
},

startHotkeyCapture(cmd){
  this.hotkeysWaiting=cmd;
  // mark row as waiting
  document.querySelectorAll('.hk-key').forEach(el=>el.classList.remove('waiting'));
  const row=this.ui.hotkeysList.querySelector(`[data-cmd="${cmd}"]`);
  if(row)row.querySelector('.hk-key').classList.add('waiting');
},

clearHotkey(cmd){
  if(!this.keymap[cmd])return;
  this.keymap[cmd].key='';
  this.renderHotkeysModal();
},

captureHotkey(e){
  if(!this.hotkeysWaiting)return false;
  e.preventDefault();e.stopPropagation();
  const parts=[];
  if(e.ctrlKey)parts.push('Ctrl');
  if(e.metaKey)parts.push('Meta');
  if(e.altKey)parts.push('Alt');
  if(e.shiftKey)parts.push('Shift');
  const key=e.key;
  if(['Control','Shift','Alt','Meta'].includes(key))return true; // modifier only — wait
  parts.push(key==='+'?'+':key==='-'?'-':key);
  const combo=parts.join('+');
  this.keymap[this.hotkeysWaiting].key=combo;
  this.hotkeysWaiting=null;
  this.renderHotkeysModal();
  return true;
},

/* ─── help modal ─────────────────────────────────────────────────── */
openHelpModal(){
  this.ui.helpList.innerHTML=Object.entries(this.keymap).map(([cmd,v])=>`
    <div class="hk-row" data-cmd="${cmd}">
      <span class="hk-name">${cmd}</span>
      <span class="hk-key">${this.esc(v.key)||'—'}</span>
      <span></span><span></span>
      <span class="hk-desc">${v.desc}</span>
    </div>`).join('');
  this.ui.helpModal.classList.remove('hidden');
},

/* ─── hotkeys dispatch ───────────────────────────────────────────── */
handleHotkeys(e){
  // if capturing — intercept
  if(this.hotkeysWaiting){this.captureHotkey(e);return}

  // skip if typing in inputs
  const tag=document.activeElement?.tagName;
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')return;
  // skip if any modal open except help
  const modalOpen=!this.ui.hotkeysModal.classList.contains('hidden')||
                  !this.ui.validationModal.classList.contains('hidden')||
                  !this.ui.renameModal.classList.contains('hidden')||
                  !this.ui.restoreModal.classList.contains('hidden');
  if(modalOpen)return;

  const combo=this.eventToCombo(e);
  const cmd=Object.entries(this.keymap).find(([,v])=>v.key===combo)?.[0];
  if(!cmd)return;

  e.preventDefault();
  this.execCmd(cmd);
},

eventToCombo(e){
  const parts=[];
  if(e.ctrlKey)parts.push('Ctrl');
  if(e.metaKey)parts.push('Meta');
  if(e.altKey)parts.push('Alt');
  if(e.shiftKey)parts.push('Shift');
  let k=e.key;
  if(e.code==='NumpadAdd')k='+';
  if(e.code==='NumpadSubtract')k='-';
  if(e.code==='Equal'&&e.key==='+')k='+';
  parts.push(k);
  return parts.join('+');
},

execCmd(cmd){
  const nudge=this.snapStep||0.1;
  const at=this.activeTrack();
  switch(cmd){
    case 'play':           this.togglePlay();break;
    case 'stop':           this.audioElement.pause();this.audioElement.currentTime=0;this.syncPlayhead();this.ui.btnPlay.textContent='▶ Play';break;
    case 'zoomIn':         this.setZoom(this.zoom+10);break;
    case 'zoomOut':        this.setZoom(this.zoom-10);break;
    case 'vzoomIn':        this.setVerticalZoom(this.verticalZoom+.1);break;
    case 'vzoomOut':       this.setVerticalZoom(this.verticalZoom-.1);break;
    case 'seekLeft':       this.audioElement.currentTime=Math.max(0,this.audioElement.currentTime-.5);this.syncPlayhead();break;
    case 'seekRight':      this.audioElement.currentTime=Math.min(this.duration,this.audioElement.currentTime+.5);this.syncPlayhead();break;
    case 'seekLargeLeft':  this.audioElement.currentTime=Math.max(0,this.audioElement.currentTime-5);this.syncPlayhead();break;
    case 'seekLargeRight': this.audioElement.currentTime=Math.min(this.duration,this.audioElement.currentTime+5);this.syncPlayhead();break;
    case 'nudgeLeft':      this.batchMoveSelected(-nudge);break;
    case 'nudgeRight':     this.batchMoveSelected(nudge);break;
    case 'splitAtPlayhead':this.splitAtPlayhead();break;
    case 'mergePrev':      this.mergeSelectedWithPrev();break;
    case 'mergeNext':      this.mergeSelectedWithNext();break;
    case 'duplicate':      this.duplicateSelected();break;
    case 'deleteSelected': this.deleteSelected();break;
    case 'selectAll':      this.selectAll();break;
    case 'deselect':       this.clearSelection();break;
    case 'undo':           this.undo();break;
    case 'redo':           this.redo();break;
    case 'centerPlayhead': this.centerOnPlayhead();break;
    case 'fitSong':        this.fitSong();break;
    case 'scrollToSel':    this.scrollToSelection();break;
    case 'zoomToSel':      this.zoomToSelection();break;
    case 'gotoSel':        this.gotoSelectionStart();break;
    case 'toggleSnap':
      this.snapStep=this.snapStep?0:0.1;
      this.ui.snapSelect.value=this.snapStep;break;
    case 'toggleAutoScroll':
      this.autoScroll=!this.autoScroll;
      this.ui.autoScroll.checked=this.autoScroll;break;
    case 'toggleLoop':     this.toggleLoopSelection();break;
    case 'saveExport':     this.exportTrack(this.activeTrack());break;
    case 'openHotkeys':    this.openHotkeysModal();break;
    case 'openHelp':       this.openHelpModal();break;
    case 'openValidation': this.openValidationModal();break;
    case 'switchTrack':
      if(this.project.tracks.length>1){
        const idx=this.project.tracks.findIndex(t=>t.id===this.project.activeTrackId);
        const next=this.project.tracks[(idx+1)%this.project.tracks.length];
        if(!next.locked)this.setActiveTrack(next.id);
      }break;
    case 'toggleLineVis':
      {const t=this.trackByType('line');if(t){t.visible=!t.visible;this.markDirty(true);this.fullRender()}}break;
    case 'toggleWordsVis':
      {const t=this.trackByType('words');if(t){t.visible=!t.visible;this.markDirty(true);this.fullRender()}}break;
    case 'toggleSolo':
      if(at){at.solo=!at.solo;this.markDirty(true);this.fullRender()}break;
    case 'toggleLock':
      if(at)this.trackAction(at.id,'lock');break;
    case 'addLine':        this.addNewLine();break;
    case 'addWord':        this.addNewWord();break;
    case 'collapseTrack':
      if(at){this.collapsed[at.id]=!this.collapsed[at.id];this.fullRender()}break;
  }
},

/* ─── session / autosave ─────────────────────────────────────────── */
checkDraftOnLaunch(){
  try{
    const draft=localStorage.getItem(this.autosaveKey);
    if(!draft)return;
    const d=JSON.parse(draft);
    if(!d?.project?.tracks?.length)return;
    this.ui.restoreModal.classList.remove('hidden');
  }catch(e){localStorage.removeItem(this.autosaveKey)}
},

restoreDraftFromStorage(apply){
  try{
    const raw=localStorage.getItem(this.autosaveKey);if(!raw)return;
    const d=JSON.parse(raw);if(!d?.project)return;
    if(!apply)return;
    this.project=d.project;
    this.zoom=d.zoom||80;
    this.verticalZoom=d.verticalZoom||1;
    this.autoScroll=d.autoScroll!==undefined?d.autoScroll:true;
    this.snapStep=d.snapStep||0;
    this.collapsed=d.collapsed||{};
    this.trackColors=d.trackColors||{};
    if(d.keymap)Object.keys(d.keymap).forEach(k=>{if(this.keymap[k])this.keymap[k].key=d.keymap[k].key});
    this.ui.zoomSlider.value=this.zoom;this.updateZoomReadout();
    this.ui.vzoomSlider.value=Math.round(this.verticalZoom*100);this.updateVZoomReadout();
    this.ui.autoScroll.checked=this.autoScroll;
    this.ui.snapSelect.value=this.snapStep;
    this.updateSaveStatus('Session restored',false);
    this.fullRender();
    // restore scroll after render
    setTimeout(()=>{
      if(d.scrollLeft)this.ui.timelineContainer.scrollLeft=d.scrollLeft;
      if(d.currentTime)this.audioElement.currentTime=d.currentTime;
    },150);
  }catch(e){console.error('Restore failed',e)}
},

saveDraftToStorage(){
  if(!this.autosaveEnabled)return;
  try{
    localStorage.setItem(this.autosaveKey,JSON.stringify({
      project:this.project,
      zoom:this.zoom,
      verticalZoom:this.verticalZoom,
      autoScroll:this.autoScroll,
      snapStep:this.snapStep,
      scrollLeft:this.ui.timelineContainer.scrollLeft,
      currentTime:this.audioElement.currentTime,
      collapsed:this.collapsed,
      trackColors:this.trackColors,
      keymap:Object.fromEntries(Object.entries(this.keymap).map(([k,v])=>[k,{key:v.key}])),
      ts:Date.now()
    }));
    this.updateSaveStatus('Autosaved',false);
  }catch(e){this.updateSaveStatus('Autosave error',true)}
},

startAutosaveLoop(){
  clearInterval(this.autosaveTimer);
  this.autosaveTimer=setInterval(()=>{if(this.dirty)this.saveDraftToStorage()},this.autosaveIntervalSec*1000);
},

restartAutosaveLoop(){clearInterval(this.autosaveTimer);this.startAutosaveLoop()},

/* ─── history ────────────────────────────────────────────────────── */
pushHistory(label){
  this.history=this.history.slice(0,this.historyIndex+1);
  this.history.push({label,project:JSON.parse(JSON.stringify(this.project)),
    selected:{trackId:this.selected.trackId,ids:[...this.selected.ids]}});
  if(this.history.length>80)this.history.shift();
  this.historyIndex=this.history.length-1;
},

undo(){
  if(this.historyIndex<=0)return;
  this.historyIndex--;
  this.applyHistory(this.history[this.historyIndex]);
},

redo(){
  if(this.historyIndex>=this.history.length-1)return;
  this.historyIndex++;
  this.applyHistory(this.history[this.historyIndex]);
},

applyHistory(h){
  this.project=JSON.parse(JSON.stringify(h.project));
  this.selected={trackId:h.selected.trackId,ids:new Set(h.selected.ids)};
  this.markDirty(true);this.fullRender();this.updateInspector();
},

/* ─── dirty / save status ────────────────────────────────────────── */
markDirty(isDirty){
  this.dirty=isDirty;
  this.updateSaveStatus(isDirty?'Unsaved changes':'Saved',isDirty);
},

updateSaveStatus(msg,dirty){
  const el=this.ui.saveStatus;el.textContent=msg;
  el.className='save-status'+(dirty?' dirty':'');
},

/* ─── ui prefs persist ───────────────────────────────────────────── */
persistUiPrefs(){
  try{localStorage.setItem(this.uiStateKey,JSON.stringify({
    zoom:this.zoom,verticalZoom:this.verticalZoom,
    autoScroll:this.autoScroll,snapStep:this.snapStep,
    volume:this.volume,muted:this.muted,
    autosaveEnabled:this.autosaveEnabled,autosaveIntervalSec:this.autosaveIntervalSec
  }))}catch(e){}
},

restoreUiPrefs(){
  try{
    const d=JSON.parse(localStorage.getItem(this.uiStateKey)||'null');if(!d)return;
    this.zoom=d.zoom||80;this.verticalZoom=d.verticalZoom||1;
    this.autoScroll=d.autoScroll!==undefined?d.autoScroll:true;
    this.snapStep=d.snapStep||0;
    this.volume=d.volume!==undefined?d.volume:1;
    this.muted=!!d.muted;
    this.autosaveEnabled=d.autosaveEnabled!==undefined?d.autosaveEnabled:true;
    this.autosaveIntervalSec=d.autosaveIntervalSec||10;
    this.ui.zoomSlider.value=this.zoom;
    this.ui.vzoomSlider.value=Math.round(this.verticalZoom*100);
    this.ui.autoScroll.checked=this.autoScroll;
    this.ui.snapSelect.value=this.snapStep;
    this.ui.volumeSlider.value=Math.round(this.volume*100);
    this.ui.autosaveEnabled.checked=this.autosaveEnabled;
    this.ui.autosaveInterval.value=this.autosaveIntervalSec;
    if(this.muted)this.ui.btnMute.textContent='🔇';
  }catch(e){}
},

/* ─── resizers ───────────────────────────────────────────────────── */
startResize(e,target){
  e.preventDefault();
  this.resize={
    active:true,target,
    startX:e.clientX,startY:e.clientY,
    startDim:target==='sidebar'?this.ui.sidebar.offsetWidth:this.ui.lyricsContainer.offsetHeight
  };
  document.body.style.userSelect='none';
},

handleResizeMove(e){
  if(!this.resize.active)return;
  if(this.resize.target==='sidebar'){
    const w=Math.max(220,Math.min(820,this.resize.startDim-(e.clientX-this.resize.startX)));
    this.ui.sidebar.style.width=w+'px';
  }else{
    const h=Math.max(80,Math.min(600,this.resize.startDim+(e.clientY-this.resize.startY)));
    this.ui.lyricsContainer.style.height=h+'px';
  }
},

stopResize(){this.resize.active=false;document.body.style.userSelect=''},

/* ─── helpers ────────────────────────────────────────────────────── */
track(id){return this.project.tracks.find(t=>t.id===id)},
activeTrack(){return this.track(this.project.activeTrackId)},
trackByType(type){return this.project.tracks.find(t=>t.type===type)},
item(trackId,itemId){return this.track(trackId)?.items.find(i=>i.id===itemId)},
sortTrack(t){if(t)t.items.sort((a,b)=>a.start-b.start)},
snap(v){return this.snapStep?Math.round(v/this.snapStep)*this.snapStep:v},
num(v,def=0){const n=parseFloat(v);return isNaN(n)?def:n},
base(name){return name.replace(/\.[^/.]+$/,'')},
esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')},
id(){return Math.random().toString(36).slice(2,9)},
rulerStep(){
  const s=60/this.zoom;
  const steps=[.05,.1,.25,.5,1,2,5,10,30,60];
  return steps.find(x=>x>=s*1.5)||steps[steps.length-1];
},
rulerTime(t,long=false){
  const m=Math.floor(t/60),s=t%60;
  return long?`${m}:${s.toFixed(2).padStart(5,'0')}`:`${m}:${Math.floor(s).toString().padStart(2,'0')}`;
},
clearCanvas(c){const x=c.getContext('2d');x.clearRect(0,0,c.width,c.height)},
hexToRgba(hex,a){
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return`rgba(${r},${g},${b},${a})`;
},
};

document.addEventListener('DOMContentLoaded',()=>App.init());
