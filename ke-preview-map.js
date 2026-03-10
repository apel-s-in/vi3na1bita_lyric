// FILE: /ke-preview-map.js
'use strict';
/* ── ke-preview-map.js: explicit line↔words mapping layer ──
   Three-tier resolution:
     1. Explicit  — stored lineId references on word items (already present in data)
     2. Derived   — temporal overlap heuristic producing a stable map
     3. Legacy    — inline fallback identical to original renderPreview() logic
   All callers get a consistent API; fallback fires automatically when needed.
────────────────────────────────────────────────────────────── */
Object.assign(App, {

  /* ── map state ── */
  _previewMap: null,       // Map<lineTrackId::lineItemId, wordItem[]>
  _previewMapDirty: true,
  _previewMapReason: '',

  /* ── invalidation ── */
  invalidatePreviewMap(reason) {
    this._previewMapDirty = true;
    this._previewMapReason = reason || 'unknown';
    this._previewMap = null;
  },

  /* ── ensure (lazy rebuild) ── */
  ensurePreviewMap() {
    if (!this._previewMapDirty && this._previewMap) return;
    this.rebuildPreviewMap();
  },

  /* ── full rebuild ── */
  rebuildPreviewMap() {
    this._previewMap = new Map();
    this._previewMapDirty = false;

    const lineTr  = this.project.tracks.find(t => t.type === 'line');
    const wordsTr = this.project.tracks.find(t => t.type === 'words');

    if (!wordsTr) return; // nothing to map

    const wordItems = wordsTr.items.filter(i => i.kind === 'word');

    // ── Tier 1 + 2: words-track has its own line items ──────────────────
    // Words track contains line items with their own IDs, and word items
    // reference lineId pointing to those line items.
    const wordLineItems = wordsTr.items.filter(i => i.kind === 'line');

    wordLineItems.forEach(line => {
      const key = this.makeDomKey(wordsTr.id, line.id);
      // Tier 1: explicit lineId references
      const byId = wordItems.filter(w => w.lineId === line.id);
      if (byId.length) {
        this._previewMap.set(key, byId.slice().sort((a, b) => a.start - b.start));
        return;
      }
      // Tier 2: derive by temporal overlap
      const derived = wordItems
        .filter(w => w.start >= line.start - 0.05 && w.end <= line.end + 0.15)
        .sort((a, b) => a.start - b.start);
      this._previewMap.set(key, derived);
    });

    // ── Cross-track mapping: lineTr lines → wordsTr words ────────────────
    if (lineTr) {
      const lineItems = lineTr.items.filter(i => i.kind === 'line');
      lineItems.forEach(line => {
        const key = this.makeDomKey(lineTr.id, line.id);
        if (this._previewMap.has(key)) return;

        // Tier 2: find words-track words that overlap this line temporally
        const derived = wordItems
          .filter(w => w.start >= line.start - 0.05 && w.end <= line.end + 0.15)
          .sort((a, b) => a.start - b.start);
        this._previewMap.set(key, derived);
      });
    }
  },

  /* ── public API ── */

  /**
   * Get word items for a given line.
   * @param {string} lineTrackId  — track id that owns the line item
   * @param {string} lineItemId   — line item id
   * @returns {Array} sorted word items, may be empty
   */
  getWordsForPreviewLine(lineTrackId, lineItemId) {
    this.ensurePreviewMap();
    const key = this.makeDomKey(lineTrackId, lineItemId);
    if (this._previewMap.has(key)) return this._previewMap.get(key);

    // Tier 3: legacy fallback — inline heuristic (identical to original)
    const wordsTr = this.project.tracks.find(t => t.type === 'words');
    if (!wordsTr) return [];
    const lineTr = this.trackById(lineTrackId);
    const line   = lineTr ? this.itemById(lineTrackId, lineItemId) : null;
    if (!line) return [];
    const wordItems = wordsTr.items.filter(i => i.kind === 'word');
    const byId = wordItems.filter(w => w.lineId === line.id);
    if (byId.length) return byId.sort((a, b) => a.start - b.start);
    return wordItems
      .filter(w => w.start >= line.start - 0.05 && w.end <= line.end + 0.15)
      .sort((a, b) => a.start - b.start);
  },

  /**
   * Given a line-track line, find the corresponding words-track line (if any).
   */
  getLinkedWordsLine(lineTrackId, lineItemId) {
    const lineTr = this.trackById(lineTrackId);
    const line   = this.itemById(lineTrackId, lineItemId);
    if (!lineTr || !line) return null;

    const wordsTr = this.project.tracks.find(t => t.type === 'words');
    if (!wordsTr) return null;

    // Words-track line items that temporally align
    return wordsTr.items.find(
      i => i.kind === 'line' &&
           Math.abs(i.start - line.start) < 0.1 &&
           Math.abs(i.end   - line.end)   < 0.1
    ) || null;
  },

  /**
   * Given a words-track line, find the corresponding line-track line (if any).
   */
  getLinkedLineForWordsLine(wordsTrackId, wordsLineItemId) {
    const wordsTr   = this.trackById(wordsTrackId);
    const wordsLine = this.itemById(wordsTrackId, wordsLineItemId);
    if (!wordsTr || !wordsLine) return null;

    const lineTr = this.project.tracks.find(t => t.type === 'line');
    if (!lineTr) return null;

    return lineTr.items.find(
      i => i.kind === 'line' &&
           Math.abs(i.start - wordsLine.start) < 0.1 &&
           Math.abs(i.end   - wordsLine.end)   < 0.1
    ) || null;
  },
});
