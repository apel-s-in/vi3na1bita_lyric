'use strict';
/* ── ke-timeline.js: render, headers, drag, marquee, trim engine ── */
Object.assign(App, {

  /* ── full render ── */
  fullRender(){
    this._applyVerticalZoom();
    this.drawWaveform();
    this.renderHeaders();
    this.renderTimeline();
    this.renderRuler();
    this.renderPreview();
    this.syncPlayhead();
    this.renderLoopRegion();
    this.ui.modeIndicator.textContent=`TRACKS: ${this.project.tracks.length}`;
  },
  _applyVerticalZoom(){
    const wh=Math.round(80*this.verticalZoom), row=Math.round(56*this.verticalZoom), lh=Math.round(34*this.verticalZoom);
    this.ui.waveCanvas.style.height=wh+'px';
    this.ui.tracksContainer.style.top=(wh+60)+'px';
    this.ui.tracksContainer.style.minHeight=((this.project.tracks.length||2)*row+220)+'px';
    document.documentElement.style.setProperty('--trkH',lh+'px');
    document.documentElement.style.setProperty('--trkGap',row+'px');
  },

  /* ── ruler ── */
  clearCanvas(c){ c.width=1; c.height=1 },
  rulerStep(){ const p=this.zoom; return p>=200?.5:p>=80?1:p>=30?2:p>=12?5:10 },
  rulerTime(t){ const m=Math.floor(t/60),s=(t%60).toFixed(1); return m+':'+(+s<10?'0':'')+s },
  renderRuler(){
    if(!this.duration){this.clearCanvas(this.ui.rulerCanvas);this.clearCanvas(this.ui.gridCanvas);return}
    const r=this.ui.rulerCanvas, g=this.ui.gridCanvas,
          rx=r.getContext('2d'), gx=g.getContext('2d'),
          w=Math.ceil(this.duration*this.zoom),
          gh=this.ui.tracksContainer.offsetTop+this.ui.tracksContainer.offsetHeight+200,
          step=this.rulerStep();
    r.width=w; r.height=30; g.width=w; g.height=gh;
    rx.clearRect(0,0,w,30); gx.clearRect(0,0,w,gh);
    rx.fillStyle='#b1b8c7'; rx.font='10px Segoe UI'; rx.textBaseline='top';
    gx.strokeStyle='rgba(255,255,255,.05)';
    for(let t=0;t<=this.duration+.0001;t+=step){
      const px=t*this.zoom, major=!(Math.round(t/step)%2), top=major?12:18;
      rx.fillRect(Math.round(px)+.5,top,1,30-top);
      if(major)rx.fillText(this.rulerTime(t),px+3,2);
      gx.beginPath(); gx.moveTo(Math.round(px)+.5,0); gx.lineTo(Math.round(px)+.5,gh); gx.stroke();
    }
  },

  /* ── track headers ── */
  renderHeaders(){
    const c=this.ui.trackHeaders; c.innerHTML='';
    const wh=Math.round(80*this.verticalZoom), row=Math.round(56*this.verticalZoom);
    const len=this.project.tracks.length;
    this.project.tracks.forEach((tr,i)=>{
      const div=document.createElement('div');
      div.className='track-head'+(tr.id===this.project.activeTrackId?' active':'')+(this.collapsed[tr.id]?' collapsed':'');
      div.style.top=(wh+30+i*row)+'px'; div.dataset.tid=tr.id;
      const dot=document.createElement('div');
      dot.className='track-color-dot'; dot.style.background=tr.color||'#1e88e5';
      dot.title='Изменить цвет/имя'; dot.onclick=()=>this.openRenameModal(tr.id);
      const nm=document.createElement('span'); nm.className='nm'; nm.textContent=tr.name;
      nm.title='Двойной клик — переименовать'; nm.ondblclick=()=>this.openRenameModal(tr.id);
      const tp=document.createElement('span'); tp.className='tp'; tp.textContent=tr.type.toUpperCase();
      const mk=(lbl,cls,title,cb)=>{
        const b=document.createElement('button'); b.textContent=lbl; b.className=cls; b.title=title; b.onclick=cb; return b;
      };
      const bV=mk('V',tr.visible?'on':'','Показать/скрыть',()=>this.toggleTrackProp(tr.id,'visible'));
      const bMu=mk('M',tr.muted?'locked':'','Mute',()=>this.toggleTrackProp(tr.id,'muted'));
      const bS=mk('S',tr.solo?'sol':'','Solo',()=>this.toggleTrackProp(tr.id,'solo'));
      const bL=mk('L',tr.locked?'locked':'','Lock',()=>this.toggleTrackProp(tr.id,'locked'));
      const bE=mk('E',tr.id===this.project.activeTrackId?'on':'','Active',()=>this.setActiveTrack(tr.id));
      const bC=mk(this.collapsed[tr.id]?'▶':'▼','col-btn','Collapse',()=>this.toggleCollapse(tr.id));
      const bUp=mk('▲','','Переместить вверх',()=>this.reorderTrack(i,-1));
      const bDn=mk('▼','','Переместить вниз',()=>this.reorderTrack(i,1));
      const bDel=mk('✕','','Удалить дорожку',()=>this.deleteTrackById(tr.id));
      if(i===0)bUp.disabled=true;
      if(i===len-1)bDn.disabled=true;
      div.append(dot,nm,tp,bV,bMu,bS,bL,bE,bC,bUp,bDn,bDel);
      c.appendChild(div);
    });
  },
  toggleTrackProp(id,prop){
    const tr=this.trackById(id); if(!tr)return;
    tr[prop]=!tr[prop];
    this.markDirty(); this.renderHeaders(); this.renderTimeline(); this.renderPreview();
  },
  setActiveTrack(id){
    this.project.activeTrackId=id; this.clearSelection();
    this.renderHeaders(); this.renderTimeline(); this.renderInspector();
  },
  toggleCollapse(id){ this.collapsed[id]=!this.collapsed[id]; this.renderHeaders(); this.renderTimeline() },
  openRenameModal(id){
    const tr=this.trackById(id); if(!tr)return;
    this._renamingId=id;
    this.ui.renameInput.value=tr.name; this.ui.renameColor.value=tr.color||'#1e88e5';
    this.ui.btnRenameOk.onclick=()=>this.applyRename();
    this.ui.renameModal.classList.remove('hidden');
    setTimeout(()=>this.ui.renameInput.focus(),80);
  },
  applyRename(){
    const tr=this.trackById(this._renamingId); if(!tr)return;
    tr.name=this.ui.renameInput.value.trim()||tr.type;
    tr.color=this.ui.renameColor.value;
    this.ui.renameModal.classList.add('hidden'); this.markDirty(); this.renderHeaders();
  },
  reorderTrack(idx,dir){
    const t=this.project.tracks, ni=idx+dir;
    if(ni<0||ni>=t.length)return;
    this.pushHistory('Reorder Track');
    [t[idx],t[ni]]=[t[ni],t[idx]];
    this.markDirty(); this.fullRender();
  },
  deleteTrackById(id){
    const tr=this.trackById(id); if(!tr)return;
    if(!confirm(`Удалить дорожку "${tr.name}" со всеми элементами?`))return;
    this.pushHistory('Delete Track');
    this.project.tracks=this.project.tracks.filter(t=>t.id!==id);
    if(this.project.activeTrackId===id)this.project.activeTrackId=this.project.tracks[0]?.id||null;
    if(this.selected.trackId===id)this.clearSelection();
    this.markDirty(); this.fullRender();
  },
  deleteActiveTrack(){ const tr=this.activeTrack(); if(tr)this.deleteTrackById(tr.id) },

  /* ── timeline render ── */
  getVisibleTracks(){
    const solo=this.project.tracks.some(t=>t.solo);
    return this.project.tracks.filter(tr=>tr.visible&&!tr.muted&&(!solo||tr.solo)&&!this.collapsed[tr.id]);
  },
  visibleItems(tr,layerM){
    if(tr.type==='line')return tr.items;
    if(layerM==='line')return tr.items.filter(i=>i.kind==='line');
    if(layerM==='word')return tr.items.filter(i=>i.kind==='word');
    if(layerM==='char'){
      const out=[];
      tr.items.filter(i=>i.kind==='word').forEach(w=>{
        (w.chars||[]).forEach(ch=>out.push({
          id:w.id+'_C_'+ch.c, kind:'char',
          start:this.num(ch.start,w.start), end:this.num(ch.end,w.end),
          text:ch.c, _parent:w
        }));
      });
      return out;
    }
    return tr.items;
  },
  _conflictCache:null,
  conflictClass(tr,it){
    if(!this._conflictCache)this._conflictCache=new WeakMap();
    if(!this._conflictCache.has(tr)){
      const s=new Set();
      ['line','word','char'].forEach(k=>{
        const its=tr.items.filter(i=>i.kind===k).sort((a,b)=>a.start-b.start);
        for(let i=1;i<its.length;i++)
          if(its[i].start<its[i-1].end-1e-6){s.add(its[i].id);s.add(its[i-1].id)}
      });
      this._conflictCache.set(tr,s);
    }
    return this._conflictCache.get(tr).has(it.id)?' conflict':'';
  },
  itemBg(it,tr,color){
    const a=it.kind==='line'?.28:.22;
    return color.startsWith('#')?this.hexToRgba(color,a):`rgba(30,136,229,${a})`;
  },

  renderTimeline(){
    this._conflictCache=new WeakMap();
    const c=this.ui.tracksContainer; c.innerHTML='';
    if(!this.project.tracks.length||!this.duration)return;
    const w=Math.ceil(this.duration*this.zoom);
    const row=Math.round(56*this.verticalZoom), lh=Math.round(34*this.verticalZoom);
    const layerM=this.ui.layerMode.value;
    const sc=this.ui.timelineContainer;
    const vpL=sc.scrollLeft/this.zoom, vpR=(sc.scrollLeft+sc.clientWidth)/this.zoom, vpM=2;
    const ripple=this._rippleAffected||new Set();
    const rollIds=new Set();
    if(this.drag.active&&this.drag.rollPair){
      rollIds.add(this.drag.rollPair.a.id); rollIds.add(this.drag.rollPair.b.id);
    }
    this.getVisibleTracks().forEach(tr=>{
      const ti=this.project.tracks.indexOf(tr);
      const color=tr.color||(tr.type==='line'?'#1e88e5':'#43a047');
      const trackTop=ti*row;
      const bg=document.createElement('div');
      bg.style.cssText=`position:absolute;left:0;top:${trackTop}px;height:${row-4}px;width:${w}px;background:rgba(255,255,255,.018);border-bottom:1px solid rgba(255,255,255,.05);pointer-events:none`;
      c.appendChild(bg);
      const isActive=tr.id===this.project.activeTrackId&&!tr.locked;
      this.visibleItems(tr,layerM).forEach(it=>{
        if(it.end<vpL-vpM||it.start>vpR+vpM)return;
        const el=this._createItemEl(tr,it,trackTop,lh,color,isActive);
        if(ripple.has(it.id))el.classList.add('ripple-affected');
        if(rollIds.has(it.id))el.classList.add('roll-pair');
        if(this._dragClamped&&this.drag.active&&this.selected.ids.has(it.id))el.classList.add('drag-clamped');
        c.appendChild(el);
      });
    });
  },

  _createItemEl(tr,it,trackTop,lh,color,isActive){
    const px=it.start*this.zoom, pw=(it.end-it.start)*this.zoom;
    const isSel=this.selected.trackId===tr.id&&this.selected.ids.has(it.id);
    const div=document.createElement('div');
    let cls='track-item item-'+it.kind;
    if(isSel)cls+=' selected';
    if(!isActive&&tr.locked)cls+=' locked-ref';
    if(isActive)cls+=' editable-active';
    cls+=this.conflictClass(tr,it);
    div.className=cls;
    div.style.cssText=`left:${px}px;width:${Math.max(4,pw)}px;`+
      `top:${trackTop+(it.kind==='line'?0:lh*.55)}px;`+
      `height:${lh*(it.kind==='line'?.45:.42)}px;`+
      `font-size:${Math.round(11*this.verticalZoom)}px`;
    div.style.borderColor=color; div.style.background=this.itemBg(it,tr,color);
    div.title=it.text; div.dataset.id=it.id; div.dataset.tid=tr.id;
    if(isActive){
      const lhEl=document.createElement('div');
      lhEl.className='handle left'; lhEl.dataset.side='left'; lhEl.dataset.id=it.id; lhEl.dataset.tid=tr.id;
      const rhEl=document.createElement('div');
      rhEl.className='handle right'; rhEl.dataset.side='right'; rhEl.dataset.id=it.id; rhEl.dataset.tid=tr.id;
      div.append(lhEl,rhEl);
      div.addEventListener('mousedown',e=>{
        if(e.target.classList.contains('handle'))return;
        e.stopPropagation();
        if(!e.shiftKey&&!(this.selected.trackId===tr.id&&this.selected.ids.has(it.id))){
          this.clearSelection(); this.selectItem(tr.id,it.id);
        }else if(e.shiftKey){this.selectItem(tr.id,it.id)}
        const sel=[...this.selected.ids].map(sid=>{
          const si=this.itemById(tr.id,sid); return si?{item:si,origStart:si.start,origEnd:si.end}:null;
        }).filter(Boolean);
        this.drag={active:true,type:'move',trackId:tr.id,itemId:it.id,startX:e.clientX,
          initial:{start:it.start,end:it.end},sel,mode:this.ui.dragMode.value,rollPair:null};
        this._dragClamped=false; this._rippleAffected=new Set();
        this._showDragBadge(this.drag.mode);
      });
    }
    const lbl=document.createElement('span'); lbl.textContent=it.text; lbl.style.pointerEvents='none';
    div.appendChild(lbl);
    return div;
  },

  /* ── drag badge ── */
  _showDragBadge(mode){
    this._hideDragBadge(); if(mode==='free')return;
    const b=document.createElement('div'); b.className='drag-mode-badge';
    b.textContent=mode==='keep'?'NO-OVERLAP':mode==='roll'?'ROLL TRIM':'RIPPLE';
    document.body.appendChild(b); this._dragModeBadge=b;
  },
  _hideDragBadge(){ if(this._dragModeBadge){this._dragModeBadge.remove();this._dragModeBadge=null} },

  /* ── snap ── */
  snapToItemEdges(value,tr,excludeIds){
    if(!tr)return value;
    const thr=8/this.zoom; let best=value, bestD=thr;
    tr.items.forEach(it=>{
      if(excludeIds&&excludeIds.has(it.id))return;
      [it.start,it.end].forEach(edge=>{
        const d=Math.abs(value-edge);
        if(d<bestD){bestD=d;best=edge}
      });
    });
    return best;
  },
  applySnap(raw,excludeIds,tr){
    if(this.snapStep==='items')return this.snapToItemEdges(raw,tr,excludeIds);
    if(this.snapStep)return Math.round(raw/this.snapStep)*this.snapStep;
    return raw;
  },

  /* ── mouse: timeline mousedown ── */
  handleTimelineMouseDown(e){
    if(e.button===2||e.target.classList.contains('playhead-handle')||e.target.closest('#track-headers'))return;
    const handle=e.target.closest('.handle'), item=e.target.closest('.track-item');
    if(handle){
      e.preventDefault(); e.stopPropagation();
      const {side,id,tid}=handle.dataset;
      const tr=this.trackById(tid), it=this.itemById(tid,id); if(!tr||!it)return;
      const mode=this.ui.dragMode.value;
      this.drag={active:true,type:'handle',trackId:tid,itemId:id,side,startX:e.clientX,
        initial:{start:it.start,end:it.end},sel:[],
        rollPair:mode==='roll'?this.findRollPair(tr,it,side):null,
        mode, origMid:side==='right'?it.end:it.start};
      this._dragClamped=false; this._rippleAffected=new Set(); this._showDragBadge(mode); return;
    }
    if(item){
      const {id,tid}=item.dataset;
      const tr=this.trackById(tid), it=this.itemById(tid,id); if(!tr||!it)return;
      if(!e.shiftKey&&!(this.selected.trackId===tid&&this.selected.ids.has(id))){
        this.clearSelection(); this.selectItem(tid,id);
      }else if(e.shiftKey){this.selectItem(tid,id)}
      const sel=this.selected.trackId===tid
        ?[...this.selected.ids].map(sid=>{const si=this.itemById(tid,sid);return si?{item:si,origStart:si.start,origEnd:si.end}:null}).filter(Boolean)
        :[{item:it,origStart:it.start,origEnd:it.end}];
      this.drag={active:true,type:'move',trackId:tid,itemId:id,startX:e.clientX,
        initial:{start:it.start,end:it.end},sel,mode:this.ui.dragMode.value,rollPair:null};
      this._dragClamped=false; this._rippleAffected=new Set(); this._showDragBadge(this.drag.mode); return;
    }
    if(e.target===this.ui.rulerCanvas){
      const rect=this.ui.scrollArea.getBoundingClientRect();
      const px=e.clientX-rect.left+this.ui.timelineContainer.scrollLeft;
      const t=Math.max(0,px/this.zoom);
      if(e.shiftKey){this._loopDrag={active:true,startT:t};this.loop={enabled:false,start:t,end:t};return}
      this.audioElement.currentTime=t; this.syncPlayhead(); return;
    }
    if(e.target===this.ui.scrollArea||e.target===this.ui.tracksContainer||
       e.target.closest('.tracks')===this.ui.tracksContainer){
      this.marquee={active:true,startX:e.clientX,startY:e.clientY};
      this.ui.selectionBox.classList.remove('hidden');
    }
  },

  /* ── mouse: global move / up ── */
  handleGlobalMouseMove(e){
    if(this.playheadDrag.active){this.handlePlayheadDragMove(e);return}
    if(this.charDrag.active){this._handleCharDragMove(e);return}
    if(this._loopDrag?.active){this.handleLoopDragMove(e);return}
    if(this.drag.active){this._handleMainDragMove(e);return}
    if(this.marquee.active){this._handleMarqueeMove(e);return}
    if(this.resize.active)this._handleResize(e);
  },
  handleGlobalMouseUp(){
    this._hideDragBadge();
    if(this.playheadDrag.active){this.playheadDrag.active=false;document.body.style.cursor='';return}
    if(this.charDrag.active){this._commitCharDrag();return}
    if(this.drag.active){
      this.sortActiveTrack(); this.normalizeTrackAfterEdit(this.activeTrack());
      this.pushHistory('Drag'); this.markDirty();
      this.drag={active:false}; this._dragClamped=false; this._rippleAffected=new Set();
      this.afterEdit(); return;
    }
    if(this._loopDrag?.active){
      this._loopDrag.active=false;
      if(this.loop.end-this.loop.start<.05)this.loop.enabled=false;
      this.renderLoopRegion(); return;
    }
    if(this.marquee.active){
      this._finalizeMarquee(); this.marquee.active=false;
      this.ui.selectionBox.classList.add('hidden'); return;
    }
    if(this.resize.active){
      this.resize.active=false; document.body.style.cursor='';
      this.resize.el?.classList.remove('active'); this.persistUiPrefs();
    }
  },

  _handleMainDragMove(e){
    const dx=(e.clientX-this.drag.startX)/this.zoom;
    const tr=this.trackById(this.drag.trackId); if(!tr)return;
    const mode=this.drag.mode||'free';
    this._dragClamped=false;
    if(this.drag.type==='move'){
      let raw=dx;
      const selIds=new Set(this.drag.sel.map(s=>s.item.id));
      if(this.snapStep==='items'){
        const ref=this.drag.sel[0];
        if(ref)raw=this.snapToItemEdges(ref.origStart+dx,tr,selIds)-ref.origStart;
      }else if(this.snapStep){raw=Math.round(dx/this.snapStep)*this.snapStep}
      this.drag.sel.forEach(s=>{raw=Math.max(raw,-s.origStart)});
      this._rippleAffected=new Set();
      if(mode==='free')this.applyFreeMove(this.drag.sel,raw);
      else if(mode==='ripple')this.applyRippleMove(tr,this.drag.sel,raw);
      else this.applyNoOverlapMove(tr,this.drag.sel,raw);
    }else if(this.drag.type==='handle'){
      const it=this.itemById(this.drag.trackId,this.drag.itemId); if(!it)return;
      const rp=this.drag.rollPair; this._rippleAffected=new Set();
      if(rp&&mode==='roll'){
        let mid=this.drag.origMid+dx;
        mid=this.applySnap(mid,new Set([rp.a.id,rp.b.id]),tr);
        this.applyRollTrim(rp,mid);
      }else{
        let raw=this.drag.side==='left'?this.drag.initial.start+dx:this.drag.initial.end+dx;
        raw=this.applySnap(raw,new Set([this.drag.itemId]),tr);
        this.applyHandleTrim(tr,it,this.drag.side,raw,mode);
      }
    }
    this.renderTimeline(); this.renderInspector();
    clearTimeout(this._dragPreviewDebounce);
    this._dragPreviewDebounce=setTimeout(()=>this.renderPreview(),80);
  },

  _handleMarqueeMove(e){
    const rect=this.ui.scrollArea.getBoundingClientRect();
    const x1=Math.min(e.clientX,this.marquee.startX)-rect.left, x2=Math.max(e.clientX,this.marquee.startX)-rect.left;
    const y1=Math.min(e.clientY,this.marquee.startY)-rect.top,  y2=Math.max(e.clientY,this.marquee.startY)-rect.top;
    const sb=this.ui.selectionBox;
    sb.style.left=(x1+this.ui.timelineContainer.scrollLeft)+'px';
    sb.style.top=(y1+this.ui.timelineContainer.scrollTop)+'px';
    sb.style.width=(x2-x1)+'px'; sb.style.height=(y2-y1)+'px';
  },

  _finalizeMarquee(){
    const sb=this.ui.selectionBox;
    if(!sb||sb.classList.contains('hidden'))return;
    const sl=parseInt(sb.style.left)||0, st=parseInt(sb.style.top)||0;
    const sr=sl+(parseInt(sb.style.width)||0), sb2=st+(parseInt(sb.style.height)||0);
    if(sr-sl<4&&sb2-st<4){this.afterEdit();return}
    const row=Math.round(56*this.verticalZoom), lh=Math.round(34*this.verticalZoom);
    // использует реальный top из tracksContainer вместо захардкоженного
    const trkTop0=parseInt(this.ui.tracksContainer.style.top)||120;
    let hitTid=null;
    this.getVisibleTracks().forEach(tr=>{
      const ti=this.project.tracks.indexOf(tr);
      const tTop=trkTop0+ti*row, tBot=tTop+lh;
      if(st<tBot&&sb2>tTop)hitTid=tr.id;
    });
    const targetId=hitTid||this.project.activeTrackId;
    const tr=this.trackById(targetId); if(!tr)return;
    const ti=this.project.tracks.indexOf(tr);
    const tTop=trkTop0+ti*row;
    tr.items.forEach(it=>{
      const ix=it.start*this.zoom, iw=Math.max(4,(it.end-it.start)*this.zoom);
      if(ix<sr&&ix+iw>sl&&tTop<sb2&&tTop+lh>st){
        if(this.selected.trackId&&this.selected.trackId!==targetId)return;
        this.selected.trackId=targetId; this.selected.ids.add(it.id);
      }
    });
    this.renderTimeline(); this.renderInspector();
  },

  /* ── resizer ── */
  startResize(e,target){
    e.preventDefault();
    const el=target==='sidebar'?this.ui.sidebarResizer:this.ui.previewResizer;
    el?.classList.add('active');
    this.resize={active:true,target,startX:e.clientX,startY:e.clientY,el,
      startDim:target==='sidebar'?this.ui.sidebar.offsetWidth:this.ui.inspectorPanel.offsetHeight};
    document.body.style.cursor=target==='sidebar'?'col-resize':'row-resize';
  },
  _handleResize(e){
    const {target,startX,startY,startDim}=this.resize;
    if(target==='sidebar'){
      this.ui.sidebar.style.width=Math.max(260,Math.min(820,startDim-(e.clientX-startX)))+'px';
    }else{
      const h=Math.max(130,Math.min(600,startDim+(e.clientY-startY)));
      this.ui.inspectorPanel.style.flex='none'; this.ui.inspectorPanel.style.height=h+'px';
    }
  },

  /* ── TRIM ENGINE v2: neighbor discovery ── */
  getOrderedKindItems(tr,kind){
    return tr.items.filter(i=>i.kind===kind).sort((a,b)=>a.start-b.start);
  },
  getPrevOrderedNeighbor(tr,it,excludeSet){
    const same=this.getOrderedKindItems(tr,it.kind), idx=same.findIndex(x=>x.id===it.id);
    for(let i=idx-1;i>=0;i--){if(!excludeSet||!excludeSet.has(same[i].id))return same[i]}
    return null;
  },
  getNextOrderedNeighbor(tr,it,excludeSet){
    const same=this.getOrderedKindItems(tr,it.kind), idx=same.findIndex(x=>x.id===it.id);
    for(let i=idx+1;i<same.length;i++){if(!excludeSet||!excludeSet.has(same[i].id))return same[i]}
    return null;
  },
  getPrevNeighbor(tr,it,excludeSet){
    const same=this.getOrderedKindItems(tr,it.kind);
    for(let i=same.length-1;i>=0;i--){
      if(same[i].id===it.id||(excludeSet&&excludeSet.has(same[i].id)))continue;
      if(same[i].end<=it.start+1e-9)return same[i];
    }
    return null;
  },
  getNextNeighbor(tr,it,excludeSet){
    const same=this.getOrderedKindItems(tr,it.kind);
    for(let i=0;i<same.length;i++){
      if(same[i].id===it.id||(excludeSet&&excludeSet.has(same[i].id)))continue;
      if(same[i].start>=it.end-1e-9)return same[i];
    }
    return null;
  },
  getOuterItems(tr,kind,selIds){
    return tr.items.filter(i=>i.kind===kind&&!selIds.has(i.id)).sort((a,b)=>a.start-b.start);
  },

  /* ── TRIM ENGINE v2: move ── */
  computeGroupMoveLimit(tr,sel,rawDelta){
    const selIds=new Set(sel.map(s=>s.item.id)); let d=rawDelta;
    const byKind={};
    sel.forEach(s=>{const k=s.item.kind;(byKind[k]=byKind[k]||[]).push(s)});
    Object.entries(byKind).forEach(([kind,grp])=>{
      const others=this.getOuterItems(tr,kind,selIds); if(!others.length)return;
      const gMin=Math.min(...grp.map(s=>s.origStart)), gMax=Math.max(...grp.map(s=>s.origEnd));
      if(d>0){
        for(const o of others){if(o.start>=gMax-1e-9){d=Math.min(d,o.start-gMax);break}}
      }else if(d<0){
        for(let j=others.length-1;j>=0;j--){if(others[j].end<=gMin+1e-9){d=Math.max(d,others[j].end-gMin);break}}
      }
    });
    return Math.max(d,-Math.min(...sel.map(s=>s.origStart)));
  },
  applyFreeMove(sel,delta){
    sel.forEach(s=>{s.item.start=Math.max(0,s.origStart+delta);s.item.end=s.item.start+(s.origEnd-s.origStart)});
  },
  applyNoOverlapMove(tr,sel,rawDelta){
    const d=this.computeGroupMoveLimit(tr,sel,rawDelta);
    sel.forEach(s=>{s.item.start=Math.max(0,s.origStart+d);s.item.end=s.item.start+(s.origEnd-s.origStart)});
    this._dragClamped=Math.abs(d-rawDelta)>1e-6;
  },
  applyRippleMove(tr,sel,rawDelta){
    const selIds=new Set(sel.map(s=>s.item.id));
    const d=Math.max(rawDelta,-Math.min(...sel.map(s=>s.origStart)));
    sel.forEach(s=>{s.item.start=Math.max(0,s.origStart+d);s.item.end=s.item.start+(s.origEnd-s.origStart)});
    const byKind={};
    sel.forEach(s=>{const k=s.item.kind;(byKind[k]=byKind[k]||[]).push(s)});
    this._rippleAffected=new Set();
    Object.entries(byKind).forEach(([kind,grp])=>{
      const others=this.getOuterItems(tr,kind,selIds);
      if(d>0)this._chainPushRight(others,Math.max(...grp.map(s=>s.item.end)));
      else if(d<0)this._chainPushLeft(others,Math.min(...grp.map(s=>s.item.start)));
    });
  },
  _chainPushRight(sortedItems,boundary){
    for(const o of sortedItems){
      if(o.start<boundary-1e-9){const p=boundary-o.start;o.start+=p;o.end+=p;this._rippleAffected.add(o.id)}
      boundary=Math.max(boundary,o.end);
    }
  },
  _chainPushLeft(sortedItems,boundary){
    for(let j=sortedItems.length-1;j>=0;j--){
      const o=sortedItems[j];
      if(o.end>boundary+1e-9){
        const dur=o.end-o.start;
        const shift=o.end-boundary;
        o.start=Math.max(0,o.start-shift);
        o.end=o.start+dur;
        this._rippleAffected.add(o.id);
      }
      boundary=Math.min(boundary,o.start);
    }
  },

  /* ── TRIM ENGINE v2: handle trim ── */
  applyHandleTrim(tr,it,side,raw,mode){
    side==='left'?this._trimLeft(tr,it,raw,mode):this._trimRight(tr,it,raw,mode);
  },
  _trimLeft(tr,it,raw,mode){
    raw=Math.max(0,Math.min(raw,it.end-this.MIN_DUR));
    if(mode==='keep'){const pr=this.getPrevNeighbor(tr,it);if(pr)raw=Math.max(raw,pr.end);it.start=raw;}
    else if(mode==='ripple'){
      const old=it.start; it.start=raw;
      if(raw<old){const oth=this.getOuterItems(tr,it.kind,new Set([it.id]));this._rippleAffected=new Set();this._chainPushLeft(oth,raw)}
    }else{it.start=raw}
  },
  _trimRight(tr,it,raw,mode){
    raw=Math.max(it.start+this.MIN_DUR,raw);
    if(mode==='keep'){const nx=this.getNextNeighbor(tr,it);if(nx)raw=Math.min(raw,nx.start);it.end=raw;}
    else if(mode==='ripple'){
      const old=it.end; it.end=raw;
      if(raw>old){const oth=this.getOuterItems(tr,it.kind,new Set([it.id]));this._rippleAffected=new Set();this._chainPushRight(oth,raw)}
    }else{it.end=raw}
  },

  /* ── TRIM ENGINE v2: roll trim ── */
  findRollPair(tr,it,side){
    const THRESH=0.5;
    if(side==='right'){const nx=this.getNextOrderedNeighbor(tr,it);if(nx&&Math.abs(it.end-nx.start)<THRESH)return{a:it,b:nx}}
    else{const pr=this.getPrevOrderedNeighbor(tr,it);if(pr&&Math.abs(pr.end-it.start)<THRESH)return{a:pr,b:it}}
    return null;
  },
  applyRollTrim(rp,rawMid){
    const mid=Math.max(rp.a.start+this.MIN_DUR,Math.min(rp.b.end-this.MIN_DUR,rawMid));
    rp.a.end=mid; rp.b.start=mid;
  },

  /* ── group stretch ── */
  stretchSelectionEdge(side,delta){
    const b=this.getSelectionBounds(); if(!b)return;
    const {items,minStart,maxEnd,tr}=b, span=maxEnd-minStart; if(span<.04)return;
    const mode=this.ui.dragMode.value, selIds=new Set(items.map(i=>i.id));
    this.applyTrackEdit(tr,'Group Stretch',()=>{
      if(side==='left'){
        let nMin=Math.max(0,minStart+delta);
        if(mode==='keep'||mode==='ripple'){
          new Set(items.map(i=>i.kind)).forEach(kind=>{
            const oth=this.getOuterItems(tr,kind,selIds);
            for(let j=oth.length-1;j>=0;j--){
              if(oth[j].end<=minStart+1e-9){if(mode==='keep')nMin=Math.max(nMin,oth[j].end);break}
            }
          });
        }
        const ratio=(maxEnd-nMin)/span;
        items.forEach(it=>{it.start=nMin+(it.start-minStart)*ratio;it.end=nMin+(it.end-minStart)*ratio});
      }else{
        let nMax=Math.max(minStart+.04,maxEnd+delta);
        if(mode==='keep'){
          new Set(items.map(i=>i.kind)).forEach(kind=>{
            const oth=this.getOuterItems(tr,kind,selIds);
            for(const o of oth){if(o.start>=maxEnd-1e-9){nMax=Math.min(nMax,o.start);break}}
          });
        }
        const ratio=(nMax-minStart)/span;
        items.forEach(it=>{it.start=minStart+(it.start-minStart)*ratio;it.end=minStart+(it.end-minStart)*ratio});
        if(mode==='ripple'&&nMax>maxEnd){
          new Set(items.map(i=>i.kind)).forEach(kind=>{
            this._chainPushRight(this.getOuterItems(tr,kind,selIds),nMax);
          });
        }
      }
    });
  },
});
