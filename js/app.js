// ══════════════════════════════════════════════
//  app.js — Event handlers, settings, navigation, init
//  Load order: 4th (depends on state.js, render.js, ai.js)
// ══════════════════════════════════════════════


function applyConflictResolution(eventId, newStart, newEnd) {
  const ev = state.events.find(e => e.id === eventId);
  if (ev) {
    ev.start = newStart;
    ev.end = newEnd;
    saveState();
    render();
    showToast(`Rescheduled "${ev.title}" to ${fmt12(newStart)}`);
  }
}

// ══════════════════════════════════════════════
//  EVENTS CRUD
// ══════════════════════════════════════════════
let editingEventId = null;
function showAddModal() {
  editingEventId = null;
  document.getElementById('event-modal-title').textContent = 'Add Event';
  document.getElementById('ev-title').value = '';
  document.getElementById('ev-date').value = todayStr();
  document.getElementById('ev-start').value = '18:00';
  document.getElementById('ev-end').value = '19:00';
  document.getElementById('ev-category').value = 'class';
  document.getElementById('ev-location').value = '';
  document.getElementById('ev-recurring').value = 'none';
  document.getElementById('ev-recurring-end').value = '';
  document.getElementById('ev-color').value = CAT_COLORS.class.dot;
  document.getElementById('ev-color').dataset.reset = 'true';
  openModal('event-modal');
}
function editEvent(id) {
  const ev = state.events.find(e=>e.id===id);
  if (!ev) return;
  editingEventId = id;
  document.getElementById('event-modal-title').textContent = 'Edit Event';
  document.getElementById('ev-title').value = ev.title;
  document.getElementById('ev-date').value = ev.date;
  document.getElementById('ev-start').value = ev.start;
  document.getElementById('ev-end').value = ev.end;
  document.getElementById('ev-category').value = ev.category;
  document.getElementById('ev-location').value = ev.location||'';
  document.getElementById('ev-recurring').value = ev.recurring||'none';
  document.getElementById('ev-recurring-end').value = ev.recurringEndDate || '';
  document.getElementById('ev-color').value = ev.color || getEventColor(ev);
  document.getElementById('ev-color').dataset.reset = ev.color ? '' : 'true';
  openModal('event-modal');
}
function resetEventColor() {
  const category = document.getElementById('ev-category').value || 'other';
  document.getElementById('ev-color').value = (CAT_COLORS[category] || CAT_COLORS.other).dot;
  document.getElementById('ev-color').dataset.reset = 'true';
}
function saveEvent() {
  const title = document.getElementById('ev-title').value.trim();
  if (!title) { alert('Please enter a title'); return; }
  const dateVal  = document.getElementById('ev-date').value;
  const startVal = document.getElementById('ev-start').value;
  const endVal   = document.getElementById('ev-end').value;
  if (!dateVal)  { alert('Please select a date'); return; }
  if (!startVal) { alert('Please set a start time'); return; }
  if (!endVal)   { alert('Please set an end time'); return; }
  if (timeMins(endVal) <= timeMins(startVal)) { alert('End time must be after start time'); return; }
  const existingEvent = editingEventId ? state.events.find(e=>e.id===editingEventId) : null;
  const ev = {
    id: editingEventId || 'e'+Date.now(),
    title,
    date: document.getElementById('ev-date').value,
    start: document.getElementById('ev-start').value,
    end: document.getElementById('ev-end').value,
    category: document.getElementById('ev-category').value,
    location: document.getElementById('ev-location').value.trim(),
    recurring: document.getElementById('ev-recurring').value,
    recurringEndDate: document.getElementById('ev-recurring-end').value || '',
    color: document.getElementById('ev-color').dataset.reset === 'true' ? '' : (document.getElementById('ev-color').value || ''),
    notes: document.getElementById('ev-notes')?.value || existingEvent?.notes || '',
  };
  document.getElementById('ev-color').dataset.reset = '';
  if (editingEventId) {
    const idx = state.events.findIndex(e=>e.id===editingEventId);
    if (idx>=0) state.events[idx] = ev;
  } else {
    state.events.push(ev);
  }
  if (navigator.vibrate) navigator.vibrate(30);
  saveState(); render();
  closeModal('event-modal');
}

function itemLabelForUndo(entry) {
  if (!entry) return 'item';
  if (entry.type === 'delete_event') return entry.payload.title || 'event';
  if (entry.type === 'delete_task') return entry.payload.name || 'task';
  if (entry.type === 'delete_attendance') return entry.payload.subject || 'attendance record';
  if (entry.type === 'delete_grade') return entry.payload.subject || 'grade';
  return 'item';
}

function pushUndoEntry(entry) {
  entry.toastId = Date.now() + '_' + Math.random().toString(36).slice(2);
  undoStack.push(entry);
  if (undoStack.length > MAX_UNDO_ENTRIES) undoStack.shift();
  redoStack = [];
  return entry;
}

function undoLast() {
  if (undoStack.length === 0) return;
  const entry = undoStack.pop();
  restoreUndoEntry(entry);
}

function restoreUndoEntry(entry) {
  redoStack.push(entry);
  if (redoStack.length > MAX_UNDO_ENTRIES) redoStack.shift();
  
  if (entry.type === 'delete_event') {
    state.events.push(entry.payload);
  } else if (entry.type === 'delete_task') {
    state.tasks.push(entry.payload);
  } else if (entry.type === 'delete_attendance') {
    state.attendance.push(entry.payload);
  } else if (entry.type === 'delete_grade') {
    state.grades.push(entry.payload);
  }
  
  saveState();
  render();
  showToast('Restored ' + itemLabelForUndo(entry));
}

function undoToastEntry(toastId) {
  const idx = undoStack.findIndex(entry => entry.toastId === toastId);
  if (idx < 0) return;
  const entry = undoStack.splice(idx, 1)[0];
  restoreUndoEntry(entry);
  document.querySelector(`[data-undo-toast-id="${toastId}"]`)?.remove();
}

function redoLast() {
  if (redoStack.length === 0) return;
  const entry = redoStack.pop();
  undoStack.push(entry);
  if (undoStack.length > MAX_UNDO_ENTRIES) undoStack.shift();
  
  if (entry.type === 'delete_event') {
    state.events = state.events.filter(e => e.id !== entry.payload.id);
  } else if (entry.type === 'delete_task') {
    state.tasks = state.tasks.filter(t => t.id !== entry.payload.id);
  } else if (entry.type === 'delete_attendance') {
    state.attendance = state.attendance.filter(a => a.id !== entry.payload.id);
  } else if (entry.type === 'delete_grade') {
    state.grades = state.grades.filter(g => g.id !== entry.payload.id);
  }
  
  saveState();
  render();
  showToast('Deleted ' + itemLabelForUndo(entry));
}

function showUndoToast(entry) {
  let label = '';
  if (entry.type === 'delete_event') label = entry.payload.title;
  else if (entry.type === 'delete_task') label = entry.payload.name;
  else if (entry.type === 'delete_attendance') label = entry.payload.subject;
  else if (entry.type === 'delete_grade') label = entry.payload.subject;
  
  const toast = document.createElement('div');
  toast.className = 'undo-toast';
  toast.innerHTML = `<span>↩ Restored: ${esc(label)}</span><button onclick="this.parentElement.remove()">✕</button>`;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }
  }, 8000);
}

function showDeleteUndoToast(entry) {
  const label = itemLabelForUndo(entry);
  const toast = document.createElement('div');
  toast.className = 'undo-toast';
  toast.dataset.undoToastId = entry.toastId;
  toast.innerHTML = `<span>Deleted ${esc(label)}</span><button class="undo-toast-action" onclick="undoToastEntry('${entry.toastId}')">Undo</button><button onclick="this.parentElement.remove()">x</button>`;
  document.body.appendChild(toast);

  setTimeout(() => {
    const idx = undoStack.findIndex(item => item.toastId === entry.toastId);
    if (idx >= 0) undoStack.splice(idx, 1);
    if (toast.parentElement) {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }
  }, 8000);
}

function deleteEvent(id) {
  haptic(50);
  const ev = state.events.find(e => e.id === id);
  let entry = null;
  if (ev) {
    entry = pushUndoEntry({ type: 'delete_event', payload: { ...ev } });
  }
  state.events = state.events.filter(e=>e.id!==id);
  saveState(); render();
  if (entry) showDeleteUndoToast(entry);
}

function showQuickAdd(triggerEvent) {
  if (triggerEvent) triggerEvent.stopPropagation();
  const popover = document.getElementById('quick-add-popover');
  if (!popover) return;
  popover.classList.remove('hidden');
  document.getElementById('qa-title').value = '';
  document.getElementById('qa-date').value = todayStr();
  document.getElementById('qa-start').value = '18:00';
  document.getElementById('qa-category').value = 'class';
  if (triggerEvent?.currentTarget && window.matchMedia('(min-width: 769px)').matches) {
    const rect = triggerEvent.currentTarget.getBoundingClientRect();
    const margin = 12;
    const popoverWidth = popover.offsetWidth || 300;
    popover.style.top = `${Math.min(rect.bottom + margin, window.innerHeight - 360)}px`;
    popover.style.left = `${Math.max(16, Math.min(rect.right - popoverWidth, window.innerWidth - popoverWidth - 16))}px`;
    popover.style.right = 'auto';
    popover.style.bottom = 'auto';
  } else {
    popover.removeAttribute('style');
  }
  // Focus title input
  setTimeout(() => document.getElementById('qa-title').focus(), 100);
  // Close popover when clicking outside
  document.addEventListener('click', closeQuickAddOnClickOutside);
}

function closeQuickAdd() {
  const popover = document.getElementById('quick-add-popover');
  if (popover) popover.classList.add('hidden');
  document.removeEventListener('click', closeQuickAddOnClickOutside);
}

function closeQuickAddOnClickOutside(e) {
  const popover = document.getElementById('quick-add-popover');
  const btn = document.getElementById('btn-quick-add');
  if (popover && !popover.contains(e.target) && !btn.contains(e.target)) {
    closeQuickAdd();
  }
}

function saveQuickEvent() {
  const title = document.getElementById('qa-title').value.trim();
  if (!title) { alert('Please enter a title'); return; }
  const start = document.getElementById('qa-start').value;
  if (!start) { alert('Please set a start time'); return; }
  const end = document.getElementById('qa-end')?.value || addMinutesToTime(start, 60);
  
  const ev = {
    id: 'e'+Date.now(),
    title,
    date: document.getElementById('qa-date').value || todayStr(),
    start,
    end,
    category: document.getElementById('qa-category').value,
    location: '',
    recurring: 'none',
    notes: '',
  };
  state.events.push(ev);
  if (navigator.vibrate) navigator.vibrate(30);
  saveState(); render();
  closeQuickAdd();
}

// ══════════════════════════════════════════════
//  FEATURE 1: SEARCH & FILTER EVENTS
// ══════════════════════════════════════════════
function filterScheduleEvents() {
  const searchTerm = document.getElementById('schedule-search')?.value?.toLowerCase() || '';
  const categoryFilter = document.getElementById('schedule-category-filter')?.value || '';
  
  const allEventsList = document.getElementById('all-events-list');
  if (!allEventsList) return;
  
  const evs = getAllEvents();
  const filtered = evs.filter(ev => {
    const matchesSearch = ev.title.toLowerCase().includes(searchTerm) || 
                         (ev.location?.toLowerCase().includes(searchTerm));
    const matchesCategory = !categoryFilter || ev.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });
  
  // Re-render the filtered list
  allEventsList.innerHTML = filtered.map(ev => {
    const cat = CAT_COLORS[ev.category] || CAT_COLORS.other;
    const evColor = getEventColor(ev);
    return `<div class="timeline-item" onclick="editEvent('${esc(ev.id)}')">
      <div class="timeline-time" style="width:70px;font-size:10px;">${esc(ev.date)}</div>
      <div class="timeline-dot" style="background:${evColor}"></div>
      <div class="timeline-content">
        <div class="timeline-title">${esc(ev.title)}</div>
        <div class="timeline-sub">${fmt12(ev.start)} – ${fmt12(ev.end)}${locationLink(ev.location) ? ' · ' + locationLink(ev.location) : ''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
        <span class="badge" style="background:${getEventBg(ev)};color:${evColor}">${cat.label}</span>
      </div>
    </div>`;
  }).join('') || '<div class="empty"><div class="empty-icon">📅</div>No events match your search.</div>';
}

