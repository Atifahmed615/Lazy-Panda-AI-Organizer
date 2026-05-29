// ══════════════════════════════════════════════
//  drag-reschedule.js — Phase 4
//  • dragReschedule: drag a calendar event to a new time-of-day
//  • taskCalendarDrag: drag an open task onto a free slot to time-block it
//  Both gated by their flags. No-ops when off.
// ══════════════════════════════════════════════

// Calendar uses 1px = 1 min. Pixel offsets convert directly to minutes.
const DRAG_SNAP_MIN = 15;
const DRAG_SUPPRESS_CLICK_PX = 4;
let _dragState = null;

function _snap(min) { return Math.round(min / DRAG_SNAP_MIN) * DRAG_SNAP_MIN; }

function installCalendarDragHandlers() {
  if (!state.flags?.dragReschedule) return;
  const root = document.getElementById('cal-days');
  if (!root || root.dataset.dragWired === '1') return;
  root.dataset.dragWired = '1';

  root.addEventListener('pointerdown', _onCalPointerDown);
  // Suppress the editEvent click that fires after a real drag.
  root.addEventListener('click', e => {
    const ev = e.target.closest('.cal-event');
    if (ev && ev.dataset.dragJustHappened === '1') {
      e.stopPropagation();
      e.preventDefault();
      delete ev.dataset.dragJustHappened;
    }
  }, true);
}
window.installCalendarDragHandlers = installCalendarDragHandlers;

function _onCalPointerDown(e) {
  if (e.button !== undefined && e.button !== 0) return;
  const evEl = e.target.closest('.cal-event');
  if (!evEl) return;
  // Don't drag recurring events — they need special handling.
  if (evEl.dataset.recurring === '1') return;
  const eventId = evEl.dataset.eventId;
  const ev = state.events.find(x => x.id === eventId);
  if (!ev) return;

  const col = evEl.closest('.cal-day-col');
  if (!col) return;

  _dragState = {
    eventId,
    ev,
    evEl,
    startY: e.clientY,
    startTop: parseFloat(evEl.style.top) || 0,
    durationMin: timeMins(ev.end) - timeMins(ev.start),
    moved: false,
    pointerId: e.pointerId,
  };
  evEl.setPointerCapture?.(e.pointerId);
  evEl.style.zIndex = '50';
  evEl.style.opacity = '0.85';
  evEl.style.cursor = 'grabbing';
  evEl.addEventListener('pointermove', _onCalPointerMove);
  evEl.addEventListener('pointerup', _onCalPointerUp);
  evEl.addEventListener('pointercancel', _onCalPointerCancel);
}

function _onCalPointerMove(e) {
  if (!_dragState) return;
  const dy = e.clientY - _dragState.startY;
  if (Math.abs(dy) > DRAG_SUPPRESS_CLICK_PX) _dragState.moved = true;
  const newTop = Math.max(0, _dragState.startTop + dy);
  _dragState.evEl.style.top = newTop + 'px';
}

function _onCalPointerCancel(e) {
  if (!_dragState) return;
  _cleanupDrag();
}

function _onCalPointerUp(e) {
  if (!_dragState) return;
  const evEl = _dragState.evEl;
  const ev = _dragState.ev;
  const newTopRaw = parseFloat(evEl.style.top) || 0;
  const snappedStart = Math.max(0, Math.min(24 * 60 - _dragState.durationMin, _snap(newTopRaw)));
  const moved = _dragState.moved && snappedStart !== timeMins(ev.start);

  if (moved) {
    // Apply the new times
    const oldStart = ev.start;
    const newStartMin = snappedStart;
    const newEndMin = snappedStart + _dragState.durationMin;
    const newStart = `${String(Math.floor(newStartMin/60)).padStart(2,'0')}:${String(newStartMin%60).padStart(2,'0')}`;
    const newEnd = `${String(Math.floor(newEndMin/60)).padStart(2,'0')}:${String(newEndMin%60).padStart(2,'0')}`;
    ev.start = newStart;
    ev.end = newEnd;

    // Conflict check — if there's now a conflict, show toast with undo.
    const conflicts = detectConflicts(ev.date, new Date(ev.date + 'T12:00:00').getDay())
      .filter(c => c.a.id === ev.id || c.b.id === ev.id);

    saveState();
    render();

    // Mark the event element so the subsequent click handler doesn't open the modal.
    if (evEl) evEl.dataset.dragJustHappened = '1';
    haptic(30);
    if (conflicts.length) {
      _showRescheduleUndoToast(ev.id, oldStart, `⚠️ Moved to ${fmt12(newStart)} — conflicts with ${conflicts.length} other event(s)`);
    } else {
      _showRescheduleUndoToast(ev.id, oldStart, `✓ Moved to ${fmt12(newStart)}`);
    }
  } else {
    // No real movement — restore to original position so the click handler can fire normally.
    evEl.style.top = _dragState.startTop + 'px';
  }
  _cleanupDrag();
}

