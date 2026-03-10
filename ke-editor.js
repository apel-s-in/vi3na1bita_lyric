'use strict';
/* ── ke-editor.js: edit ops, inspector, preview, export, session, validation ── */
Object.assign(App, {

  /* ── track loading ── */
  async loadTrackJSON(file,forceType){
    if(!file)return;
    try{
      const raw=JSON.parse(await file.text());
      const track=this.normalizeTrack(raw,forceType,this.base(file.name));
      const idx=this.project.tracks.findIndex(t=>t.type===track.type);
      if(idx>=0)this.project.tracks[idx]=track; else this.project.tracks.push(track);
      if(!this.project.activeTrackId||!this.activeTrack()||this.activeTrack().locked)
        this.project.activeTrackId=track.id;
      this.pushHistory('Load Track'); this.markDirty(false); this.fullRender();
    }catch(e){console.error(e);alert('Невалидный JSON: '+e.message)}
  },
  normalizeTrack(raw,forceType,name){
    const t={id:'T_'+this.uid(),type:forceType,name:name||forceType,
             visible:true,solo:false,locked:false,muted:false,items:[]};
    if(forceType==='line'){
      if(!Array.isArray(raw)||!raw.length||!('time'in raw[0]))throw Error('bad line json');
      raw.forEach((d,i)=>{
        const s=this.num(d.time,0),n=raw[i+1]?this.num(raw[i+1].time,s+2):s+2;
        t.items.push({id:'L_'+this.uid(),kind:'line',start:s,end:Math.max(s+.15,n-.05),
          text:typeof d.line==='string'?d.line:''});
      });
    }else{
      if(!Array.isArray(raw)||!raw.length||!('start'in raw[0])||!('words'in raw[0]))throw Error('bad words json');
      raw.forEach(line=>{
        const lid='L_'+this.uid(),ls=this.num(line.start,0),le=this.num(line.end,ls+.5);
        t.items.push({id:lid,kind:'line',start:ls,end:Math.max(ls+.05,le),
          text:typeof line.line==='string'?line.line:'',lineId:lid});
        (line.words||[]).forEach(w=>{
          const ws=this.num(w.start,ls),we=this.num(w.end,ws+.1);
          t.items.push({id:'W_'+this.uid(),kind:'word',lineId:lid,start:ws,end:Math.max(ws+.03,we),
            text:typeof w.w==='string'?w.w:'',chars:Array.isArray(w.chars)?w.chars:[]});
        });
      });
      this.recalcTrackLines(t);
    }
    this.sortTrack(t); return t;
  },
  recalcTrackLines(tr){
    const lines=tr.items.filter(i=>i.kind==='line').sort((a,b)=>a.start-b.start);
    tr.items.filter(i=>i.kind==='word').forEach(w=>{
      if(!w.lineId){
        const line=lines.find(l=>w.start>=l.start&&w.end<=l.end+.1);
        w.lineId=line?.id||null;
      }
    });
  },

  /* ── inspector ── */
  renderInspector(){
    const c=this.ui.inspectorContent;
    if(!this.selected.trackId||!this.selected.ids.size){c.innerHTML='<p class="muted">Выберите элемент(ы)</p>';return}
    const tr=this.trackById(this.selected.trackId);
    const isRO=!tr||tr.locked||tr.id!==this.project.activeTrackId;
    const ids=[...this.selected.ids];
    const items=ids.map(id=>this.itemById(this.selected.trackId,id)).filter(Boolean);
    if(!items.length){c.innerHTML='<p class="muted">Нет данных</p>';return}
    if(isRO&&ids.length===1){
      const it=items[0];
      c.innerHTML=`<div style="border:1px solid #4a3200;border-radius:6px;padding:8px;background:rgba(255,152,0,.06);margin-bottom:8px;font-size:11px;color:#ff9800">🔒 Readonly</div>
        <div class="igr"><label>ID</label><span class="muted">${it.id}</span></div>
        <div class="igr"><label>Тип</label><span>${it.kind} / ${tr?.name||''}</span></div>
        <div class="igr"><label>Start</label><span>${it.start.toFixed(3)}s</span></div>
        <div class="igr"><label>End</label><span>${it.end.toFixed(3)}s</span></div>
        <div class="igr"><label>Duration</label><span>${(it.end-it.start).toFixed(3)}s</span></div>
        <div class="igr"><label>Text</label><span>${this.esc(it.text)}</span></div>`;
      return;
    }
    if(ids.length===1){
      const it=items[0],isW=tr.type==='words';
      let html=`<div class="igr"><label>ID</label><span class="muted">${it.id}</span></div>
        <div class="igr"><label>Тип</label><span>${it.kind} / дорожка: ${tr.name}</span></div>
        <div class="irow">
          <div class="igr"><label>Start (s)</label><input type="number" step="0.01" id="ins-start" value="${it.start.toFixed(3)}"></div>
          <div class="igr"><label>End (s)</label><input type="number" step="0.01" id="ins-end" value="${it.end.toFixed(3)}"></div>
        </div>
        <div class="igr"><label>Duration: ${(it.end-it.start).toFixed(3)}s</label></div>
        <div class="igr"><label>Text</label><input type="text" id="ins-text" value="${this.esc(it.text)}"></div>`;
      if(it.kind==='word'&&isW){
        html+=`<div class="igr"><label>Chars</label>${this._renderCharsInspector(it)}</div>
          <div class="iact">
            <button class="btn" id="ins-rebuild-chars">↺ Rebuild Chars</button>
            <button class="btn" id="ins-chars-dist">Distribute Evenly</button>
          </div>`;
      }
      html+=`<div class="iact">
          <button class="btn pri" id="ins-apply">Apply</button>
          <button class="btn" id="ins-split">✂ Split</button>
          <button class="btn" id="ins-merge-prev">⊲ Mrg Prev</button>
          <button class="btn" id="ins-merge-next">Mrg Next ⊳</button>
          <button class="btn" id="ins-dup">⧉ Dup</button>
          <button class="btn" id="ins-del">🗑 Del</button>
        </div>
        ${it.kind==='line'&&isW?`<div class="iact"><button class="btn" id="ins-words-from-line">→ Words from Line</button></div>`:''}
        ${it.kind==='word'&&isW?`<div class="iact"><button class="btn" id="ins-line-from-words">→ Collapse to Line</button></div>`:''}`;
      c.innerHTML=html;
      this._bindInspectorSingle(tr,it);
    }else{
      const totalDur=items.reduce((s,i)=>s+(i.end-i.start),0).toFixed(3);
      c.innerHTML=`<div class="igr"><label>Выбрано: ${items.length}</label></div>
        <div class="igr"><label>Суммарная длительность: ${totalDur}s</label></div>
        <div class="batch-box"><h4>Batch: сдвиг всех</h4>
          <div class="batch-row"><input type="number" step="0.01" id="batch-delta" placeholder="секунды"><button class="btn" id="batch-move">Сдвинуть</button></div>
          <div class="batch-row"><input type="number" step="0.01" id="batch-dur" placeholder="длительность"><button class="btn" id="batch-norm">Нормализовать</button></div>
          <div class="batch-row"><input type="number" step="0.01" id="batch-gap" placeholder="отступ" value="0"><button class="btn" id="batch-close">Закрыть пробелы</button></div>
        </div>
        <div class="iact">
          <button class="btn" id="batch-dist">Distribute Evenly</button>
          <button class="btn" id="ins-del">🗑 Del All</button>
        </div>`;
      this._bindInspectorBatch(tr,items);
    }
  },

  _renderCharsInspector(it){
    const chars=it.chars||[];
    if(!chars.length)return '<span class="muted">Нет chars</span>';
    const dur=it.end-it.start;
    return '<div class="chars-timeline" id="chars-tl">'+
      chars.map((ch,ci)=>{
        const cs=this.num(ch.start,it.start),ce=this.num(ch.end,it.end);
        const l=((cs-it.start)/dur*100).toFixed(2),w=((ce-cs)/dur*100).toFixed(2);
        return `<div class="char-block" data-ci="${ci}" style="left:${l}%;width:${w}%;min-width:8px">
          <div class="char-handle cl" data-ci="${ci}" data-side="left"></div>
          <span>${ch.c||'?'}</span>
          <div class="char-handle cr" data-ci="${ci}" data-side="right"></div>
        </div>`;
      }).join('')+'</div>';
  },

  _applyInspectorEdits(tr,it){
    const g=id=>document.getElementById(id);
    const ns=this.num(g('ins-start').value,it.start),ne=this.num(g('ins-end').value,it.end);
    if(ns>=ne){alert('Start должен быть меньше End');return}
    this.pushHistory('Inspector Edit');
    it.start=Math.max(0,ns); it.end=Math.max(it.start+this.MIN_DUR,ne);
    it.text=g('ins-text').value;
    this.normalizeTrackAfterEdit(tr); this.markDirty(); this.afterEdit();
  },

  _bindInspectorSingle(tr,it){
    const g=id=>document.getElementById(id);
    const applyFn=()=>this._applyInspectorEdits(tr,it);
    g('ins-apply').onclick=applyFn;
    ['ins-start','ins-end','ins-text'].forEach(id=>{
      const el=g(id); if(el)el.onkeydown=ev=>{if(ev.key==='Enter'){ev.preventDefault();applyFn()}}
    });
    g('ins-split')?.addEventListener('click',()=>this.runCommand('split'));
    g('ins-merge-prev')?.addEventListener('click',()=>this.runCommand('mergePrev'));
    g('ins-merge-next')?.addEventListener('click',()=>this.runCommand('mergeNext'));
    g('ins-dup')?.addEventListener('click',()=>this.runCommand('duplicate'));
    g('ins-del')?.addEventListener('click',()=>this.runCommand('deleteSelected'));
    g('ins-words-from-line')?.addEventListener('click',()=>this.createWordsFromLine(tr,it));
    g('ins-line-from-words')?.addEventListener('click',()=>this.collapseWordToLine(tr,it));
    if(it.kind==='word'){
      g('ins-rebuild-chars')?.addEventListener('click',()=>this._rebuildCharsFromWord(tr,it));
      g('ins-chars-dist')?.addEventListener('click',()=>this._distributeCharsEvenly(tr,it));
      setTimeout(()=>this._bindCharsDrag(tr,it),50);
    }
  },

  _bindCharsDrag(tr,it){
    const tl=document.getElementById('chars-tl'); if(!tl)return;
    tl.querySelectorAll('.char-handle').forEach(h=>{
      h.addEventListener('mousedown',e=>{
        e.preventDefault(); e.stopPropagation();
        const ci=+h.dataset.ci,side=h.dataset.side,ch=(it.chars||[])[ci]; if(!ch)return;
        this.charDrag={active:true,itemId:it.id,trackId:tr.id,charIdx:ci,side,
          startX:e.clientX,initialStart:this.num(ch.start,it.start),initialEnd:this.num(ch.end,it.end)};
      });
    });
  },

  _handleCharDragMove(e){
    const {charIdx,side,startX,initialStart,initialEnd,trackId,itemId}=this.charDrag;
    const tr=this.trackById(trackId),it=this.itemById(trackId,itemId);
    if(!tr||!it||!it.chars)return;
    const ch=it.chars[charIdx]; if(!ch)return;
    const tl=document.getElementById('chars-tl'); if(!tl)return;
    const dt=(e.clientX-startX)/(tl.offsetWidth||200)*(it.end-it.start);
    if(side==='left')ch.start=Math.max(it.start,Math.min(initialStart+dt,this.num(ch.end,it.end)-this.MIN_DUR));
    else ch.end=Math.max(this.num(ch.start,it.start)+this.MIN_DUR,Math.min(initialEnd+dt,it.end));
    this.renderInspector();
  },

  _commitCharDrag(){
    this.charDrag.active=false; this.pushHistory('Char Drag'); this.markDirty(); this.renderInspector();
  },

  _rebuildCharsFromWord(tr,it){
    const chars=[...it.text].filter(c=>c.trim());
    const step=chars.length?(it.end-it.start)/chars.length:.1;
    it.chars=chars.map((c,i)=>({c,start:it.start+i*step,end:it.start+(i+1)*step-.005}));
    this.pushHistory('Rebuild Chars'); this.markDirty(); this.renderInspector(); this.renderTimeline();
  },

  _distributeCharsEvenly(tr,it){
    const chars=it.chars||[]; if(!chars.length)return;
    const step=(it.end-it.start)/chars.length;
    chars.forEach((ch,i)=>{ch.start=it.start+i*step;ch.end=it.start+(i+1)*step-.005});
    this.pushHistory('Distribute Chars'); this.markDirty(); this.renderInspector();
  },

  _bindInspectorBatch(tr,items){
    const g=id=>document.getElementById(id);
    g('batch-move')?.addEventListener('click',()=>{
      const d=this.num(g('batch-delta').value,0);
      this.pushHistory('Batch Move');
      this._batchMoveRipple(tr,items,d);
      this.normalizeTrackAfterEdit(tr); this.markDirty(); this.afterEdit();
    });
    g('batch-norm')?.addEventListener('click',()=>{
      const dur=this.num(g('batch-dur').value,0); if(dur<=0)return;
      this.pushHistory('Batch Norm');
      items.forEach(i=>{i.end=i.start+dur});
      this.normalizeTrackAfterEdit(tr); this.markDirty(); this.afterEdit();
    });
    g('batch-close')?.addEventListener('click',()=>{
      const gap=this.num(g('batch-gap').value,0);
      this.pushHistory('Batch Close Gaps');
      const sorted=[...items].sort((a,b)=>a.start-b.start);
      sorted.forEach((it,i)=>{if(i>0){it.start=sorted[i-1].end+gap;it.end=Math.max(it.start+this.MIN_DUR,it.end)}});
      this.normalizeTrackAfterEdit(tr); this.markDirty(); this.afterEdit();
    });
    g('batch-dist')?.addEventListener('click',()=>this._distributeItemsEvenly(items));
    g('ins-del')?.addEventListener('click',()=>this.runCommand('deleteSelected'));
  },

  _batchMoveRipple(tr,selItems,delta){
    if(Math.abs(delta)<1e-9)return;
    const sel=selItems.map(i=>({item:i,origStart:i.start,origEnd:i.end}));
    const mode=this.ui.dragMode.value;
    if(mode==='ripple')this.applyRippleMove(tr,sel,delta);
    else if(mode==='keep')this.applyNoOverlapMove(tr,sel,delta);
    else this.applyFreeMove(sel,delta);
    this.sortTrack(tr);
  },

  _distributeItemsEvenly(items){
    if(items.length<2)return;
    const sorted=[...items].sort((a,b)=>a.start-b.start);
    const step=(sorted[sorted.length-1].end-sorted[0].start)/sorted.length;
    this.pushHistory('Distribute Evenly');
    sorted.forEach((it,i)=>{const dur=it.end-it.start;it.start=sorted[0].start+i*step;it.end=it.start+dur});
    this.markDirty(); this.afterEdit();
  },

  /* ── edit ops ── */
  splitAtPlayhead(){
    const tr=this.activeTrack(); if(!tr)return;
    const t=this.audioElement.currentTime,ids=[...this.selected.ids];
    if(!ids.length){alert('Выберите элемент для разрезания');return}
    this.pushHistory('Split');
    ids.forEach(id=>{
      const it=this.itemById(tr.id,id); if(!it||t<=it.start||t>=it.end)return;
      const sp=this.smartTextSplit(it.text,(t-it.start)/(it.end-it.start));
      tr.items.push({...it,id:(it.kind==='word'?'W_':'L_')+this.uid(),start:t,text:sp.after,chars:[]});
      it.end=t; it.text=sp.before;
      it.chars=(it.chars||[]).filter(c=>this.num(c.start,it.start)<t);
    });
    this.normalizeTrackAfterEdit(tr); this.markDirty(); this.afterEdit();
  },
  splitAtCursor(cursorT){
    const tr=this.activeTrack(); if(!tr||!this.selected.ids.size)return;
    this.pushHistory('Split at Cursor');
    [...this.selected.ids].forEach(id=>{
      const it=this.itemById(tr.id,id); if(!it||cursorT<=it.start||cursorT>=it.end)return;
      const sp=this.smartTextSplit(it.text,(cursorT-it.start)/(it.end-it.start));
      tr.items.push({...it,id:(it.kind==='word'?'W_':'L_')+this.uid(),start:cursorT,text:sp.after,chars:[]});
      it.end=cursorT; it.text=sp.before;
    });
    this.normalizeTrackAfterEdit(tr); this.markDirty(); this.afterEdit();
  },
  mergeSelectedWithNext(){
    const tr=this.activeTrack(); if(!tr||!this.selected.ids.size)return;
    this.pushHistory('Merge Next');
    [...this.selected.ids].forEach(id=>{
      const it=this.itemById(tr.id,id); if(!it)return;
      const nx=this.getNextOrderedNeighbor(tr,it); if(!nx)return;
      it.end=nx.end; it.text=this.mergeTexts(it.text,nx.text);
      it.chars=[...(it.chars||[]),...(nx.chars||[])];
      tr.items=tr.items.filter(i=>i.id!==nx.id);
    });
    this.normalizeTrackAfterEdit(tr); this.markDirty(); this.afterEdit();
  },
  mergeSelectedWithPrev(){
    const tr=this.activeTrack(); if(!tr||!this.selected.ids.size)return;
    this.pushHistory('Merge Prev');
    [...this.selected.ids].forEach(id=>{
      const it=this.itemById(tr.id,id); if(!it)return;
      const pr=this.getPrevOrderedNeighbor(tr,it); if(!pr)return;
      pr.end=it.end; pr.text=this.mergeTexts(pr.text,it.text);
      pr.chars=[...(pr.chars||[]),...(it.chars||[])];
      tr.items=tr.items.filter(i=>i.id!==it.id);
      this.selected.ids.delete(id); this.selected.ids.add(pr.id);
    });
    this.normalizeTrackAfterEdit(tr); this.markDirty(); this.afterEdit();
  },
  duplicateSelected(){
    const tr=this.activeTrack(); if(!tr||!this.selected.ids.size)return;
    this.pushHistory('Duplicate');
    const newIds=new Set();
    [...this.selected.ids].forEach(id=>{
      const it=this.itemById(tr.id,id); if(!it)return;
      const dur=it.end-it.start,nx=this.getNextOrderedNeighbor(tr,it);
      const s=nx?Math.max(it.end,nx.start-dur):it.end;
      tr.items.push({...it,id:(it.kind==='word'?'W_':'L_')+this.uid(),
        start:s,end:s+dur,chars:JSON.parse(JSON.stringify(it.chars||[]))});
      newIds.add(tr.items[tr.items.length-1].id);
    });
    this.selected.ids=newIds;
    this.normalizeTrackAfterEdit(tr); this.markDirty(); this.afterEdit();
  },
  _addItem(kind){
    const tr=this.activeTrack(); if(!tr||(kind==='word'&&tr.type==='line'))return;
    const t=this.audioElement.currentTime;
    this.pushHistory('Add '+kind);
    const it=kind==='line'
      ?{id:'L_'+this.uid(),kind:'line',start:t,end:t+2,text:'New Line'}
      :{id:'W_'+this.uid(),kind:'word',
        lineId:tr.items.find(i=>i.kind==='line'&&i.start<=t&&i.end>t)?.id||null,
        start:t,end:t+.5,text:'word',chars:[]};
    tr.items.push(it);
    this.sortTrack(tr); this.markDirty(); this.renderTimeline();
    this.selectItem(tr.id,it.id); this.renderPreview();
  },
  addNewLine(){ this._addItem('line') },
  addNewWord(){ this._addItem('word') },
  deleteSelected(){
    const tr=this.activeTrack(); if(!tr||!this.selected.ids.size)return;
    this.pushHistory('Delete');
    const ids=[...this.selected.ids];
    tr.items=tr.items.filter(i=>!ids.includes(i.id));
    this.clearSelection(); this.markDirty(); this.renderTimeline(); this.renderPreview();
  },
  nudgeSelected(delta){
    const tr=this.activeTrack(); if(!tr||!this.selected.ids.size)return;
    this.pushHistory('Nudge');
    [...this.selected.ids].forEach(id=>{
      const it=this.itemById(tr.id,id); if(!it)return;
      it.start=Math.max(0,it.start+delta); it.end=Math.max(it.start+this.MIN_DUR,it.end+delta);
    });
    this.markDirty(); this.afterEdit();
  },
  stretchSelected(side,delta){
    const tr=this.activeTrack(); if(!tr||!this.selected.ids.size)return;
    this.pushHistory('Stretch');
    [...this.selected.ids].forEach(id=>{
      const it=this.itemById(tr.id,id); if(!it)return;
      if(side==='left')it.start=Math.max(0,Math.min(it.end-this.MIN_DUR,it.start+delta));
      else it.end=Math.max(it.start+this.MIN_DUR,it.end+delta);
    });
    this.markDirty(); this.afterEdit();
  },
  createWordsFromLine(tr,it){
    if(it.kind!=='line'||tr.type!=='words')return;
    const words=it.text.split(/\s+/).filter(Boolean); if(!words.length)return;
    this.pushHistory('Words from Line');
    const dur=(it.end-it.start)/words.length;
    words.forEach((w,i)=>{
      tr.items.push({id:'W_'+this.uid(),kind:'word',lineId:it.id,
        start:it.start+i*dur,end:it.start+(i+1)*dur-.005,text:w,chars:[]});
    });
    this.normalizeTrackAfterEdit(tr); this.markDirty(); this.afterEdit();
  },
  collapseWordToLine(tr,it){
    if(it.kind!=='word'||tr.type!=='words')return;
    const line=tr.items.find(l=>l.kind==='line'&&l.id===it.lineId); if(!line)return;
    this.pushHistory('Collapse to Line');
    const ws=tr.items.filter(i=>i.kind==='word'&&i.lineId===it.lineId);
    if(ws.length){
      line.start=Math.min(line.start,...ws.map(w=>w.start));
      line.end=Math.max(line.end,...ws.map(w=>w.end));
      line.text=ws.map(w=>w.text).join(' ');
      tr.items=tr.items.filter(i=>!(i.kind==='word'&&i.lineId===it.lineId));
    }
    this.clearSelection(); this.normalizeTrackAfterEdit(tr); this.markDirty(); this.afterEdit();
  },

  /* ── navigation ── */
  fitSong(){
    if(!this.duration)return;
    this.setZoom(Math.max(10,Math.floor(this.ui.timelineContainer.clientWidth/this.duration)),false);
    this.ui.timelineContainer.scrollLeft=0;
  },
  zoomToSelection(){
    const b=this.getSelectionBounds(); if(!b)return;
    this.setZoom(Math.max(10,Math.floor(this.ui.timelineContainer.clientWidth/(b.maxEnd-b.minStart)*.85)),false);
    setTimeout(()=>this.ui.timelineContainer.scrollLeft=b.minStart*this.zoom-20,50);
  },
  scrollToSelection(){
    const b=this.getSelectionBounds(); if(!b)return;
    this.ui.timelineContainer.scrollLeft=Math.max(0,b.minStart*this.zoom-this.ui.timelineContainer.clientWidth/2);
  },
  gotoSelectionStart(){
    const b=this.getSelectionBounds(); if(!b)return;
    this.audioElement.currentTime=b.minStart; this.syncPlayhead();
  },
  navigateItem(dir){
    const tr=this.activeTrack(); if(!tr)return;
    const items=this.visibleItems(tr,this.ui.layerMode.value).sort((a,b)=>a.start-b.start);
    if(!items.length)return;
    let ci=-1;
    if(this.selected.ids.size===1)ci=items.findIndex(i=>i.id===[...this.selected.ids][0]);
    let ni=ci+dir;
    if(ni<0)ni=items.length-1; if(ni>=items.length)ni=0;
    const target=items[ni]; if(!target)return;
    this.clearSelection(); this.selectItem(tr.id,target.id);
    this.audioElement.currentTime=target.start; this.syncPlayhead(); this.scrollToSelection();
  },
  switchActiveTrack(){
    const ids=this.project.tracks.map(t=>t.id); if(!ids.length)return;
    this.setActiveTrack(ids[(ids.indexOf(this.project.activeTrackId)+1)%ids.length]);
  },

  /* ── preview ── */
  renderPreview(){
    const t=this.audioElement.currentTime||0;
    const hasSolo=this.project.tracks.some(x=>x.solo);
    const vis=x=>x.visible&&!x.muted&&(!hasSolo||x.solo);
    const lineTr=this.project.tracks.find(x=>x.type==='line'&&vis(x));
    const wordsTr=this.project.tracks.find(x=>x.type==='words'&&vis(x));
    const src=lineTr||wordsTr;
    if(!src){this.ui.lyricsContainer.innerHTML='<p class="muted">Нет данных</p>';return}
    const wordsFor=(wTr,line)=>{
      const byId=wTr.items.filter(i=>i.kind==='word'&&i.lineId===line.id);
      return byId.length?byId.sort((a,b)=>a.start-b.start)
        :wTr.items.filter(i=>i.kind==='word'&&i.start>=line.start-.05&&i.end<=line.end+.15).sort((a,b)=>a.start-b.start);
    };
    const wSpan=(words)=>words.map(w=>`<span class="lyric-word${t>=w.start&&t<w.end?' playing':''}">${this.esc(w.text)} </span>`).join('');
    const lCls=(playing,sel)=>`lyric-line${playing?' playing':''}${sel?' selected-ui':''}`;
    const isSel=(tid,id)=>this.selected.trackId===tid&&this.selected.ids.has(id);
    let html='';
    const renderLine=(line,tid,extraCls='',extra='')=>{
      const pl=t>=line.start&&t<line.end;
      html+=`<div class="${lCls(pl,isSel(tid,line.id))}${extraCls}" data-id="${line.id}" data-tid="${tid}">${extra}</div>`;
    };
    if(src===wordsTr&&!lineTr){
      wordsTr.items.filter(i=>i.kind==='line').sort((a,b)=>a.start-b.start).forEach(line=>{
        const words=wordsFor(wordsTr,line);
        const pl=t>=line.start&&t<line.end;
        html+=`<div class="${lCls(pl,isSel(wordsTr.id,line.id))}" data-id="${line.id}" data-tid="${wordsTr.id}">
          ${words.length?wSpan(words):this.esc(line.text)}</div>`;
      });
    }else if(lineTr&&wordsTr){
      lineTr.items.filter(i=>i.kind==='line').sort((a,b)=>a.start-b.start).forEach(line=>{
        const pl=t>=line.start&&t<line.end;
        const words=wordsFor(wordsTr,line);
        html+=`<div class="${lCls(pl,isSel(lineTr.id,line.id))} preview-subline" data-id="${line.id}" data-tid="${lineTr.id}">
          <span class="preview-underlay">${this.esc(line.text)}</span>
          ${words.length?' <span style="opacity:.7">|</span> '+wSpan(words):''}
        </div>`;
      });
    }else{
      src.items.filter(i=>i.kind==='line').sort((a,b)=>a.start-b.start).forEach(line=>{
        const pl=t>=line.start&&t<line.end;
        html+=`<div class="${lCls(pl,isSel(src.id,line.id))}" data-id="${line.id}" data-tid="${src.id}">${this.esc(line.text)}</div>`;
      });
    }
    this.ui.lyricsContainer.innerHTML=html||'<p class="muted">Нет строк</p>';
    this.ui.lyricsContainer.querySelectorAll('.lyric-line').forEach(el=>{
      el.onclick=()=>{
        const it=this.itemById(el.dataset.tid,el.dataset.id);
        if(it){this.audioElement.currentTime=it.start;this.syncPlayhead();this.selectItem(el.dataset.tid,el.dataset.id)}
      };
    });
    this.ui.lyricsContainer.querySelector('.lyric-line.playing')?.scrollIntoView({block:'nearest',behavior:'smooth'});
  },

  /* ── export ── */
  exportTrack(tr){ if(!tr){alert('Нет дорожки для экспорта');return} this._openExportPreview(tr) },
  openExportPreview(){ const tr=this.activeTrack(); if(!tr){alert('Нет активной дорожки');return} this._openExportPreview(tr) },
  _openExportPreview(tr){
    try{
      const norm=this.normalizeTrackForExport(tr);
      this._exportPreviewTrack=tr;
      this.ui.exportPreviewText.value=JSON.stringify(this.serializeTrack(norm),null,2);
      this.ui.exportPreviewModal.classList.remove('hidden');
    }catch(e){alert('Ошибка подготовки экспорта: '+e.message)}
  },
  doExportTrack(tr){
    if(!tr)return;
    try{
      const json=this.serializeTrack(this.normalizeTrackForExport(tr));
      this.downloadBlob(new Blob([JSON.stringify(json,null,2)],{type:'application/json'}),tr.name+'_export.json');
      this.ui.exportPreviewModal.classList.add('hidden');
    }catch(e){alert('Ошибка экспорта: '+e.message)}
  },
  serializeTrack(tr){
    if(tr.type==='line'){
      return tr.items.filter(i=>i.kind==='line').sort((a,b)=>a.start-b.start)
        .map(i=>({time:+i.start.toFixed(3),line:i.text}));
    }
    return tr.items.filter(i=>i.kind==='line').sort((a,b)=>a.start-b.start).map(line=>{
      const words=tr.items.filter(i=>i.kind==='word'&&i.lineId===line.id).sort((a,b)=>a.start-b.start);
      return{start:+line.start.toFixed(3),end:+line.end.toFixed(3),line:line.text,
        words:words.map(w=>({start:+w.start.toFixed(3),end:+w.end.toFixed(3),w:w.text,
          chars:(w.chars||[]).map(c=>({c:c.c,start:+this.num(c.start,w.start).toFixed(3),end:+this.num(c.end,w.end).toFixed(3)}))}))};
    });
  },
  exportAll(){ this.project.tracks.forEach(tr=>this.doExportTrack(tr)) },
  exportZip(){
    try{
      const files=this.project.tracks.map(tr=>({
        name:tr.name+'_export.json',
        data:new TextEncoder().encode(JSON.stringify(this.serializeTrack(this.normalizeTrackForExport(tr)),null,2))
      }));
      if(!files.length){alert('Нет дорожек');return}
      this.downloadBlob(this._buildZipBlob(files),'karaoke_export.zip');
    }catch(e){alert('ZIP error: '+e.message);console.error(e)}
  },
  _crc32Table:null,
  _getCrc32Table(){
    if(this._crc32Table)return this._crc32Table;
    const t=new Uint32Array(256);
    for(let i=0;i<256;i++){let n=i;for(let k=0;k<8;k++)n=n&1?0xEDB88320^(n>>>1):n>>>1;t[i]=n}
    return this._crc32Table=t;
  },
  _buildZipBlob(files){
    const u32=(n,b,o)=>{b[o]=n&255;b[o+1]=(n>>8)&255;b[o+2]=(n>>16)&255;b[o+3]=(n>>24)&255};
    const u16=(n,b,o)=>{b[o]=n&255;b[o+1]=(n>>8)&255};
    const tbl=this._getCrc32Table();
    const crc32=d=>{let c=0xFFFFFFFF;for(let i=0;i<d.length;i++)c=tbl[(c^d[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0};
    const parts=[],cdirs=[],enc=new TextEncoder();let off=0;
    files.forEach(f=>{
      const nb=enc.encode(f.name),data=f.data,crc=crc32(data),cs=data.length;
      const lh=new Uint8Array(30+nb.length);
      u32(0x04034b50,lh,0);u16(20,lh,4);u32(crc,lh,14);u32(cs,lh,18);u32(cs,lh,22);u16(nb.length,lh,26);lh.set(nb,30);
      const cd=new Uint8Array(46+nb.length);
      u32(0x02014b50,cd,0);u16(20,cd,4);u16(20,cd,6);u32(crc,cd,16);u32(cs,cd,20);u32(cs,cd,24);
      u16(nb.length,cd,28);u32(off,cd,42);cd.set(nb,46);
      parts.push(lh,data);cdirs.push(cd);off+=lh.length+cs;
    });
    const cdSz=cdirs.reduce((s,c)=>s+c.length,0),eocd=new Uint8Array(22);
    u32(0x06054b50,eocd,0);u16(files.length,eocd,8);u16(files.length,eocd,10);u32(cdSz,eocd,12);u32(off,eocd,16);
    return new Blob([...parts,...cdirs,eocd],{type:'application/zip'});
  },

  /* ── session / autosave ── */
  buildSessionSnapshot(){
    return{version:2,ts:Date.now(),zoom:this.zoom,verticalZoom:this.verticalZoom,
      snapStep:this.snapStep,autoScroll:this.autoScroll,volume:this.volume,muted:this.muted,
      autosaveEnabled:this.autosaveEnabled,autosaveIntervalSec:this.autosaveIntervalSec,
      loop:this.loop,collapsed:{...this.collapsed},project:JSON.parse(JSON.stringify(this.project)),
      playheadTime:this.audioElement.currentTime||0,playbackRate:this.playbackRate,keymap:{...this.keymap},
      sidebarWidth:this.ui.sidebar.style.width,dragMode:this.ui.dragMode.value,
      layerMode:this.ui.layerMode.value,scrollLeft:this.ui.timelineContainer.scrollLeft,
      activeTrackId:this.project.activeTrackId};
  },
  saveAutoDraft(){
    try{
      const snap=this.buildSessionSnapshot();
      if(!this._draftKey||Date.now()-this._draftKeyTs>300000){this._draftKey='keDraft_'+Date.now();this._draftKeyTs=Date.now()}
      const rKey=this._draftKey,json=JSON.stringify(snap);
      this._safeSetItem(this.DRAFT_KEY,json); this._safeSetItem(rKey,json);
      this._addToRecent(rKey,snap); this.updateSaveStatus('Autosaved',false);
    }catch(e){console.warn('Autosave failed',e);this.updateSaveStatus('Autosave error',true)}
  },
  _safeSetItem(key,val){
    try{localStorage.setItem(key,val)}
    catch(e){
      if(e.name==='QuotaExceededError'||e.code===22||e.code===1014){
        const list=this._getRecentList(),half=Math.max(1,Math.floor(list.length/2));
        for(let i=list.length-1;i>=list.length-half;i--)if(list[i])localStorage.removeItem(list[i].key);
        localStorage.setItem(this.RECENT_KEY,JSON.stringify(list.slice(0,list.length-half)));
        localStorage.setItem(key,val);
      }else throw e;
    }
  },
  saveSessionToFile(){
    this.downloadBlob(new Blob([JSON.stringify(this.buildSessionSnapshot(),null,2)],{type:'application/json'}),
      'karaoke-session-'+new Date().toISOString().slice(0,19).replace(/:/g,'-')+'.kep');
    this.updateSaveStatus('Saved',false); this.dirty=false;
  },
  async loadSessionFromFile(file){
    if(!file)return;
    try{this.applySnapshot(JSON.parse(await file.text()));this.updateSaveStatus('Session loaded',false)}
    catch(e){alert('Ошибка загрузки сессии: '+e.message)}
  },
  applySnapshot(snap){
    if(!snap?.project)return;
    const def=(v,d)=>v!==undefined?v:d;
    this.zoom=snap.zoom||80; this.verticalZoom=snap.verticalZoom||1;
    this.snapStep=snap.snapStep||0; this.autoScroll=def(snap.autoScroll,true);
    this.volume=def(snap.volume,1); this.muted=snap.muted||false;
    this.autosaveEnabled=def(snap.autosaveEnabled,true); this.autosaveIntervalSec=snap.autosaveIntervalSec||10;
    this.loop=snap.loop||{enabled:false,start:null,end:null};
    this.collapsed=snap.collapsed||{}; this.project=snap.project;
    this.playbackRate=snap.playbackRate||1; this.audioElement.playbackRate=this.playbackRate;
    this.ui.playbackRate.value=this.playbackRate;
    if(snap.keymap)this.keymap={...this.defaultKeymap(),...snap.keymap};
    if(snap.sidebarWidth)this.ui.sidebar.style.width=snap.sidebarWidth;
    if(snap.dragMode)this.ui.dragMode.value=snap.dragMode;
    if(snap.layerMode)this.ui.layerMode.value=snap.layerMode;
    this._syncUiToDOM(); this.restartAutosaveLoop(); this.fullRender();
    if(snap.scrollLeft)setTimeout(()=>this.ui.timelineContainer.scrollLeft=snap.scrollLeft,120);
    if(snap.playheadTime)setTimeout(()=>{this.audioElement.currentTime=snap.playheadTime;this.syncPlayhead()},150);
  },
  restoreDraftFromStorage(key,force){
    try{
      const raw=localStorage.getItem(key||this.DRAFT_KEY); if(!raw)return false;
      const snap=JSON.parse(raw); if(!force&&!snap.project)return false;
      this.applySnapshot(snap); this.updateSaveStatus('Draft restored',false); return true;
    }catch(e){console.warn('Restore failed',e);return false}
  },
  checkDraftOnLaunch(){
    try{
      const raw=localStorage.getItem(this.DRAFT_KEY); if(!raw)return;
      const snap=JSON.parse(raw); if(!snap?.project?.tracks?.length)return;
      const ts=snap.ts?new Date(snap.ts).toLocaleString():'неизвестно';
      this._pendingDraftKey=this.DRAFT_KEY;
      this.ui.restoreModalDesc.textContent=`Найден черновик от ${ts} (треков: ${snap.project.tracks.length}). Восстановить?`;
      this.ui.restoreModal.classList.remove('hidden');
    }catch(e){console.warn(e)}
  },
  startAutosaveLoop(){
    this.stopAutosaveLoop(); if(!this.autosaveEnabled)return;
    this.autosaveTimer=setInterval(()=>{if(this.dirty&&this.autosaveEnabled)this.saveAutoDraft()},this.autosaveIntervalSec*1000);
  },
  stopAutosaveLoop(){ clearInterval(this.autosaveTimer); this.autosaveTimer=null },
  restartAutosaveLoop(){ this.stopAutosaveLoop(); this.startAutosaveLoop() },
  _getRecentList(){ try{return JSON.parse(localStorage.getItem(this.RECENT_KEY)||'[]')}catch{return[]} },
  openRecentModal(){ this._renderRecentList(); this.ui.recentModal.classList.remove('hidden') },
  _renderRecentList(){
    const list=this._getRecentList(),c=this.ui.recentList;
    if(!list.length){c.innerHTML='<p class="muted" style="padding:12px">Нет сохранённых черновиков</p>';return}
    c.innerHTML=list.map((r,i)=>`<div class="draft-row">
      <span class="draft-ts">${r.ts?new Date(r.ts).toLocaleString():'?'}</span>
      <span class="draft-info" title="${r.key}">${r.tracks||0} треков${r.name?' — '+r.name:''}</span>
      <button class="btn" data-act="restore" data-idx="${i}">Restore</button>
      <button class="btn" data-act="del" data-idx="${i}">✕</button>
    </div>`).join('');
    c.querySelectorAll('[data-act]').forEach(btn=>{
      btn.onclick=()=>{
        const r=list[+btn.dataset.idx];
        if(btn.dataset.act==='restore'){
          this._pendingDraftKey=r.key; this.ui.recentModal.classList.add('hidden'); this.restoreDraftFromStorage(r.key,true);
        }else{localStorage.removeItem(r.key);this._removeFromRecent(r.key);this._renderRecentList()}
      };
    });
  },
  _addToRecent(key,snap){
    let list=this._getRecentList().filter(r=>r.key!==key);
    list.unshift({key,ts:snap.ts,tracks:snap.project?.tracks?.length||0,name:snap.project?.tracks?.[0]?.name||''});
    if(list.length>this.MAX_RECENT)list=list.slice(0,this.MAX_RECENT);
    localStorage.setItem(this.RECENT_KEY,JSON.stringify(list));
  },
  _removeFromRecent(key){
    if(!key)return;
    localStorage.setItem(this.RECENT_KEY,JSON.stringify(this._getRecentList().filter(r=>r.key!==key)));
  },
  clearAllDrafts(){
    this._getRecentList().forEach(r=>localStorage.removeItem(r.key));
    localStorage.removeItem(this.RECENT_KEY); localStorage.removeItem(this.DRAFT_KEY);
  },

  /* ── validation ── */
  openValidationModal(){
    const res=this._runValidation();
    this.ui.validationList.innerHTML=res.length
      ?res.map(v=>`<div class="validation-item ${v.sev}"><span class="vi-badge">${v.sev.toUpperCase()}</span><span>${v.msg}</span></div>`).join('')
      :'<div class="validation-item ok"><span class="vi-badge">OK</span><span>Всё в порядке!</span></div>';
    this.ui.validationModal.classList.remove('hidden');
  },
  _runValidation(){
    const out=[],f3=n=>n.toFixed(3),f2=n=>n.toFixed(2);
    if(!this.project.tracks.length){out.push({sev:'info',msg:'Нет загруженных дорожек'});return out}
    this.project.tracks.forEach(tr=>{
      if(!tr.items.length){out.push({sev:'info',msg:`[${tr.name}] Дорожка пустая`});return}
      const sorted=[...tr.items].sort((a,b)=>a.start-b.start);
      let prevEnd=-1,prevKind=null;
      sorted.forEach(it=>{
        if(it.start<0)out.push({sev:'err',msg:`[${tr.name}] "${it.text}" start<0 (${f3(it.start)})`});
        if(it.end<=it.start)out.push({sev:'err',msg:`[${tr.name}] "${it.text}" end<=start`});
        if(it.kind===prevKind&&it.start<prevEnd-1e-4)out.push({sev:'warn',msg:`[${tr.name}] Перекрытие: "${it.text}" (${f3(it.start)}) до ${f3(prevEnd)}`});
        if(!it.text.trim())out.push({sev:'warn',msg:`[${tr.name}] Пустой текст: ${it.id}`});
        if(it.kind===prevKind&&it.start>prevEnd+2)out.push({sev:'info',msg:`[${tr.name}] Разрыв перед "${it.text}" (${f2(it.start-prevEnd)}s)`});
        prevEnd=it.end; prevKind=it.kind;
        if(it.kind==='word'&&tr.type==='words'){
          const line=tr.items.find(l=>l.kind==='line'&&l.id===it.lineId);
          if(!line)out.push({sev:'warn',msg:`[${tr.name}] Слово "${it.text}" без строки`});
          else{
            if(it.start<line.start-.01)out.push({sev:'err',msg:`[${tr.name}] "${it.text}" раньше строки`});
            if(it.end>line.end+.01)out.push({sev:'err',msg:`[${tr.name}] "${it.text}" позже строки`});
          }
          (it.chars||[]).forEach((ch,ci)=>{
            if(this.num(ch.start,it.start)<it.start-.01)out.push({sev:'warn',msg:`[${tr.name}] Char ${ci} "${ch.c}" раньше слова`});
            if(this.num(ch.end,it.end)>it.end+.01)out.push({sev:'warn',msg:`[${tr.name}] Char ${ci} "${ch.c}" позже слова`});
          });
        }
      });
    });
    return out;
  },
  autoFixOverlaps(){
    this.pushHistory('Auto-Fix Overlaps');
    this.project.tracks.forEach(tr=>{
      ['line','word'].forEach(kind=>{
        const items=tr.items.filter(i=>i.kind===kind).sort((a,b)=>a.start-b.start);
        for(let i=1;i<items.length;i++){
          if(items[i].start<items[i-1].end){
            items[i].start=items[i-1].end;
            if(items[i].end<=items[i].start)items[i].end=items[i].start+.05;
          }
        }
      });
    });
    this.markDirty(); this.renderTimeline(); this.openValidationModal();
  },
  _batchCloseGapsCtx(){
    const tr=this.activeTrack(); if(!tr||!this.selected.ids.size)return;
    const items=[...this.selected.ids].map(id=>this.itemById(tr.id,id)).filter(Boolean).sort((a,b)=>a.start-b.start);
    this.pushHistory('Batch Close Gaps');
    items.forEach((it,i)=>{if(i>0){it.start=items[i-1].end;it.end=Math.max(it.start+this.MIN_DUR,it.end)}});
    this.normalizeTrackAfterEdit(tr); this.markDirty(); this.afterEdit();
  },
});