// ══════════════════════════════════════════════
//  FEATURE 3: DUPLICATE EVENT
// ══════════════════════════════════════════════
function duplicateEvent(id) {
  const ev = state.events.find(e=>e.id===id);
  if (!ev) return;

  // Create a one-off copy on the next calendar day.
  // 'recurring' is intentionally reset to 'none' — duplicating a weekly
  // class should produce a single extra session, not another recurring series.
  const tomorrow = new Date(ev.date + 'T12:00:00');
  tomorrow.setDate(tomorrow.getDate() + 1);
  const newDate = tomorrow.toISOString().split('T')[0];

  const newEvent = {
    ...ev,
    id: 'e' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    date: newDate,
    recurring: 'none',   // Bug D fix: never inherit the source's recurrence
  };

  state.events.push(newEvent);
  saveState();
  render();
  showToast(`✓ "${ev.title}" duplicated for ${newDate}`);
}

// ══════════════════════════════════════════════
//  CLASS NOTES VIEWER (Feature 8)
// ══════════════════════════════════════════════
let viewingNotesEventId = null;
function openNotesViewer(id) {
  const ev = state.events.find(e => e.id === id);
  if (!ev) return;
  viewingNotesEventId = id;
  const titleEl = document.getElementById('notes-modal-title');
  const metaEl = document.getElementById('notes-modal-meta');
  const body = document.getElementById('notes-modal-body');
  // Notes UI may have been removed; guard against missing DOM.
  if (!titleEl || !metaEl || !body) return;
  titleEl.textContent = `📝 ${ev.title}`;
  metaEl.textContent =
    `${ev.date} · ${fmt12(ev.start)} – ${fmt12(ev.end)}${ev.location ? ' · ' + ev.location : ''}`;
  body.textContent = ev.notes && ev.notes.trim() ? ev.notes : '(No notes yet — click Edit Notes to add some.)';
  body.style.color = ev.notes && ev.notes.trim() ? 'var(--text)' : 'var(--text3)';
  openModal('notes-modal');
}
function editEventFromNotes() {
  const id = viewingNotesEventId;
  closeModal('notes-modal', false);
  if (!id) return;
  const ev = state.events.find(e => e.id === id);
  if (!ev) return;
  editingEventId = id;
  document.getElementById('event-modal-title').textContent = 'Edit Event';
  document.getElementById('ev-title').value = ev.title;
  document.getElementById('ev-date').value = ev.date;
  document.getElementById('ev-start').value = ev.start;
  document.getElementById('ev-end').value = ev.end;
  document.getElementById('ev-category').value = ev.category;
  document.getElementById('ev-location').value = ev.location || '';
  document.getElementById('ev-recurring').value = ev.recurring || 'none';
  document.getElementById('ev-recurring-end').value = ev.recurringEndDate || '';
  document.getElementById('ev-color').value = ev.color || getEventColor(ev);
  document.getElementById('ev-color').dataset.reset = ev.color ? '' : 'true';
  const notesEl = document.getElementById('ev-notes');
  if (notesEl) notesEl.value = ev.notes || '';
  openModal('event-modal', false);
  history.replaceState({ panel: 'modal', modal: 'event-modal', view: state.currentView || DEFAULT_VIEW }, '', location.href);
}

// ══════════════════════════════════════════════
//  TASKS CRUD
// ══════════════════════════════════════════════
let taskModalSubtasks = [];

function renderTaskModalSubtasks() {
  const el = document.getElementById('tk-subtasks-list');
  if (!el) return;
  el.innerHTML = taskModalSubtasks.map(st => `<div class="subtask-editor-item">
    <span>${esc(st.name)}</span>
    <button type="button" onclick="removeTaskModalSubtask('${esc(st.id)}')">x</button>
  </div>`).join('');
}

function addTaskModalSubtask() {
  const input = document.getElementById('tk-subtask-input');
  const name = input.value.trim();
  if (!name) return;
  taskModalSubtasks.push({ id: 'st' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), name, done: false });
  input.value = '';
  renderTaskModalSubtasks();
}

function removeTaskModalSubtask(id) {
  taskModalSubtasks = taskModalSubtasks.filter(st => st.id !== id);
  renderTaskModalSubtasks();
}

function showAddTaskModal() {
  taskModalSubtasks = [];
  document.getElementById('tk-name').value = '';
  document.getElementById('tk-due').value = todayStr();
  document.getElementById('tk-priority').value = 'medium';
  document.getElementById('tk-recurring').value = 'none';
  document.getElementById('tk-recurring-day').value = String(new Date().getDay());
  document.getElementById('tk-subtask-input').value = '';
  renderTaskModalSubtasks();
  openModal('task-modal');
}
function saveTask() {
  const name = document.getElementById('tk-name').value.trim();
  if (!name) { alert('Please enter a task name'); return; }
  state.tasks.push({
    id: 't'+Date.now(),
    name,
    due: document.getElementById('tk-due').value,
    priority: document.getElementById('tk-priority').value,
    subtasks: taskModalSubtasks,
    recurring: document.getElementById('tk-recurring').value,
    recurringDay: Number(document.getElementById('tk-recurring-day').value),
    doneDates: [],
    done: false,
  });
  saveState(); render();
  closeModal('task-modal');
}
function toggleTask(id, date = todayStr()) {
  const t = state.tasks.find(t=>t.id===id);
  if (!t) return;

  // Animate the checkbox before the DOM re-renders
  const checkEl = document.querySelector(`.task-check[onclick*="'${id}'"]`);
  if (checkEl) {
    checkEl.classList.remove('checking');
    // Force reflow so removing+re-adding the class restarts the animation
    void checkEl.offsetWidth;
    checkEl.classList.add('checking');
  }

  if ((t.recurring || 'none') !== 'none') {
    t.doneDates = t.doneDates || [];
    if (t.doneDates.includes(date)) t.doneDates = t.doneDates.filter(d => d !== date);
    else t.doneDates.push(date);
  } else {
    t.done = !t.done;
    if ((t.subtasks || []).length && t.done) t.subtasks.forEach(st => st.done = true);
  }

  // Haptic: stronger pulse when completing, lighter when unchecking
  if (isTaskDoneForDate(t, date)) haptic(45);
  else haptic(20);

  // Delay render slightly so the animation has time to play
  setTimeout(() => { saveState(); render(); }, 180);
}

function toggleSubtask(taskId, subtaskId) {
  const t = state.tasks.find(task => task.id === taskId);
  const st = t?.subtasks?.find(item => item.id === subtaskId);
  if (!st) return;
  st.done = !st.done;
  t.done = t.subtasks.length ? t.subtasks.every(item => item.done) : !!t.done;
  saveState();
  render();
}
function deleteTask(id) {
  haptic(50);
  const task = state.tasks.find(t => t.id === id);
  let entry = null;
  if (task) {
    entry = pushUndoEntry({ type: 'delete_task', payload: { ...task } });
  }
  state.tasks = state.tasks.filter(t=>t.id!==id);
  saveState(); render();
  if (entry) showDeleteUndoToast(entry);
}

// ══════════════════════════════════════════════
//  HABITS CRUD + INTERACTIONS
// ══════════════════════════════════════════════
let editingHabitId = null;
const DAY_INITIALS = ['S','M','T','W','T','F','S'];

function _buildHabitWeekdayPicker(selected) {
  const wrap = document.getElementById('hb-weekday-picker');
  if (!wrap) return;
  wrap.innerHTML = DAY_INITIALS.map((d, i) => {
    const on = selected.includes(i);
    return `<button type="button" class="hb-day-pill${on ? ' on' : ''}" data-day="${i}" onclick="toggleHabitWeekday(${i})">${d}</button>`;
  }).join('');
}

function _buildHabitColorPicker(selected) {
  const wrap = document.getElementById('hb-color-picker');
  if (!wrap) return;
  wrap.innerHTML = HABIT_COLOR_PRESETS.map(c => {
    const on = (selected || '').toLowerCase() === c.toLowerCase();
    return `<button type="button" class="hb-color-swatch${on ? ' on' : ''}" data-color="${c}" style="background:${c};" aria-label="Color ${c}" onclick="selectHabitColor('${c}')"></button>`;
  }).join('');
}

function toggleHabitWeekday(day) {
  const btn = document.querySelector('.hb-day-pill[data-day="' + day + '"]');
  if (!btn) return;
  btn.classList.toggle('on');
}

function selectHabitColor(color) {
  document.querySelectorAll('.hb-color-swatch').forEach(el => el.classList.toggle('on', el.dataset.color === color));
}

function _getHabitFormSelectedWeekdays() {
  return Array.from(document.querySelectorAll('.hb-day-pill.on')).map(b => Number(b.dataset.day));
}

function _getHabitFormColor() {
  const on = document.querySelector('.hb-color-swatch.on');
  return on ? on.dataset.color : HABIT_COLOR_PRESETS[0];
}

function updateHabitTypeUI() {
  const type = document.getElementById('hb-type').value;
  document.getElementById('hb-counter-row').style.display = type === 'counter' ? '' : 'none';
}

function updateHabitFrequencyUI() {
  const freq = document.getElementById('hb-frequency').value;
  document.getElementById('hb-weekdays-row').style.display = freq === 'weekly' ? '' : 'none';
}

function showAddHabitModal() {
  editingHabitId = null;
  document.getElementById('habit-modal-title').textContent = 'Add Habit';
  document.getElementById('hb-name').value = '';
  document.getElementById('hb-emoji').value = '⭐';
  document.getElementById('hb-type').value = 'checkoff';
  document.getElementById('hb-target').value = 1;
  document.getElementById('hb-unit').value = '';
  document.getElementById('hb-frequency').value = 'daily';
  document.getElementById('hb-reminder').value = '';
  document.getElementById('hb-delete-btn').style.display = 'none';
  _buildHabitWeekdayPicker([1,2,3,4,5]);
  _buildHabitColorPicker(HABIT_COLOR_PRESETS[0]);
  updateHabitTypeUI();
  updateHabitFrequencyUI();
  openModal('habit-modal');
}

function editHabit(id) {
  const h = (state.habits || []).find(x => x.id === id);
  if (!h) return;
  editingHabitId = id;
  document.getElementById('habit-modal-title').textContent = 'Edit Habit';
  document.getElementById('hb-name').value = h.name || '';
  document.getElementById('hb-emoji').value = h.emoji || '⭐';
  document.getElementById('hb-type').value = h.type || 'checkoff';
  document.getElementById('hb-target').value = h.target || 1;
  document.getElementById('hb-unit').value = h.unit || '';
  document.getElementById('hb-frequency').value = h.frequency || 'daily';
  document.getElementById('hb-reminder').value = h.reminderTime || '';
  document.getElementById('hb-delete-btn').style.display = '';
  _buildHabitWeekdayPicker(Array.isArray(h.weekdays) && h.weekdays.length ? h.weekdays : [1,2,3,4,5]);
  _buildHabitColorPicker(h.color || HABIT_COLOR_PRESETS[0]);
  updateHabitTypeUI();
  updateHabitFrequencyUI();
  openModal('habit-modal');
}

function saveHabit() {
  const name = document.getElementById('hb-name').value.trim();
  if (!name) { alert('Please enter a habit name'); return; }
  const type = document.getElementById('hb-type').value;
  const frequency = document.getElementById('hb-frequency').value;
  const target = Math.max(1, Number(document.getElementById('hb-target').value) || 1);
  const unit = document.getElementById('hb-unit').value.trim();
  const reminderTime = document.getElementById('hb-reminder').value || '';
  let weekdays = _getHabitFormSelectedWeekdays();
  if (frequency === 'daily' || !weekdays.length) weekdays = [0,1,2,3,4,5,6];
  const color = _getHabitFormColor();
  const emoji = document.getElementById('hb-emoji').value.trim() || '⭐';

  if (!Array.isArray(state.habits)) state.habits = [];

  if (editingHabitId) {
    const idx = state.habits.findIndex(h => h.id === editingHabitId);
    if (idx >= 0) {
      const existing = state.habits[idx];
      state.habits[idx] = {
        ...existing,
        name, emoji, color, type, target, unit, frequency, weekdays, reminderTime,
        weeklyTarget: frequency === 'daily' ? 7 : weekdays.length
      };
    }
  } else {
    state.habits.push({
      id: 'h' + Date.now() + Math.random().toString(36).slice(2),
      name, emoji, color, type, target, unit, frequency, weekdays,
      weeklyTarget: frequency === 'daily' ? 7 : weekdays.length,
      createdAt: todayStr(),
      completions: {},
      reminderTime,
      archived: false
    });
  }
  if (navigator.vibrate) navigator.vibrate(30);
  saveState(); render();
  closeModal('habit-modal');
}