function _cleanupDrag() {
  if (!_dragState) return;
  const { evEl, pointerId } = _dragState;
  evEl.removeEventListener('pointermove', _onCalPointerMove);
  evEl.removeEventListener('pointerup', _onCalPointerUp);
  evEl.removeEventListener('pointercancel', _onCalPointerCancel);
  try { evEl.releasePointerCapture?.(pointerId); } catch (e) {}
  evEl.style.zIndex = '';
  evEl.style.opacity = '';
  evEl.style.cursor = '';
  _dragState = null;
}

function _showRescheduleUndoToast(eventId, prevStart, msg) {
  const toast = document.createElement('div');
  toast.className = 'undo-toast';
  toast.innerHTML = `<span>${esc(msg)}</span><button class="undo-toast-action" onclick="undoReschedule('${esc(eventId)}','${esc(prevStart)}', this.parentElement)">Undo</button><button onclick="this.parentElement.remove()">x</button>`;
  document.body.appendChild(toast);
  setTimeout(() => { if (toast.parentElement) { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); } }, 8000);
}

function undoReschedule(eventId, prevStart, toastEl) {
  const ev = state.events.find(x => x.id === eventId);
  if (!ev) return;
  const dur = timeMins(ev.end) - timeMins(ev.start);
  ev.start = prevStart;
  const newEndMin = timeMins(prevStart) + dur;
  ev.end = `${String(Math.floor(newEndMin/60)).padStart(2,'0')}:${String(newEndMin%60).padStart(2,'0')}`;
  saveState(); render();
  if (toastEl) toastEl.remove();
  showToast('Move undone');
}
window.undoReschedule = undoReschedule;

// ══════════════════════════════════════════════
//  Phase 4 — Task → Calendar drag
//  Drag a task chip from the dashboard tasks panel onto a free slot.
//  Creates a time-blocked event linked back via taskId.
// ══════════════════════════════════════════════
let _taskDragState = null;
const TASK_DRAG_DEFAULT_MIN = 30;

function installTaskCalendarDrop() {
  if (!state.flags?.taskCalendarDrag) return;
  // Make task items in the dashboard task lists draggable
  document.querySelectorAll('#tasks-today .task-item, #tasks-upcoming .task-item, #all-tasks-list .task-item').forEach(el => {
    if (el.dataset.taskDragWired === '1') return;
    el.dataset.taskDragWired = '1';
    el.draggable = true;
    el.addEventListener('dragstart', _onTaskDragStart);
    el.addEventListener('dragend', _onTaskDragEnd);
  });
  // Make calendar day columns drop targets
  document.querySelectorAll('#cal-days .cal-day-col').forEach(col => {
    if (col.dataset.dropWired === '1') return;
    col.dataset.dropWired = '1';
    col.addEventListener('dragover', _onColDragOver);
    col.addEventListener('drop', _onColDrop);
  });
}
window.installTaskCalendarDrop = installTaskCalendarDrop;

function _onTaskDragStart(e) {
  const el = e.currentTarget;
  const id = el.dataset.taskId || el.dataset.id || el.getAttribute('data-task-id');
  if (!id) return;
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  _taskDragState = { taskId: id, task: t };
  if (e.dataTransfer) {
    e.dataTransfer.setData('text/lazy-panda-task', id);
    e.dataTransfer.effectAllowed = 'copy';
  }
}
function _onTaskDragEnd() { _taskDragState = null; }

function _onColDragOver(e) {
  if (!_taskDragState) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  e.currentTarget.style.background = 'rgba(124,111,247,0.08)';
}
function _onColDrop(e) {
  e.preventDefault();
  const col = e.currentTarget;
  col.style.background = '';
  if (!_taskDragState) return;
  const t = _taskDragState.task;
  const colRect = col.getBoundingClientRect();
  const offsetY = e.clientY - colRect.top + col.scrollTop;
  const startMin = Math.max(0, Math.min(24*60 - 15, _snap(offsetY)));
  const dur = Math.max(15, Math.min(240, Number(t.estMinutes) || TASK_DRAG_DEFAULT_MIN));
  const endMin = Math.min(24*60, startMin + dur);
  const newStart = `${String(Math.floor(startMin/60)).padStart(2,'0')}:${String(startMin%60).padStart(2,'0')}`;
  const newEnd   = `${String(Math.floor(endMin/60)).padStart(2,'0')}:${String(endMin%60).padStart(2,'0')}`;
  const date = col.dataset.dayDate || todayStr();
  const ev = {
    id: 'e' + Date.now(),
    title: t.name,
    date,
    start: newStart,
    end: newEnd,
    category: 'study',
    location: '',
    recurring: 'none',
    recurringEndDate: '',
    color: '',
    notes: `Time-blocked for task: ${t.name}`,
    energy: null,
    taskId: t.id,
    gcalEventId: '',
  };
  state.events.push(ev);
  saveState(); render();
  showToast(`✓ Blocked ${dur}min for "${t.name}"`);
  _taskDragState = null;
}
