// FILE: /ke-editor.js  (delta — changed sections)
'use strict';
/* ── ke-editor.js: edit ops, inspector, preview, export, session, validation ── */
Object.assign(App, {

  /* ═══════════════════════════════════════════
     PREVIEW — split into structural rebuild + playback sync
  ═══════════════════════════════════════════ */
  _previewStructureVersion: 0,
  _previewRenderedVersion:  -1,

  /* Call this after any structural change (edit/load/mapping change) */
  invalidatePreviewStructure() {
    this._previewStructureVersion++;
  },

  /* Full render — only when structure changed */
  renderPreview() {
    this.invalidatePreviewStructure();
    this._rebuildPreviewDOM();
  },

  _rebuildPreviewDOM() {
    const lc = this.ui.lyricsContainer;
    if (!lc) return;

    this.clearPreviewDomMap();
    this._previewRenderedVersion = this._previewStructureVersion;

    const lineTr  = this.project.tracks.find(t => t.type === 'line');
    const wordsTr = this.project.tracks.find(t => t.type === 'words');

    // Пересобрать mapping явно один раз до цикла (не lazy)
    this.invalidatePreviewMap('preview-rebuild');
    this.rebuildPreviewMap();

    const frag = document.createDocumentFragment();

    /* ── WORDS TRACK takes priority ── */
    if (wordsTr) {
      const lineItems = wordsTr.items
        .filter(i => i.kind === 'line')
        .sort((a, b) => a.start - b.start);

      lineItems.forEach(line => {
        const lineEl = document.createElement('div');
        lineEl.className = 'lyric-line';
        lineEl.dataset.trackId = wordsTr.id;
        lineEl.dataset.itemId  = line.id;

        // Get words via mapping layer (with fallback)
        const words = this.getWordsForPreviewLine(wordsTr.id, line.id);
        words.forEach(w => {
          const span = document.createElement('span');
          span.className = 'lyric-word';
          span.textContent = (w.text || '') + ' ';
          span.dataset.trackId = wordsTr.id;
          span.dataset.itemId  = w.id;
          lineEl.appendChild(span);
          this.registerPreviewWordEl(wordsTr.id, w.id, span);
        });

        if (!words.length) {
          lineEl.textContent = line.text || '';
        }

        frag.appendChild(lineEl);
        this.registerPreviewLineEl(wordsTr.id, line.id, lineEl);
      });

    /* ── LINE TRACK fallback ── */
    } else if (lineTr) {
      const lineItems = lineTr.items
        .filter(i => i.kind === 'line')
        .sort((a, b) => a.start - b.start);

      lineItems.forEach(line => {
        const lineEl = document.createElement('div');
        lineEl.className = 'lyric-line';
        lineEl.dataset.trackId = lineTr.id;
        lineEl.dataset.itemId  = line.id;
        lineEl.textContent     = line.text || '';
        frag.appendChild(lineEl);
        this.registerPreviewLineEl(lineTr.id, line.id, lineEl);
      });
    }

    lc.innerHTML = '';
    lc.appendChild(frag);
  },

  /* ── Playback sync — no innerHTML, only class updates ── */
  _syncPreviewPlayback(t) {
    // Rebuild structure if stale
    if (this._previewRenderedVersion !== this._previewStructureVersion) {
      this._rebuildPreviewDOM();
    }

    const wordsTr = this.project.tracks.find(tr => tr.type === 'words');
    const lineTr  = this.project.tracks.find(tr => tr.type === 'line');
    const activeTr = wordsTr || lineTr;
    if (!activeTr) return;

    const lineItems = activeTr.items.filter(i => i.kind === 'line');

    lineItems.forEach(line => {
      const lineEl = this.getPreviewLineEl(activeTr.id, line.id);
      if (!lineEl) return;

      const lineActive = t >= line.start && t < line.end;
      this.safeSetClass(lineEl, 'playing', lineActive);

      if (wordsTr) {
        const words = this.getWordsForPreviewLine(activeTr.id, line.id);
        words.forEach(w => {
          const wEl = this.getPreviewWordEl(wordsTr.id, w.id);
          if (!wEl) return;
          this.safeSetClass(wEl, 'playing', t >= w.start && t < w.end);
        });
      }
    });
  },

  /* ═══════════════════════════════════════════
     SPLIT  (improved: char-boundary aware + Intl.Segmenter)
  ═══════════════════════════════════════════ */
  splitItem(trackId, itemId, atTime) {
    const tr   = this.trackById(trackId);
    const item = this.itemById(trackId, itemId);
    if (!tr || !item || tr.locked) return;

    const t = atTime !== undefined
      ? atTime
      : this.audioElement.currentTime;

    if (t <= item.start + this.MIN_DUR || t >= item.end - this.MIN_DUR) return;

    this.applyTrackEdit(tr, 'split', () => {
      const ratio  = (t - item.start) / (item.end - item.start);
      const { before, after } = this._splitText(item.text || '', ratio, item.chars);

      const newItem = {
        id:     this.uid(),
        kind:   item.kind,
        start:  t,
        end:    item.end,
        text:   after,
        lineId: item.lineId,
        chars:  item.chars ? this._splitChars(item.chars, t, item.start, item.end) : undefined,
      };
      item.end  = t;
      item.text = before;
      if (item.chars) item.chars = this._splitCharsLeft(item.chars, t, item.start, item.end);

      const idx = tr.items.indexOf(item);
      tr.items.splice(idx + 1, 0, newItem);

      this.selected = { trackId, ids: new Set([item.id, newItem.id]) };
      this.invalidatePreviewMap('split');
      this.invalidatePlaybackIndex();
    });
  },

  /* Smart text split: char-boundary → Intl.Segmenter → word → char */
  _splitText(text, ratio, chars) {
    if (!text) return { before: '', after: '' };

    // Tier 1: char boundaries in item data
    if (chars && chars.length > 0) {
      const idx = Math.max(1, Math.round(chars.length * ratio));
      const before = chars.slice(0, idx).map(c => c.t || '').join('');
      const after  = chars.slice(idx).map(c => c.t || '').join('');
      return { before: before.trimEnd(), after: after.trimStart() };
    }

    // Tier 2: Intl.Segmenter on words
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      try {
        const seg = new Intl.Segmenter(undefined, { granularity: 'word' });
        const segs = [...seg.segment(text)].filter(s => s.isWordLike);
        if (segs.length > 1) {
          const idx = Math.max(1, Math.round(segs.length * ratio));
          const splitAt = segs[idx]?.index ?? Math.round(text.length * ratio);
          return {
            before: text.slice(0, splitAt).trimEnd(),
            after:  text.slice(splitAt).trimStart(),
          };
        }
      } catch (_) { /* fallback */ }
    }

    // Tier 3: simple space-word split
    return this.smartTextSplit(text, ratio);
  },

  /* Split chars array at a time boundary */
  _splitCharsLeft(chars, atTime, itemStart, itemEnd) {
    if (!chars) return undefined;
    return chars.filter(c => (c.s !== undefined ? c.s : itemStart) < atTime);
  },
  _splitChars(chars, atTime, itemStart, itemEnd) {
    if (!chars) return undefined;
    return chars.filter(c => (c.s !== undefined ? c.s : itemStart) >= atTime);
  },

  /* ═══════════════════════════════════════════
     MERGE  (improved: preserves chars, spaces, link)
  ═══════════════════════════════════════════ */
  mergeWithPrev(trackId, itemId) {
    const tr   = this.trackById(trackId);
    const item = this.itemById(trackId, itemId);
    if (!tr || !item || tr.locked) return;

    const sorted = tr.items.filter(i => i.kind === item.kind)
                            .sort((a, b) => a.start - b.start);
    const idx  = sorted.findIndex(i => i.id === item.id);
    if (idx <= 0) return;
    const prev = sorted[idx - 1];

    this.applyTrackEdit(tr, 'merge', () => {
      // Merge text preserving single space
      const mergedText = this.mergeTexts(prev.text || '', item.text || '');

      // Merge chars arrays if both present
      let mergedChars;
      if (prev.chars && item.chars) {
        mergedChars = [...prev.chars, ...item.chars]
          .sort((a, b) => (a.s || 0) - (b.s || 0));
      }

      prev.end  = item.end;
      prev.text = mergedText;
      if (mergedChars) prev.chars = mergedChars;

      // Remove the merged item
      tr.items.splice(tr.items.indexOf(item), 1);

      // Update word items that referenced the removed item's lineId
      if (item.kind === 'line') {
        tr.items.forEach(w => {
          if (w.lineId === item.id) w.lineId = prev.id;
        });
      }

      this.selected = { trackId, ids: new Set([prev.id]) };
      this.invalidatePreviewMap('merge');
      this.invalidatePlaybackIndex();
    });
  },

  mergeWithNext(trackId, itemId) {
    const tr   = this.trackById(trackId);
    const item = this.itemById(trackId, itemId);
    if (!tr || !item || tr.locked) return;

    const sorted = tr.items.filter(i => i.kind === item.kind)
                            .sort((a, b) => a.start - b.start);
    const idx  = sorted.findIndex(i => i.id === item.id);
    if (idx < 0 || idx >= sorted.length - 1) return;
    const next = sorted[idx + 1];

    // Reuse mergeWithPrev logic by temporarily swapping context
    this.mergeWithPrev(trackId, next.id);
  },

  /* ═══════════════════════════════════════════
     INSPECTOR (common binder to reduce duplication)
  ═══════════════════════════════════════════ */
  renderInspector() {
    const { trackId, ids } = this.selected;
    const ic = this.ui.inspectorContent;
    if (!ic) return;

    if (!trackId || !ids.size) {
      ic.innerHTML = '<p class="no-sel">Ничего не выбрано</p>';
      return;
    }

    const tr    = this.trackById(trackId);
    const items = [...ids].map(id => this.itemById(trackId, id)).filter(Boolean);
    if (!tr || !items.length) {
      ic.innerHTML = '<p class="no-sel">Элемент не найден</p>';
      return;
    }

    if (items.length === 1) {
      this._renderInspectorSingle(tr, items[0], ic);
    } else {
      this._renderInspectorBatch(tr, items, ic);
    }
  },

  /* ── shared field builder ── */
  _makeInspectorField(label, input, hint) {
    const row = document.createElement('div');
    row.className = 'insp-row';
    const lbl = document.createElement('label');
    lbl.className = 'insp-label';
    lbl.textContent = label;
    row.appendChild(lbl);
    row.appendChild(input);
    if (hint) {
      const h = document.createElement('span');
      h.className = 'insp-hint';
      h.textContent = hint;
      row.appendChild(h);
    }
    return row;
  },

  _makeInput(type, val, opts = {}) {
    const inp = document.createElement('input');
    inp.type  = type;
    inp.value = val;
    inp.className = type === 'number' ? 'insp-num' : 'insp-text';
    if (opts.min  !== undefined) inp.min  = opts.min;
    if (opts.max  !== undefined) inp.max  = opts.max;
    if (opts.step !== undefined) inp.step = opts.step;
    return inp;
  },
  // Обратная совместимость — тонкие обёртки
  _makeNumInput(val, min, max, step) { return this._makeInput('number', val, {min, max, step}); },
  _makeTextInput(val)                { return this._makeInput('text',   val); },

  /* ── shared change handler builder ── */
  _bindInspectorField(inp, tr, getItems, field, transform, label) {
    inp.addEventListener('change', () => {
      const items = getItems();
      if (!items.length) return;
      this.applyTrackEdit(tr, label || 'inspector edit', () => {
        const val = transform ? transform(inp.value) : inp.value;
        items.forEach(item => { item[field] = val; });
      });
    });
  },

  _renderInspectorSingle(tr, item, ic) {
    ic.innerHTML = '';
    const getItem = () => [this.itemById(tr.id, item.id)].filter(Boolean);

    // Start
    const startInp = this._makeNumInput(item.start.toFixed(3), 0, undefined, 0.001);
    this._bindInspectorField(startInp, tr, getItem, 'start', v => {
      const n = parseFloat(v);
      const it = this.itemById(tr.id, item.id);
      if (it && n < it.end) return n;
      return item.start;
    }, 'trim start');
    ic.appendChild(this._makeInspectorField('Start', startInp));

    // End
    const endInp = this._makeNumInput(item.end.toFixed(3), 0, undefined, 0.001);
    this._bindInspectorField(endInp, tr, getItem, 'end', v => {
      const n = parseFloat(v);
      const it = this.itemById(tr.id, item.id);
      if (it && n > it.start) return n;
      return item.end;
    }, 'trim end');
    ic.appendChild(this._makeInspectorField('End', endInp));

    // Duration (read-only)
    const durEl = document.createElement('div');
    durEl.className = 'insp-readout';
    durEl.textContent = (item.end - item.start).toFixed(3) + ' s';
    ic.appendChild(this._makeInspectorField('Dur', durEl));

    // Text
    const textInp = this._makeTextInput(item.text || '');
    this._bindInspectorField(textInp, tr, getItem, 'text', v => v, 'edit text');
    ic.appendChild(this._makeInspectorField('Text', textInp));

    // Kind (read-only)
    const kindEl = document.createElement('div');
    kindEl.className = 'insp-readout';
    kindEl.textContent = item.kind || '';
    ic.appendChild(this._makeInspectorField('Kind', kindEl));
  },

  _renderInspectorBatch(tr, items, ic) {
    ic.innerHTML = '';
    const getItems = () => items.map(it => this.itemById(tr.id, it.id)).filter(Boolean);

    const count = document.createElement('div');
    count.className = 'insp-readout';
    count.textContent = `${items.length} items selected`;
    ic.appendChild(count);

    // Batch start offset
    const offsetInp = this._makeNumInput(0, -999, 999, 0.01);
    offsetInp.addEventListener('change', () => {
      const dt = parseFloat(offsetInp.value) || 0;
      if (!dt) return;
      this.applyTrackEdit(tr, 'batch offset', () => {
        getItems().forEach(it => {
          it.start = Math.max(0, it.start + dt);
          it.end   = it.end + dt;
        });
      });
      offsetInp.value = 0;
    });
    ic.appendChild(this._makeInspectorField('Offset (s)', offsetInp,
      'shifts all selected by this amount'));

    // Batch gap normalize
    const normBtn = document.createElement('button');
    normBtn.textContent = 'Normalize gaps';
    normBtn.className = 'btn-sm';
    normBtn.addEventListener('click', () => {
      const its = getItems().slice().sort((a, b) => a.start - b.start);
      if (its.length < 2) return;
      this.applyTrackEdit(tr, 'normalize gaps', () => {
        const totalDur = its.reduce((s, i) => s + (i.end - i.start), 0);
        const span     = its[its.length - 1].end - its[0].start;
        const gap      = Math.max(0, (span - totalDur) / (its.length - 1));
        let cursor     = its[0].start;
        its.forEach(it => {
          const dur = it.end - it.start;
          it.start  = cursor;
          it.end    = cursor + dur;
          cursor    = it.end + gap;
        });
      });
    });
    ic.appendChild(this._makeInspectorField('Batch', normBtn));
  },

  /* ═══════════════════════════════════════════
     EXPORT / SESSION (unchanged — abbreviated here)
  ═══════════════════════════════════════════ */
  exportActiveTrack() {
    const tr = this.activeTrack();
    if (!tr) return alert('Нет активной дорожки');
    const data = this.normalizeTrackForExport(tr);
    this.downloadBlob(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      `${this.audioFileName}_${tr.type}.json`
    );
  },

  exportAllTracks() {
    const data = this.project.tracks.map(tr => this.normalizeTrackForExport(tr));
    this.downloadBlob(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      `${this.audioFileName}_all.json`
    );
  },

  /* autosave */
  saveAutoDraft() {
    try {
      const snap = {
        ts:      Date.now(),
        audio:   this.audioFileName,
        project: this.project,
      };
      localStorage.setItem(this.DRAFT_KEY, JSON.stringify(snap));
      this.updateSaveStatus('Autosaved', false);
      setTimeout(() => { if (!this.dirty) this.updateSaveStatus('Saved', false); }, 2000);
    } catch (e) { console.warn('autosave failed:', e); }
  },

  loadSession(data) {
    try {
      if (data.project)       this.project = data.project;
      else if (data.tracks)   this.project.tracks = data.tracks;
      if (data.audio)         this.audioFileName = data.audio;

      // Normalize all tracks on load (handles old format)
      this.project.tracks.forEach(tr => this.normalizeTrackAfterEdit(tr));

      // Re-init state
      this.selected      = { trackId: null, ids: new Set() };
      this.history       = [];
      this.historyIndex  = -1;
      this.pushHistory('session load');

      // Invalidate all derived caches
      this.invalidatePreviewMap('session-load');
      this.invalidatePlaybackIndex();

      this.fullRender();
      this.markDirty(false);
    } catch (e) {
      console.error('loadSession:', e);
      alert('Ошибка загрузки сессии');
    }
  },
});