function deleteHabitFromModal() {
  if (!editingHabitId) return;
  const h = (state.habits || []).find(x => x.id === editingHabitId);
  if (!h) { closeModal('habit-modal'); return; }
  if (!confirm('Delete habit "' + h.name + '"? Streak history will be lost.')) return;
  state.habits = state.habits.filter(x => x.id !== editingHabitId);
  editingHabitId = null;
  saveState(); render();
  closeModal('habit-modal');
  showToast('Habit deleted');
}

function _findHabit(id) {
  return (state.habits || []).find(h => h.id === id);
}

function toggleHabitDone(id) {
  const h = _findHabit(id);
  if (!h) return;
  const today = todayStr();
  if (!h.completions) h.completions = {};
  if (isHabitDoneForDate(h, today)) {
    delete h.completions[today];
  } else {
    h.completions[today] = h.type === 'counter' ? getHabitDailyTarget(h) : 1;
    if (navigator.vibrate) navigator.vibrate(20);
    const streak = getHabitStreak(h);
    if (streak > 0 && streak % 7 === 0) showToast('🔥 ' + streak + '-day streak on ' + h.name + '!');
  }
  saveState(); render();
}

function incrementHabit(id) {
  const h = _findHabit(id);
  if (!h) return;
  const today = todayStr();
  if (!h.completions) h.completions = {};
  const cur = getHabitProgress(h, today);
  const target = getHabitDailyTarget(h);
  h.completions[today] = cur + 1;
  if (navigator.vibrate) navigator.vibrate(15);
  // Toast when target newly reached
  if (cur < target && cur + 1 >= target) {
    const streak = getHabitStreak(h);
    showToast('✅ ' + h.name + ' — done! 🔥 ' + streak);
  }
  saveState(); render();
}

function decrementHabit(id) {
  const h = _findHabit(id);
  if (!h) return;
  const today = todayStr();
  if (!h.completions) h.completions = {};
  const cur = getHabitProgress(h, today);
  if (cur <= 0) return;
  if (cur - 1 <= 0) delete h.completions[today];
  else h.completions[today] = cur - 1;
  if (navigator.vibrate) navigator.vibrate(15);
  saveState(); render();
}

// ══════════════════════════════════════════════
//  MOBILE CHAT
// ══════════════════════════════════════════════
function openChatOverlay(pushHistory = true) {
  const overlay = document.getElementById('chat-overlay');
  overlay.classList.add('open');
  document.getElementById('chat-close-btn').style.display = '';
  document.getElementById('chat-fab').style.display = 'none';
  requestAnimationFrame(() => {
    const msgsEl = document.getElementById('chat-messages');
    if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;
  });
  if (pushHistory) history.pushState({ panel: 'chat', view: state.currentView || DEFAULT_VIEW }, '', location.href);
}
function closeChatOverlay(useHistory = true) {
  const overlay = document.getElementById('chat-overlay');
  const wasOpen = overlay.classList.contains('open');
  overlay.classList.remove('open');
  document.getElementById('chat-close-btn').style.display = 'none';
  document.getElementById('chat-fab').style.display = '';
  if (useHistory && wasOpen && history.state && history.state.panel === 'chat') history.back();
}

// ══════════════════════════════════════════════
//  API KEY
// ══════════════════════════════════════════════
function saveApiKey() {
  const key = document.getElementById('settings-api-key').value.trim();
  const statusEl = document.getElementById('api-key-status');
  state.apiKey = key;
  let stored = true;
  try {
    if (key) localStorage.setItem(API_KEY_STORAGE_KEY, key);
    else localStorage.removeItem(API_KEY_STORAGE_KEY);
  } catch(e) {
    stored = false;
  }
  saveState();
  statusEl.style.display = 'block';
  if (stored) {
    if (key) { statusEl.textContent = '✓ Key saved'; statusEl.style.color='var(--green)'; }
    else { statusEl.textContent = 'Key cleared'; statusEl.style.color='var(--text3)'; }
  } else {
    statusEl.textContent = 'Could not save key on this device.';
    statusEl.style.color = 'var(--coral)';
  }
  document.getElementById('api-status-sidebar').textContent = key ? '⬤ Connected' : '⬤ No key';
  document.getElementById('api-status-sidebar').style.color = key ? 'var(--green)' : 'var(--coral)';
}

// ══════════════════════════════════════════════
//  AI CHAT
// ══════════════════════════════════════════════

// Gemini fetch — native browser CORS support, no proxy needed
function changeTheme() {
  const theme = document.getElementById('settings-theme').value;
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  saveState();
}

function changeAccent() {
  const accent = document.getElementById('settings-accent').value;
  state.accent = accent;
  document.documentElement.style.setProperty('--accent', accent);
  saveState();
}

function changeWeeklyHourLimit() {
  const input = document.getElementById('settings-weekly-limit');
  const value = Math.max(10, Math.min(120, Number(input.value) || 50));
  state.weeklyHourLimit = value;
  input.value = value;
  saveState();
  renderWorkloadWidget();
}

function changeTravelBuffer() {
  const input = document.getElementById('settings-travel-buffer');
  const value = Math.max(0, Math.min(60, Number(input.value) || 0));
  state.travelBufferMins = value;
  input.value = value;
  saveState();
  renderConflictBanner(); // re-evaluate conflicts with new buffer
}
function toggleKeyVisibility() {
  const input = document.getElementById('settings-api-key');
  const eye = document.getElementById('key-eye');
  if (input.type === 'password') {
    input.type = 'text';
    eye.textContent = '🙈';
  } else {
    input.type = 'password';
    eye.textContent = '👁';
  }
}

async function testApiKey() {
  const key = document.getElementById('settings-api-key').value.trim();
  const statusEl = document.getElementById('api-key-status');
  const btn = document.getElementById('test-btn');

  if (!key) {
    statusEl.style.display = 'block';
    statusEl.style.color = 'var(--amber)';
    statusEl.textContent = '⚠️ Please enter an API key first.';
    return;
  }

  btn.textContent = '⏳ Testing…';
  btn.disabled = true;
  statusEl.style.display = 'block';
  statusEl.style.color = 'var(--text3)';
  statusEl.textContent = 'Sending test request to Gemini…';

  try {
    const testUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + encodeURIComponent(key.trim());
    const res = await fetch(testUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Say hello in 3 words.' }] }], generationConfig: { maxOutputTokens: 20 } })
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch(e) {
      statusEl.style.color = 'var(--coral)';
      statusEl.textContent = '❌ Invalid response — double check your key is correct.';
      btn.textContent = '🧪 Test Key'; btn.disabled = false;
      return;
    }
    if (res.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
      statusEl.style.color = 'var(--green)';
      statusEl.textContent = '✅ Key works! Gemini replied: "' + data.candidates[0].content.parts[0].text.trim() + '"';
    } else {
      const msg = data.error?.message || 'Unknown error';
      statusEl.style.color = 'var(--coral)';
      statusEl.textContent = '❌ Error: ' + msg;
    }
  } catch(e) {
    statusEl.style.color = 'var(--coral)';
    statusEl.textContent = '❌ Network error: ' + e.message;
  }

  btn.textContent = '🧪 Test Key';
  btn.disabled = false;
}

// ══════════════════════════════════════════════
//  BACKUP & RESTORE
// ══════════════════════════════════════════════
function exportData() {
  const backup = {
    version: 3,
    exportedAt: new Date().toISOString(),
    events: state.events,
    tasks: state.tasks,
    habits: state.habits || [],
    attendance: state.attendance || [],
    grades: state.grades || [],
    settings: {
      apiKey: '',  // API key intentionally omitted from backup for security — re-enter it after restore
      theme: state.theme || 'dark',
      accent: state.accent || '#7c6ff7',
      notifMinutes: state.notifMinutes || 10,
      notificationsEnabled: !!state.notificationsEnabled,
      gcalClientId: state.gcalClientId || '',
      waPhone: state.waPhone || '',
      waServer: state.waServer || '',
      currentView: state.currentView || DEFAULT_VIEW,
      showFreeTime: state.showFreeTime !== false,
      weeklyHourLimit: state.weeklyHourLimit || 50
    },
    uploadedDocs: uploadedDocs || [],
    optimizerResult: lastOptimizerResult || null
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lazy-panda-backup-' + new Date().toISOString().split('T')[0] + '.json';
  a.click();
  URL.revokeObjectURL(url);
  const el = document.getElementById('backup-status');
  if (el) {
    el.style.display = 'block';
    el.style.color = 'var(--green)';
    el.textContent = '✅ Exported ' + state.events.length + ' events, ' + state.tasks.length + ' tasks, ' + (state.attendance||[]).length + ' attendance records, ' + (state.grades||[]).length + ' grades.';
  }
}

function exportIcal() {
  const tzid = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const formatIcsDateTime = (dateStr, timeStr) => {
    return dateStr.replace(/-/g, '') + 'T' + timeStr.replace(':', '') + '00';
  };
  
  const escapeIcsText = (text) => {
    if (!text) return '';
    return String(text).replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\r?\n/g, '\\n');
  };
  
  const vevents = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in90Days = new Date();
  in90Days.setHours(0, 0, 0, 0);
  in90Days.setDate(today.getDate() + 90);
  
  // Generate events for 90 days
  state.events.forEach(ev => {
    const rec = ev.recurring || 'none';
    const evDate = new Date(ev.date + 'T00:00:00');
    if (rec === 'none' && evDate > in90Days) return;
    
    // Determine which days this event should appear on
    const daysToUse = [];
    const evDay = new Date(ev.date).getDay();
    
    const startDate = evDate > today ? new Date(evDate) : new Date(today);
    for (let d = startDate; d <= in90Days; d.setDate(d.getDate() + 1)) {
      const dStr = dateStr(d);
      const dayOfWeek = d.getDay();
      if (ev.recurringEndDate && dStr > ev.recurringEndDate) continue;
      
      let include = false;
      if (rec === 'none') {
        include = dStr === ev.date;
      } else if (rec === 'daily') {
        include = true;
      } else if (rec === 'weekly') {
        include = dayOfWeek === evDay;
      } else if (rec === 'weekends') {
        include = dayOfWeek === 0 || dayOfWeek === 6;
      } else if (rec === 'biweekly') {
        const weeks = Math.floor(daysBetween(ev.date, dStr) / 7);
        include = dayOfWeek === evDay && weeks >= 0 && weeks % 2 === 0;
      } else if (rec === 'monthly') {
        include = new Date(ev.date + 'T12:00:00').getDate() === d.getDate();
      }
      
      if (include) daysToUse.push(dStr);
    }
    
    // Create VEVENT for each occurrence
    daysToUse.forEach(dateStr => {
      const dtStart = formatIcsDateTime(dateStr, ev.start);
      const dtEnd = formatIcsDateTime(dateStr, ev.end);
      const uid = ev.id + '-' + dateStr + '@lazypanda';
      
      const vevent = [
        'BEGIN:VEVENT',
        'UID:' + uid,
        'DTSTART;TZID=' + tzid + ':' + dtStart,
        'DTEND;TZID=' + tzid + ':' + dtEnd,
        'SUMMARY:' + escapeIcsText(ev.title),
        'LOCATION:' + escapeIcsText(ev.location || ''),
        'DESCRIPTION:' + escapeIcsText(ev.notes || ''),
        'CATEGORIES:' + escapeIcsText(ev.category),
        'END:VEVENT'
      ];
      vevents.push(vevent.join('\r\n'));
    });
  });
  
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Lazy Panda//AI Organizer//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Lazy Panda Schedule',
    'X-WR-TIMEZONE:' + tzid,
    'DTSTAMP:' + now,
    ...vevents,
    'END:VCALENDAR'
  ].join('\r\n');
  
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lazy-panda-schedule-' + new Date().toISOString().split('T')[0] + '.ics';
  a.click();
  URL.revokeObjectURL(url);
  
  const el = document.getElementById('backup-status');
  if (el) {
    el.style.display = 'block';
    el.style.color = 'var(--green)';
    el.textContent = '✅ Exported ' + vevents.length + ' event occurrences to .ics file. You can now import to Google Calendar, Outlook, or Apple Calendar.';
  }
  showToast('Exported ' + vevents.length + ' iCal events');
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const backup = JSON.parse(ev.target.result);
      const el = document.getElementById('backup-status');
      if (!backup.events || !backup.tasks) throw new Error('Invalid backup file format');
      if (!confirm('This will replace your current data with the backup. Continue?')) return;
      state.events = backup.events;
      state.tasks = backup.tasks;
      state.habits = Array.isArray(backup.habits) ? backup.habits : [];
      state.attendance = backup.attendance || [];
      state.grades = backup.grades || [];
      state.apiKey = backup.settings?.apiKey || state.apiKey || '';
      state.theme = backup.settings?.theme || 'dark';
      state.accent = backup.settings?.accent || '#7c6ff7';
      state.notifMinutes = backup.settings?.notifMinutes || 10;
      state.notificationsEnabled = !!backup.settings?.notificationsEnabled;
      state.gcalClientId = backup.settings?.gcalClientId || '';
      state.waPhone = backup.settings?.waPhone || '';
      state.waServer = backup.settings?.waServer || '';
      state.currentView = backup.settings?.currentView || DEFAULT_VIEW;
      state.showFreeTime = backup.settings?.showFreeTime !== false;
      state.weeklyHourLimit = backup.settings?.weeklyHourLimit || 50;
      uploadedDocs = Array.isArray(backup.uploadedDocs) ? backup.uploadedDocs : [];
      lastOptimizerResult = backup.optimizerResult || null;
      document.documentElement.setAttribute('data-theme', state.theme);
      document.documentElement.style.setProperty('--accent', state.accent);
      saveState();
      render();
      showView(isValidView(state.currentView) ? state.currentView : DEFAULT_VIEW, { pushHistory: false, persist: false });
      // Re-arm notification scheduler if notifications are enabled
      if (state.notificationsEnabled) {
        startNotificationScheduler();
      }
      if (el) {
        el.style.display = 'block';
        el.style.color = 'var(--green)';
        el.textContent = '✅ Restored backup from ' + (backup.exportedAt || 'unknown') + '.';
      }
    } catch(err) {
      const el = document.getElementById('backup-status');
      if (el) {
        el.style.display = 'block';
        el.style.color = 'var(--coral)';
        el.textContent = '❌ Failed to import: ' + err.message;
      }
    }
  };
  reader.readAsText(file);
}

