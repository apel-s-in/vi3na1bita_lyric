'use strict';
/* ── ke-ui.js: commands, bind, hotkeys, modals, layout, init ── */
Object.assign(App, {

  initCommands(){
    const A=this;
    this.commands={
      playPause(){ A.togglePlay() },
      stop(){ A.audioElement.pause();A.audioElement.currentTime=0;A.syncPlayhead();A.ui.btnPlay.textContent='▶ Play' },
      zoomIn(){ A.setZoom(A.zoom+10,true) },
      zoomOut(){ A.setZoom(A.zoom-10,true) },
      vzoomIn(){ A.setVerticalZoom(A.verticalZoom+.1) },
      vzoomOut(){ A.setVerticalZoom(A.verticalZoom-.1) },
      seekLeft(){ A.audioElement.currentTime=Math.max(0,A.audioElement.currentTime-.1);A.syncPlayhead() },
      seekRight(){ A.audioElement.currentTime=Math.min(A.duration||9999,A.audioElement.currentTime+.1);A.syncPlayhead() },
      seekLeftBig(){ A.audioElement.currentTime=Math.max(0,A.audioElement.currentTime-1);A.syncPlayhead() },
      seekRightBig(){ A.audioElement.currentTime=Math.min(A.duration||9999,A.audioElement.currentTime+1);A.syncPlayhead() },
      nudgeLeft(){ A.nudgeSelected(-.05) },
      nudgeRight(){ A.nudgeSelected(.05) },
      stretchLeft(){ A.stretchSelected('left',-.05) },
      stretchRight(){ A.stretchSelected('right',.05) },
      stretchGroupLeft(){ A.stretchSelectionEdge('left',-.05) },
      stretchGroupRight(){ A.stretchSelectionEdge('right',.05) },
      split(){ A.splitAtPlayhead() },
      mergeNext(){ A.mergeSelectedWithNext() },
      mergePrev(){ A.mergeSelectedWithPrev() },
      duplicate(){ A.duplicateSelected() },
      deleteSelected(){ A.deleteSelected() },
      selectAll(){ A.selectAll() },
      deselect(){ A.clearSelection() },
      undo(){ A.undo() },
      redo(){ A.redo() },
      centerPlayhead(){ A.centerOnPlayhead() },
      fitSong(){ A.fitSong() },
      zoomSelection(){ A.zoomToSelection() },
      scrollSelection(){ A.scrollToSelection() },
      gotoSelStart(){ A.gotoSelectionStart() },
      toggleAutoscroll(){ A.autoScroll=!A.autoScroll;A.ui.autoScroll.checked=A.autoScroll },
      toggleSnap(){ const v=A.snapStep?0:.25;A.snapStep=v;A.ui.snapSelect.value=v },
      exportActive(){ A.exportTrack(A.activeTrack()) },
      openHotkeys(){ A.openHotkeysModal() },
      switchTrack(){ A.switchActiveTrack() },
      toggleLineVis(){ const tr=A.trackByType('line');if(tr)A.toggleTrackProp(tr.id,'visible') },
      toggleWordsVis(){ const tr=A.trackByType('words');if(tr)A.toggleTrackProp(tr.id,'visible') },
      soloActive(){ const tr=A.activeTrack();if(tr)A.toggleTrackProp(tr.id,'solo') },
      lockActive(){ const tr=A.activeTrack();if(tr)A.toggleTrackProp(tr.id,'locked') },
      loopToggle(){ if(A.loop.enabled)A.clearLoop();else A.openLoopModal() },
      addLine(){ A.addNewLine() },
      addWord(){ A.addNewWord() },
      validate(){ A.openValidationModal() },
      help(){ A._openHelpModal() },
      navPrev(){ A.navigateItem(-1) },
      navNext(){ A.navigateItem(1) },
      deleteTrack(){ A.deleteActiveTrack() },
      exportPreview(){ A.openExportPreview() },
      editText(){
        const it=A.itemById(A.context.trackId,A.context.itemId); if(!it)return;
        const t=prompt('Текст:',it.text);
        if(t!==null){const tr=A.trackById(A.context.trackId);A.applyTrackEdit(tr,'Edit Text',()=>{it.text=t})}
      },
      splitAtCursor(){ A.splitAtCursor(A.context.cursorX) },
      batchCloseGaps(){ A._batchCloseGapsCtx() },
      batchDistribute(){
        const tr=A.activeTrack();
        if(tr&&A.selected.ids.size>1)
          A._distributeItemsEvenly([...A.selected.ids].map(id=>A.itemById(tr.id,id)).filter(Boolean));
      },
      batchNormalize(){
        const dur=A.num(prompt('Длительность (s):','1.0'),0); if(dur<=0)return;
        const tr=A.activeTrack(); if(!tr)return;
        A.applyTrackEdit(tr,'Batch Norm',()=>{
          [...A.selected.ids].forEach(id=>{const it=A.itemById(tr.id,id);if(it)it.end=it.start+dur});
        });
      },
      moveToPlayhead(){
        const tr=A.activeTrack(); if(!tr||!A.selected.ids.size)return;
        const items=[...A.selected.ids].map(id=>A.itemById(tr.id,id)).filter(Boolean);
        if(!items.length)return;
        const t=A.audioElement.currentTime,minS=Math.min(...items.map(i=>i.start)),delta=t-minS;
        A.applyTrackEdit(tr,'Move to Playhead',()=>{items.forEach(i=>{i.start+=delta;i.end+=delta})});
      },
      selTrack(){
        const tid=A.context.trackId,tr=A.trackById(tid); if(!tr)return;
        A.selected.trackId=tid;
        A.selected.ids=new Set(A.visibleItems(tr,A.ui.layerMode.value).map(i=>i.id));
        A.renderTimeline(); A.renderInspector();
      }
    };
  },

  runCommand(name){
    const cmd=this.commands[name];
    if(cmd)cmd(); else console.warn('Unknown command:',name);
  },

  /* ── bind ── */
  bind(){
    const u=this.ui,A=this;
    u.audioUpload.onchange=e=>A.loadAudio(e.target.files[0]);
    u.lineUpload.onchange=e=>A.loadTrackJSON(e.target.files[0],'line');
    u.wordsUpload.onchange=e=>A.loadTrackJSON(e.target.files[0],'words');
    u.btnExportActive.onclick=()=>A.runCommand('exportActive');
    u.btnExportLine.onclick=()=>A.exportTrack(A.trackByType('line'));
    u.btnExportWords.onclick=()=>A.exportTrack(A.trackByType('words'));
    u.btnExportAll.onclick=()=>A.exportAll();
    u.btnExportZip.onclick=()=>A.exportZip();
    u.btnSaveSession.onclick=()=>A.saveSessionToFile();
    u.btnLoadSession.onclick=()=>u.sessionUpload.click();
    u.sessionUpload.onchange=e=>A.loadSessionFromFile(e.target.files[0]);
    u.btnValidate.onclick=()=>A.runCommand('validate');
    u.btnRestoreSession.onclick=()=>A.openRecentModal();
    u.btnRecent.onclick=()=>A.openRecentModal();
    u.btnHotkeys.onclick=()=>A.runCommand('openHotkeys');
    u.btnHelp.onclick=()=>A.runCommand('help');
    u.btnVkbd.onclick=()=>A.openVkbdModal();
    u.btnVkbdClose.onclick=()=>u.vkbdModal.classList.add('hidden');
    u.btnHotkeysClose.onclick=()=>A.closeHotkeysModal();
    u.btnHotkeysSave.onclick=()=>A.saveKeymap();
    u.btnHotkeysReset.onclick=()=>{A.keymap=A.defaultKeymap();A.renderHotkeysModal()};
    u.hkSearch.oninput=()=>A.renderHotkeysModal();
    u.btnValidationClose.onclick=()=>u.validationModal.classList.add('hidden');
    u.btnValidationExport.onclick=()=>{u.validationModal.classList.add('hidden');A.runCommand('exportActive')};
    u.btnValidationFix.onclick=()=>A.autoFixOverlaps();
    u.btnValidationRerun.onclick=()=>A.runCommand('validate');
    u.btnHelpClose.onclick=()=>u.helpModal.classList.add('hidden');
    u.btnRenameCancel.onclick=()=>u.renameModal.classList.add('hidden');
    u.btnRecentClose.onclick=()=>u.recentModal.classList.add('hidden');
    u.btnRecentClearAll.onclick=()=>{A.clearAllDrafts();u.recentModal.classList.add('hidden')};
    u.btnLoopCancel.onclick=()=>u.loopModal.classList.add('hidden');
    u.btnLoopOk.onclick=()=>A.applyLoopFromModal();
    u.btnPlay.onclick=()=>A.runCommand('playPause');
    u.btnStop.onclick=()=>A.runCommand('stop');
    u.btnCenterPlayhead.onclick=()=>A.runCommand('centerPlayhead');
    u.btnLoop.onclick=()=>A.openLoopModal();
    u.btnLoopClear.onclick=()=>A.clearLoop();
    u.btnUndo.onclick=()=>A.runCommand('undo');
    u.btnRedo.onclick=()=>A.runCommand('redo');
    u.btnSelectAll.onclick=()=>A.runCommand('selectAll');
    u.btnDeselect.onclick=()=>A.runCommand('deselect');
    u.btnSplit.onclick=()=>A.runCommand('split');
    u.btnMergePrev.onclick=()=>A.runCommand('mergePrev');
    u.btnMerge.onclick=()=>A.runCommand('mergeNext');
    u.btnDuplicate.onclick=()=>A.runCommand('duplicate');
    u.btnAddLine.onclick=()=>A.runCommand('addLine');
    u.btnAddWord.onclick=()=>A.runCommand('addWord');
    u.btnDelete.onclick=()=>A.runCommand('deleteSelected');
    u.btnFitSong.onclick=()=>A.runCommand('fitSong');
    u.btnZoomSelection.onclick=()=>A.runCommand('zoomSelection');
    u.btnScrollSelection.onclick=()=>A.runCommand('scrollSelection');
    u.btnGotoSelection.onclick=()=>A.runCommand('gotoSelStart');
    u.zoomSlider.oninput=e=>A.setZoom(+e.target.value,true);
    u.vzoomSlider.oninput=e=>A.setVerticalZoom(+e.target.value/100);
    u.snapSelect.onchange=e=>{A.snapStep=e.target.value==='items'?'items':+e.target.value};
    u.autoScroll.onchange=e=>{A.autoScroll=e.target.checked;A.persistUiPrefs()};
    u.autosaveEnabled.onchange=e=>{A.autosaveEnabled=e.target.checked;A.persistUiPrefs()};
    u.autosaveInterval.onchange=e=>{A.autosaveIntervalSec=+e.target.value;A.persistUiPrefs();A.restartAutosaveLoop()};
    u.volumeSlider.oninput=e=>A.setVolume(+e.target.value/100);
    u.btnMute.onclick=()=>A.toggleMute();
    u.playbackRate.onchange=e=>{A.playbackRate=+e.target.value;A.audioElement.playbackRate=A.playbackRate};
    u.btnExportPreviewClose.onclick=()=>u.exportPreviewModal.classList.add('hidden');
    u.btnExportPreviewCopy.onclick=()=>{
      navigator.clipboard?.writeText(u.exportPreviewText.value);
      u.btnExportPreviewCopy.textContent='✓ Copied';
      setTimeout(()=>{u.btnExportPreviewCopy.textContent='📋 Copy'},1500);
    };
    u.btnExportPreviewDownload.onclick=()=>{if(A._exportPreviewTrack)A.doExportTrack(A._exportPreviewTrack)};

    u.btnRestoreYes.onclick=()=>{A.restoreDraftFromStorage(A._pendingDraftKey||A.DRAFT_KEY,true);u.restoreModal.classList.add('hidden')};
    u.btnRestoreNo.onclick=()=>u.restoreModal.classList.add('hidden');
    u.btnRestoreDelete.onclick=()=>{
      localStorage.removeItem(A._pendingDraftKey||A.DRAFT_KEY);
      A._removeFromRecent(A._pendingDraftKey||A.DRAFT_KEY);
      u.restoreModal.classList.add('hidden');
    };

    A.audioElement.addEventListener('timeupdate',()=>{
      A.syncPlayhead(); A.handleLoopTick();
      if(A.audioElement.paused){
        clearTimeout(A._previewDebounce);
        A._previewDebounce=setTimeout(()=>A.renderPreview(),80);
      }
    });
    A.audioElement.addEventListener('loadedmetadata',()=>{
      A.duration=A.audioElement.duration||A.duration||0; A.fullRender();
    });

    u.scrollArea.addEventListener('mousedown',e=>A.handleTimelineMouseDown(e));
    u.playheadHandle.addEventListener('mousedown',e=>A.startPlayheadDrag(e));
    document.addEventListener('mousemove',e=>A.handleGlobalMouseMove(e));
    document.addEventListener('mouseup',()=>A.handleGlobalMouseUp());
    u.sidebarResizer.addEventListener('mousedown',e=>A.startResize(e,'sidebar'));
    u.previewResizer.addEventListener('mousedown',e=>A.startResize(e,'preview'));
    u.scrollArea.addEventListener('contextmenu',e=>A.showContextMenu(e));

    document.addEventListener('click',e=>{
      if(!e.target.closest('#context-menu'))u.contextMenu.classList.add('hidden');
      ['hotkeysModal','validationModal','helpModal','renameModal','recentModal','loopModal','exportPreviewModal']
        .forEach(m=>{if(e.target===u[m])u[m].classList.add('hidden')});
    });

    A._setupContext();
    A._setupTouch();
    document.addEventListener('keydown',e=>A.handleHotkeys(e));

    // drag & drop files onto timeline
    const dz=u.timelineContainer;
    ['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{
      e.preventDefault();e.stopPropagation();dz.style.outline='2px dashed var(--acc)';
    }));
    ['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{
      e.preventDefault();e.stopPropagation();dz.style.outline='';
    }));
    dz.addEventListener('drop',e=>{
      const files=e.dataTransfer?.files; if(!files||!files.length)return;
      for(const f of files){
        if(f.type.startsWith('audio/')){A.loadAudio(f);break}
        if(f.name.endsWith('.json')){A.loadTrackJSON(f,f.name.toLowerCase().includes('word')?'words':'line');break}
        if(f.name.endsWith('.kep')){A.loadSessionFromFile(f);break}
      }
    });

    window.addEventListener('beforeunload',e=>{if(A.dirty){e.preventDefault();e.returnValue=''}});

    u.timelineContainer.addEventListener('wheel',e=>{
      if(e.ctrlKey){e.preventDefault();A.setZoom(A.zoom+(e.deltaY<0?10:-10),true)}
      else if(e.shiftKey){e.preventDefault();A.setVerticalZoom(A.verticalZoom+(e.deltaY<0?.1:-.1))}
    },{passive:false});

    u.timelineContainer.addEventListener('scroll',()=>{
      clearTimeout(A._scrollRenderTimer);
      A._scrollRenderTimer=setTimeout(()=>A.renderTimeline(),60);
    });

    if(window.ResizeObserver)new ResizeObserver(()=>A.renderRuler()).observe(u.timelineContainer);
    else window.addEventListener('resize',()=>A.renderRuler());
  },

  /* ── context menu ── */
  showContextMenu(e){
    e.preventDefault();
    const rect=this.ui.scrollArea.getBoundingClientRect();
    const px=e.clientX-rect.left+this.ui.timelineContainer.scrollLeft;
    this.context.cursorX=px/this.zoom;
    const item=e.target.closest('.track-item');
    this.context.trackId=item?.dataset.tid||this.project.activeTrackId;
    this.context.itemId=item?.dataset.id||null;
    if(item&&!this.selected.ids.has(this.context.itemId))
      this.selectItem(this.context.trackId,this.context.itemId);
    const m=this.ui.contextMenu;
    m.style.left=Math.min(e.clientX,window.innerWidth-220)+'px';
    m.style.top=Math.min(e.clientY,window.innerHeight-340)+'px';
    m.classList.remove('hidden');
  },

  _setupContext(){
    const hide=()=>this.ui.contextMenu.classList.add('hidden');
    const map={
      ctxEdit:'editText', ctxSplit:'split', ctxSplitCursor:'splitAtCursor',
      ctxMergePrev:'mergePrev', ctxMergeNext:'mergeNext',
      ctxDuplicate:'duplicate', ctxAddLine:'addLine', ctxAddWord:'addWord',
      ctxBatchClose:'batchCloseGaps', ctxBatchDist:'batchDistribute', ctxBatchNorm:'batchNormalize',
      ctxMovePlayhead:'moveToPlayhead', ctxZoomSelection:'zoomSelection',
      ctxScrollSelection:'scrollSelection', ctxDelete:'deleteSelected',
      ctxSelTrack:'selTrack', ctxDeleteTrack:'deleteTrack'
    };
    Object.entries(map).forEach(([key,cmd])=>{
      if(this.ui[key])this.ui[key].onclick=()=>{hide();this.runCommand(cmd)};
    });
  },

  /* ── hotkeys ── */
  defaultKeymap(){
    return{
      play_pause:{key:'Space',desc:'Play / Pause',ru:'Воспроизведение / Пауза'},
      stop:{key:'Escape',desc:'Stop',ru:'Стоп'},
      zoom_in:{key:'+',desc:'Zoom In',ru:'Увеличить масштаб'},
      zoom_in_num:{key:'NumpadAdd',desc:'Zoom In (numpad)',ru:'Увеличить масштаб (нампад)'},
      zoom_out:{key:'-',desc:'Zoom Out',ru:'Уменьшить масштаб'},
      zoom_out_num:{key:'NumpadSubtract',desc:'Zoom Out (numpad)',ru:'Уменьшить масштаб (нампад)'},
      vzoom_in:{key:'Alt+ArrowUp',desc:'Vertical Zoom In',ru:'Вертикальный масштаб +'},
      vzoom_out:{key:'Alt+ArrowDown',desc:'Vertical Zoom Out',ru:'Вертикальный масштаб −'},
      seek_left:{key:'ArrowLeft',desc:'Seek Left 0.1s',ru:'На 0.1с назад'},
      seek_right:{key:'ArrowRight',desc:'Seek Right 0.1s',ru:'На 0.1с вперёд'},
      seek_left_big:{key:'Shift+ArrowLeft',desc:'Seek Left 1s',ru:'На 1с назад'},
      seek_right_big:{key:'Shift+ArrowRight',desc:'Seek Right 1s',ru:'На 1с вперёд'},
      nudge_left:{key:'Alt+ArrowLeft',desc:'Nudge selected left',ru:'Сдвинуть выбранное влево'},
      nudge_right:{key:'Alt+ArrowRight',desc:'Nudge selected right',ru:'Сдвинуть выбранное вправо'},
      stretch_left:{key:'Alt+Shift+ArrowLeft',desc:'Stretch left edge',ru:'Растянуть левую границу'},
      stretch_right:{key:'Alt+Shift+ArrowRight',desc:'Stretch right edge',ru:'Растянуть правую границу'},
      split:{key:'S',desc:'Split at playhead',ru:'Разрезать на позиции воспроизведения'},
      merge_next:{key:'M',desc:'Merge with next',ru:'Объединить со следующим'},
      merge_prev:{key:'Shift+M',desc:'Merge with previous',ru:'Объединить с предыдущим'},
      duplicate:{key:'D',desc:'Duplicate selected',ru:'Дублировать выбранное'},
      delete:{key:'Delete',desc:'Delete selected',ru:'Удалить выбранное'},
      delete_back:{key:'Backspace',desc:'Delete selected (backspace)',ru:'Удалить выбранное (backspace)'},
      select_all:{key:'Ctrl+A',desc:'Select all',ru:'Выбрать всё'},
      deselect:{key:'Ctrl+D',desc:'Deselect',ru:'Снять выделение'},
      undo:{key:'Ctrl+Z',desc:'Undo',ru:'Отменить'},
      redo:{key:'Ctrl+Y',desc:'Redo',ru:'Повторить'},
      redo2:{key:'Ctrl+Shift+Z',desc:'Redo (alt)',ru:'Повторить (альт)'},
      center_playhead:{key:'C',desc:'Center on playhead',ru:'Центрировать на воспроизведении'},
      fit_song:{key:'F',desc:'Fit entire song',ru:'Вместить всю песню'},
      zoom_selection:{key:'Z',desc:'Zoom to selection',ru:'Масштаб к выделению'},
      scroll_selection:{key:'G',desc:'Scroll to selection',ru:'Прокрутить к выделению'},
      goto_sel_start:{key:'Home',desc:'Go to selection start',ru:'Перейти к началу выделения'},
      toggle_autoscroll:{key:'L',desc:'Toggle auto-scroll',ru:'Вкл/выкл авто-прокрутку'},
      toggle_snap:{key:'N',desc:'Toggle snap',ru:'Вкл/выкл привязку'},
      save_json:{key:'Ctrl+S',desc:'Export active track',ru:'Экспортировать активную дорожку'},
      open_hotkeys:{key:'Ctrl+K',desc:'Open hotkeys panel',ru:'Открыть настройки горячих клавиш'},
      toggle_track:{key:'Tab',desc:'Switch active track',ru:'Переключить активную дорожку'},
      toggle_line_vis:{key:'1',desc:'Toggle line track visibility',ru:'Видимость линейной дорожки'},
      toggle_words_vis:{key:'2',desc:'Toggle words track visibility',ru:'Видимость дорожки слов'},
      solo_active:{key:'3',desc:'Solo active track',ru:'Соло активной дорожки'},
      lock_active:{key:'4',desc:'Lock/unlock active track',ru:'Заблокировать/разблокировать активную дорожку'},
      loop_toggle:{key:'Ctrl+L',desc:'Toggle loop',ru:'Включить/выключить петлю'},
      add_line:{key:'Ctrl+Shift+L',desc:'Add new line at playhead',ru:'Добавить новую строку'},
      add_word:{key:'Ctrl+Shift+W',desc:'Add new word at playhead',ru:'Добавить новое слово'},
      validate:{key:'Ctrl+Shift+V',desc:'Open validation panel',ru:'Открыть панель валидации'},
      help:{key:'?',desc:'Open help',ru:'Открыть справку по клавишам'},
      stretch_group_left:{key:'Ctrl+Alt+ArrowLeft',desc:'Stretch group left edge',ru:'Растянуть группу (левый край)'},
      stretch_group_right:{key:'Ctrl+Alt+ArrowRight',desc:'Stretch group right edge',ru:'Растянуть группу (правый край)'},
      nav_prev:{key:'ArrowUp',desc:'Previous item',ru:'Предыдущий элемент'},
      nav_next:{key:'ArrowDown',desc:'Next item',ru:'Следующий элемент'},
      export_preview:{key:'Ctrl+E',desc:'Export preview',ru:'Предпросмотр экспорта'},
      delete_track:{key:'Ctrl+Shift+Delete',desc:'Delete active track',ru:'Удалить активную дорожку'}
    };
  },

  initKeymap(){
    const def=this.defaultKeymap();
    try{
      const saved=JSON.parse(localStorage.getItem(this.KM_KEY)||'{}');
      this.keymap={};
      Object.keys(def).forEach(cmd=>{this.keymap[cmd]={...def[cmd],...(saved[cmd]||{})}});
    }catch{this.keymap=this.defaultKeymap()}
  },

  saveKeymap(){
    if(this.hotkeysWaiting)return;
    const conflicts=this.findHotkeyConflicts();
    if(conflicts.length&&!confirm(`Конфликты:\n${conflicts.map(c=>c.keys+': '+c.cmds.join(', ')).join('\n')}\nСохранить?`))return;
    localStorage.setItem(this.KM_KEY,JSON.stringify(this.keymap));
    this.ui.hotkeysModal.classList.add('hidden');
  },

  closeHotkeysModal(){ this.hotkeysWaiting=null; this.ui.hotkeysModal.classList.add('hidden') },

  findHotkeyConflicts(){
    const map={};
    Object.entries(this.keymap).forEach(([cmd,cfg])=>{
      if(!cfg.key)return;
      (map[cfg.key]=map[cfg.key]||[]).push(cmd);
    });
    return Object.entries(map).filter(([,v])=>v.length>1).map(([keys,cmds])=>({keys,cmds}));
  },

  openHotkeysModal(){
    this.hotkeysWaiting=null; this.renderHotkeysModal();
    this.ui.hotkeysModal.classList.remove('hidden');
    setTimeout(()=>this.ui.hkSearch.focus(),80);
  },

  renderHotkeysModal(){
    const q=(this.ui.hkSearch.value||'').toLowerCase();
    const conflicts=this.findHotkeyConflicts();
    const cSet=new Set(conflicts.flatMap(c=>c.cmds));
    this.ui.hotkeysConflicts.textContent=conflicts.length
      ?'⚠ Конфликты: '+conflicts.map(c=>`"${c.keys}" (${c.cmds.join(', ')})`).join('; '):'';
    const rows=Object.entries(this.keymap).filter(([cmd,cfg])=>
      !q||cmd.includes(q)||cfg.ru?.toLowerCase().includes(q)||cfg.key?.toLowerCase().includes(q));
    this.ui.hotkeysList.innerHTML=rows.map(([cmd,cfg])=>{
      const isW=this.hotkeysWaiting===cmd;
      return`<div class="hk-row">
        <span class="hk-name">${cfg.ru||cmd}</span>
        <div class="hk-key${isW?' waiting':''}${cSet.has(cmd)?' conflict':''}">${isW?'Press key…':(cfg.key||'—')}</div>
        <button class="btn" data-set="${cmd}">Set</button>
        <button class="btn" data-clear="${cmd}">Clear</button>
        <span class="hk-desc">${cfg.desc||''}</span>
      </div>`;
    }).join('');
    this.ui.hotkeysList.querySelectorAll('[data-set]').forEach(b=>{
      b.onclick=()=>{this.hotkeysWaiting=b.dataset.set;this.renderHotkeysModal()};
    });
    this.ui.hotkeysList.querySelectorAll('[data-clear]').forEach(b=>{
      b.onclick=()=>{if(this.keymap[b.dataset.clear])this.keymap[b.dataset.clear].key='';this.hotkeysWaiting=null;this.renderHotkeysModal()};
    });
  },

  captureHotkeyInput(e){
    if(!this.hotkeysWaiting)return false;
    e.preventDefault(); e.stopPropagation();
    if(e.key==='Escape'){this.hotkeysWaiting=null;this.renderHotkeysModal();return true}
    const parts=[];
    if(e.ctrlKey)parts.push('Ctrl'); if(e.altKey)parts.push('Alt'); if(e.shiftKey)parts.push('Shift');
    const k=e.code==='Space'?'Space':e.key;
    if(!['Control','Alt','Shift','Meta'].includes(k))parts.push(k);
    const combo=parts.join('+');
    if(combo)this.keymap[this.hotkeysWaiting].key=combo;
    this.hotkeysWaiting=null; this.renderHotkeysModal(); return true;
  },

  matchHotkey(cmd,e){
    const cfg=this.keymap[cmd]; if(!cfg||!cfg.key)return false;
    const parts=cfg.key.split('+');
    const needCtrl=parts.includes('Ctrl'),needAlt=parts.includes('Alt'),needShift=parts.includes('Shift');
    const kp=parts.filter(p=>!['Ctrl','Alt','Shift'].includes(p))[0]||'';
    return e.ctrlKey===needCtrl&&e.altKey===needAlt&&e.shiftKey===needShift&&(e.key===kp||e.code===kp);
  },

  _hotkeyCommandMap:Object.freeze({
    play_pause:'playPause', stop:'stop',
    zoom_in:'zoomIn', zoom_in_num:'zoomIn', zoom_out:'zoomOut', zoom_out_num:'zoomOut',
    vzoom_in:'vzoomIn', vzoom_out:'vzoomOut',
    seek_left:'seekLeft', seek_right:'seekRight',
    seek_left_big:'seekLeftBig', seek_right_big:'seekRightBig',
    nudge_left:'nudgeLeft', nudge_right:'nudgeRight',
    stretch_left:'stretchLeft', stretch_right:'stretchRight',
    split:'split', merge_next:'mergeNext', merge_prev:'mergePrev',
    duplicate:'duplicate', delete:'deleteSelected', delete_back:'deleteSelected',
    select_all:'selectAll', deselect:'deselect',
    undo:'undo', redo:'redo', redo2:'redo',
    center_playhead:'centerPlayhead', fit_song:'fitSong',
    zoom_selection:'zoomSelection', scroll_selection:'scrollSelection', goto_sel_start:'gotoSelStart',
    toggle_autoscroll:'toggleAutoscroll', toggle_snap:'toggleSnap',
    save_json:'exportActive', open_hotkeys:'openHotkeys', toggle_track:'switchTrack',
    toggle_line_vis:'toggleLineVis', toggle_words_vis:'toggleWordsVis',
    solo_active:'soloActive', lock_active:'lockActive',
    loop_toggle:'loopToggle', add_line:'addLine', add_word:'addWord',
    validate:'validate', help:'help',
    stretch_group_left:'stretchGroupLeft', stretch_group_right:'stretchGroupRight',
    nav_prev:'navPrev', nav_next:'navNext',
    export_preview:'exportPreview', delete_track:'deleteTrack'
  }),

  handleHotkeys(e){
    if(this.hotkeysWaiting){this.captureHotkeyInput(e);return}
    const tag=e.target.tagName;
    const isInput=tag==='INPUT'||tag==='TEXTAREA'||e.target.isContentEditable;
    const allowInInput=['undo','redo','redo2','save_json','open_hotkeys','select_all'];
    if(isInput&&!allowInInput.some(cmd=>this.matchHotkey(cmd,e)))return;
    for(const [hk,cmd] of Object.entries(this._hotkeyCommandMap)){
      if(this.matchHotkey(hk,e)){e.preventDefault();this.runCommand(cmd);return}
    }
  },

  /* ── touch ── */
  _setupTouch(){
    const tc=this.ui.timelineContainer,sa=this.ui.scrollArea;
    let ts=null;
    sa.addEventListener('touchstart',e=>{
      if(e.touches.length===1){
        ts={type:'seek',startX:e.touches[0].clientX,startScroll:tc.scrollLeft};
      }else if(e.touches.length===2){
        const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
        ts={type:'pinch',startDist:d,startZoom:this.zoom}; e.preventDefault();
      }
    },{passive:false});
    sa.addEventListener('touchmove',e=>{
      if(!ts)return;
      if(ts.type==='seek'&&e.touches.length===1){tc.scrollLeft=ts.startScroll-(e.touches[0].clientX-ts.startX)}
      else if(ts.type==='pinch'&&e.touches.length===2){
        e.preventDefault();
        const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
        this.setZoom(Math.round(ts.startZoom*(d/ts.startDist)),false);
      }
    },{passive:false});
    sa.addEventListener('touchend',()=>{ts=null});
    let lastTap=0;
    sa.addEventListener('touchend',e=>{
      if(e.changedTouches.length!==1)return;
      const now=Date.now(); if(now-lastTap<300)this.togglePlay(); lastTap=now;
    });
  },

  /* ── modals ── */
  openVkbdModal(){
    if(this._vkbdKeyHandler)document.removeEventListener('keydown',this._vkbdKeyHandler);
    const km=this.keymap,rev={};
    Object.entries(km).forEach(([cmd,cfg])=>{if(cfg.key)rev[cfg.key]=(rev[cfg.key]||[]).concat(cmd)});
    const rows=[
      ['Escape','F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12'],
      ['`','1','2','3','4','5','6','7','8','9','0','-','=','Backspace'],
      ['Tab','q','Q','w','W','e','r','t','y','u','i','o','p','[',']','\\'],
      ['CapsLock','a','A','s','S','d','D','f','F','g','G','h','j','k','l',';',"'",'Enter'],
      ['Shift','z','Z','x','c','C','v','V','b','n','m',',','.','/','Shift'],
      ['Ctrl','Alt','Space','Alt','Ctrl']
    ];
    const getCmd=k=>{
      for(const c of[k,k.toUpperCase(),k.toLowerCase()]){if(rev[c])return rev[c].map(cmd=>km[cmd]?.ru||cmd).join(' / ')}
      return null;
    };
    this.ui.vkbdDisplay.innerHTML=rows.map(row=>'<div style="display:flex;gap:3px;margin-bottom:3px">'+
      row.map(k=>{
        const cmd=getCmd(k);
        const bg=cmd?'background:#1e3a2e;border-color:#43a047':'background:#1b1f27;border-color:#465063';
        return`<div title="${cmd||k}" style="${bg};border:1px solid;border-radius:4px;padding:3px 5px;min-width:32px;text-align:center;font-size:10px;cursor:default">
          <div style="font-weight:700;font-size:11px">${k.length>4?k.slice(0,4):k}</div>
          ${cmd?`<div style="font-size:9px;color:#7bd882;overflow:hidden;max-width:56px;text-overflow:ellipsis;white-space:nowrap">${cmd}</div>`:''}
        </div>`;
      }).join('')+'</div>').join('');
    this.ui.vkbdHint.textContent='';
    this._vkbdKeyHandler=ev=>{
      const found=Object.entries(km).find(([,c])=>c.key&&(c.key===ev.key||c.key.endsWith('+'+ev.key)));
      this.ui.vkbdHint.textContent=found?`${ev.key} → ${found[1].ru||found[0]}`:`${ev.key} — не назначено`;
    };
    document.addEventListener('keydown',this._vkbdKeyHandler);
    this.ui.btnVkbdClose.onclick=()=>{
      document.removeEventListener('keydown',this._vkbdKeyHandler);
      this.ui.vkbdModal.classList.add('hidden');
    };
    this.ui.vkbdModal.classList.remove('hidden');
  },

  _openHelpModal(){
    this.ui.helpList.innerHTML=Object.entries(this.keymap).map(([,cfg])=>`
      <div class="hk-row">
        <span class="hk-name">${cfg.ru||cfg.desc}</span>
        <div class="hk-key">${cfg.key||'—'}</div>
        <span></span><span></span>
        <span class="hk-desc">${cfg.desc}</span>
      </div>`).join('');
    this.ui.helpModal.classList.remove('hidden');
  },

  /* ── flexible layout ── */
  initFlexLayout(){
    this._bindTimelineResizer();
    this._bindSidebarCollapse();
    this._bindPanelCollapse();
    this._bindToolbarCompact();
    this._bindLayoutLock();
    this._bindToolbarGroupDrag();
    this._restoreLayoutPrefs();
    this._applyLayoutLockUi();
  },

  _bindTimelineResizer(){
    const el=this.ui.timelineResizer,wm=this.ui.workspaceMain;
    let sY=0,sH=0,act=false;
    el.addEventListener('mousedown',e=>{
      e.preventDefault();act=true;sY=e.clientY;sH=wm.offsetHeight;
      document.body.style.cursor='row-resize';el.classList.add('active');
    });
    document.addEventListener('mousemove',e=>{
      if(!act)return;
      const h=Math.max(160,Math.min(window.innerHeight-60,sH+(e.clientY-sY)));
      wm.style.flex='none';wm.style.height=h+'px';
      this.renderRuler();this._saveLayoutPref('workspaceH',h);
    });
    document.addEventListener('mouseup',()=>{
      if(act){act=false;document.body.style.cursor='';el.classList.remove('active')}
    });
  },

  _bindSidebarCollapse(){
    const btn=this.ui.sidebarCollapseBtn,sb=this.ui.sidebar;
    btn.addEventListener('click',()=>{
      const col=sb.classList.toggle('collapsed-sidebar');
      btn.textContent=col?'▶':'◀';
      this._saveLayoutPref('sidebarCollapsed',col);
      setTimeout(()=>this.renderRuler(),160);
    });
  },

  _bindPanelCollapse(){
    const setup=(btn,panel,key,onToggle)=>{
      btn.addEventListener('click',()=>{
        const col=panel.classList.toggle('panel-collapsed');
        btn.textContent=col?'▼':'▲';
        this._saveLayoutPref(key,col);
        onToggle?.(col);
      });
    };
    setup(this.ui.inspectorCollapseBtn,this.ui.inspectorPanel,'inspectorCollapsed');
    setup(this.ui.previewCollapseBtn,this.ui.previewPanel,'previewCollapsed',col=>{
      this.ui.previewResizer.style.display=col?'none':'block';
    });
  },

  _bindToolbarCompact(){
    const btn=this.ui.toolbarCompactBtn,tb=this.ui.toolbar;
    btn.addEventListener('click',()=>{
      const c=tb.classList.toggle('compact');
      btn.textContent=c?'▼':'▲';
      this._saveLayoutPref('toolbarCompact',c);
    });
  },

  _bindLayoutLock(){
    this.ui.btnLayoutLock?.addEventListener('click',()=>{
      this.layoutUnlocked=!this.layoutUnlocked;
      this.persistUiPrefs();
      this._applyLayoutLockUi();
    });
  },

  _applyLayoutLockUi(){
    document.body.classList.toggle('layout-locked',!this.layoutUnlocked);
    if(this.ui.btnLayoutLock){
      this.ui.btnLayoutLock.textContent=this.layoutUnlocked?'🔓':'🔒';
      this.ui.btnLayoutLock.title=this.layoutUnlocked?'Интерфейс разблокирован: можно настраивать и двигать':'Интерфейс заблокирован: настройка и перетаскивание отключены';
    }
    document.querySelectorAll('.grp[data-grp]').forEach(grp=>{
      grp.draggable=!!this.layoutUnlocked;
    });
  },

  _bindToolbarGroupDrag(){
    document.querySelectorAll('.row').forEach(row=>this._setupRowDragDrop(row));
  },

  _setupRowDragDrop(row){
    let dragEl=null,ph=null;
    row.addEventListener('dragstart',e=>{
      if(!this.layoutUnlocked){e.preventDefault();return}
      const handle=e.target.closest('.grp-handle');
      const grp=handle?.closest('.grp[draggable]');
      if(!grp){e.preventDefault();return}
      dragEl=grp;
      dragEl.classList.add('dragging');
      e.dataTransfer.effectAllowed='move';
      e.dataTransfer.setData('text/plain',grp.id);
      ph=document.createElement('div');
      ph.style.cssText=`width:${grp.offsetWidth}px;height:${grp.offsetHeight}px;border:1px dashed var(--br2);border-radius:4px;flex-shrink:0`;
      setTimeout(()=>grp.after(ph),0);
    });
    row.addEventListener('dragover',e=>{
      if(!this.layoutUnlocked||!dragEl||!ph)return;
      e.preventDefault();
      e.dataTransfer.dropEffect='move';
      const over=e.target.closest('.grp[draggable]');
      if(!over||over===dragEl)return;
      const r=over.getBoundingClientRect();
      e.clientX<r.left+r.width/2?over.before(ph):over.after(ph);
    });
    row.addEventListener('drop',e=>{
      if(!this.layoutUnlocked||!dragEl||!ph)return;
      e.preventDefault();
      ph.replaceWith(dragEl);
      dragEl.classList.remove('dragging');
      dragEl=null;
      ph=null;
      this._saveToolbarOrder();
    });
    row.addEventListener('dragend',()=>{
      dragEl?.classList.remove('dragging');
      ph?.remove();
      dragEl=null;
      ph=null;
    });
    row.addEventListener('dragenter',e=>{if(this.layoutUnlocked&&e.target===row)row.classList.add('row-drag-over')});
    row.addEventListener('dragleave',e=>{if(e.target===row)row.classList.remove('row-drag-over')});
    ['drop','dragend'].forEach(ev=>row.addEventListener(ev,()=>row.classList.remove('row-drag-over')));
  },

  _saveToolbarOrder(){
    const order={};
    document.querySelectorAll('.row').forEach(row=>{
      order[row.id||row.dataset.row]=[...row.querySelectorAll('.grp[data-grp]')].map(g=>g.dataset.grp);
    });
    this._saveLayoutPref('toolbarOrder',order);
  },

  _restoreToolbarOrder(order){
    if(!order)return;
    Object.entries(order).forEach(([rowId,grpIds])=>{
      const row=document.getElementById(rowId)||document.querySelector(`[data-row="${rowId}"]`);
      if(!row)return;
      grpIds.forEach(gId=>{
        const g=document.querySelector(`[data-grp="${gId}"]`);
        if(g)row.appendChild(g);
      });
    });
  },

  _saveLayoutPref(key,val){
    try{
      const p=JSON.parse(localStorage.getItem(this.UI_KEY)||'{}');
      p['layout_'+key]=val;
      localStorage.setItem(this.UI_KEY,JSON.stringify(p));
    }catch(e){console.warn('layout pref save:',e)}
  },

  _restoreLayoutPrefs(){
    try{
      const p=JSON.parse(localStorage.getItem(this.UI_KEY)||'{}');
      const g=k=>p['layout_'+k];
      if(g('toolbarCompact')){this.ui.toolbar.classList.add('compact');this.ui.toolbarCompactBtn.textContent='▼'}
      if(g('toolbarOrder'))this._restoreToolbarOrder(g('toolbarOrder'));
      if(g('sidebarCollapsed')){this.ui.sidebar.classList.add('collapsed-sidebar');this.ui.sidebarCollapseBtn.textContent='▶'}
      if(g('inspectorCollapsed')){this.ui.inspectorPanel.classList.add('panel-collapsed');this.ui.inspectorCollapseBtn.textContent='▼'}
      if(g('previewCollapsed')){
        this.ui.previewPanel.classList.add('panel-collapsed');
        this.ui.previewCollapseBtn.textContent='▼';
        this.ui.previewResizer.style.display='none';
      }else{
        this.ui.previewPanel.classList.remove('panel-collapsed');
        this.ui.previewCollapseBtn.textContent='▲';
        this.ui.previewResizer.style.display='block';
      }
      const wh=g('workspaceH');
      if(wh){this.ui.workspaceMain.style.flex='none';this.ui.workspaceMain.style.height=wh+'px'}
    }catch(e){console.warn('layout restore:',e)}
  },

  /* ── init ── */
  init(){
    this.cache();
    this.audioElement=this.ui.audioPlayer;
    this.initCommands();
    this.initKeymap();
    this.restoreUiPrefs();
    this.bind();
    this.applyVol();
    this.updateZoomReadout();
    this.updateVZoomReadout();
    this.updateVolumeReadout();
    this.updateSaveStatus('Saved',false);
    this.pushHistory('Initial');
    this.checkDraftOnLaunch();
    this.startAutosaveLoop();
    this.initFlexLayout();
    this.fullRender();
  },
});

document.addEventListener('DOMContentLoaded',()=>App.init());
