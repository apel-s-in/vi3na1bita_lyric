// FILE: /ke-layout.js
'use strict';
/* ── ke-layout.js: all layout logic ──
   Covers: panel collapse, toolbar compact, sidebar/inspector/preview resize,
   layout lock, toolbar group reorder, fullscreen timeline, layout persistence.
   ke-ui.js calls initLayout() only.
────────────────────────────────────── */
Object.assign(App, {

  /* ═══════════════════════════════════════════
     LAYOUT STATE
     Single source of truth for all panel/layout prefs.
     NOTE: track-level collapse lives in App.collapsed (ke-state.js),
           NOT here. This object is purely about panels & chrome.
  ═══════════════════════════════════════════ */
  layoutState: {
    toolbarCompact:     false,
    sidebarCollapsed:   false,
    inspectorCollapsed: false,
    previewCollapsed:   false,
    layoutUnlocked:     false,   // mirrors App.layoutUnlocked for persistence
    fullscreenTimeline: false,
    workspaceHeight:    null,    // px number or null
    sidebarWidth:       null,    // px string or null
    inspectorHeight:    null,    // px number or null
    toolbarOrder:       null,    // {rowId: [grpId, ...], ...}
  },

  /* ═══════════════════════════════════════════
     PUBLIC ENTRY POINT
  ═══════════════════════════════════════════ */
  initLayout() {
    this._migrateLayoutPrefs();
    this._restoreLayoutState();
    this._applyLayoutState();
    this._bindTimelineResizer();
    this._bindSidebarResizer();
    this._bindPreviewResizer();
    this._bindSidebarCollapse();
    this._bindPanelCollapse();
    this._bindToolbarCompact();
    this._bindLayoutLock();
    this._bindToolbarGroupDrag();
  },

  /* ═══════════════════════════════════════════
     MIGRATION: old scattered layout_* keys → new layout block
  ═══════════════════════════════════════════ */
  _migrateLayoutPrefs() {
    try {
      const stored = JSON.parse(localStorage.getItem(this.UI_KEY) || '{}');
      // Already migrated?
      if (stored.layout && stored._layoutMigrated) return;

      const layout = stored.layout || {};
      // Map old layout_* keys into new block
      const OLD_MAP = {
        layout_toolbarCompact:     'toolbarCompact',
        layout_sidebarCollapsed:   'sidebarCollapsed',
        layout_inspectorCollapsed: 'inspectorCollapsed',
        layout_previewCollapsed:   'previewCollapsed',
        layout_workspaceH:         'workspaceHeight',
        layout_toolbarOrder:       'toolbarOrder',
      };
      let didMigrate = false;
      Object.entries(OLD_MAP).forEach(([oldKey, newKey]) => {
        if (stored[oldKey] !== undefined && layout[newKey] === undefined) {
          layout[newKey] = stored[oldKey];
          didMigrate = true;
        }
      });
      if (didMigrate || !stored._layoutMigrated) {
        // Clean up old keys
        Object.keys(OLD_MAP).forEach(k => delete stored[k]);
        stored.layout = layout;
        stored._layoutMigrated = true;
        localStorage.setItem(this.UI_KEY, JSON.stringify(stored));
      }
    } catch (e) { console.warn('layout migration:', e); }
  },

  /* ═══════════════════════════════════════════
     PERSISTENCE
  ═══════════════════════════════════════════ */
  _saveLayoutState() {
    try {
      const stored = JSON.parse(localStorage.getItem(this.UI_KEY) || '{}');
      stored.layout = { ...this.layoutState };
      stored._layoutMigrated = true;
      localStorage.setItem(this.UI_KEY, JSON.stringify(stored));
    } catch (e) { console.warn('layout save:', e); }
  },

  _saveLayoutProp(key, val) {
    this.layoutState[key] = val;
    clearTimeout(this._layoutSaveDebounce);
    this._layoutSaveDebounce = setTimeout(() => this._saveLayoutState(), 150);
  },

  _restoreLayoutState() {
    try {
      const stored = JSON.parse(localStorage.getItem(this.UI_KEY) || '{}');
      const saved = stored.layout || {};
      Object.keys(this.layoutState).forEach(k => {
        if (saved[k] !== undefined) this.layoutState[k] = saved[k];
      });
      // Sync layoutUnlocked to App-level flag
      this.layoutUnlocked = !!this.layoutState.layoutUnlocked;
    } catch (e) { console.warn('layout restore:', e); }
  },

  /* ═══════════════════════════════════════════
     APPLY ENTIRE LAYOUT STATE TO DOM
     Called once on init, and on fullscreen toggle.
  ═══════════════════════════════════════════ */
  _applyLayoutState() {
    const ls = this.layoutState;
    const u  = this.ui;

    // toolbar compact
    u.toolbar.classList.toggle('compact', ls.toolbarCompact);
    u.toolbarCompactBtn.textContent = ls.toolbarCompact ? '▼' : '▲';

    // sidebar collapsed
    u.sidebar.classList.toggle('collapsed-sidebar', ls.sidebarCollapsed);
    u.sidebarCollapseBtn.textContent = ls.sidebarCollapsed ? '▶' : '◀';

    // inspector collapsed
    u.inspectorPanel.classList.toggle('panel-collapsed', ls.inspectorCollapsed);
    u.inspectorCollapseBtn.textContent = ls.inspectorCollapsed ? '▼' : '▲';

    // preview collapsed
    u.previewPanel.classList.toggle('panel-collapsed', ls.previewCollapsed);
    u.previewCollapseBtn.textContent = ls.previewCollapsed ? '▼' : '▲';
    u.previewResizer.style.display   = ls.previewCollapsed ? 'none' : 'block';

    // workspace height
    if (ls.workspaceHeight) {
      u.workspaceMain.style.flex   = 'none';
      u.workspaceMain.style.height = ls.workspaceHeight + 'px';
    }

    // sidebar width
    if (ls.sidebarWidth) {
      u.sidebar.style.width = ls.sidebarWidth;
    }

    // inspector height
    if (ls.inspectorHeight) {
      u.inspectorPanel.style.flex   = 'none';
      u.inspectorPanel.style.height = ls.inspectorHeight + 'px';
    }

    // toolbar order
    if (ls.toolbarOrder) this._restoreToolbarOrder(ls.toolbarOrder);

    // layout lock
    this._applyLayoutLockUi();

    // fullscreen
    u.workspace.classList.toggle('timeline-expanded', ls.fullscreenTimeline);
  },

  /* ═══════════════════════════════════════════
     UNIVERSAL PANEL TOGGLE HELPER
     togglePanel(btn, panel, stateKey, extraCb, options)
       options: { collapsedText, expandedText, hideResizer }
  ═══════════════════════════════════════════ */
  togglePanel(btn, panel, stateKey, extraCb, options = {}) {
    const collapsed = panel.classList.toggle('panel-collapsed');
    btn.textContent = collapsed
      ? (options.collapsedText  || '▼')
      : (options.expandedText   || '▲');
    // aria
    if (btn.hasAttribute('aria-expanded') || options.ariaExpanded) {
      btn.setAttribute('aria-expanded', String(!collapsed));
    }
    this._saveLayoutProp(stateKey, collapsed);
    if (typeof extraCb === 'function') extraCb(collapsed);
  },

  /* ═══════════════════════════════════════════
     BIND: PANEL COLLAPSE
  ═══════════════════════════════════════════ */
  _bindPanelCollapse() {
    this.ui.inspectorCollapseBtn.addEventListener('click', () => {
      this.togglePanel(
        this.ui.inspectorCollapseBtn,
        this.ui.inspectorPanel,
        'inspectorCollapsed'
      );
    });
    this.ui.previewCollapseBtn.addEventListener('click', () => {
      this.togglePanel(
        this.ui.previewCollapseBtn,
        this.ui.previewPanel,
        'previewCollapsed',
        collapsed => {
          this.ui.previewResizer.style.display = collapsed ? 'none' : 'block';
        }
      );
    });
  },

  /* ═══════════════════════════════════════════
     BIND: SIDEBAR COLLAPSE
  ═══════════════════════════════════════════ */
  _bindSidebarCollapse() {
    this.ui.sidebarCollapseBtn.addEventListener('click', () => {
      const col = this.ui.sidebar.classList.toggle('collapsed-sidebar');
      this.ui.sidebarCollapseBtn.textContent = col ? '▶' : '◀';
      this._saveLayoutProp('sidebarCollapsed', col);
      setTimeout(() => this.renderRuler(), 160);
    });
  },

  /* ═══════════════════════════════════════════
     BIND: TOOLBAR COMPACT
  ═══════════════════════════════════════════ */
  _bindToolbarCompact() {
    this.ui.toolbarCompactBtn.addEventListener('click', () => {
      const c = this.ui.toolbar.classList.toggle('compact');
      this.ui.toolbarCompactBtn.textContent = c ? '▼' : '▲';
      this._saveLayoutProp('toolbarCompact', c);
    });
  },

  /* ═══════════════════════════════════════════
     BIND: LAYOUT LOCK
  ═══════════════════════════════════════════ */
  _bindLayoutLock() {
    this.ui.btnLayoutLock?.addEventListener('click', () => {
      this.layoutUnlocked = !this.layoutUnlocked;
      this.layoutState.layoutUnlocked = this.layoutUnlocked;
      this._saveLayoutState();
      this.persistUiPrefs();   // keep App.layoutUnlocked in sync for session snapshots
      this._applyLayoutLockUi();
    });
  },

  _applyLayoutLockUi() {
    document.body.classList.toggle('layout-locked', !this.layoutUnlocked);
    if (this.ui.btnLayoutLock) {
      this.ui.btnLayoutLock.textContent = this.layoutUnlocked ? '🔓' : '🔒';
      this.ui.btnLayoutLock.title = this.layoutUnlocked
        ? 'Интерфейс разблокирован: можно настраивать и двигать'
        : 'Интерфейс заблокирован: настройка и перетаскивание отключены';
    }
    document.querySelectorAll('.grp[data-grp]').forEach(grp => {
      grp.draggable = !!this.layoutUnlocked;
    });
  },

  /* ═══════════════════════════════════════════
     BIND: TIMELINE HEIGHT RESIZER
     (was in ke-ui.js _bindTimelineResizer)
  ═══════════════════════════════════════════ */
  _bindTimelineResizer() {
    const el = this.ui.timelineResizer;
    const wm = this.ui.workspaceMain;
    let active = false, sY = 0, sH = 0;

    el.addEventListener('mousedown', e => {
      e.preventDefault();
      active = true; sY = e.clientY; sH = wm.offsetHeight;
      document.body.style.cursor = 'row-resize';
      el.classList.add('active');
    });
    document.addEventListener('mousemove', e => {
      if (!active) return;
      const h = Math.max(160, Math.min(window.innerHeight - 60, sH + (e.clientY - sY)));
      wm.style.flex   = 'none';
      wm.style.height = h + 'px';
      this.renderRuler();
      this._saveLayoutProp('workspaceHeight', h);
    });
    document.addEventListener('mouseup', () => {
      if (!active) return;
      active = false;
      document.body.style.cursor = '';
      el.classList.remove('active');
    });
  },

  /* ═══════════════════════════════════════════
     BIND: SIDEBAR (col-resize) RESIZER
     (was in ke-timeline.js startResize / _handleResize)
  ═══════════════════════════════════════════ */
  _bindSidebarResizer() {
    const el = this.ui.sidebarResizer;
    let active = false, sX = 0, sW = 0;

    el.addEventListener('mousedown', e => {
      e.preventDefault();
      active = true; sX = e.clientX; sW = this.ui.sidebar.offsetWidth;
      document.body.style.cursor = 'col-resize';
      el.classList.add('active');
    });
    document.addEventListener('mousemove', e => {
      if (!active) return;
      const w = Math.max(220, Math.min(860, sW - (e.clientX - sX)));
      this.ui.sidebar.style.width = w + 'px';
      this._saveLayoutProp('sidebarWidth', w + 'px');
    });
    document.addEventListener('mouseup', () => {
      if (!active) return;
      active = false;
      document.body.style.cursor = '';
      el.classList.remove('active');
    });
  },

  /* ═══════════════════════════════════════════
     BIND: PREVIEW (row-resize) RESIZER
     (was in ke-timeline.js startResize / _handleResize)
  ═══════════════════════════════════════════ */
  _bindPreviewResizer() {
    const el = this.ui.previewResizer;
    let active = false, sY = 0, sH = 0;

    el.addEventListener('mousedown', e => {
      const h = this.ui.inspectorPanel.offsetHeight;
      if (!h) return; // панель скрыта (fullscreen или collapsed) — resize невозможен
      e.preventDefault();
      active = true; sY = e.clientY; sH = h;
      document.body.style.cursor = 'row-resize';
      el.classList.add('active');
    });
    document.addEventListener('mousemove', e => {
      if (!active) return;
      const h = Math.max(130, Math.min(600, sH + (e.clientY - sY)));
      this.ui.inspectorPanel.style.flex   = 'none';
      this.ui.inspectorPanel.style.height = h + 'px';
      this._saveLayoutProp('inspectorHeight', h);
    });
    document.addEventListener('mouseup', () => {
      if (!active) return;
      active = false;
      document.body.style.cursor = '';
      el.classList.remove('active');
      this.persistUiPrefs();
    });
  },

  /* ═══════════════════════════════════════════
     TOOLBAR GROUP REORDER
     Pointer-based (not HTML5 DnD) for better cross-browser stability.
     Same UX: drag by handle, reorder within row, order saved on drop.
  ═══════════════════════════════════════════ */
  _bindToolbarGroupDrag() {
    // Один глобальный Escape-листенер для всех drag-сессий
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') this._toolbarDragEscape = true;
    });
    document.querySelectorAll('.row').forEach(row => this._setupRowDragDrop(row));
  },

  _setupRowDragDrop(row) {
    // Guard: don't double-bind
    if (row._layoutDragBound) return;
    row._layoutDragBound = true;

    const DRAG_THRESHOLD = 4; // px before drag activates
    let dragEl   = null;
    let ghost    = null;       // placeholder div
    let pointerOrigin = null;  // {x, y}
    let isDragging = false;
    let animFrame  = null;
    let lastOver   = null;

    const cleanup = () => {
      isDragging = false;
      dragEl?.classList.remove('dragging');
      ghost?.remove();
      row.classList.remove('row-drag-over');
      dragEl    = null;
      ghost     = null;
      pointerOrigin = null;
      lastOver  = null;
      if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    };

    const saveOrder = () => {
      clearTimeout(this._toolbarOrderDebounce);
      this._toolbarOrderDebounce = setTimeout(() => this._saveToolbarOrder(), 200);
    };

    const insertGhostNear = (clientX) => {
      if (!ghost || !dragEl) return;
      const groups = [...row.querySelectorAll('.grp[data-grp]')]
        .filter(g => g !== dragEl && g !== ghost);
      let inserted = false;
      for (const g of groups) {
        const r = g.getBoundingClientRect();
        if (clientX < r.left + r.width / 2) {
          row.insertBefore(ghost, g);
          inserted = true;
          break;
        }
      }
      if (!inserted) {
        // Append before toolbar-toggle or at end
        const toggle = row.querySelector('.toolbar-toggle');
        if (toggle) row.insertBefore(ghost, toggle);
        else row.appendChild(ghost);
      }
    };

    row.addEventListener('pointerdown', e => {
      if (!this.layoutUnlocked) return;
      const handle = e.target.closest('.grp-handle');
      if (!handle) return;
      const grp = handle.closest('.grp[data-grp]');
      if (!grp || grp.closest('.row') !== row) return;

      e.preventDefault();
      dragEl = grp;
      pointerOrigin = { x: e.clientX, y: e.clientY };
      isDragging = false;
      row.setPointerCapture(e.pointerId);
    });

    row.addEventListener('pointermove', e => {
      if (!dragEl || !pointerOrigin) return;
      // Глобальный Escape (флаг из _bindToolbarGroupDrag)
      if (this._toolbarDragEscape) { this._toolbarDragEscape = false; cleanup(); return; }
      const dx = Math.abs(e.clientX - pointerOrigin.x);
      const dy = Math.abs(e.clientY - pointerOrigin.y);

      if (!isDragging) {
        if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return;
        // Start drag
        isDragging = true;
        dragEl.classList.add('dragging');
        row.classList.add('row-drag-over');

        ghost = document.createElement('div');
        ghost.style.cssText =
          `width:${dragEl.offsetWidth}px;height:${dragEl.offsetHeight}px;` +
          `border:1px dashed var(--br2);border-radius:4px;flex-shrink:0;pointer-events:none`;
        dragEl.after(ghost);
      }

      if (animFrame) cancelAnimationFrame(animFrame);
      animFrame = requestAnimationFrame(() => {
        insertGhostNear(e.clientX);
      });
    });

    const finishDrag = (e) => {
      if (!dragEl) { cleanup(); return; }
      if (isDragging && ghost) {
        ghost.replaceWith(dragEl);
        saveOrder();
      }
      cleanup();
    };

    row.addEventListener('pointerup', finishDrag);
    row.addEventListener('pointercancel', cleanup);
    // Safety: если layout lock флипнул во время drag — прерываем
    document.body.addEventListener('classChange_layoutLock', cleanup, { passive: true });
  },

  _saveToolbarOrder() {
    const order = {};
    document.querySelectorAll('.row').forEach(row => {
      const rowId = row.id || row.dataset.row;
      order[rowId] = [...row.querySelectorAll('.grp[data-grp]')].map(g => g.dataset.grp);
    });
    this._saveLayoutProp('toolbarOrder', order);
  },

  _restoreToolbarOrder(order) {
    if (!order) return;
    Object.entries(order).forEach(([rowId, grpIds]) => {
      const row = document.getElementById(rowId) ||
                  document.querySelector(`[data-row="${rowId}"]`);
      if (!row) return;
      const toggle = row.querySelector('.toolbar-toggle');
      grpIds.forEach(gId => {
        const g = document.querySelector(`[data-grp="${gId}"]`);
        if (!g) return;
        // Insert before toggle button if present, else append
        if (toggle) row.insertBefore(g, toggle);
        else row.appendChild(g);
      });
    });
  },

  /* ═══════════════════════════════════════════
     FULLSCREEN TIMELINE API
     Architectural support — UI button can be added later.
     CSS .workspace.timeline-expanded is the toggle class.
  ═══════════════════════════════════════════ */
  toggleTimelineFullscreen() {
    this.setTimelineFullscreen(!this.layoutState.fullscreenTimeline);
  },

  setTimelineFullscreen(value) {
    const was = this.layoutState.fullscreenTimeline;
    this.layoutState.fullscreenTimeline = !!value;
    this.ui.workspace.classList.toggle('timeline-expanded', !!value);

    if (was && !value) {
      // Restore panel state from layoutState
      this._applyLayoutState();
    }

    this._saveLayoutProp('fullscreenTimeline', !!value);
    // Trigger ruler reflow
    requestAnimationFrame(() => this.renderRuler());
  },
});