// ══════════════════════════════════════════════
//  POMODORO TIMER
// ══════════════════════════════════════════════
let pomoInterval = null;
let pomoTimeLeft = 25 * 60; // 25 mins
let pomoMode = 'work'; // 'work' | 'break'
let pomoRunning = false;

function updatePomoUI() {
  const m = Math.floor(pomoTimeLeft / 60);
  const s = pomoTimeLeft % 60;
  const timeEl = document.getElementById('pomo-time');
  if (timeEl) timeEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  const box = document.getElementById('pomo-box');
  const toggleBtn = document.getElementById('pomo-toggle');
  const status = document.getElementById('pomo-status');

  if (!box || !toggleBtn) return;

  if (pomoMode === 'work') {
    box.classList.remove('break');
    if (status) status.textContent = pomoRunning ? 'Stay focused! 🎯' : 'Ready to focus';
    toggleBtn.textContent = pomoRunning ? 'Pause' : 'Start Focus';
  } else {
    box.classList.add('break');
    if (status) status.textContent = pomoRunning ? 'Relax, you earned it ☕' : 'Ready for a break';
    toggleBtn.textContent = pomoRunning ? 'Pause' : 'Start Break';
  }

  // Update tab highlights
  const tabWork = document.getElementById('tab-work');
  const tabBreak = document.getElementById('tab-break');
  if (tabWork && tabBreak) {
    tabWork.classList.toggle('active', pomoMode === 'work');
    tabBreak.classList.toggle('active', pomoMode === 'break');
  }
}

function setPomodoroMode(mode) {
  if (pomoRunning) {
    if (!confirm('A timer is currently running. Switch modes anyway?')) return;
    clearInterval(pomoInterval);
    pomoRunning = false;
  }
  pomoMode = mode;
  pomoTimeLeft = mode === 'work' ? 25 * 60 : 5 * 60;
  updatePomoUI();
}

function togglePomodoro() {
  if (pomoRunning) {
    clearInterval(pomoInterval);
    pomoRunning = false;
    updatePomoUI();
  } else {
    pomoRunning = true;
    if (navigator.vibrate) navigator.vibrate(50);
    pomoInterval = setInterval(() => {
      pomoTimeLeft--;
      if (pomoTimeLeft <= 0) {
        clearInterval(pomoInterval);
        pomoRunning = false;
        if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 500]); // long vibration
        
        // Switch modes
        if (pomoMode === 'work') {
          pomoMode = 'break';
          pomoTimeLeft = 5 * 60; // 5 mins
        } else {
          pomoMode = 'work';
          pomoTimeLeft = 25 * 60; // 25 mins
        }
      }
      updatePomoUI();
    }, 1000);
    updatePomoUI();
  }
}

function resetPomodoro() {
  clearInterval(pomoInterval);
  pomoRunning = false;
  pomoMode = 'work';
  pomoTimeLeft = 25 * 60;
  updatePomoUI();
}

// ══════════════════════════════════════════════
//  PHASE 2 — DEADLINE COUNTDOWN (Feature 6)
// ══════════════════════════════════════════════
function deadlineDiffLabel(dueStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const due = new Date(dueStr + 'T00:00:00');
  const diff = Math.round((due - today) / 86400000);
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, color: '#f87171', urgency: 0 };
  if (diff === 0) return { label: 'Due today!', color: '#f87171', urgency: 1 };
  if (diff === 1) return { label: 'Due tomorrow', color: '#fbbf24', urgency: 2 };
  if (diff <= 3) return { label: `${diff} days left`, color: '#fbbf24', urgency: 3 };
  if (diff <= 7) return { label: `${diff} days left`, color: '#34d399', urgency: 4 };
  return { label: `${diff} days left`, color: 'var(--text3)', urgency: 5 };
}

