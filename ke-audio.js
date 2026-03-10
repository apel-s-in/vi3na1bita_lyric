'use strict';
/* ── ke-audio.js: audio, waveform, playback, playhead, loop, zoom, volume ── */
Object.assign(App, {

  /* ── audio load ── */
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
      this._waveCache=null; this._waveCacheKey='';
      this.fullRender();
    }catch(e){console.error(e);alert('Не удалось загрузить аудио')}
    finally{this.ui.loader.classList.add('hidden')}
  },

  /* ── waveform ── */
  _waveCache:null, _waveCacheKey:'',
  drawWaveform(){
    const c=this.ui.waveCanvas, ctx=c.getContext('2d'),
          w=Math.ceil(Math.max(1,(this.duration||1)*this.zoom)),
          h=Math.round(80*this.verticalZoom);
    c.width=w; c.height=h; ctx.clearRect(0,0,w,h);
    if(!this.audioBuffer){ctx.fillStyle='#3a3d46';ctx.fillRect(0,h/2-1,w,2);return}
    const key=w+'_'+h;
    if(this._waveCache&&this._waveCacheKey===key){ctx.drawImage(this._waveCache,0,0);return}
    const d=this.audioBuffer.getChannelData(0), step=Math.max(1,Math.ceil(d.length/w)), amp=h/2;
    ctx.fillStyle='#5a7fa8';
    for(let i=0;i<w;i++){
      let mn=1,mx=-1,s=i*step,e2=Math.min(s+step,d.length);
      for(let j=s;j<e2;j++){const v=d[j];if(v<mn)mn=v;if(v>mx)mx=v}
      ctx.fillRect(i,(1+mn)*amp,1,Math.max(1,(mx-mn)*amp));
    }
    try{
      const oc=document.createElement('canvas'); oc.width=w; oc.height=h;
      oc.getContext('2d').drawImage(c,0,0);
      this._waveCache=oc; this._waveCacheKey=key;
    }catch(e){/* canvas too large */}
  },

  /* ── playback ── */
  togglePlay(){
    if(!this.audioElement.src&&!this.audioElement.currentSrc){alert('Нет аудио');return}
    if(this.audioElement.paused){
      this.audioElement.play(); this.ui.btnPlay.textContent='⏸ Pause';
      this._raf=requestAnimationFrame(()=>this._tickRAF());
    }else{this.audioElement.pause(); this.ui.btnPlay.textContent='▶ Play'}
  },
  _tickRAF(){
    this.syncPlayhead();
    const now=performance.now();
    if(!this._lastPreviewTick||now-this._lastPreviewTick>100){
      this.renderPreview(); this._lastPreviewTick=now;
    }
    if(!this.audioElement.paused)this._raf=requestAnimationFrame(()=>this._tickRAF());
  },

  /* ── playhead sync ── */
  syncPlayhead(){
    const t=this.audioElement.currentTime||0, px=t*this.zoom;
    this.ui.playhead.style.left=px+'px';
    this.ui.timeDisplay.textContent=this.fmtTime(t)+' / '+this.fmtTime(this.duration||1);
    this._updatePlayingHighlights(t);
    if(this.autoScroll&&!this.audioElement.paused){
      const sc=this.ui.timelineContainer, sw=sc.clientWidth, sl=sc.scrollLeft;
      if(px<sl||px>sl+sw-40)sc.scrollLeft=px-sw/2;
    }
  },

  /* optimised: reuse element map instead of querySelectorAll */
  _playingIds:new Set(),
  _updatePlayingHighlights(t){
    // Clear previous
    this._playingIds.forEach(id=>{
      const el=this.ui.tracksContainer.querySelector(`[data-id="${id}"]`);
      if(el)el.classList.remove('playing');
    });
    this._playingIds.clear();
    this.project.tracks.forEach(tr=>{
      if(!tr.visible)return;
      tr.items.forEach(it=>{
        if(t>=it.start&&t<it.end){
          const el=this.ui.tracksContainer.querySelector(`[data-id="${it.id}"]`);
          if(el){el.classList.add('playing'); this._playingIds.add(it.id)}
        }
      });
    });
  },

  startPlayheadDrag(e){
    e.preventDefault(); e.stopPropagation();
    this.playheadDrag.active=true; document.body.style.cursor='ew-resize';
  },
  handlePlayheadDragMove(e){
    const rect=this.ui.scrollArea.getBoundingClientRect();
    const px=e.clientX-rect.left+this.ui.timelineContainer.scrollLeft;
    const t=Math.max(0,Math.min(px/this.zoom,this.duration||99999));
    this.audioElement.currentTime=t; this.syncPlayhead();
  },
  centerOnPlayhead(){ this.centerScrollOnTime(this.audioElement.currentTime) },
  centerScrollOnTime(time){
    const px=time*this.zoom, sw=this.ui.timelineContainer.clientWidth;
    this.ui.timelineContainer.scrollLeft=Math.max(0,px-sw/2);
  },

  /* ── loop ── */
  openLoopModal(){
    this.ui.loopInVal.value=(this.loop.start||0).toFixed(3);
    this.ui.loopOutVal.value=(this.loop.end||this.duration||0).toFixed(3);
    this.ui.loopModal.classList.remove('hidden');
  },
  applyLoopFromModal(){
    const i=this.num(this.ui.loopInVal.value,0), o=this.num(this.ui.loopOutVal.value,this.duration||10);
    if(i>=o){alert('Loop In должен быть меньше Loop Out');return}
    this.loop={enabled:true,start:i,end:o};
    this.ui.loopModal.classList.add('hidden'); this.renderLoopRegion();
  },
  clearLoop(){ this.loop={enabled:false,start:null,end:null}; this.renderLoopRegion() },
  handleLoopTick(){
    if(!this.loop.enabled||this.loop.start===null)return;
    if(this.audioElement.currentTime>=this.loop.end)this.audioElement.currentTime=this.loop.start;
  },
  renderLoopRegion(){
    const lr=this.ui.loopRegion;
    if(!this.loop.enabled||this.loop.start===null||this.loop.end===null){lr.style.display='none';return}
    lr.style.display='block';
    lr.style.left=(this.loop.start*this.zoom)+'px';
    lr.style.width=((this.loop.end-this.loop.start)*this.zoom)+'px';
  },
  handleLoopDragMove(e){
    const rect=this.ui.scrollArea.getBoundingClientRect();
    const px=e.clientX-rect.left+this.ui.timelineContainer.scrollLeft;
    const t=Math.max(0,px/this.zoom);
    const s=Math.min(this._loopDrag.startT,t), en=Math.max(this._loopDrag.startT,t);
    this.loop={enabled:en-s>.05,start:s,end:en};
    this.renderLoopRegion();
  },

  /* ── zoom ── */
  setZoom(v,keepPlayhead){
    const oldZoom=this.zoom;
    this.zoom=Math.max(10,Math.min(320,v));
    this.ui.zoomSlider.value=this.zoom; this.updateZoomReadout();
    const sc=this.ui.timelineContainer;
    if(keepPlayhead){
      const t=this.audioElement.currentTime, relPos=t*oldZoom-sc.scrollLeft;
      this.fullRender(); sc.scrollLeft=Math.max(0,t*this.zoom-relPos);
    }else{this.fullRender()}
    this.persistUiPrefs();
  },
  setVerticalZoom(v){
    this.verticalZoom=Math.max(.7,Math.min(2.2,v));
    this.ui.vzoomSlider.value=Math.round(this.verticalZoom*100);
    this.updateVZoomReadout(); this.fullRender(); this.persistUiPrefs();
  },
  updateZoomReadout(){ this.ui.zoomReadout.textContent=this.zoom+' px/s' },
  updateVZoomReadout(){ this.ui.vzoomReadout.textContent=Math.round(this.verticalZoom*100)+'%' },

  /* ── volume ── */
  setVolume(v){ this.volume=Math.max(0,Math.min(1,v)); this.applyVol(); this.updateVolumeReadout(); this.persistUiPrefs() },
  toggleMute(){ this.muted=!this.muted; this.applyVol(); this.ui.btnMute.textContent=this.muted?'🔇':'🔊' },
  applyVol(){ this.audioElement.volume=this.muted?0:this.volume },
  updateVolumeReadout(){
    this.ui.volumeReadout.textContent=Math.round(this.volume*100)+'%';
    this.ui.volumeSlider.value=Math.round(this.volume*100);
  },
});