function renderDeadlines() {
  const el = document.getElementById('deadlines-list');
  if (!el) return;
  const pending = state.tasks
    .filter(t => !isTaskComplete(t))
    .map(t => ({ ...t, _diff: deadlineDiffLabel(t.due), _repeat: (t.recurring || 'none') !== 'none' }))
    .sort((a, b) => a._diff.urgency - b._diff.urgency || a.due.localeCompare(b.due));

  if (!pending.length) {
    el.innerHTML = emptyState('deadlines');
    return;
  }

  el.innerHTML = pending.map((t, i) => {
    const { label, color } = t._diff;
    const pColor = PRIORITY_COLORS[t.priority] || '#9090a8';
    const barPct = Math.max(5, Math.min(100, 100 - (t._diff.urgency * 18)));
    return `<div class="deadline-card" style="--i:${i}" role="article" aria-label="${esc(t.name)}, ${label}, ${esc(t.priority)} priority${t._repeat ? `, repeats ${esc(t.recurring)}` : ''}">
      <div class="deadline-card-top">
        <div class="deadline-title">${esc(t.name)}</div>
        <div class="deadline-badge" style="color:${color};background:${color}22;">${t._repeat ? `Repeats ${esc(t.recurring)}` : esc(label)}</div>
      </div>
      <div class="deadline-meta">
        <span style="color:${pColor};font-size:11px;font-weight:600;text-transform:uppercase;">${esc(t.priority)} priority</span>
        <span style="color:var(--text3);font-size:11px;">${t._repeat ? `Started ${esc(t.due)}` : `Due ${esc(t.due)}`}</span>
      </div>
      <div class="deadline-bar-track" role="progressbar" aria-valuenow="${barPct}" aria-valuemin="0" aria-valuemax="100" aria-label="Time remaining for ${esc(t.name)}">
        <div class="deadline-bar-fill" style="width:${barPct}%;background:${color};"></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button class="btn-add" style="font-size:11px;" onclick="toggleTask('${esc(t.id)}')" aria-label="Mark ${esc(t.name)} as complete">✓ Mark Done</button>
        <button class="btn-add" style="font-size:11px;" onclick="deleteTask('${esc(t.id)}')" aria-label="Remove ${esc(t.name)}">✕ Remove</button>
      </div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════
//  PHASE 2 — ATTENDANCE TRACKER (Feature 3)
// ══════════════════════════════════════════════
function getClassSubjects() {
  const seen = new Set();
  return state.events
    .filter(e => e.category === 'class')
    .map(e => e.title)
    .filter(t => { if (seen.has(t)) return false; seen.add(t); return true; });
}

function showMarkAttendanceModal() {
  document.getElementById('att-date').value = todayStr();
  document.getElementById('att-status').value = 'present';
  document.getElementById('att-note').value = '';
  const subEl = document.getElementById('att-subject');
  const subjects = getClassSubjects();
  subEl.innerHTML = subjects.length
    ? subjects.map(s => `<option value="${s}">${s}</option>`).join('')
    : `<option value="Other">Other</option>`;
  openModal('attendance-modal');
}

function saveAttendance() {
  const record = {
    id: 'a' + Date.now(),
    subject: document.getElementById('att-subject').value,
    date: document.getElementById('att-date').value,
    status: document.getElementById('att-status').value,
    note: document.getElementById('att-note').value.trim(),
  };
  state.attendance.push(record);
  if (navigator.vibrate) navigator.vibrate(30);
  saveState();
  renderAttendanceSummary();
  renderAttendanceLog();
  closeModal('attendance-modal');
}

function deleteAttendance(id) {
  const record = state.attendance.find(a => a.id === id);
  if (record) {
    undoStack.push({ type: 'delete_attendance', payload: { ...record } });
    if (undoStack.length > MAX_UNDO_ENTRIES) undoStack.shift();
    redoStack = [];
  }
  state.attendance = state.attendance.filter(a => a.id !== id);
  saveState();
  renderAttendanceSummary();
  renderAttendanceLog();
}

function getAttendanceStats() {
  const stats = {};
  state.attendance.forEach(r => {
    if (!stats[r.subject]) stats[r.subject] = { present: 0, absent: 0, late: 0, total: 0 };
    stats[r.subject][r.status]++;
    stats[r.subject].total++;
  });
  return stats;
}

function renderAttendanceSummary() {
  const el = document.getElementById('attendance-summary');
  if (!el) return;
  const stats = getAttendanceStats();
  const subjects = Object.keys(stats);

  if (!subjects.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">📋</div>No attendance records yet. Mark your first session!</div>`;
    return;
  }

  el.innerHTML = `<div class="att-grid">${subjects.map(subj => {
    const s = stats[subj];
    const pct = s.total ? Math.round((s.present + s.late * 0.5) / s.total * 100) : 0;
    const warn = pct < 75;
    const color = pct >= 85 ? 'var(--green)' : pct >= 75 ? 'var(--amber)' : 'var(--coral)';
    return `<div class="att-card${warn ? ' att-warn' : ''}" role="article" aria-label="${esc(subj)}, attendance ${pct}%${warn ? ', below 75% threshold' : ''}">
      <div class="att-subject">${esc(subj)}</div>
      <div class="att-pct" style="color:${color};" aria-live="polite">${pct}%</div>
      <div class="att-bar-track"><div class="att-bar-fill" style="width:${pct}%;background:${color};"></div></div>
      <div class="att-counts">
        <span style="color:var(--green);" title="Present">✅ ${s.present}</span>
        <span style="color:var(--coral);" title="Absent">❌ ${s.absent}</span>
        <span style="color:var(--amber);" title="Late">🕐 ${s.late}</span>
        <span style="color:var(--text3);">/ ${s.total}</span>
      </div>
      ${warn ? `<div class="att-warning">⚠️ Below 75% threshold</div>` : ''}
    </div>`;
  }).join('')}</div>`;
}

function renderAttendanceLog() {
  const el = document.getElementById('attendance-log');
  if (!el) return;
  const sorted = [...state.attendance].sort((a, b) => b.date.localeCompare(a.date));
  if (!sorted.length) { el.innerHTML = ''; return; }

  const STATUS_ICON = { present: '✅', absent: '❌', late: '🕐' };
  el.innerHTML = `<div class="section-header" style="margin-bottom:8px;">
    <span class="section-title">ATTENDANCE LOG</span>
  </div>
  <div class="timeline">${sorted.map(r => `
    <div class="timeline-item">
      <div class="timeline-time" style="width:70px;font-size:10px;">${esc(r.date)}</div>
      <div style="font-size:16px;flex-shrink:0;">${STATUS_ICON[r.status] || '—'}</div>
      <div class="timeline-content">
        <div class="timeline-title">${esc(r.subject)}</div>
        <div class="timeline-sub">${esc(r.status.charAt(0).toUpperCase()+r.status.slice(1))}${r.note ? ' · ' + esc(r.note) : ''}</div>
      </div>
      <span onclick="deleteAttendance('${esc(r.id)}')" style="font-size:14px;color:var(--text3);cursor:pointer;padding:4px;">✕</span>
    </div>`).join('')}</div>`;
}

// ══════════════════════════════════════════════
//  PHASE 2 — GRADE & GPA TRACKER (Feature 5)
// ══════════════════════════════════════════════
let editingGradeId = null;

function gradeToLetter(pct) {
  if (pct >= 90) return { letter: 'A+', gp: 4.0 };
  if (pct >= 85) return { letter: 'A',  gp: 4.0 };
  if (pct >= 80) return { letter: 'A-', gp: 3.7 };
  if (pct >= 75) return { letter: 'B+', gp: 3.3 };
  if (pct >= 70) return { letter: 'B',  gp: 3.0 };
  if (pct >= 65) return { letter: 'B-', gp: 2.7 };
  if (pct >= 60) return { letter: 'C+', gp: 2.3 };
  if (pct >= 55) return { letter: 'C',  gp: 2.0 };
  if (pct >= 50) return { letter: 'C-', gp: 1.7 };
  if (pct >= 45) return { letter: 'D',  gp: 1.0 };
  return { letter: 'F', gp: 0.0 };
}

function calcGPA() {
  // Group grades by subject, calculate weighted score per subject, then GPA by credits
  const subjects = {};
  state.grades.forEach(g => {
    if (!subjects[g.subject]) subjects[g.subject] = { credits: g.credits || 3, weightedSum: 0, totalWeight: 0 };
    const pct = (g.score / g.total) * 100;
    const weight = g.weight || 100;
    subjects[g.subject].weightedSum += pct * weight;
    subjects[g.subject].totalWeight += weight;
  });

  let totalPoints = 0, totalCredits = 0;
  Object.values(subjects).forEach(s => {
    if (s.totalWeight === 0) return;
    const avgPct = s.weightedSum / s.totalWeight;
    const { gp } = gradeToLetter(avgPct);
    totalPoints += gp * s.credits;
    totalCredits += s.credits;
  });
  return totalCredits ? (totalPoints / totalCredits).toFixed(2) : null;
}

function showAddGradeModal(id) {
  editingGradeId = id || null;
  const g = id ? state.grades.find(x => x.id === id) : null;
  document.getElementById('grade-modal-title').textContent = g ? 'Edit Grade' : 'Add Grade';
  document.getElementById('gr-subject').value = g ? g.subject : '';
  document.getElementById('gr-name').value = g ? g.name : '';
  document.getElementById('gr-score').value = g ? g.score : '';
  document.getElementById('gr-total').value = g ? g.total : '100';
  document.getElementById('gr-weight').value = g ? g.weight : '100';
  document.getElementById('gr-credits').value = g ? g.credits : '3';
  openModal('grade-modal');
}

function saveGrade() {
  const subject = document.getElementById('gr-subject').value.trim();
  const name = document.getElementById('gr-name').value.trim();
  const score = parseFloat(document.getElementById('gr-score').value);
  const total = parseFloat(document.getElementById('gr-total').value) || 100;
  const weight = parseFloat(document.getElementById('gr-weight').value) || 100;
  const credits = parseFloat(document.getElementById('gr-credits').value) || 3;
  if (!subject || !name || isNaN(score)) { alert('Please fill in subject, name and score.'); return; }
  const entry = { id: editingGradeId || 'g' + Date.now(), subject, name, score, total, weight, credits };
  if (editingGradeId) {
    const idx = state.grades.findIndex(g => g.id === editingGradeId);
    if (idx >= 0) state.grades[idx] = entry;
  } else {
    state.grades.push(entry);
  }
  if (navigator.vibrate) navigator.vibrate(30);
  saveState();
  renderGrades();
  closeModal('grade-modal');
}

function deleteGrade(id) {
  const grade = state.grades.find(g => g.id === id);
  if (grade) {
    undoStack.push({ type: 'delete_grade', payload: { ...grade } });
    if (undoStack.length > MAX_UNDO_ENTRIES) undoStack.shift();
    redoStack = [];
  }
  state.grades = state.grades.filter(g => g.id !== id);
  saveState();
  renderGrades();
}

function renderGrades() {
  const summaryEl = document.getElementById('gpa-summary');
  const listEl = document.getElementById('grades-list');
  if (!summaryEl || !listEl) return;

  const gpa = calcGPA();
  const gpaColor = !gpa ? 'var(--text3)' : gpa >= 3.5 ? 'var(--green)' : gpa >= 2.5 ? 'var(--amber)' : 'var(--coral)';

  summaryEl.innerHTML = `<div class="gpa-banner">
    <div>
      <div style="font-size:11px;color:var(--text3);font-weight:600;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:4px;">Cumulative GPA</div>
      <div class="gpa-value" style="color:${gpaColor};">${gpa || '—'}</div>
      <div style="font-size:12px;color:var(--text3);margin-top:2px;">${gpa ? gradeToLetter(gpa * 25).letter + ' Average' : 'No grades yet'}</div>
    </div>
    <div style="font-size:40px;">🎓</div>
  </div>`;

  if (!state.grades.length) {
    listEl.innerHTML = `<div class="empty"><div class="empty-icon">📝</div>No grades added yet. Tap "+ Add Grade" to start tracking.</div>`;
    return;
  }

  // Group by subject
  const bySubject = {};
  state.grades.forEach(g => {
    if (!bySubject[g.subject]) bySubject[g.subject] = [];
    bySubject[g.subject].push(g);
  });

  listEl.innerHTML = Object.entries(bySubject).map(([subj, grades]) => {
    const totalWeight = grades.reduce((s, g) => s + (g.weight || 100), 0);
    const weightedPct = grades.reduce((s, g) => s + (g.score / g.total * 100) * (g.weight || 100), 0) / (totalWeight || 1);
    const { letter, gp } = gradeToLetter(weightedPct);
    const color = gp >= 3.5 ? 'var(--green)' : gp >= 2.5 ? 'var(--amber)' : 'var(--coral)';

    return `<div class="grade-subject-block" role="article" aria-label="${esc(subj)}, grade ${letter}, ${weightedPct.toFixed(1)}% average, ${grades[0].credits || 3} credit hours">
      <div class="grade-subject-header">
        <div>
          <div class="grade-subject-name">${esc(subj)}</div>
          <div style="font-size:11px;color:var(--text3);">${grades[0].credits || 3} credit hrs · ${weightedPct.toFixed(1)}% avg</div>
        </div>
        <div style="text-align:right;">
          <div class="grade-letter" style="color:${color};" aria-live="polite">${esc(letter)}</div>
          <div style="font-size:11px;color:var(--text3);">${gp.toFixed(1)} GP</div>
        </div>
      </div>
      ${grades.map(g => {
        const pct = (g.score / g.total * 100).toFixed(1);
        const { letter: gl } = gradeToLetter(parseFloat(pct));
        return `<div class="grade-item" role="listitem" aria-label="${esc(g.name)}, score ${g.score} out of ${g.total}, ${pct}%, grade ${gl}">
          <div class="grade-item-name">${esc(g.name)} <span style="color:var(--text3);font-size:10px;">(${g.weight}% weight)</span></div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:12px;color:var(--text2);">${g.score}/${g.total} · ${pct}% · ${esc(gl)}</span>
            <span onclick="showAddGradeModal('${esc(g.id)}')" style="cursor:pointer;color:var(--text3);font-size:12px;" role="button" tabindex="0" aria-label="Edit grade ${esc(g.name)}" onkeydown="if(event.key==='Enter' || event.key===' ') { event.preventDefault(); showAddGradeModal('${esc(g.id)}'); }">✏️</span>
            <span onclick="deleteGrade('${esc(g.id)}')" style="cursor:pointer;color:var(--text3);font-size:12px;" role="button" tabindex="0" aria-label="Delete grade ${esc(g.name)}" onkeydown="if(event.key==='Enter' || event.key===' ') { event.preventDefault(); deleteGrade('${esc(g.id)}'); }">✕</span>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════
//  PHASE 3 — NOTIFICATIONS (Feature 1)
// ══════════════════════════════════════════════
let notifCheckInterval = null;

function saveNotifPrefs() {
  state.notifMinutes = parseInt(document.getElementById('notif-minutes')?.value || '10');
  saveState();
}

async function requestNotificationPermission() {
  const btn = document.getElementById('notif-enable-btn');
  const statusEl = document.getElementById('notif-status');
  if (!('Notification' in window)) {
    statusEl.textContent = '❌ Notifications not supported in this browser';
    statusEl.style.color = 'var(--coral)';
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    state.notificationsEnabled = true;
    saveState();
    statusEl.textContent = '✅ Notifications enabled!';
    statusEl.style.color = 'var(--green)';
    if (btn) btn.textContent = '✅ Enabled';
    startNotificationScheduler();
  } else {
    statusEl.textContent = '❌ Permission denied — enable in browser settings';
    statusEl.style.color = 'var(--coral)';
  }
}

function updateNotifStatusUI() {
  const statusEl = document.getElementById('notif-status');
  const btn = document.getElementById('notif-enable-btn');
  const minutesEl = document.getElementById('notif-minutes');
  if (!statusEl) return;
  if (Notification.permission === 'granted' && state.notificationsEnabled) {
    statusEl.textContent = '✅ Active';
    statusEl.style.color = 'var(--green)';
    if (btn) btn.textContent = '✅ Enabled';
  } else if (Notification.permission === 'denied') {
    statusEl.textContent = '❌ Blocked — allow in browser settings';
    statusEl.style.color = 'var(--coral)';
  } else {
    statusEl.textContent = 'Not enabled';
    statusEl.style.color = 'var(--text3)';
  }
  if (minutesEl && state.notifMinutes) minutesEl.value = state.notifMinutes;
}

function updateAppVersionUI() {
  const buildEl = document.getElementById('app-version-value');
  const statusEl = document.getElementById('app-update-status');
  if (!buildEl || !statusEl) return;

  const build = window.LAZY_PANDA_BUILD || 'unknown';
  buildEl.textContent = 'Build: ' + build;

  const status = window.__lpSwStatus || { text: 'Update status unavailable.', color: 'var(--text3)' };
  statusEl.textContent = status.text;
  statusEl.style.color = status.color || 'var(--text3)';
}

async function checkForUpdates() {
  if (typeof window.__setLpSwStatus === 'function') {
    window.__setLpSwStatus('Checking for updates…', 'var(--text3)');
  }

  try {
    let reg = window.__lpSwRegistration;
    if (!reg && 'serviceWorker' in navigator) {
      reg = await navigator.serviceWorker.getRegistration();
      window.__lpSwRegistration = reg || null;
    }

    if (!reg) {
      if (typeof window.__setLpSwStatus === 'function') {
        window.__setLpSwStatus('No installed app updater found in this browser session.', 'var(--amber)');
      }
      return;
    }

    await reg.update();

    if (reg.waiting) {
      if (typeof window.__setLpSwStatus === 'function') {
        window.__setLpSwStatus('Update is ready. Reopen the app if it does not refresh automatically.', 'var(--green)');
      }
    } else {
      if (typeof window.__setLpSwStatus === 'function') {
        window.__setLpSwStatus('Checked successfully. This build looks current.', 'var(--green)');
      }
    }
  } catch (e) {
    if (typeof window.__setLpSwStatus === 'function') {
      window.__setLpSwStatus('Update check failed: ' + e.message, 'var(--coral)');
    }
  }
}

function testNotification() {
  if (Notification.permission !== 'granted') {
    alert('Please enable notifications first.');
    return;
  }
  new Notification('Lazy Panda 🐼', {
    body: 'Notifications are working! You\'ll be reminded before class.',
    icon: './icon.png',
    badge: './icon.png',
    tag: 'test'
  });
}

function startNotificationScheduler() {
  if (notifCheckInterval) clearInterval(notifCheckInterval);
  checkUpcomingNotifications();
  notifCheckInterval = setInterval(checkUpcomingNotifications, 60000);
}

// ── NOTIFICATION FIRE TRACKING ─────────────────────────────────────────────
// Persisted to localStorage so refreshes don't re-fire or lose state.
// Key format: 'lp_notif_fired' → { "YYYY-MM-DD": ["key1","key2",...] }
const notifiedEvents = new Set(); // in-memory mirror for fast lookup

function _loadNotifFired() {
  const today = todayStr();
  try {
    const parsed = JSON.parse(localStorage.getItem('lp_notif_fired') || '{}');
    // Prune everything except today
    const pruned = {};
    if (parsed[today]) pruned[today] = parsed[today];
    localStorage.setItem('lp_notif_fired', JSON.stringify(pruned));
    (pruned[today] || []).forEach(k => notifiedEvents.add(k));
  } catch(e) {}
}
_loadNotifFired();

function _markNotifFired(key) {
  notifiedEvents.add(key);
  const today = todayStr();
  try {
    const parsed = JSON.parse(localStorage.getItem('lp_notif_fired') || '{}');
    if (!parsed[today]) parsed[today] = [];
    if (!parsed[today].includes(key)) {
      parsed[today].push(key);
      localStorage.setItem('lp_notif_fired', JSON.stringify(parsed));
    }
  } catch(e) {}
}

function _fireNotif(key, title, body) {
  if (notifiedEvents.has(key)) return; // already fired
  if (Notification.permission !== 'granted' || !state.notificationsEnabled) return;
  _markNotifFired(key);
  new Notification(title, {
    body,
    icon: './icon.png',
    badge: './icon.png',
    tag: key,
    requireInteraction: false
  });
}

function checkUpcomingNotifications() {
  if (Notification.permission !== 'granted' || !state.notificationsEnabled) return;

  const mins = Number(state.notifMinutes) || 10;
  const now = nowMins();
  const today = todayStr();
  const todayEvs = getTodayEvents();

  // ── Events ──
  todayEvs.forEach(ev => {
    const start = timeMins(ev.start);
    const diff = start - now;
    // Fire if within the window: between 0 and (mins + 1) so we don't miss a tick
    if (diff <= 0 || diff > mins + 1) return;

    const key = `${today}-ev-${ev.id}`;
    _fireNotif(
      key,
      `🐼 ${ev.title} in ${Math.round(diff)} min`,
      `${fmt12(ev.start)} – ${fmt12(ev.end)}${ev.location ? ' · ' + ev.location : ''}`
    );

    // WhatsApp reminder
    const waKey = `wa-${today}-${ev.id}`;
    if (state.waPhone && state.waServer && !notifiedEvents.has(waKey)) {
      _markNotifFired(waKey);
      sendWhatsAppReminder(ev, Math.round(diff));
    }
  });

  // ── Tasks due today (fire once, in the morning window or whenever app opens) ──
  const taskNotifHour = 8; // fire task reminders at/after 8 AM
  if (now >= taskNotifHour * 60) {
    state.tasks.filter(t => !isTaskComplete(t) && t.due === today).forEach(task => {
      const key = `${today}-task-${task.id}`;
      _fireNotif(
        key,
        `🐼 Task due today: ${task.name}`,
        `Priority: ${task.priority} — tap to open Lazy Panda`
      );
    });
  }

  // ── Custom reminders (set by AI or user) ──
  if (Array.isArray(state.customReminders)) {
    state.customReminders.forEach(rem => {
      if (rem.fired || rem.date !== today) return;
      const remMins = timeMins(rem.time);
      const diff = remMins - now;
      if (diff <= 0 && diff >= -2) { // fire within 2-min window of exact time
        const key = `${today}-rem-${rem.id}`;
        _fireNotif(key, `🐼 Reminder: ${rem.title}`, rem.note || '');
        rem.fired = true;
        saveState();
      }
    });
  }

  // ── Habit reminders ──
  if (Array.isArray(state.habits)) {
    state.habits.forEach(h => {
      if (h.archived || !h.reminderTime) return;
      if (!isHabitScheduledOnDay(h, today)) return;
      if (isHabitDoneForDate(h, today)) return; // already done — don't nag
      const remMins = timeMins(h.reminderTime);
      const diff = remMins - now;
      if (diff <= 0 && diff >= -2) {
        const key = `${today}-habit-${h.id}`;
        _fireNotif(key, `🐼 Habit: ${h.emoji} ${h.name}`, h.type === 'counter' ? `Log today's ${h.unit || 'progress'}` : 'Tap to check it off');
      }
    });
  }
}

// ══════════════════════════════════════════════
//  PHASE 3 — SHARE SCHEDULE (Feature 18)
// ══════════════════════════════════════════════
async function shareSchedule(mode) {
  const today = new Date();
  let text = '';

  if (mode === 'today') {
    const evs = getTodayEvents();
    const pending = state.tasks.filter(t => !isTaskDoneForDate(t, todayStr()) && t.due === todayStr());
    text = `📅 Lazy Panda — ${today.toDateString()}\n`;
    text += `${'─'.repeat(34)}\n`;
    if (evs.length) {
      text += `\n🗓 TODAY'S SCHEDULE\n`;
      evs.forEach(ev => {
        text += `  ${fmt12(ev.start)} – ${fmt12(ev.end)}  ${ev.title}`;
        if (ev.location) text += `\n  📍 ${ev.location}`;
        text += '\n';
      });
    } else {
      text += '\n🎉 No classes today!\n';
    }
    if (pending.length) {
      text += `\n✅ TODAY'S TASKS\n`;
      pending.forEach(t => { text += `  · ${t.name} (${t.priority})\n`; });
    }
    text += `\n— Shared from Lazy Panda 🐼`;
  } else {
    text = `📆 Lazy Panda — Weekly Schedule\n`;
    text += `${'─'.repeat(34)}\n`;
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const ds = d.toISOString().split('T')[0];
      const evs = getEventsForDay(ds, d.getDay());
      if (evs.length) {
        text += `\n${DAYS[d.getDay()]} ${d.getDate()}\n`;
        evs.forEach(ev => { text += `  ${fmt12(ev.start)}  ${ev.title}\n`; });
      }
    }
    text += `\n— Shared from Lazy Panda 🐼`;
  }

  if (navigator.share) {
    try {
      await navigator.share({ title: 'My Schedule — Lazy Panda', text });
      return;
    } catch(e) { /* fallback to clipboard */ }
  }
  // Clipboard fallback
  try {
    await navigator.clipboard.writeText(text);
    showToast('📋 Schedule copied to clipboard!');
  } catch(e) {
    showToast('Could not share — try copying manually.');
  }
}

const GCAL_SCOPES = 'https://www.googleapis.com/auth/calendar';
let gCalTokenClient = null;
let gCalAccessToken = null;

function updateGCalUI() {
  const connected = !!gCalAccessToken;
  document.getElementById('gcal-connect-btn').style.display = connected ? 'none' : '';
  document.getElementById('gcal-sync-btn').style.display = connected ? '' : 'none';
  document.getElementById('gcal-import-btn').style.display = connected ? '' : 'none';
  document.getElementById('gcal-disconnect-btn').style.display = connected ? '' : 'none';
  const statusEl = document.getElementById('gcal-status');
  if (connected) {
    statusEl.style.display = 'block';
    statusEl.style.color = 'var(--green)';
    statusEl.textContent = '✅ Connected to Google Calendar';
  }
}

function setGCalStatus(msg, color = 'var(--text3)') {
  const el = document.getElementById('gcal-status');
  if (!el) return;
  el.style.display = 'block';
  el.style.color = color;
  el.textContent = msg;
}

async function loadGISLibrary() {
  if (window.google?.accounts?.oauth2) return true;
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = () => res(true);
    s.onerror = () => rej(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(s);
  });
}

async function connectGoogleCalendar() {
  const clientId = "428339420555-1mvluo2fb8mo5cntrl0rrrbk8pfqn1jh.apps.googleusercontent.com";
  setGCalStatus('Loading Google Sign-In…', 'var(--text3)');
  try {
    await loadGISLibrary();
    gCalTokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GCAL_SCOPES,
      callback: (resp) => {
        if (resp.error) { setGCalStatus('❌ Auth error: ' + resp.error, 'var(--coral)'); return; }
        gCalAccessToken = resp.access_token;
        updateGCalUI();
      }
    });
    gCalTokenClient.requestAccessToken({ prompt: 'consent' });
  } catch(e) {
    setGCalStatus('❌ ' + e.message, 'var(--coral)');
  }
}

function disconnectGoogleCalendar() {
  if (gCalAccessToken) window.google?.accounts?.oauth2?.revoke(gCalAccessToken);
  gCalAccessToken = null;
  updateGCalUI();
  const el = document.getElementById('gcal-status');
  if (el) { el.style.display = 'none'; }
}

async function syncToGoogleCalendar() {
  if (!gCalAccessToken) return;
  setGCalStatus('⏳ Syncing events to Google Calendar…', 'var(--text3)');
  const now = new Date();
  const eventsToSync = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(now); d.setDate(now.getDate() + i);
    const ds = d.toISOString().split('T')[0];
    getEventsForDay(ds, d.getDay()).forEach(ev => eventsToSync.push({ ev, ds }));
  }
  let synced = 0, errors = 0;
  for (const { ev, ds } of eventsToSync.slice(0, 50)) {
    const [sh, sm] = ev.start.split(':').map(Number);
    const [eh, em] = ev.end.split(':').map(Number);
    const startDt = new Date(ds); startDt.setHours(sh, sm, 0, 0);
    const endDt   = new Date(ds); endDt.setHours(eh, em, 0, 0);
    const body = {
      summary: ev.title,
      location: ev.location || '',
      start: { dateTime: startDt.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      end:   { dateTime: endDt.toISOString(),   timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      description: ev.notes ? `Notes:\n${ev.notes}` : 'Added by Lazy Panda 🐼'
    };
    try {
      const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { Authorization: `Bearer ${gCalAccessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (r.ok) synced++; else errors++;
    } catch{ errors++; }
  }
  setGCalStatus(`✅ Synced ${synced} events${errors ? ` (${errors} errors)` : ''} to Google Calendar.`, 'var(--green)');
}

async function importFromGoogleCalendar() {
  if (!gCalAccessToken) return;
  setGCalStatus('⏳ Importing from Google Calendar…', 'var(--text3)');
  try {
    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + 30 * 86400000).toISOString();
    const r = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=50`,
      { headers: { Authorization: `Bearer ${gCalAccessToken}` } }
    );
    const data = await r.json();
    const items = data.items || [];
    let imported = 0;
    items.forEach(item => {
      if (!item.start?.dateTime) return; // skip all-day
      const start = new Date(item.start.dateTime);
      const end   = new Date(item.end.dateTime);
      const ds = start.toISOString().split('T')[0];
      const pad = n => String(n).padStart(2,'0');
      const startStr = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
      const endStr   = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
      const existing = state.events.find(e => e.title === item.summary && e.date === ds && e.start === startStr);
      if (!existing) {
        state.events.push({ id:'gcal_'+item.id, title:item.summary||'Untitled', date:ds, start:startStr, end:endStr, location:item.location||'', category:'other', recurring:'none', notes:item.description||'' });
        imported++;
      }
    });
    saveState(); render();
    setGCalStatus(`✅ Imported ${imported} new events from Google Calendar.`, 'var(--green)');
  } catch(e) {
    setGCalStatus('❌ Import failed: ' + e.message, 'var(--coral)');
  }
}

// ══════════════════════════════════════════════
//  PHASE 4 — WHATSAPP REMINDERS (Feature 19)
// ══════════════════════════════════════════════
function updateWAUI() {
  const phoneEl = document.getElementById('wa-phone');
  const serverEl = document.getElementById('wa-server');
  if (phoneEl && state.waPhone) phoneEl.value = state.waPhone;
  if (serverEl && state.waServer) serverEl.value = state.waServer;
}

function saveWhatsAppConfig() {
  state.waPhone  = document.getElementById('wa-phone')?.value.trim();
  state.waServer = document.getElementById('wa-server')?.value.trim();
  saveState();
  const el = document.getElementById('wa-status');
  if (el) {
    el.style.display = 'block';
    el.style.color = 'var(--green)';
    el.textContent = '✅ WhatsApp config saved.';
  }
}

async function testWhatsApp() {
  const phone  = document.getElementById('wa-phone')?.value.trim();
  const server = document.getElementById('wa-server')?.value.trim();
  const el = document.getElementById('wa-status');
  if (!phone || !server) {
    if (el) { el.style.display='block'; el.style.color='var(--amber)'; el.textContent='⚠️ Enter both phone number and server URL.'; }
    return;
  }
  if (el) { el.style.display='block'; el.style.color='var(--text3)'; el.textContent='⏳ Sending test message…'; }
  try {
    const res = await fetch(`${server}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: phone, message: '🐼 Lazy Panda test message! Your WhatsApp reminders are working.' })
    });
    if (res.ok) {
      if (el) { el.style.color='var(--green)'; el.textContent='✅ Test message sent! Check your WhatsApp.'; }
    } else {
      const d = await res.json().catch(()=>({}));
      if (el) { el.style.color='var(--coral)'; el.textContent='❌ Server error: ' + (d.error || res.status); }
    }
  } catch(e) {
    if (el) { el.style.color='var(--coral)'; el.textContent='❌ Could not reach server: ' + e.message; }
  }
}

async function sendWhatsAppReminder(ev, minsBeforeClass) {
  if (!state.waPhone || !state.waServer) return;
  const msg = `🐼 Lazy Panda Reminder\n\n📚 ${ev.title} starts in ${minsBeforeClass} minutes!\n⏰ ${fmt12(ev.start)} – ${fmt12(ev.end)}${ev.location ? '\n📍 ' + ev.location : ''}`;
  try {
    await fetch(`${state.waServer}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: state.waPhone, message: msg })
    });
  } catch(e) { /* silent — don't interrupt UI */ }
}

// WhatsApp reminder logic is integrated directly into checkUpcomingNotifications() above.

// ══════════════════════════════════════════════
//  PHASE 6.2 — COLLABORATIVE SHARING VIA URL
// ══════════════════════════════════════════════
async function generateShareLink(mode = 'week') {
  showToast('⏳ Generating secure share link...');
  closeMobileDrawer(false);
  try {
    const evs = state.events.map(e => ({
      id: e.id, title: e.title, date: e.date, start: e.start, end: e.end, 
      location: e.location, category: e.category, recurring: e.recurring,
      recurringEndDate: e.recurringEndDate, color: e.color
    }));

    const jsonStr = JSON.stringify(evs);
    const stream = new Blob([jsonStr]).stream();
    const compressedStream = stream.pipeThrough(new CompressionStream('deflate'));
    const compressedResponse = await new Response(compressedStream).arrayBuffer();
    
    const binaryString = String.fromCharCode.apply(null, new Uint8Array(compressedResponse));
    const base64Str = btoa(binaryString).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    
    const url = new URL(location.href);
    url.searchParams.set('share', base64Str);
    
    if (url.toString().length > 2000) {
      showToast('⚠️ Link is very long. Some browsers might truncate it.');
    }
    
    if (navigator.share) {
      await navigator.share({
        title: 'My Lazy Panda Schedule',
        text: 'Here is my schedule!',
        url: url.toString()
      });
    } else {
      await navigator.clipboard.writeText(url.toString());
      showToast('✅ Share link copied to clipboard!');
    }
  } catch (e) {
    console.error('Share error:', e);
    showToast('❌ Failed to generate share link.');
  }
}

async function handleShareUrl() {
  const params = new URLSearchParams(location.search);
  const shareData = params.get('share');
  if (!shareData) return false;

  try {
    showToast('⏳ Loading shared schedule...');
    const base64Str = shareData.replace(/-/g, '+').replace(/_/g, '/');
    const binaryStr = atob(base64Str);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    
    const stream = new Blob([bytes]).stream();
    const decompressedStream = stream.pipeThrough(new DecompressionStream('deflate'));
    const text = await new Response(decompressedStream).text();
    const sharedEvents = JSON.parse(text);

    if (!Array.isArray(sharedEvents)) throw new Error('Invalid share data format');
    const validEvents = sharedEvents.filter(ev => ev && typeof ev.start === 'string' && typeof ev.end === 'string' && typeof ev.title === 'string');

    const sharedList = document.getElementById('shared-schedule-list');
    
    sharedList.innerHTML = validEvents.sort((a,b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return timeMins(a.start) - timeMins(b.start);
    }).map(ev => {
      const cat = CAT_COLORS[ev.category] || CAT_COLORS.other;
      const evColor = getEventColor(ev);
      return `<div class="timeline-item">
        <div class="timeline-time" style="width:70px;font-size:10px;">${esc(ev.date || 'Recur')}</div>
        <div class="timeline-dot" style="background:${evColor}"></div>
        <div class="timeline-content">
          <div class="timeline-title">${esc(ev.title)}</div>
          <div class="timeline-sub">${fmt12(ev.start)} – ${fmt12(ev.end)}${ev.location ? ' · ' + esc(ev.location) : ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          <span class="badge" style="background:${getEventBg(ev)};color:${evColor}">${cat.label}</span>
        </div>
      </div>`;
    }).join('');

    return true;
  } catch(e) {
    console.error('Failed to load shared schedule:', e);
    showToast('❌ Invalid or corrupted share link.');
    const newUrl = new URL(location.href);
    newUrl.searchParams.delete('share');
    history.replaceState(null, '', newUrl.toString());
    return false;
  }
}

function exitSharedView() {
  const newUrl = new URL(location.href);
  newUrl.searchParams.delete('share');
  history.replaceState(null, '', newUrl.toString());
  showView('dashboard');
}

// ══════════════════════════════════════════════
//  PHASE 6.4 — CLOUD SYNC (GOOGLE FIREBASE)
// ══════════════════════════════════════════════
let firebaseUnsubscribe = null;
let lastSyncTimestamp = 0;
let syncInProgress = false;

// TODO: Replace this placeholder config with an actual Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyABHSM6EFseBSxqKMajA0OPEoQd81KkJDM",
  authDomain: "gen-lang-client-0412969424.firebaseapp.com",
  projectId: "gen-lang-client-0412969424",
  storageBucket: "gen-lang-client-0412969424.firebasestorage.app",
  messagingSenderId: "428339420555",
  appId: "1:428339420555:web:8b040024cd3c039ca0638e",
  measurementId: "G-R0DYVP159S"
};

// Initialize Firebase
let firebaseApp, auth, db;
try {
  if (firebase.apps.length === 0) {
    firebaseApp = firebase.initializeApp(firebaseConfig);
  } else {
    firebaseApp = firebase.app();
  }
  auth = firebase.auth();
  db = firebase.firestore();
} catch (e) {
  console.error("Firebase init error:", e);
}

function updateFirebaseUI(user) {
  const statusEl = document.getElementById('firebase-status');
  const signinBtn = document.getElementById('fb-signin-btn');
  const signoutBtn = document.getElementById('fb-signout-btn');
  const syncBtn = document.getElementById('fb-sync-btn');
  
  if (user) {
    if (statusEl) {
      statusEl.textContent = `Signed in as ${user.email}`;
      statusEl.style.color = 'var(--green)';
    }
    if (signinBtn) signinBtn.style.display = 'none';
    if (signoutBtn) signoutBtn.style.display = 'inline-block';
    if (syncBtn) syncBtn.removeAttribute('disabled');
  } else {
    if (statusEl) {
      statusEl.textContent = 'Not signed in.';
      statusEl.style.color = 'var(--text3)';
    }
    if (signinBtn) signinBtn.style.display = 'inline-block';
    if (signoutBtn) signoutBtn.style.display = 'none';
    if (syncBtn) syncBtn.setAttribute('disabled', 'true');
  }
}

if (auth) {
  auth.onAuthStateChanged(user => {
    updateFirebaseUI(user);
    if (user) {
      setupRealtimeSyncListener(user.uid);
      restoreFromCloud();
    } else {
      if (firebaseUnsubscribe) {
        firebaseUnsubscribe();
        firebaseUnsubscribe = null;
      }
    }
  });
}

function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(e => {
    console.error("Sign in failed", e);
    const el = document.getElementById('firebase-status');
    if (el) {
      el.textContent = 'Sign in failed: ' + e.message;
      el.style.color = 'var(--coral)';
    }
  });
}

function signOut() {
  auth.signOut().then(() => {
    updateFirebaseUI(null);
  });
}

function initializeCloudSync() {
  // No-op, Firebase handles this via onAuthStateChanged
}

function setupRealtimeSyncListener(uid) {
  if (firebaseUnsubscribe) firebaseUnsubscribe();
  
  firebaseUnsubscribe = db.collection('users').doc(uid).onSnapshot(doc => {
    if (doc.exists) {
      handleRemoteSync(doc.data(), doc.metadata.hasPendingWrites);
    }
  }, err => {
    console.error('Realtime sync error:', err);
  });
}

function handleRemoteSync(cloudState, isLocal) {
  if (isLocal) return;
  
  const remoteTimestamp = cloudState.updated_at || 0;
  if (remoteTimestamp > lastSyncTimestamp) {
    mergeCloudData(cloudState);
    lastSyncTimestamp = remoteTimestamp;
  }
}

function mergeCloudData(cloudState) {
  if (cloudState.events && Array.isArray(cloudState.events)) {
    cloudState.events.forEach(cloudEv => {
      const idx = state.events.findIndex(e => e.id === cloudEv.id);
      if (idx < 0) state.events.push(cloudEv);
    });
  }
  if (cloudState.tasks && Array.isArray(cloudState.tasks)) {
    cloudState.tasks.forEach(cloudTask => {
      const idx = state.tasks.findIndex(t => t.id === cloudTask.id);
      if (idx < 0) state.tasks.push(cloudTask);
    });
  }
  saveState();
  render();
}

let syncTimeout = null;
function autoSyncToCloud() {
  if (!auth || !auth.currentUser) return;
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    syncToCloud(true);
  }, 3000);
}

async function syncToCloud(isAuto = false) {
  if (syncInProgress) return;
  syncInProgress = true;
  
  const user = auth?.currentUser;
  const el = document.getElementById('firebase-status');
  
  if (!user) {
    syncInProgress = false;
    return;
  }
  
  if (!isAuto && el) {
    el.style.color = 'var(--text3)';
    el.textContent = `⏳ Syncing to cloud... (${user.email})`;
  }
  
  try {
    const payload = { ...state };
    delete payload.apiKey;
    const now = new Date().getTime();
    payload.updated_at = now;
    lastSyncTimestamp = now;
    
    await db.collection('users').doc(user.uid).set(payload, { merge: true });
    
    syncInProgress = false;
    if (!isAuto && el) {
      el.style.color = 'var(--green)';
      el.textContent = `✅ Synced to cloud (${user.email})`;
    }
  } catch(e) {
    syncInProgress = false;
    console.error('Sync error:', e);
    if (!isAuto && el) {
      el.style.color = 'var(--coral)';
      el.textContent = '❌ Sync failed: ' + e.message;
    }
  }
}

async function restoreFromCloud() {
  const user = auth?.currentUser;
  const el = document.getElementById('firebase-status');
  if (!user) return;
  
  if (el) {
    el.style.color = 'var(--text3)';
    el.textContent = `⏳ Restoring from cloud... (${user.email})`;
  }
  
  try {
    const doc = await db.collection('users').doc(user.uid).get();
    if (!doc.exists) {
      if (el) {
        el.style.color = 'var(--text3)';
        el.textContent = `Welcome! No cloud data found for ${user.email}.`;
      }
      return;
    }
    
    const cloudState = doc.data();
    lastSyncTimestamp = cloudState.updated_at || new Date().getTime();
    
    const localApiKey = state.apiKey;
    const localGcalClientId = state.gcalClientId;
    const localWaPhone = state.waPhone;
    
    if (cloudState.events && Array.isArray(cloudState.events)) {
      cloudState.events.forEach(cloudEv => {
        const idx = state.events.findIndex(e => e.id === cloudEv.id);
        if (idx < 0) state.events.push(cloudEv);
      });
    }
    
    if (cloudState.tasks && Array.isArray(cloudState.tasks)) {
      cloudState.tasks.forEach(cloudTask => {
        const idx = state.tasks.findIndex(t => t.id === cloudTask.id);
        if (idx < 0) state.tasks.push(cloudTask);
      });
    }
    
    if (cloudState.grades && Array.isArray(cloudState.grades)) state.grades = cloudState.grades;
    if (cloudState.attendance && Array.isArray(cloudState.attendance)) state.attendance = cloudState.attendance;
    
    if (Array.isArray(cloudState.habits)) {
      if (!Array.isArray(state.habits)) state.habits = [];
      cloudState.habits.forEach(cloudH => {
        const idx = state.habits.findIndex(h => h.id === cloudH.id);
        if (idx < 0) {
          state.habits.push(cloudH);
        } else {
          state.habits[idx].completions = { ...(state.habits[idx].completions || {}), ...(cloudH.completions || {}) };
        }
      });
    }
    
    if (!state.apiKey && localApiKey) state.apiKey = localApiKey;
    if (!state.gcalClientId && localGcalClientId) state.gcalClientId = localGcalClientId;
    if (!state.waPhone && localWaPhone) state.waPhone = localWaPhone;
    
    saveState();
    render();
    if (el) {
      el.style.color = 'var(--green)';
      el.textContent = `✅ Restored and syncing (${user.email})`;
    }
  } catch(e) {
    console.error('Restore error:', e);
    if (el) {
      el.style.color = 'var(--coral)';
      el.textContent = '❌ Restore failed: ' + e.message;
    }
  }
}

// Listen for messages from Service Worker (background sync triggers)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data.type === 'BACKGROUND_CLOUD_SYNC') {
      console.log('Background cloud sync triggered by SW');
      autoSyncToCloud();
    }
    if (event.data.type === 'BACKGROUND_NOTIFICATION_CHECK') {
      console.log('Background notification check triggered by SW');
      if (typeof checkUpcomingNotifications === 'function') {
        checkUpcomingNotifications();
      }
    }
  });
}

function initializeNavigation() {
  const hashView = location.hash ? location.hash.slice(1) : '';
  const initialView = isValidView(hashView) ? hashView : (isValidView(state.currentView) ? state.currentView : DEFAULT_VIEW);
  
  handleShareUrl().then(isShared => {
    if (isShared) {
      showView('shared', { pushHistory: false, persist: false });
    } else {
      history.replaceState(
        { view: DEFAULT_VIEW },
        '',
        location.pathname + location.search
      );
      showView(initialView, { pushHistory: false, persist: false });
      if (initialView !== DEFAULT_VIEW) {
        history.pushState({ view: initialView }, '', '#' + initialView);
      }
    }
  });
  
  // Trigger proactive AI
  generateDailyRecommendations();
}

window.addEventListener('popstate', function(e) {
  const stateObj = e.state || {};
  const openModalId = getOpenModalId();

  if (stateObj.panel === 'chat') {
    closeAllModals();
    closeMobileDrawer(false);
    openChatOverlay(false);
    return;
  }

  if (stateObj.panel === 'drawer') {
    closeAllModals();
    closeChatOverlay(false);
    openMobileDrawer(false);
    return;
  }

  if (stateObj.panel === 'modal' && stateObj.modal) {
    closeChatOverlay(false);
    closeMobileDrawer(false);
    closeAllModals();
    openModal(stateObj.modal, false);
    return;
  }

  closeChatOverlay(false);
  closeMobileDrawer(false);
  if (openModalId) closeModal(openModalId, false);
  showView(isValidView(stateObj.view) ? stateObj.view : DEFAULT_VIEW, { pushHistory: false });
});

// ══════════════════════════════════════════════
// ══════════════════════════════════════════════
loadState();
render();
initializeNavigation();

// Initialize cloud sync if configured
initializeCloudSync();

// Start notification scheduler if already permitted from a previous session
if ('Notification' in window && Notification.permission === 'granted' && state.notificationsEnabled) {
  startNotificationScheduler();
}

// Auto-update timeline every minute
setInterval(() => { renderTimeline(); renderUpcoming(); }, 60000);

// ── VISIBILITY-BASED NOTIFICATION CHECK ────────────────────────────────────
// On mobile, setInterval is throttled when the app is in background.
// Fire a check the moment the user brings the app back into focus.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.notificationsEnabled) {
    checkUpcomingNotifications();
  }
});

// ── OFFLINE BANNER ──────────────────────────────────────────────────────────
(function initOfflineBanner() {
  const banner = document.getElementById('offline-banner');
  if (!banner) return;
  function update() {
    if (navigator.onLine) {
      banner.classList.add('hidden');
    } else {
      banner.classList.remove('hidden');
    }
  }
  update(); // check on load in case we're already offline
  window.addEventListener('offline', update);
  window.addEventListener('online',  update);
})();

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

const quickAddPopover = document.getElementById('quick-add-popover');
if (quickAddPopover) {
  quickAddPopover.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveQuickEvent();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeQuickAdd();
    }
  });
}

// Global keyboard shortcuts for undo/redo
document.addEventListener('keydown', (e) => {
  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  const ctrlKey = isMac ? e.metaKey : e.ctrlKey;
  
  // Don't trigger shortcuts when typing in input/textarea
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
    return;
  }
  
  // Check if a modal is open (except for Escape to close them)
  const openModal = document.querySelector('.modal-overlay:not(.hidden)');
  if (openModal && e.key !== 'Escape') {
    return;
  }
  
  // Undo: Ctrl/Cmd+Z
  if (ctrlKey && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undoLast();
  }
  // Redo: Ctrl/Cmd+Shift+Z
  else if (ctrlKey && e.key === 'z' && e.shiftKey) {
    e.preventDefault();
    redoLast();
  }
  // N: New event (quick add)
  else if (e.key.toLowerCase() === 'n' && !ctrlKey && !e.altKey) {
    e.preventDefault();
    showQuickAdd(null);
  }
  // T: New task
  else if (e.key.toLowerCase() === 't' && !ctrlKey && !e.altKey) {
    e.preventDefault();
    showAddTaskModal();
  }
  // /: Focus search (if in schedule view)
  else if (e.key === '/' && !ctrlKey && !e.altKey) {
    e.preventDefault();
    if (state.currentView === 'schedule') {
      const search = document.getElementById('schedule-search');
      if (search) search.focus();
    }
  }
  // 1-9: Switch views
  else if (/^[1-9]$/.test(e.key) && !ctrlKey && !e.altKey) {
    const viewNames = ['dashboard','schedule','tasks','deadlines','focus','settings'];
    const idx = parseInt(e.key) - 1;
    if (idx < viewNames.length) {
      e.preventDefault();
      showView(viewNames[idx]);
    }
  }
  // ?: Show help
  else if ((e.key === '?' || (e.shiftKey && e.key === '/')) && !ctrlKey && !e.altKey) {
    e.preventDefault();
    openModal('shortcuts-modal');
  }
  // Escape: Close modal
  else if (e.key === 'Escape' && openModal) {
    e.preventDefault();
    closeModal(openModal.id);
  }
});

window.showView = showView;
window.checkForUpdates = checkForUpdates;
window.updateAppVersionUI = updateAppVersionUI;

// (Gym module extracted to ./gym/ — see gym/README.md)

// ══════════════════════════════════════════════
//  MOBILE GESTURES & UX
// ══════════════════════════════════════════════

/* Haptic feedback — silent on unsupported browsers */
function haptic(ms) {
  if (navigator.vibrate) navigator.vibrate(ms || 30);
}

/* ── Swipe-to-delete ───────────────────────────
   Wraps .task-item and .timeline-item in a
   .swipe-wrap + .swipe-del-bg, then handles
   left-swipe-to-delete on mobile only.
─────────────────────────────────────────────── */
function initSwipeToDelete() {
  if (window.innerWidth > 768) return;

  const TRASH_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/><path d="M10,11v6M14,11v6"/><path d="M9,6V4h6v2"/></svg>`;

  document.querySelectorAll('.task-item[data-id], .timeline-item[data-id]').forEach(item => {
    // Skip already-wrapped items
    if (item.parentElement && item.parentElement.classList.contains('swipe-wrap')) return;

    const id   = item.dataset.id;
    const type = item.dataset.type; // 'task' | 'event'
    if (!id) return;

    // Build wrapper
    const wrap = document.createElement('div');
    wrap.className = 'swipe-wrap';
    item.parentNode.insertBefore(wrap, item);
    wrap.appendChild(item);

    // Delete bg (sits behind item via DOM order — wrap is relative, item will translate)
    const bg = document.createElement('div');
    bg.className = 'swipe-del-bg';
    bg.innerHTML = TRASH_SVG + '<span>Delete</span>';
    wrap.appendChild(bg);

    // Touch state
    let startX = 0, startY = 0, dx = 0, decided = false, isVertical = false, active = false;

    item.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dx = 0; decided = false; isVertical = false; active = true;
      item.style.transition = 'none';
    }, { passive: true });

    item.addEventListener('touchmove', (e) => {
      if (!active) return;
      const cdx = e.touches[0].clientX - startX;
      const cdy = e.touches[0].clientY - startY;

      if (!decided) {
        if (Math.abs(cdx) < 6 && Math.abs(cdy) < 6) return;
        decided = true;
        isVertical = Math.abs(cdy) > Math.abs(cdx);
      }
      if (isVertical || cdx > 4) return; // ignore right-swipe & vertical scroll

      dx = Math.max(cdx, -96);
      item.style.transform = `translateX(${dx}px)`;
      const pct = Math.min(Math.abs(dx) / 80, 1);
      bg.style.width  = Math.abs(dx) + 'px';
      bg.style.opacity = pct;
    }, { passive: true });

    item.addEventListener('touchend', () => {
      if (!active || isVertical || dx === 0) { active = false; return; }
      active = false;

      if (dx <= -72) {
        // Commit delete — animate out then call delete
        haptic(50);
        item.style.transition = 'transform 0.18s ease, opacity 0.18s ease';
        item.style.transform  = 'translateX(-110%)';
        item.style.opacity    = '0';
        setTimeout(() => {
          const h = wrap.offsetHeight;
          wrap.style.transition  = 'max-height 0.22s ease, margin-bottom 0.22s ease, padding 0.22s ease';
          wrap.style.overflow    = 'hidden';
          wrap.style.maxHeight   = h + 'px';
          requestAnimationFrame(() => {
            wrap.style.maxHeight    = '0';
            wrap.style.marginBottom = '0';
          });
          setTimeout(() => {
            if (type === 'task')  deleteTask(id);
            else                  deleteEvent(id);
          }, 240);
        }, 160);
      } else {
        // Snap back with spring
        item.style.transition = 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1)';
        item.style.transform  = 'translateX(0)';
        bg.style.opacity = '0';
        bg.style.width   = '0';
        dx = 0;
      }
    }, { passive: true });

    item.addEventListener('touchcancel', () => {
      active = false;
      item.style.transition = 'transform 0.25s ease';
      item.style.transform  = 'translateX(0)';
      bg.style.opacity = '0';
      bg.style.width   = '0';
      dx = 0;
    }, { passive: true });
  });
}

/* ── Swipe between views ───────────────────────
   Left-swipe  → next view in nav order
   Right-swipe → prev view in nav order
   Only fires on mobile, ignores horizontal
   scrollable children.
─────────────────────────────────────────────── */
(function initSwipeNav() {
  const SWIPE_VIEWS = ['dashboard', 'schedule', 'tasks', 'deadlines', 'focus'];
  const THRESHOLD   = 55;   // px minimum swipe
  const MAX_TIME    = 380;  // ms maximum gesture time
  const IGNORE_SEL  = '.cal-grid-wrap, input, textarea, select, [contenteditable]';

  let startX = 0, startY = 0, startTime = 0;

  const main = document.querySelector('.main');
  if (!main) return;

  // Hint arrows injected once
  function getHint(side) {
    let el = document.querySelector(`.swipe-nav-hint.${side}`);
    if (!el) {
      el = document.createElement('div');
      el.className = `swipe-nav-hint ${side}`;
      el.textContent = side === 'left' ? '‹' : '›';
      document.body.appendChild(el);
    }
    return el;
  }

  function flashHint(side) {
    const el = getHint(side);
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 300);
  }

  main.addEventListener('touchstart', (e) => {
    startX    = e.touches[0].clientX;
    startY    = e.touches[0].clientY;
    startTime = Date.now();
  }, { passive: true });

  main.addEventListener('touchend', (e) => {
    if (window.innerWidth > 768) return;

    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    const dt = Date.now() - startTime;

    // Must be fast, mostly horizontal, and past threshold
    if (dt > MAX_TIME || Math.abs(dx) < THRESHOLD || Math.abs(dy) > Math.abs(dx)) return;

    // Ignore if touch started inside a horizontally scrollable element
    if (e.target && e.target.closest(IGNORE_SEL)) return;

    const curIdx = SWIPE_VIEWS.indexOf(state.currentView);
    if (curIdx === -1) return;

    if (dx < 0 && curIdx < SWIPE_VIEWS.length - 1) {
      haptic(28);
      flashHint('right');
      showView(SWIPE_VIEWS[curIdx + 1]);
    } else if (dx > 0 && curIdx > 0) {
      haptic(28);
      flashHint('left');
      showView(SWIPE_VIEWS[curIdx - 1]);
    }
  }, { passive: true });
})();

/* ── Re-init swipe-to-delete after every render ── */
const _origRender = typeof render === 'function' ? render : null;
// Hook into safeRender which is the actual debounced wrapper used by everything
const _origSafeRender = typeof safeRender === 'function' ? safeRender : null;
if (_origSafeRender) {
  // Patch: after safeRender fires, re-init swipe targets
  // safeRender uses a debounce internally, so we watch for DOM settle
  const _safeWrap = safeRender;
  window._mobileGestureRenderHook = function() {
    requestAnimationFrame(() => initSwipeToDelete());
  };
}

// Also hook MutationObserver so items added by render() get swipe bindings
(function() {
  const containers = ['timeline-list', 'tasks-today', 'tasks-upcoming', 'all-events-list', 'all-tasks-list'];
  const observer = new MutationObserver(() => {
    if (window.innerWidth > 768) return;
    requestAnimationFrame(() => initSwipeToDelete());
  });
  function observeContainers() {
    containers.forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.observe(el, { childList: true, subtree: false });
    });
  }
  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeContainers);
  } else {
    observeContainers();
  }
})();
