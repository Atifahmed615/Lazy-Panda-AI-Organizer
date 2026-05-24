// ══════════════════════════════════════════════
//  DATA STORE
// ══════════════════════════════════════════════
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const CAT_COLORS = {
  class: { dot:'#7c6ff7', badge:'#7c6ff7', bg:'rgba(124,111,247,0.12)', label:'CLASS' },
  study: { dot:'#34d399', badge:'#34d399', bg:'rgba(52,211,153,0.1)', label:'STUDY' },
  meeting: { dot:'#60a5fa', badge:'#60a5fa', bg:'rgba(96,165,250,0.1)', label:'MEETING' },
  personal: { dot:'#fbbf24', badge:'#fbbf24', bg:'rgba(251,191,36,0.1)', label:'PERSONAL' },
  other: { dot:'#9090a8', badge:'#9090a8', bg:'rgba(144,144,168,0.1)', label:'OTHER' },
};
const PRIORITY_COLORS = { high:'#f87171', medium:'#fbbf24', low:'#34d399' };
const STATE_STORAGE_KEY = 'classflow_state';
const API_KEY_STORAGE_KEY = 'lazy_panda_api_key';
const DOCS_STORAGE_KEY = 'lazy_panda_uploaded_docs';
const OPTIMIZER_STORAGE_KEY = 'lazy_panda_optimizer_result';
const DEFAULT_VIEW = 'dashboard';
let uploadedDocs = [];
let lastOptimizerResult = null;

function defaultEvents() {
  const today = new Date();
  const fmt = d => d.toISOString().split('T')[0];
  const dayOfWeek = today.getDay(); // 0=Sun

  // Compute next occurrence of a given weekday
  function nextDay(targetDay) {
    let d = new Date(today);
    let diff = (targetDay - dayOfWeek + 7) % 7;
    if (diff === 0) diff = 0;
    d.setDate(d.getDate() + diff);
    return fmt(d);
  }

  return [
    { id:'e1', title:'Machine Learning', category:'class', date: nextDay(1), start:'18:00', end:'21:00', location:'NED CIS Department', recurring:'weekly' },
    { id:'e2', title:'Mathematics for AI', category:'class', date: nextDay(2), start:'18:00', end:'21:00', location:'NED CIS Department', recurring:'weekly' },
    { id:'e3', title:'Introduction to AI', category:'class', date: nextDay(3), start:'18:00', end:'21:00', location:'NED CIS Department', recurring:'weekly' },
    { id:'e4', title:'Understanding Holy Quran 1', category:'class', date: nextDay(4), start:'18:00', end:'21:00', location:'NED Auditorium', recurring:'weekly' },
    { id:'e5', title:'AI-Driven Dev & Claude Code', category:'class', date: nextDay(5), start:'20:00', end:'22:00', location:'Online', recurring:'weekends' },
    { id:'e6', title:'AI-Driven Dev & Claude Code', category:'class', date: nextDay(0), start:'20:00', end:'22:00', location:'Online', recurring:'weekends' },
    { id:'e7', title:'PGD: Machine Learning', category:'class', date: nextDay(6), start:'11:00', end:'13:00', location:'NED Textile Department', recurring:'weekends' },
    { id:'e8', title:'PGD: Machine Learning', category:'class', date: nextDay(0), start:'11:00', end:'13:00', location:'NED Textile Department', recurring:'weekends' },
    { id:'e9', title:'CAIPP', category:'class', date: nextDay(6), start:'14:00', end:'18:00', location:'PNEC Computer Science Dept', recurring:'weekly' },
  ];
}

function defaultTasks() {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
  const tmrw = tomorrow.toISOString().split('T')[0];
  return [
    { id:'t1', name:'Review ML backpropagation notes', due: today, priority:'high', done: false },
    { id:'t2', name:'Complete Math for AI assignment', due: today, priority:'medium', done: false },
    { id:'t3', name:'Prepare CAIPP presentation', due: tmrw, priority:'high', done: false },
    { id:'t4', name:'Read Quran tafseer chapter 2', due: tmrw, priority:'low', done: false },
  ];
}

let state = { events: [], tasks: [], attendance: [], grades: [], apiKey: '', theme: 'dark', accent: '#7c6ff7', currentView: DEFAULT_VIEW, showFreeTime: true, weeklyHourLimit: 50 };

// Undo/Redo stacks for destructive actions
let undoStack = [];
let redoStack = [];
const MAX_UNDO_ENTRIES = 20;

function loadState() {
  try {
    const saved = localStorage.getItem(STATE_STORAGE_KEY);
    if (saved) {
      state = { ...state, ...JSON.parse(saved) };
      if (!Array.isArray(state.events)) state.events = [];
      if (!Array.isArray(state.tasks)) state.tasks = [];
    } else {
      state.events = defaultEvents();
      state.tasks = defaultTasks();
      state.theme = 'dark';
      state.accent = '#7c6ff7';
    }
    const savedApiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (savedApiKey) state.apiKey = savedApiKey;
    try {
      const savedDocs = localStorage.getItem(DOCS_STORAGE_KEY);
      uploadedDocs = savedDocs ? JSON.parse(savedDocs) : [];
    if (!Array.isArray(uploadedDocs)) uploadedDocs = [];
    } catch(e) {
      uploadedDocs = [];
    }
    try {
      lastOptimizerResult = localStorage.getItem(OPTIMIZER_STORAGE_KEY) || null;
    } catch(e) {
      lastOptimizerResult = null;
    }
    if (!state.attendance) state.attendance = [];
    if (!state.grades) state.grades = [];
    if (!state.notifMinutes) state.notifMinutes = 10;
    if (state.notificationsEnabled === undefined) state.notificationsEnabled = false;
    if (!state.gcalClientId) state.gcalClientId = '';
    if (!state.waPhone) state.waPhone = '';
    if (!state.waServer) state.waServer = '';
    if (!state.currentView) state.currentView = DEFAULT_VIEW;
    if (state.showFreeTime === undefined) state.showFreeTime = true;
    if (!state.weeklyHourLimit) state.weeklyHourLimit = 50;
    state.events.forEach(ev => {
      if (!ev.recurringEndDate) ev.recurringEndDate = '';
      if (!ev.color) ev.color = '';
    });
    state.tasks.forEach(t => {
      if (!Array.isArray(t.subtasks)) t.subtasks = [];
      if (!t.recurring) t.recurring = 'none';
      if (t.recurringDay === undefined) t.recurringDay = new Date((t.due || todayStr()) + 'T12:00:00').getDay();
      if (!t.doneDates) t.doneDates = [];
    });
    document.documentElement.setAttribute('data-theme', state.theme || 'dark');
    if (state.accent) document.documentElement.style.setProperty('--accent', state.accent);
    const statusEl = document.getElementById('api-status-sidebar');
    if (statusEl) {
      statusEl.textContent = state.apiKey ? '⬤ Connected' : '⬤ No key';
      statusEl.style.color = state.apiKey ? 'var(--green)' : 'var(--coral)';
    }
  } catch(e) { state.events = defaultEvents(); state.tasks = defaultTasks(); state.attendance = []; state.grades = []; state.theme = 'dark'; state.accent = '#7c6ff7'; }
}

function saveState() {
  try {
    localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(state));
  } catch(e) {}
  try {
    if (state.apiKey) localStorage.setItem(API_KEY_STORAGE_KEY, state.apiKey);
    else localStorage.removeItem(API_KEY_STORAGE_KEY);
  } catch(e) {}
  try {
    if (uploadedDocs.length) localStorage.setItem(DOCS_STORAGE_KEY, JSON.stringify(uploadedDocs));
    else localStorage.removeItem(DOCS_STORAGE_KEY);
  } catch(e) {}
  try {
    if (lastOptimizerResult) localStorage.setItem(OPTIMIZER_STORAGE_KEY, lastOptimizerResult);
    else localStorage.removeItem(OPTIMIZER_STORAGE_KEY);
  } catch(e) {}
  
  // Invalidate cache
  calendarCache = {};

  // Auto-sync
  if (typeof autoSyncToCloud === 'function') autoSyncToCloud();
}

function resetData() {
  if (!confirm('Reset everything? All data will be lost.')) return;
  // Clear all data and settings
  state.events = [];
  state.tasks = [];
  state.attendance = [];
  state.grades = [];
  state.apiKey = '';
  state.theme = 'dark';
  state.accent = '#7c6ff7';
  state.notificationsEnabled = false;
  state.notifMinutes = 10;
  state.gcalClientId = '';
  state.waPhone = '';
  state.waServer = '';
  state.currentView = DEFAULT_VIEW;
  state.showFreeTime = true;
  state.weeklyHourLimit = 50;
  uploadedDocs = [];
  lastOptimizerResult = null;
  // Stop notification scheduler
  if (window.notificationIntervalId) {
    clearInterval(window.notificationIntervalId);
    window.notificationIntervalId = null;
  }
  saveState();
  // Reset UI to defaults
  document.documentElement.setAttribute('data-theme', 'dark');
  document.documentElement.style.setProperty('--accent', '#7c6ff7');
  render();
  showView(DEFAULT_VIEW, { pushHistory: false, persist: false });
}

// ══════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════
function todayStr() { return new Date().toISOString().split('T')[0]; }
function nowMins() { const n=new Date(); return n.getHours()*60+n.getMinutes(); }
function timeMins(t) { const [h,m]=t.split(':').map(Number); return h*60+m; }
function dateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function fmt12(t) {
  const [h,m]=t.split(':').map(Number);
  const ampm=h>=12?'PM':'AM';
  return `${h%12||12}:${String(m).padStart(2,'0')} ${ampm}`;
}
function addMinutesToTime(time, minutes) {
  const total = (timeMins(time) + minutes) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
function getWeekBounds(baseDate = new Date()) {
  const start = new Date(baseDate);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end, startStr: dateStr(start), endStr: dateStr(end) };
}

// XSS prevention — escape all user-supplied strings before injecting into innerHTML
const _ESC = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => _ESC[c]); }
function daysBetween(a, b) {
  const start = new Date(a + 'T12:00:00');
  const end = new Date(b + 'T12:00:00');
  return Math.floor((end - start) / 86400000);
}

function hexToRgba(hex, alpha) {
  const raw = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return `rgba(144,144,168,${alpha})`;
  const n = parseInt(raw, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function getEventColor(ev) {
  return ev.color || (CAT_COLORS[ev.category]?.dot) || CAT_COLORS.other.dot;
}

function getEventBg(ev) {
  return hexToRgba(getEventColor(ev), 0.13);
}

let calendarCache = {};

function getEventsForDay(targetDateStr, targetDayOfWeek) {
  const cacheKey = `${targetDateStr}-${targetDayOfWeek}`;
  if (calendarCache[cacheKey]) return calendarCache[cacheKey];

  const seen = new Set();
  const events = state.events.filter(ev => {
    if (ev.recurringEndDate && targetDateStr > ev.recurringEndDate) return false;
    if (targetDateStr < ev.date) return false;
    let matches = false;
    const rec = ev.recurring || 'none';
    if (rec === 'none') {
      matches = ev.date === targetDateStr;
    } else if (rec === 'daily') {
      matches = true;
    } else if (rec === 'weekly') {
      const evDay = new Date(ev.date + 'T12:00:00').getDay();
      matches = evDay === targetDayOfWeek;
    } else if (rec === 'weekends') {
      matches = targetDayOfWeek === 0 || targetDayOfWeek === 6;
    } else if (rec === 'biweekly') {
      const evDay = new Date(ev.date + 'T12:00:00').getDay();
      const weeks = Math.floor(daysBetween(ev.date, targetDateStr) / 7);
      matches = evDay === targetDayOfWeek && weeks >= 0 && weeks % 2 === 0;
    } else if (rec === 'monthly') {
      matches = new Date(ev.date + 'T12:00:00').getDate() === new Date(targetDateStr + 'T12:00:00').getDate();
    } else {
      matches = ev.date === targetDateStr;
    }
    if (!matches) return false;
    // Use ID as dedup key — title-based key silently drops events with same name/time
    if (seen.has(ev.id)) return false;
    seen.add(ev.id);
    return true;
  }).sort((a,b) => timeMins(a.start)-timeMins(b.start));
  
  calendarCache[cacheKey] = events;
  return events;
}

function getTodayEvents() {
  return getEventsForDay(todayStr(), new Date().getDay());
}

function getUpcomingEvent() {
  const now = nowMins();
  const todayEvs = getTodayEvents();
  return todayEvs.find(ev => timeMins(ev.end) > now) || null;
}

function locationLink(loc) {
  if (!loc || !loc.trim()) return '';
  const q = encodeURIComponent(loc);
  return `<a href="https://maps.google.com/?q=${q}" target="_blank" rel="noopener" class="location-link" onclick="event.stopPropagation()">📍 ${esc(loc)}</a>`;
}

function getAllEvents() {
  return [...state.events].sort((a,b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return timeMins(a.start)-timeMins(b.start);
  });
}

// ══════════════════════════════════════════════
//  RENDER
// ══════════════════════════════════════════════

// Safe wrapper — a broken render function never crashes the whole app
function safeRender(fn, label) {
  try { fn(); } catch(e) { console.error('[render] ' + label + ':', e); }
}

function isViewVisible(id) {
  const el = document.getElementById('view-' + id);
  return el && !el.classList.contains('hidden');
}

function render() {
  // Dashboard widgets — always kept fresh (they're visible on load)
  safeRender(renderUpcoming,       'upcoming');
  safeRender(renderWorkloadWidget, 'workload');
  safeRender(renderTimeline,       'timeline');
  safeRender(renderTasks,          'tasks');
  safeRender(renderConflictBanner, 'conflictBanner');
  safeRender(renderGCalBanner,     'gcalBanner');
  safeRender(updateBadge,          'badge');

  // Only re-render views that are currently visible — avoids wasted work on hidden panels
  if (isViewVisible('schedule'))   safeRender(renderCalendar,           'calendar');
  if (isViewVisible('schedule') || isViewVisible('dashboard'))
                                   safeRender(renderAllEvents,          'allEvents');
  if (isViewVisible('tasks'))      safeRender(renderAllTasks,           'allTasks');
  if (isViewVisible('deadlines'))  safeRender(renderDeadlines,          'deadlines');
  if (isViewVisible('stats'))      safeRender(renderStats,              'stats');
}

function isValidView(view) {
  return views.includes(view);
}

function getOpenModalId() {
  const openModal = document.querySelector('.modal-overlay:not(.hidden)');
  return openModal ? openModal.id : null;
}

let lastActiveElement = null;

function openModal(id, pushHistory = true) {
  const modal = document.getElementById(id);
  if (!modal) return;
  
  // Store the currently focused element to restore focus later
  lastActiveElement = document.activeElement;
  
  modal.classList.remove('hidden');
  
  // Add accessibility attributes if not present
  if (!modal.getAttribute('role')) modal.setAttribute('role', 'dialog');
  if (!modal.getAttribute('aria-modal')) modal.setAttribute('aria-modal', 'true');
  
  // Find and focus first input or focusable element in the modal
  const focusableElements = modal.querySelectorAll('input, button, [tabindex]:not([tabindex="-1"])');
  if (focusableElements.length > 0) {
    focusableElements[0].focus();
  }
  
  if (pushHistory) history.pushState({ panel: 'modal', modal: id, view: state.currentView || DEFAULT_VIEW }, '', location.href);
}

function closeModal(id, useHistory = true) {
  const modal = document.getElementById(id);
  if (!modal) return;
  const wasOpen = !modal.classList.contains('hidden');
  modal.classList.add('hidden');
  
  // Restore focus to the previously active element
  if (lastActiveElement && typeof lastActiveElement.focus === 'function') {
    lastActiveElement.focus();
  }
  
  if (useHistory && wasOpen && history.state && history.state.panel === 'modal' && history.state.modal === id) history.back();
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(function(modal) {
    modal.classList.add('hidden');
  });
}

let timerInterval;
function renderUpcoming() {
  clearInterval(timerInterval);
  const wrap = document.getElementById('upcoming-card-wrap');
  const ev = getUpcomingEvent();
  if (!ev) {
    wrap.innerHTML = `<div class="upcoming-empty">
      <div class="upcoming-empty-icon">🎉</div>
      <div class="upcoming-empty-title">No more classes today</div>
      <div class="upcoming-empty-sub">You're free! Check tomorrow's schedule.</div>
    </div>`;
    return;
  }
  const cat = CAT_COLORS[ev.category] || CAT_COLORS.other;
  wrap.innerHTML = `<div class="upcoming-card">
    <div class="upcoming-label">NEXT UP</div>
    <div class="upcoming-name">${esc(ev.title)}</div>
    <div class="upcoming-meta">${fmt12(ev.start)} – ${fmt12(ev.end)}${locationLink(ev.location) ? ' · ' + locationLink(ev.location) : ''}</div>
    <div class="upcoming-timer" id="timer-display">--:--</div>
    <div class="upcoming-timer-label">until class starts</div>
    <div class="upcoming-actions">
      <button class="btn-ghost" onclick="deleteEvent('${esc(ev.id)}')">Remove</button>
      <button class="btn-ghost" onclick="editEvent('${esc(ev.id)}')">Edit</button>
    </div>
  </div>`;

  function tick() {
    const now = nowMins();
    const start = timeMins(ev.start);
    const diff = start - now;
    const disp = document.getElementById('timer-display');
    if (!disp) { clearInterval(timerInterval); return; }
    if (diff <= 0) {
      const inProgress = timeMins(ev.end) - now;
      disp.textContent = inProgress > 0 ? 'IN PROGRESS' : 'ENDED';
      disp.style.fontSize = '18px';
    } else {
      const h = Math.floor(diff/60), m = diff%60;
      disp.textContent = h > 0 ? `${h}h ${m}m` : `${m}m`;
    }
  }
  tick();
  timerInterval = setInterval(tick, 30000);
}

function calcWeeklyWorkload() {
  const week = getWeekBounds();
  let scheduledMinutes = 0;

  for (let d = new Date(week.start); d <= week.end; d.setDate(d.getDate() + 1)) {
    const events = getEventsForDay(dateStr(d), d.getDay());
    events.forEach(ev => {
      scheduledMinutes += Math.max(0, timeMins(ev.end) - timeMins(ev.start));
    });
  }

  const pendingTasks = state.tasks.filter(t => !isTaskComplete(t) && t.due >= week.startStr && t.due <= week.endStr);
  const pendingMinutes = pendingTasks.length * 90;
  const scheduledHours = scheduledMinutes / 60;
  const pendingHours = pendingMinutes / 60;
  const totalHours = scheduledHours + pendingHours;
  const limit = Number(state.weeklyHourLimit) || 50;

  return {
    scheduledHours,
    pendingHours,
    totalHours,
    pendingTasks: pendingTasks.length,
    limit,
    overloaded: totalHours > limit
  };
}

function renderWorkloadWidget() {
  const wrap = document.getElementById('workload-widget-wrap');
  if (!wrap) return;
  const workload = calcWeeklyWorkload();
  const pct = Math.min(100, Math.round((workload.totalHours / workload.limit) * 100));
  const scheduledPct = Math.min(pct, Math.round((workload.scheduledHours / workload.limit) * 100));
  const taskPct = Math.max(0, pct - scheduledPct);
  const color = workload.overloaded ? 'var(--coral)' : 'var(--green)';

  wrap.innerHTML = `<div class="workload-card${workload.overloaded ? ' overloaded' : ''}">
    <div class="workload-top">
      <div>
        <div class="workload-label">THIS WEEK</div>
        <div class="workload-title">${workload.totalHours.toFixed(1)}h / ${workload.limit}h committed</div>
      </div>
      <div class="workload-meta">${workload.scheduledHours.toFixed(1)}h scheduled · ${workload.pendingHours.toFixed(1)}h tasks</div>
    </div>
    <div class="workload-track" aria-label="Weekly workload ${pct}%">
      <div class="workload-fill scheduled" style="width:${scheduledPct}%;background:${color};"></div>
      <div class="workload-fill tasks" style="left:${scheduledPct}%;width:${taskPct}%;"></div>
    </div>
    <div class="workload-note">${workload.overloaded ? 'Heavy week: consider rescheduling low-priority tasks.' : `${workload.pendingTasks} pending task${workload.pendingTasks === 1 ? '' : 's'} due this week.`}</div>
  </div>`;
}

// Get left-border color based on priority or category
function getPriorityBorderColor(ev) {
  if (ev.priority && PRIORITY_COLORS[ev.priority]) {
    return PRIORITY_COLORS[ev.priority];
  }
  return getEventColor(ev);
}

function isTaskComplete(t) {
  const subtasks = t.subtasks || [];
  if (subtasks.length) return subtasks.every(st => st.done);
  return !!t.done;
}

function isTaskDoneForDate(t, date = todayStr()) {
  if ((t.recurring || 'none') !== 'none') return (t.doneDates || []).includes(date);
  return isTaskComplete(t);
}

function getTasksForDay(targetDateStr) {
  const day = new Date(targetDateStr + 'T12:00:00').getDay();
  return state.tasks.filter(t => {
    const rec = t.recurring || 'none';
    if (rec === 'none') return t.due <= targetDateStr && !isTaskComplete(t);
    if (targetDateStr < t.due) return false;
    if (rec === 'daily') return true;
    if (rec === 'weekly') return Number(t.recurringDay) === day;
    return false;
  });
}

function renderSubtaskProgress(t) {
  const subtasks = t.subtasks || [];
  if (!subtasks.length) return '';
  const done = subtasks.filter(st => st.done).length;
  return `<span class="subtask-progress">${done}/${subtasks.length}</span>`;
}

function renderSubtasks(t) {
  const subtasks = t.subtasks || [];
  if (!subtasks.length) return '';
  return `<div class="subtask-list">${subtasks.map(st => `
    <div class="subtask-item">
      <span class="subtask-check${st.done ? ' done' : ''}" onclick="event.stopPropagation();toggleSubtask('${esc(t.id)}','${esc(st.id)}')"></span>
      <span class="${st.done ? 'task-name done' : ''}">${esc(st.name)}</span>
    </div>`).join('')}</div>`;
}

function renderTimeline() {
  const el = document.getElementById('timeline');
  const evs = getTodayEvents();
  if (!evs.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">📅</div>No events today. Add one!</div>`;
    return;
  }
  const now = nowMins();
  el.innerHTML = evs.map(ev => {
    const cat = CAT_COLORS[ev.category] || CAT_COLORS.other;
    const evColor = getEventColor(ev);
    const past = timeMins(ev.end) < now;
    const active = timeMins(ev.start) <= now && timeMins(ev.end) > now;
    const borderColor = getPriorityBorderColor(ev);
    return `<div class="timeline-item priority-stripe" role="button" tabindex="0" aria-label="${esc(ev.title)}, ${fmt12(ev.start)} to ${fmt12(ev.end)}${ev.location ? ', Location: ' + ev.location : ''}${active ? ', currently in progress' : ''}${past ? ', completed' : ''}" onclick="editEvent('${esc(ev.id)}')" onkeydown="if(event.key==='Enter' || event.key===' ') { event.preventDefault(); editEvent('${esc(ev.id)}'); }" style="--priority-stripe-color:${borderColor};${past?'opacity:0.45':''}${active?';background:var(--surface2);border-color:var(--border2)':''}">
      <div class="timeline-time">${fmt12(ev.start)}</div>
      <div class="timeline-dot" style="background:${evColor}"></div>
      <div class="timeline-content">
        <div class="timeline-title">${esc(ev.title)}${active?' <span style="font-size:10px;color:var(--green);font-weight:600;margin-left:6px;">● LIVE</span>':''}</div>
        <div class="timeline-sub">${fmt12(ev.start)} – ${fmt12(ev.end)}${locationLink(ev.location) ? ' · ' + locationLink(ev.location) : ''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
        <span class="badge" style="background:${getEventBg(ev)};color:${evColor}">${cat.label}</span>
      </div>
    </div>`;
  }).join('');
}

function renderTasks() {
  const today = todayStr();

  const todayTasks = getTasksForDay(today).filter(t => !isTaskDoneForDate(t, today));
  const upcomingTasks = state.tasks.filter(t => (t.recurring || 'none') === 'none' && t.due > today && !isTaskComplete(t));

  const renderTask = (t) => `<div class="task-item">
    <div class="task-check${isTaskDoneForDate(t, today)?' done':''}" role="checkbox" tabindex="0" aria-checked="${isTaskDoneForDate(t, today)}" aria-label="Mark '${esc(t.name)}' as ${isTaskDoneForDate(t, today) ? 'incomplete' : 'complete'}" onclick="toggleTask('${esc(t.id)}', '${today}')" onkeydown="if(event.key==='Enter' || event.key===' ') { event.preventDefault(); toggleTask('${esc(t.id)}', '${today}'); }"></div>
    <div class="task-text">
      <div class="task-name${isTaskDoneForDate(t, today)?' done':''}">${esc(t.name)}${renderSubtaskProgress(t)}</div>
      <div class="task-due">${(t.recurring || 'none') !== 'none' ? `Repeats ${esc(t.recurring)}` : esc(t.due)}</div>
      ${renderSubtasks(t)}
    </div>
    <div class="priority-dot" style="background:${PRIORITY_COLORS[t.priority]||'#9090a8'}"></div>
  </div>`;

  const todayEl = document.getElementById('tasks-today');
  const upcomingEl = document.getElementById('tasks-upcoming');

  todayEl.innerHTML = todayTasks.length ? todayTasks.map(renderTask).join('') : '<div class="empty" style="padding:12px 0;font-size:12px;">All done! 🎉</div>';
  upcomingEl.innerHTML = upcomingTasks.length ? upcomingTasks.map(renderTask).join('') : '<div class="empty" style="padding:12px 0;font-size:12px;">Nothing upcoming</div>';
}

// ══════════════════════════════════════════════
//  CONFLICT DETECTION (PHASE 5)
// ══════════════════════════════════════════════
function detectConflicts(events) {
  const conflicts = [];
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const e1 = events[i];
      const e2 = events[j];
      const start1 = timeMins(e1.start);
      const end1 = timeMins(e1.end);
      const start2 = timeMins(e2.start);
      const end2 = timeMins(e2.end);
      if (start1 < end2 && start2 < end1) {
        conflicts.push({ a: e1, b: e2 });
      }
    }
  }
  return conflicts;
}

function renderConflictBanner() {
  const wrap = document.getElementById('conflict-banner-wrap');
  if (!wrap) return;
  const todayEvents = getTodayEvents();
  const conflicts = detectConflicts(todayEvents);
  if (!conflicts.length) {
    wrap.innerHTML = '';
    return;
  }
  
  let html = '';
  conflicts.forEach(c => {
    html += `<div class="action-card" style="border-left: 3px solid var(--coral); margin-bottom: 8px;">
      <div style="display:flex; justify-content: space-between; align-items:flex-start;">
        <div>
          <div style="font-size:12px; font-weight:700; color:var(--coral); text-transform:uppercase; margin-bottom:4px;">⚠️ Schedule Conflict</div>
          <div style="font-size:13px; color:var(--text2); margin-bottom:8px;">
            <b>${esc(c.a.title)}</b> (${fmt12(c.a.start)} - ${fmt12(c.a.end)}) overlaps with <b>${esc(c.b.title)}</b> (${fmt12(c.b.start)} - ${fmt12(c.b.end)}).
          </div>
        </div>
      </div>
      <div id="conflict-actions-${c.a.id}-${c.b.id}">
        <button class="btn-add" style="padding: 4px 10px; font-size: 11px;" onclick="resolveConflictWithAI('${c.a.id}', '${c.b.id}')">💡 Fix with AI</button>
      </div>
    </div>`;
  });
  wrap.innerHTML = html;
}

function renderGCalBanner() {
  const wrap = document.getElementById('gcal-banner-wrap');
  if (!wrap) return;
  if (typeof gCalAccessToken !== 'undefined' && gCalAccessToken) {
    wrap.innerHTML = '';
    return;
  }
  wrap.innerHTML = `
    <div class="conflict-banner" style="background:var(--surface2);border-color:var(--accent);display:flex;align-items:center;justify-content:space-between;gap:12px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="font-size:20px;">📅</div>
        <div>
          <div style="font-weight:600;font-size:14px;color:var(--text);">Google Calendar Sync</div>
          <div style="font-size:12px;color:var(--text2);">Import your classes and events directly from Google.</div>
        </div>
      </div>
      <button class="btn-save" onclick="showView('settings'); setTimeout(() => document.getElementById('gcal-connect-btn').scrollIntoView({behavior:'smooth'}), 300)" style="background:var(--accent);padding:8px 16px;font-size:12px;">Connect Now</button>
    </div>
  `;
}

async function resolveConflictWithAI(idA, idB) {
  const actionsWrap = document.getElementById(`conflict-actions-${idA}-${idB}`);
  if (!actionsWrap) return;
  
  if (!state.apiKey) {
    showToast("Please set your Gemini API key in Settings to use this feature.");
    return;
  }

  const evA = state.events.find(e => e.id === idA);
  const evB = state.events.find(e => e.id === idB);
  if (!evA || !evB) return;

  const todayEvs = getTodayEvents();
  
  actionsWrap.innerHTML = `<div style="font-size:12px; color:var(--text3);"><span class="typing-dot" style="display:inline-block"></span><span class="typing-dot" style="display:inline-block"></span><span class="typing-dot" style="display:inline-block"></span> Analyzing schedule...</div>`;

  const prompt = `These two events conflict today:
Event A: "${evA.title}" from ${evA.start} to ${evA.end} (ID: ${evA.id})
Event B: "${evB.title}" from ${evB.start} to ${evB.end} (ID: ${evB.id})

Here is the user's schedule for today:
${todayEvs.map(e => `- ${e.title}: ${e.start} to ${e.end}`).join('\n')}

Suggest exactly 2 ways to resolve this conflict. For each suggestion, pick one event to move to a new free time slot TODAY.
Return ONLY raw JSON in this exact format, with no markdown formatting:
[
  { "suggestion": "Move [Event] to [Time]", "moveEventId": "[id]", "newStart": "HH:MM", "newEnd": "HH:MM" },
  { "suggestion": "Move [Event] to [Time]", "moveEventId": "[id]", "newStart": "HH:MM", "newEnd": "HH:MM" }
]`;

  try {
    const res = await geminiFetch({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 300, temperature: 0.2 }
    });
    const responseText = await res.text();
    const data = JSON.parse(responseText);
    if (!res.ok) throw new Error(data.error?.message || 'API error');
    
    let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    raw = raw.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
    const suggestions = JSON.parse(raw);
    
    let buttonsHtml = '<div style="display:flex; gap:8px; flex-wrap:wrap;">';
    suggestions.forEach(s => {
      buttonsHtml += `<button class="btn-ghost" style="padding: 6px 12px; font-size:12px; border:1px solid var(--border);" data-id="${esc(s.moveEventId)}" data-start="${esc(s.newStart)}" data-end="${esc(s.newEnd)}" onclick="applyConflictResolution(this.dataset.id, this.dataset.start, this.dataset.end)">${esc(s.suggestion)}</button>`;
    });
    buttonsHtml += '</div>';
    actionsWrap.innerHTML = buttonsHtml;
    
  } catch (e) {
    console.error('Conflict resolution error:', e);
    actionsWrap.innerHTML = `<span style="color:var(--coral); font-size:12px;">Failed to get AI suggestions.</span>`;
  }
}

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

function renderAllEvents() {
  const el = document.getElementById('all-events-list');
  if (!el) return;
  const evs = getAllEvents();
  el.innerHTML = evs.map(ev => {
    const cat = CAT_COLORS[ev.category] || CAT_COLORS.other;
    const evColor = getEventColor(ev);
    return `<div class="timeline-item" role="button" tabindex="0" aria-label="${esc(ev.title)}, ${esc(ev.date)}, ${fmt12(ev.start)} to ${fmt12(ev.end)}${ev.location ? ', Location: ' + ev.location : ''}" onclick="editEvent('${esc(ev.id)}')" onkeydown="if(event.key==='Enter' || event.key===' ') { event.preventDefault(); editEvent('${esc(ev.id)}'); }">
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
  }).join('') || '<div class="empty"><div class="empty-icon">📅</div>No events yet.</div>';
}

function renderAllTasks() {
  const el = document.getElementById('all-tasks-list');
  if (!el) return;
  const tasks = [...state.tasks].sort((a,b)=>{
    if(isTaskComplete(a)!==isTaskComplete(b)) return isTaskComplete(a)?1:-1;
    return a.due.localeCompare(b.due);
  });
  const today = todayStr();
  el.innerHTML = tasks.map(t => `<div class="task-item" style="border-bottom:1px solid var(--border);padding:10px 0;">
    <div class="task-check${isTaskDoneForDate(t, today)?' done':''}" role="checkbox" tabindex="0" aria-checked="${isTaskComplete(t)}" aria-label="Mark '${esc(t.name)}' as ${isTaskComplete(t) ? 'incomplete' : 'complete'}" onclick="toggleTask('${esc(t.id)}', '${today}')" onkeydown="if(event.key==='Enter' || event.key===' ') { event.preventDefault(); toggleTask('${esc(t.id)}', '${today}'); }"></div>
    <div class="task-text">
      <div class="task-name${isTaskComplete(t)?' done':''}">${esc(t.name)}${renderSubtaskProgress(t)}</div>
      ${renderSubtasks(t)}
      <div class="task-due">Due: ${esc(t.due)} • ${esc(t.priority)} priority</div>
    </div>
    <div class="priority-dot" style="background:${PRIORITY_COLORS[t.priority]||'#9090a8'}"></div>
    <span onclick="deleteTask('${esc(t.id)}')" style="font-size:14px;color:var(--text3);cursor:pointer;margin-left:8px;padding:4px;" role="button" tabindex="0" aria-label="Delete task '${esc(t.name)}'" onkeydown="if(event.key==='Enter' || event.key===' ') { event.preventDefault(); deleteTask('${esc(t.id)}'); }">🗑️</span>
  </div>`).join('') || '<div class="empty"><div class="empty-icon">✅</div>No tasks yet.</div>';
}

function updateBadge() {
  const today = todayStr();
  const count = getTasksForDay(today).filter(t => !isTaskDoneForDate(t, today)).length;
  const badge = document.getElementById('task-badge');
  if (badge) badge.textContent = count || '';
  if (badge) badge.style.display = count ? '' : 'none';
}

// ══════════════════════════════════════════════
//  VIEWS
// ══════════════════════════════════════════════
function setScheduleMode(mode) {
  document.getElementById('schedule-week').classList.toggle('hidden', mode !== 'week');
  document.getElementById('schedule-list').classList.toggle('hidden', mode !== 'list');
  document.getElementById('btn-view-week').classList.toggle('active', mode === 'week');
  document.getElementById('btn-view-list').classList.toggle('active', mode === 'list');
  if (mode === 'week') renderCalendar();
}

function toggleFreeTime() {
  state.showFreeTime = !state.showFreeTime;
  saveState();
  renderCalendar();
}

function renderCalendar() {
  const headerEl = document.getElementById('cal-header');
  if (!headerEl) return;
  const freeBtn = document.getElementById('btn-toggle-free-time');
  if (freeBtn) {
    freeBtn.classList.toggle('active', !!state.showFreeTime);
    freeBtn.textContent = state.showFreeTime ? 'Hide Free Time' : 'Show Free Time';
  }
  const now = new Date();
  const todayDay = now.getDay();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - todayDay);

  const timesEl = document.getElementById('cal-times');
  const daysEl = document.getElementById('cal-days');

  // Render Header
  let headerHtml = `<div class="cal-header-day"></div>`;
  for(let i=0; i<7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    const isToday = i === todayDay && d.getMonth() === now.getMonth();
    headerHtml += `<div class="cal-header-day${isToday?' active':''}">${DAYS[i]}<br>${d.getDate()}</div>`;
  }
  headerEl.innerHTML = headerHtml;

  // Render Times
  let timesHtml = '';
  for(let i=0; i<24; i++) {
    timesHtml += `<div class="cal-time">${i===0?'12 AM':(i<12?i+' AM':(i===12?'12 PM':(i-12)+' PM'))}</div>`;
  }
  timesEl.innerHTML = timesHtml;

  // Render Days Columns
  let daysHtml = '';
  for(let i=0; i<7; i++) {
    const targetDate = new Date(startOfWeek);
    targetDate.setDate(startOfWeek.getDate() + i);
    const targetDateStr = targetDate.toISOString().split('T')[0];
    const evs = getEventsForDay(targetDateStr, i);

    let evHtml = '';
    evs.forEach(ev => {
       const startMin = timeMins(ev.start);
       const endMin = timeMins(ev.end);
       const dur = endMin - startMin;
       const top = startMin; // 1 min = 1px (since 60px per hour)
       const height = dur;
       const borderColor = getPriorityBorderColor(ev);
       evHtml += `<div class="cal-event priority-stripe" role="button" tabindex="0" aria-label="${esc(ev.title)}, ${fmt12(ev.start)} to ${fmt12(ev.end)}${ev.location ? ', Location: ' + ev.location : ''}" onclick="editEvent('${esc(ev.id)}')" onkeydown="if(event.key==='Enter' || event.key===' ') { event.preventDefault(); editEvent('${esc(ev.id)}'); }" style="--priority-stripe-color:${borderColor};top:${top}px; height:${height}px; background:var(--surface2); border:1px solid var(--border); color:var(--text);">
         <div class="cal-event-title">${esc(ev.title)}</div>
         <div style="font-size:8px; opacity:0.8;">${fmt12(ev.start)}</div>
         ${ev.location ? `<div style="font-size:8px; opacity:0.75;">${locationLink(ev.location)}</div>` : ''}
       </div>`;
    });

    let freeHtml = '';
    if (state.showFreeTime) {
      const sorted = [...evs].sort((a,b) => timeMins(a.start) - timeMins(b.start));
      let cursor = 8 * 60;
      const dayEnd = 23 * 60;
      sorted.forEach(ev => {
        const startMin = Math.max(8 * 60, timeMins(ev.start));
        const endMin = Math.min(dayEnd, timeMins(ev.end));
        if (startMin - cursor >= 30) {
          const gap = startMin - cursor;
          freeHtml += `<div class="cal-free-block" style="top:${cursor}px;height:${gap}px;">${gap >= 60 ? '<span>free</span>' : ''}</div>`;
        }
        cursor = Math.max(cursor, endMin);
      });
      if (dayEnd - cursor >= 30) {
        const gap = dayEnd - cursor;
        freeHtml += `<div class="cal-free-block" style="top:${cursor}px;height:${gap}px;">${gap >= 60 ? '<span>free</span>' : ''}</div>`;
      }
    }

    let gridLines = `<div class="cal-grid-lines">`;
    for(let h=0; h<24; h++) gridLines += `<div class="cal-grid-line"></div>`;
    gridLines += `</div>`;

    daysHtml += `<div class="cal-day-col">${gridLines}${freeHtml}${evHtml}</div>`;
  }
  daysEl.innerHTML = daysHtml;

  // Auto-scroll to current time (use requestAnimationFrame so layout is ready)
  requestAnimationFrame(() => {
    const wrap = document.querySelector('.cal-grid-wrap');
    if (wrap) {
      wrap.scrollTop = Math.max(0, (now.getHours() * 60) - 60);
    }
  });
}
const views = ['dashboard','schedule','tasks','deadlines','focus','settings','stats','shared','gym'];
function showView(v, options) {
  const opts = options || {};
  if (!isValidView(v)) v = DEFAULT_VIEW;

  // Close drawer if it was open (drawer items: settings)
  closeMobileDrawer(false);
  closeChatOverlay(false);
  state.currentView = v;
  if (opts.persist !== false) saveState();
  
  // Set view visibility
  views.forEach(id => {
    const el = document.getElementById('view-'+id);
    if (el) el.classList.toggle('hidden', id!==v);
    const nav = document.getElementById('nav-'+id);
    if(nav) nav.classList.toggle('active', id===v);
    const mnav = document.getElementById('mnav-'+id);
    if(mnav) mnav.classList.toggle('active', id===v);
  });
  
  // Highlight "More" tab if viewing overflow items (only settings remains)
  const overflowViews = ['settings'];
  const mnavMore = document.getElementById('mnav-more');
  if(mnavMore) {
    mnavMore.classList.toggle('active', overflowViews.includes(v));
  }
  
  const titles = { dashboard:'Dashboard', schedule:'Schedule', tasks:'Tasks', deadlines:'Deadlines', focus:'Focus', settings:'Settings', stats:'Statistics', gym:'Gym Plan 💪' };
  document.getElementById('mobile-title').textContent = titles[v] || v;
  if(v==='settings') {
    const keyEl = document.getElementById('settings-api-key');
    if(keyEl) keyEl.value = state.apiKey||'';
    const themeEl = document.getElementById('settings-theme');
    if(themeEl) themeEl.value = state.theme || 'dark';
    const accentEl = document.getElementById('settings-accent');
    if(accentEl) accentEl.value = state.accent || '#7c6ff7';
    const weeklyLimitEl = document.getElementById('settings-weekly-limit');
    if(weeklyLimitEl) weeklyLimitEl.value = state.weeklyHourLimit || 50;
    updateNotifStatusUI();
    updateGCalUI();
    updateWAUI();
    updateAppVersionUI();
    if (typeof updateSupabaseUI === 'function') updateSupabaseUI();
  }
  if(v==='schedule') { requestAnimationFrame(() => { renderCalendar(); }); }
  if(v==='deadlines') renderDeadlines();
  if(v==='stats') renderStats();
  if(v==='gym') renderGymView();

  if (opts.pushHistory !== false) {
    const hash = v === DEFAULT_VIEW ? '' : '#' + v;
    history.pushState({ view: v }, '', hash || location.pathname + location.search);
  }
}

// ══════════════════════════════════════════════
//  MOBILE DRAWER (MORE MENU)
// ══════════════════════════════════════════════
function toggleMobileDrawer() {
  const drawer = document.getElementById('mobile-drawer');
  const overlay = document.getElementById('mobile-drawer-overlay');
  if(!drawer || !overlay) return;
  
  const isOpen = drawer.classList.contains('open');
  if (isOpen) closeMobileDrawer();
  else openMobileDrawer();
}

function openMobileDrawer(pushHistory = true) {
  const drawer = document.getElementById('mobile-drawer');
  const overlay = document.getElementById('mobile-drawer-overlay');
  if(!drawer || !overlay) return;
  drawer.classList.add('open');
  overlay.classList.add('open');
  if (pushHistory) history.pushState({ panel: 'drawer', view: state.currentView || DEFAULT_VIEW }, '', location.href);
}

function closeMobileDrawer(useHistory = true) {
  const drawer = document.getElementById('mobile-drawer');
  const overlay = document.getElementById('mobile-drawer-overlay');
  if(!drawer || !overlay) return;

  const wasOpen = drawer.classList.contains('open');
  drawer.classList.remove('open');
  overlay.classList.remove('open');
  if (useHistory && wasOpen && history.state && history.state.panel === 'drawer') history.back();
}

// ══════════════════════════════════════════════
//  STATS VIEW
// ══════════════════════════════════════════════
function renderStats() {
  const el = document.getElementById('stats-dashboard');
  if (!el) return;

  const now = new Date();
  const week = getWeekBounds(now);
  let totalMins = 0;
  const catMins = { class:0, study:0, meeting:0, personal:0, other:0 };
  
  // Weekly Schedule Hours
  for (let d = new Date(week.start); d <= week.end; d.setDate(d.getDate() + 1)) {
    const events = getEventsForDay(dateStr(d), d.getDay());
    events.forEach(ev => {
      const mins = Math.max(0, timeMins(ev.end) - timeMins(ev.start));
      totalMins += mins;
      const cat = CAT_COLORS[ev.category] ? ev.category : 'other';
      catMins[cat] += mins;
    });
  }

  // Task Completion Rate (This Month)
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const firstStr = dateStr(firstDay);
  const lastStr = dateStr(lastDay);
  
  const monthTasks = state.tasks.filter(t => t.due >= firstStr && t.due <= lastStr && (t.recurring || 'none') === 'none');
  const completedTasks = monthTasks.filter(t => isTaskComplete(t));
  const taskPct = monthTasks.length ? Math.round((completedTasks.length / monthTasks.length) * 100) : 0;

  // Busiest Days (across all recurring events)
  const dayCounts = [0,0,0,0,0,0,0]; // Sun-Sat
  state.events.forEach(ev => {
    const rec = ev.recurring || 'none';
    if (rec === 'weekly') {
      const d = new Date(ev.date + 'T12:00:00').getDay();
      dayCounts[d]++;
    } else if (rec === 'weekends') {
      dayCounts[0]++; dayCounts[6]++;
    } else if (rec === 'daily') {
      for(let i=0;i<7;i++) dayCounts[i]++;
    } else if (rec === 'none') {
      const d = new Date(ev.date + 'T12:00:00').getDay();
      dayCounts[d]++;
    }
  });
  const maxDay = Math.max(...dayCounts, 1);

  // Category Breakdown (Total time across all events)
  let allTime = 0;
  const allCatMins = { class:0, study:0, meeting:0, personal:0, other:0 };
  state.events.forEach(ev => {
    const mins = Math.max(0, timeMins(ev.end) - timeMins(ev.start));
    let multiplier = 1;
    const rec = ev.recurring || 'none';
    if (rec === 'weekly') multiplier = 4;
    else if (rec === 'daily') multiplier = 30;
    else if (rec === 'weekends') multiplier = 8;
    allTime += (mins * multiplier);
    const cat = CAT_COLORS[ev.category] ? ev.category : 'other';
    allCatMins[cat] += (mins * multiplier);
  });

  const allCatPct = {};
  for(let c in allCatMins) {
    allCatPct[c] = allTime ? (allCatMins[c] / allTime) * 100 : 0;
  }

  let html = '';

  // 1. Schedule Hours
  html += `<div class="stat-card">
    <div class="stat-title">Weekly Schedule</div>
    <div class="stat-value">${(totalMins/60).toFixed(1)} <span style="font-size:14px;color:var(--text3);font-weight:400;">hours this week</span></div>
    <div class="stat-bar-track">
      <div class="stat-bar-segment" style="width:${totalMins ? (catMins.class/totalMins)*100 : 0}%;background:${CAT_COLORS.class.dot}"></div>
      <div class="stat-bar-segment" style="width:${totalMins ? (catMins.study/totalMins)*100 : 0}%;background:${CAT_COLORS.study.dot}"></div>
      <div class="stat-bar-segment" style="width:${totalMins ? (catMins.meeting/totalMins)*100 : 0}%;background:${CAT_COLORS.meeting.dot}"></div>
      <div class="stat-bar-segment" style="width:${totalMins ? (catMins.personal/totalMins)*100 : 0}%;background:${CAT_COLORS.personal.dot}"></div>
      <div class="stat-bar-segment" style="width:${totalMins ? (catMins.other/totalMins)*100 : 0}%;background:${CAT_COLORS.other.dot}"></div>
    </div>
    <div class="stat-legend">
      ${['class','study','meeting','personal'].map(c => `
      <div class="stat-legend-item"><div class="stat-legend-dot" style="background:${CAT_COLORS[c].dot}"></div>${CAT_COLORS[c].label}</div>
      `).join('')}
    </div>
  </div>`;

  // 2. Task Completion
  html += `<div class="stat-card stat-flex">
    <div class="stat-ring" style="--pct:${taskPct}">
      <svg viewBox="0 0 36 36"><path class="ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" /><path class="ring-fill" stroke-dasharray="${taskPct}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" /><text x="18" y="20.5" class="ring-text">${taskPct}%</text></svg>
    </div>
    <div>
      <div class="stat-title">Task Completion</div>
      <div style="font-size:13px;color:var(--text3);margin-top:4px;">You've completed <b>${completedTasks.length}</b> of <b>${monthTasks.length}</b> tasks this month.</div>
    </div>
  </div>`;

  // 3. Busiest Days
  html += `<div class="stat-card">
    <div class="stat-title">Busiest Days</div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:12px;">Based on recurring schedule</div>
    <div class="stat-bars">
      ${DAYS.map((d, i) => `
        <div class="stat-bar-col">
          <div class="stat-bar-vertical-wrap"><div class="stat-bar-vertical" style="height:${(dayCounts[i]/maxDay)*100}%"></div></div>
          <div class="stat-bar-label">${d[0]}</div>
        </div>
      `).join('')}
    </div>
  </div>`;

  // 4. Category Breakdown
  html += `<div class="stat-card stat-flex">
    <div class="stat-donut" style="background:conic-gradient(
      ${CAT_COLORS.class.dot} 0% ${allCatPct.class}%,
      ${CAT_COLORS.study.dot} ${allCatPct.class}% ${allCatPct.class+allCatPct.study}%,
      ${CAT_COLORS.meeting.dot} ${allCatPct.class+allCatPct.study}% ${allCatPct.class+allCatPct.study+allCatPct.meeting}%,
      ${CAT_COLORS.personal.dot} ${allCatPct.class+allCatPct.study+allCatPct.meeting}% ${allCatPct.class+allCatPct.study+allCatPct.meeting+allCatPct.personal}%,
      ${CAT_COLORS.other.dot} ${allCatPct.class+allCatPct.study+allCatPct.meeting+allCatPct.personal}% 100%
    )"></div>
    <div>
      <div class="stat-title" style="margin-bottom:8px;">Category Breakdown</div>
      <div class="stat-legend stat-legend-col">
        ${['class','study','meeting','personal'].map(c => `
        <div class="stat-legend-item"><div class="stat-legend-dot" style="background:${CAT_COLORS[c].dot}"></div>${CAT_COLORS[c].label} (${Math.round(allCatPct[c])}%)</div>
        `).join('')}
      </div>
    </div>
  </div>`;

  el.innerHTML = html;
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
  if (t) { 
    if ((t.recurring || 'none') !== 'none') {
      t.doneDates = t.doneDates || [];
      if (t.doneDates.includes(date)) t.doneDates = t.doneDates.filter(d => d !== date);
      else t.doneDates.push(date);
    } else {
      t.done = !t.done;
      if ((t.subtasks || []).length && t.done) t.subtasks.forEach(st => st.done = true);
    }
    if (isTaskDoneForDate(t, date) && navigator.vibrate) navigator.vibrate(40);
    saveState(); render(); 
  }
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
async function geminiFetch(payload) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + encodeURIComponent(state.apiKey.trim());
  return await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}
let chatHistory = [];

function buildSystemPrompt() {
  const today = new Date();
  const todayEvs = getTodayEvents();
  const allEvs = getAllEvents().slice(0,30);
  const pendingTasks = state.tasks.filter(t=>!isTaskComplete(t));
  
  // Get workload summary
  const now = new Date();
  const week = getWeekBounds(now);
  let schedMins = 0;
  for (let d = new Date(week.start); d <= week.end; d.setDate(d.getDate() + 1)) {
    getEventsForDay(dateStr(d), d.getDay()).forEach(ev => {
      schedMins += Math.max(0, timeMins(ev.end) - timeMins(ev.start));
    });
  }
  const pendingMins = state.tasks.filter(t => !isTaskComplete(t) && t.due >= week.startStr && t.due <= week.endStr).length * 60;
  const totalWeeklyHours = (schedMins + pendingMins) / 60;
  const isOverloaded = totalWeeklyHours > state.weeklyHourLimit;

  return `You are Lazy Panda 🐼, an intelligent scheduling assistant powered by Gemini AI embedded in a productivity app.

CURRENT DATE & TIME: ${today.toDateString()}, ${today.toLocaleTimeString()}
TODAY IS: ${DAYS[today.getDay()]}

CURRENT WEEKLY WORKLOAD:
Total committed hours: ${totalWeeklyHours.toFixed(1)}h (Limit: ${state.weeklyHourLimit}h)
Status: ${isOverloaded ? 'OVERLOADED (warn the user)' : 'Healthy'}

TODAY'S SCHEDULE:
${todayEvs.length ? todayEvs.map(e=>`- ${e.title} | ${fmt12(e.start)}–${fmt12(e.end)} | ${e.location||'N/A'} | ${e.category}`).join('\n') : 'No events today'}

ALL UPCOMING EVENTS (next 30):
${allEvs.map(e=>`- ${e.title} | ${e.date} | ${fmt12(e.start)}–${fmt12(e.end)} | ${e.location||'N/A'} | ${e.recurring||'once'}`).join('\n')}

PENDING TASKS:
${pendingTasks.length ? pendingTasks.map(t=>`- ${t.name} | Due: ${t.due} | ${t.priority} priority`).join('\n') : 'No pending tasks'}

TIME RESOLUTION RULES (apply these before creating events):
- "morning" → 09:00–10:00
- "afternoon" → 14:00–15:00
- "evening" → 18:00–19:00
- "night" → 21:00–22:00
- "tomorrow" → ${new Date(today.getTime() + 86400000).toISOString().split('T')[0]}
- "next Monday/Tuesday/..." → compute the date of the next occurrence of that weekday
- "after [class name]" → look up that event's end time and use it as the start
- "before [class name]" → use 1 hour before that event's start
- If duration is not specified, default to 1 hour.
- Always confirm the resolved time in your response before executing the ACTION block.

YOUR CAPABILITIES:
You can help the user manage their schedule through conversation. When a user wants to add/edit/delete events or tasks, respond in a friendly way AND include a JSON action block at the END of your response in this exact format:

ACTION:{"type":"create_event","data":{"title":"...","date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM","category":"class|study|meeting|personal|other","location":"...","recurring":"none|daily|weekly|weekends|biweekly|monthly","recurringEndDate":"","color":""}}

ACTION:{"type":"create_task","data":{"name":"...","due":"YYYY-MM-DD","priority":"high|medium|low","recurring":"none|daily|weekly","subtasks":[]}}

ACTION:{"type":"delete_event","data":{"id":"..."}}

ACTION:{"type":"delete_task","data":{"id":"..."}}

Only include the ACTION block when actually performing an operation. If info is missing, ask clarifying questions before executing.

PROACTIVE BEHAVIOR RULES:
- After any event or task is created, proactively suggest one follow-up action (e.g., 'Want me to add a study session the day before?').
- If the student mentions being stressed or overwhelmed, acknowledge it briefly before giving practical advice or suggesting to reschedule lower-priority items.
- Always be conversational, helpful, and proactive about suggesting study sessions or reminders.`;
}

// addMsg — renders a chat bubble.
// text: string to display. By default it is HTML-escaped (safe for user input).
// isAction: short summary string shown in the action card below the bubble.
// rawHtml: pass true ONLY for hard-coded system/error messages that contain
//          intentional HTML tags — never use for user-supplied or AI content.
function addMsg(role, text, isAction, rawHtml) {
  const msgsEl = document.getElementById('chat-messages');
  const timeStr = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  const bubbleContent = rawHtml ? text : esc(text).replace(/\n/g,'<br>');
  div.innerHTML = `<div class="msg-bubble">${bubbleContent}</div><div class="msg-time">${timeStr}</div>`;
  if (isAction) {
    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `<div class="action-card-title">✦ Action Performed</div>${esc(isAction)}`;
    div.appendChild(card);
  }
  msgsEl.appendChild(div);
  msgsEl.scrollTop = msgsEl.scrollHeight;
}

function showTyping() {
  const msgsEl = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'msg ai'; div.id = 'typing-msg';
  div.innerHTML = `<div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`;
  msgsEl.appendChild(div);
  msgsEl.scrollTop = msgsEl.scrollHeight;
}

function removeTyping() {
  const el = document.getElementById('typing-msg');
  if (el) el.remove();
}

function parseAndExecuteActions(text) {
  const actionRegex = /ACTION:(\{.*?\})/gs;
  let match; let results = [];
  let cleanText = text;

  while ((match = actionRegex.exec(text)) !== null) {
    try {
      const action = JSON.parse(match[1]);
      cleanText = cleanText.replace(match[0], '').trim();
      let result = '';

      if (action.type === 'create_event') {
        const ev = { recurring:'none', recurringEndDate:'', color:'', ...action.data, id: 'e'+Date.now()+Math.random() };
        state.events.push(ev);
        result = `Event "${ev.title}" added on ${ev.date} at ${fmt12(ev.start)}`;
        saveState(); render();
      } else if (action.type === 'create_task') {
        const task = { subtasks: [], recurring: 'none', ...action.data, id: 't'+Date.now()+Math.random(), done: false, doneDates: [] };
        task.recurringDay = task.recurringDay ?? new Date((task.due || todayStr()) + 'T12:00:00').getDay();
        state.tasks.push(task);
        result = `Task "${task.name}" added (due ${task.due})`;
        saveState(); render();
      } else if (action.type === 'delete_event') {
        const ev = state.events.find(e=>e.id===action.data.id);
        if (ev) {
          state.events = state.events.filter(e=>e.id!==action.data.id);
          result = `Removed "${ev.title}"`;
          saveState(); render();
        }
      } else if (action.type === 'delete_task') {
        const task = state.tasks.find(t=>t.id===action.data.id);
        if (task) {
          state.tasks = state.tasks.filter(t=>t.id!==action.data.id);
          result = `Removed task "${task.name}"`;
          saveState(); render();
        }
      }
      if (result) results.push(result);
    } catch(e) { console.error('Action parse error:', e); }
  }
  return { cleanText, results };
}

// ══════════════════════════════════════════════
//  PHASE 4.2 — VOICE COMMANDS
// ══════════════════════════════════════════════
let voiceRecognition = null;
let isListening = false;

function startVoiceInput() {
  const voiceBtn = document.getElementById('voice-btn');
  if (!voiceBtn) return;

  // Check for Web Speech API support
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast('🎤 Voice input not supported in this browser. Use Chrome, Edge, or Safari.');
    return;
  }

  // If already listening, stop
  if (isListening) {
    if (voiceRecognition) voiceRecognition.stop();
    return;
  }

  // Create recognition instance if not already created
  if (!voiceRecognition) {
    voiceRecognition = new SpeechRecognition();
    voiceRecognition.lang = 'en-US';
    voiceRecognition.interimResults = false;
    voiceRecognition.maxAlternatives = 1;

    voiceRecognition.onstart = () => {
      isListening = true;
      voiceBtn.classList.add('active');
      voiceBtn.setAttribute('aria-label', 'Listening... click to stop');
      voiceBtn.textContent = '🔴';
    };

    voiceRecognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const isFinal = event.results[i].isFinal;
        transcript += event.results[i][0].transcript;
        if (isFinal) {
          // Insert transcript into chat input
          const input = document.getElementById('chat-input');
          if (input) {
            input.value = transcript.trim();
            // Auto-resize textarea
            input.style.height = '';
            input.style.height = Math.min(input.scrollHeight, 100) + 'px';
            // Auto-submit the message
            setTimeout(() => sendMessage(), 100);
          }
        }
      }
    };

    voiceRecognition.onerror = (event) => {
      const errorMessages = {
        'no-speech': '🎤 No speech detected. Please try again.',
        'audio-capture': '🎤 No microphone detected. Check your permissions.',
        'network': '🎤 Network error. Check your connection.',
        'denied': '🎤 Microphone access denied. Enable in your browser settings.'
      };
      const msg = errorMessages[event.error] || `🎤 Voice error: ${event.error}`;
      showToast(msg);
    };

    voiceRecognition.onend = () => {
      isListening = false;
      voiceBtn.classList.remove('active');
      voiceBtn.setAttribute('aria-label', 'Voice input: click to speak your message');
      voiceBtn.textContent = '🎤';
    };
  }

  // Start listening
  voiceRecognition.start();
}

// ══════════════════════════════════════════════
//  PHASE 5.1 — PROACTIVE AI RECOMMENDATIONS
// ══════════════════════════════════════════════
async function generateDailyRecommendations() {
  if (!state.apiKey) return;
  const today = todayStr();
  if (state.lastRecommendationDate === today && state.lastRecommendations) {
    renderRecommendations(state.lastRecommendations);
    return;
  }

  const prompt = `Given this student's schedule and tasks, return ONLY a JSON array of up to 3 recommendations.
Each object must have: { "icon": "emoji", "text": "short action-oriented text", "urgency": "high|medium|low" }
Focus on: overdue tasks, upcoming exams, or schedule gaps. Do not include markdown formatting. Return raw JSON array only.

CURRENT DATE: ${new Date().toDateString()}
EVENTS: ${JSON.stringify(getAllEvents().slice(0, 15))}
TASKS: ${JSON.stringify(state.tasks.filter(t=>!isTaskComplete(t)))}
`;

  try {
    const res = await geminiFetch({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 300, temperature: 0.7 }
    });
    const responseText = await res.text();
    const data = JSON.parse(responseText);
    if (!res.ok) throw new Error(data.error?.message || 'API error');
    
    let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    raw = raw.replace(/```json/g, '').replace(/```/g, '').trim();
    const recs = JSON.parse(raw);
    
    state.lastRecommendationDate = today;
    state.lastRecommendations = recs;
    saveState();
    renderRecommendations(recs);
  } catch(e) {
    console.error('Recommendation error:', e);
  }
}

function renderRecommendations(recs) {
  const wrap = document.getElementById('ai-recommendations-wrap');
  if (!wrap || !recs || !recs.length) return;
  
  const html = `
    <div class="stat-card" style="position:relative; padding:16px; margin-bottom:0;">
      <button onclick="dismissRecommendations()" style="position:absolute;top:10px;right:10px;background:none;border:none;color:var(--text3);cursor:pointer;" aria-label="Dismiss">✕</button>
      <div style="font-size:12px;font-weight:700;color:var(--accent);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px;">✨ AI Recommendations</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${recs.map(r => `
          <div style="display:flex;align-items:flex-start;gap:10px;">
            <div style="font-size:18px;">${r.icon}</div>
            <div style="font-size:13px;color:var(--text2);flex:1;">${esc(r.text)}</div>
            ${r.urgency==='high' ? `<div style="width:8px;height:8px;border-radius:50%;background:var(--coral);margin-top:4px;"></div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
  wrap.innerHTML = html;
}

function dismissRecommendations() {
  const wrap = document.getElementById('ai-recommendations-wrap');
  if (wrap) wrap.innerHTML = '';
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;

  input.value = ''; input.style.height = '';
  addMsg('user', msg);
  chatHistory.push({ role: 'user', parts: [{ text: msg }] });
  // Cap history at 40 entries (~20 turns) to prevent unbounded memory growth
  if (chatHistory.length > 40) chatHistory.splice(0, chatHistory.length - 40);

  document.getElementById('chat-send').disabled = true;
  document.getElementById('ai-chat-status').textContent = 'Thinking…';
  showTyping();
  // Hide chips while waiting; they'll be restored after the reply
  const chipsEl = document.getElementById('quick-chips');
  if (chipsEl) chipsEl.style.display = 'none';

  try {
    const contents = chatHistory.slice(-12).filter(m => m.role === 'user' || m.role === 'model');

    // Try Gemini first, fall back to offline AI if no key
    if (!state.apiKey) {
      removeTyping();
      const offlineReply = await tryOfflineAI(msg);
      if (offlineReply) {
        addMsg('ai', `🔒 <em style="font-size:11px;color:var(--text3);">Offline AI (Gemini Nano)</em><br><br>${esc(offlineReply).replace(/\n/g,'<br>')}`, null, true);
        chatHistory.push({ role: 'model', parts: [{ text: offlineReply }] });
      } else {
        addMsg('ai', '⚠️ No API key found. Go to <b>Settings</b> → paste your Gemini API key → tap Save Key.<br><br>Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style="color:#a78bfa;">aistudio.google.com/apikey</a>', null, true);
      }
      document.getElementById('chat-send').disabled = false;
      document.getElementById('ai-chat-status').textContent = 'Ready';
      if (chipsEl) chipsEl.style.display = '';
      return;
    }

    const res = await geminiFetch({
        system_instruction: { parts: [{ text: buildSystemPrompt() }] },
        contents: contents,
        generationConfig: { maxOutputTokens: 1200, temperature: 0.7 }
      });

    removeTyping();

    const responseText = await res.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch(parseErr) {
      console.error('Non-JSON response:', responseText.substring(0, 200));
      addMsg('ai', '⚠️ Invalid API key or network error. Please check your Gemini API key in Settings.');
      document.getElementById('chat-send').disabled = false;
      document.getElementById('ai-chat-status').textContent = 'Ready';
      if (chipsEl) chipsEl.style.display = '';
      return;
    }

    if (!res.ok) {
      const errMsg = data.error?.message || 'API error ' + res.status;
      addMsg('ai', '⚠️ ' + errMsg);
    } else {
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I got an empty response.';
      const { cleanText, results } = parseAndExecuteActions(raw);
      const actionSummary = results.join(', ');
      addMsg('ai', cleanText || raw, actionSummary || null);
      chatHistory.push({ role: 'model', parts: [{ text: raw }] });
    }
  } catch(e) {
    removeTyping();
    addMsg('ai', '⚠️ Connection error: ' + e.message + '. Check your Gemini API key in Settings.');
  }

  document.getElementById('chat-send').disabled = false;
  document.getElementById('ai-chat-status').textContent = 'Ready';
  // Restore quick chips so they stay accessible throughout the conversation
  if (chipsEl) chipsEl.style.display = '';
}

function sendQuick(msg) {
  document.getElementById('chat-input').value = msg;
  sendMessage();
}

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

function autoResize(el) {
  el.style.height = '';
  el.style.height = Math.min(el.scrollHeight, 100) + 'px';
}

// ══════════════════════════════════════════════
//  SETTINGS HELPERS
// ══════════════════════════════════════════════
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
    version: 2,
    exportedAt: new Date().toISOString(),
    events: state.events,
    tasks: state.tasks,
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
    'PRODID:-//Lazy Panda//AI Scheduler//EN',
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
    el.innerHTML = `<div class="empty"><div class="empty-icon">🎉</div>No pending deadlines!</div>`;
    return;
  }

  el.innerHTML = pending.map(t => {
    const { label, color } = t._diff;
    const pColor = PRIORITY_COLORS[t.priority] || '#9090a8';
    const barPct = Math.max(5, Math.min(100, 100 - (t._diff.urgency * 18)));
    return `<div class="deadline-card" role="article" aria-label="${esc(t.name)}, ${label}, ${esc(t.priority)} priority${t._repeat ? `, repeats ${esc(t.recurring)}` : ''}">
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
    icon: './icon.svg',
    badge: './icon.svg',
    tag: 'test'
  });
}

function startNotificationScheduler() {
  if (notifCheckInterval) clearInterval(notifCheckInterval);
  checkUpcomingNotifications();
  notifCheckInterval = setInterval(checkUpcomingNotifications, 60000);
}

const notifiedEvents = new Set();

function checkUpcomingNotifications() {
  const mins = state.notifMinutes || 10;
  const now = nowMins();
  const todayEvs = getTodayEvents();

  todayEvs.forEach(ev => {
    const start = timeMins(ev.start);
    const diff = start - now;
    if (diff <= 0 || diff > mins) return;

    // Browser push notification
    const notifKey = `${todayStr()}-${ev.id}`;
    if (Notification.permission === 'granted' && state.notificationsEnabled && !notifiedEvents.has(notifKey)) {
      notifiedEvents.add(notifKey);
      new Notification(`🐼 ${ev.title} in ${diff} min`, {
        body: `${fmt12(ev.start)} – ${fmt12(ev.end)}${ev.location ? ' · ' + ev.location : ''}`,
        icon: './icon.svg',
        tag: notifKey,
        requireInteraction: false
      });
    }

    // WhatsApp reminder (Bug E fix: merged here — no monkey-patch needed)
    const waKey = `wa-${todayStr()}-${ev.id}`;
    if (state.waPhone && state.waServer && !notifiedEvents.has(waKey)) {
      notifiedEvents.add(waKey);
      sendWhatsAppReminder(ev, diff);
    }
  });
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

function showToast(msg, duration = 3000) {
  let toast = document.getElementById('lp-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'lp-toast';
    toast.style.cssText = `position:fixed;bottom:calc(90px + var(--safe-bottom));left:50%;transform:translateX(-50%) translateY(20px);background:var(--surface3);color:var(--text);padding:10px 18px;border-radius:20px;font-size:13px;font-weight:500;z-index:200;opacity:0;transition:opacity .2s,transform .2s;pointer-events:none;border:1px solid var(--border2);white-space:nowrap;`;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(10px)';
  }, duration);
}

// ══════════════════════════════════════════════
//  PHASE 3 — CONFLICT DETECTION (Feature 10)
// ══════════════════════════════════════════════
function detectConflicts(dateStr, dayOfWeek) {
  const evs = getEventsForDay(dateStr, dayOfWeek);
  const conflicts = [];
  for (let i = 0; i < evs.length; i++) {
    for (let j = i + 1; j < evs.length; j++) {
      const a = evs[i], b = evs[j];
      const aStart = timeMins(a.start), aEnd = timeMins(a.end);
      const bStart = timeMins(b.start), bEnd = timeMins(b.end);
      if (aStart < bEnd && bStart < aEnd) {
        conflicts.push({ a, b });
      }
    }
  }
  return conflicts;
}

function detectAllConflicts() {
  const results = [];
  const now = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const ds = d.toISOString().split('T')[0];
    const found = detectConflicts(ds, d.getDay());
    found.forEach(c => results.push({ date: ds, ...c }));
  }
  return results;
}

function renderConflictBanner() {
  const conflicts = detectAllConflicts();
  const existing = document.getElementById('conflict-banner');
  if (existing) existing.remove();
  if (!conflicts.length) return;

  const banner = document.createElement('div');
  banner.id = 'conflict-banner';
  banner.className = 'conflict-banner';
  banner.innerHTML = `<div style="display:flex;align-items:flex-start;gap:10px;">
    <span style="font-size:18px;flex-shrink:0;">⚡</span>
    <div>
      <div style="font-weight:600;font-size:13px;margin-bottom:4px;">${conflicts.length} Schedule Conflict${conflicts.length > 1 ? 's' : ''} Detected</div>
      ${conflicts.map(c => `<div style="font-size:12px;color:var(--text2);margin-top:2px;">
        <b>${esc(c.date)}</b>: &ldquo;${esc(c.a.title)}&rdquo; (${fmt12(c.a.start)}–${fmt12(c.a.end)}) overlaps with &ldquo;${esc(c.b.title)}&rdquo; (${fmt12(c.b.start)}–${fmt12(c.b.end)})
      </div>`).join('')}
    </div>
    <span onclick="this.parentElement.parentElement.remove()" style="cursor:pointer;color:var(--text3);margin-left:auto;padding:2px 6px;font-size:14px;">✕</span>
  </div>`;
  const dashboard = document.getElementById('view-dashboard');
  if (dashboard) dashboard.insertAdjacentElement('afterbegin', banner);
}

// ══════════════════════════════════════════════
//  PHASE 3 — OFFLINE AI (Feature 15)
// ══════════════════════════════════════════════
async function tryOfflineAI(prompt) {
  // Chrome's experimental Prompt API (window.ai / window.LanguageModel)
  const api = window.ai?.languageModel || window.LanguageModel;
  if (!api) return null;
  try {
    const { available } = await api.capabilities();
    if (available === 'no') return null;
    const session = await api.create({
      systemPrompt: `You are Lazy Panda 🐼, a scheduling assistant. Answer briefly and helpfully. Today is ${new Date().toDateString()}.`
    });
    const result = await session.prompt(prompt);
    session.destroy();
    return result;
  } catch(e) {
    return null;
  }
}

// ══════════════════════════════════════════════
//  PHASE 4 — CHAT WITH NOTES (Feature 11)
// ══════════════════════════════════════════════
async function handleNotesUpload(event) {
  const files = Array.from(event.target.files);
  event.target.value = ''; // reset so same file can be re-uploaded
  for (const file of files) {
    const id = 'doc_' + Date.now() + Math.random();
    let text = '';
    if (file.type === 'application/pdf') {
      text = await extractPdfText(file);
    } else {
      text = await file.text();
    }
    uploadedDocs.push({ id, name: file.name, type: file.type, text: text.slice(0, 40000), size: file.size });
    addNotesChatMsg('ai', `✅ Loaded <b>${file.name}</b> (${(file.size/1024).toFixed(1)} KB). Ask me anything about it!`);
  }
  saveState();
  renderNotesDocs();
}

async function extractPdfText(file) {
  // Load pdf.js from CDN dynamically
  if (!window.pdfjsLib) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  try {
    const ab = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: ab }).promise;
    let fullText = '';
    for (let i = 1; i <= Math.min(pdf.numPages, 50); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(s => s.str).join(' ') + '\n';
    }
    return fullText;
  } catch(e) {
    return `[Could not extract text from PDF: ${e.message}]`;
  }
}

function removeDoc(id) {
  uploadedDocs = uploadedDocs.filter(d => d.id !== id);
  saveState();
  renderNotesDocs();
  showToast('Document removed');
}

function renderNotesDocs() {
  const el = document.getElementById('notes-docs-list');
  if (!el) return;
  // Combine uploaded docs + events with notes
  const eventNotes = state.events.filter(e => e.notes && e.notes.trim());
  if (!uploadedDocs.length && !eventNotes.length) {
    el.innerHTML = `<div style="font-size:12px;color:var(--text3);padding:8px 0;">No documents loaded. Upload a PDF or use your class notes below.</div>`;
    return;
  }
  el.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:6px;">
    ${uploadedDocs.map(d => `<div class="doc-chip">
      <span style="font-size:12px;">📄</span>
      <span>${d.name}</span>
      <span onclick="removeDoc('${d.id}')" style="cursor:pointer;opacity:0.6;margin-left:2px;">✕</span>
    </div>`).join('')}
    ${eventNotes.map(e => `<div class="doc-chip" style="border-color:var(--accent);color:var(--accent);">
      <span style="font-size:12px;">📝</span>
      <span>${e.title}</span>
    </div>`).join('')}
  </div>`;
}

function buildNotesContext(query) {
  const eventNotes = state.events
    .filter(e => e.notes && e.notes.trim())
    .map(e => `[Class Notes: ${e.title} (${e.date})]\n${e.notes}`)
    .join('\n\n');
  const uploadedContext = uploadedDocs
    .map(d => `[Document: ${d.name}]\n${d.text}`)
    .join('\n\n');
  const combined = [eventNotes, uploadedContext].filter(Boolean).join('\n\n');
  // Trim to ~12000 chars to stay within token limits
  return combined.slice(0, 12000);
}

function addNotesChatMsg(role, html) {
  const el = document.getElementById('notes-chat-messages');
  if (!el) return;
  const timeStr = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.innerHTML = `<div class="msg-bubble">${html}</div><div class="msg-time">${timeStr}</div>`;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

async function sendNotesChat() {
  const input = document.getElementById('notes-chat-input');
  const query = input.value.trim();
  if (!query) return;
  input.value = ''; input.style.height = '';

  const context = buildNotesContext(query);
  if (!context) {
    addNotesChatMsg('ai', '⚠️ No notes or documents found. Upload a PDF or add notes to your class events first.');
    return;
  }
  if (!state.apiKey) {
    addNotesChatMsg('ai', '⚠️ Add your Gemini API key in Settings to use this feature.');
    return;
  }
  addNotesChatMsg('user', esc(query));

  // Show typing
  const msgsEl = document.getElementById('notes-chat-messages');
  const typingDiv = document.createElement('div');
  typingDiv.className = 'msg ai'; typingDiv.id = 'notes-typing';
  typingDiv.innerHTML = `<div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`;
  msgsEl.appendChild(typingDiv);
  msgsEl.scrollTop = msgsEl.scrollHeight;

  try {
    const systemPrompt = `You are a study assistant for Lazy Panda 🐼. Answer questions based ONLY on the provided notes and documents. 
If the answer isn't in the documents, say so clearly. Be concise, accurate, and helpful.
Quote relevant passages when useful. Format with markdown-style bold for key terms.

DOCUMENTS & NOTES:
${context}`;

    const res = await geminiFetch({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: query }] }],
      generationConfig: { maxOutputTokens: 800, temperature: 0.3 }
    });
    document.getElementById('notes-typing')?.remove();
    const data = await res.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.';
    addNotesChatMsg('ai', esc(reply).replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>'));
  } catch(e) {
    document.getElementById('notes-typing')?.remove();
    addNotesChatMsg('ai', '⚠️ Error: ' + e.message);
  }
}

function handleNotesChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendNotesChat(); }
}

// ══════════════════════════════════════════════
//  PHASE 4 — AUTO SCHEDULE OPTIMIZER (Feature 12)
// ══════════════════════════════════════════════
function renderOptimizerOutput() {
  const el = document.getElementById('optimizer-output');
  if (!el) return;
  if (!lastOptimizerResult) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">⚡</div>Configure your preferences above and tap "Optimize Now" to generate an AI-powered study plan.</div>`;
  }
}

async function runOptimizer() {
  if (!state.apiKey) {
    showToast('⚠️ Add your Gemini API key in Settings first.');
    return;
  }
  const blockSize = document.getElementById('opt-block-size')?.value || '90';
  const peakTime = document.getElementById('opt-peak-time')?.value || 'evening';
  const breakSize = document.getElementById('opt-break-size')?.value || '15';
  const days = document.getElementById('opt-days')?.value || '7';

  const el = document.getElementById('optimizer-output');
  el.innerHTML = `<div class="optimizer-loading"><div class="typing-indicator" style="justify-content:center;"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div><div style="margin-top:10px;font-size:13px;color:var(--text3);">Analyzing your schedule and building an optimized plan…</div></div>`;

  // Build schedule context for the next N days
  const now = new Date();
  const scheduleCtx = [];
  for (let i = 0; i < parseInt(days); i++) {
    const d = new Date(now); d.setDate(now.getDate() + i);
    const ds = d.toISOString().split('T')[0];
    const evs = getEventsForDay(ds, d.getDay());
    if (evs.length) {
      scheduleCtx.push(`${DAYS[d.getDay()]} ${ds}: ` + evs.map(e => `${fmt12(e.start)}-${fmt12(e.end)} ${e.title}`).join(', '));
    } else {
      scheduleCtx.push(`${DAYS[d.getDay()]} ${ds}: Free day`);
    }
  }
  const pendingTasks = state.tasks.filter(t => !isTaskComplete(t)).slice(0, 15);
  const peakMap = { morning:'6 AM–12 PM', afternoon:'12 PM–5 PM', evening:'5 PM–9 PM', night:'9 PM–12 AM' };

  const prompt = `You are an expert academic schedule optimizer for Lazy Panda 🐼.

STUDENT'S EXISTING SCHEDULE (next ${days} days):
${scheduleCtx.join('\n')}

PENDING TASKS TO FIT IN:
${pendingTasks.map(t => `- ${t.name} (due ${t.due}, ${t.priority} priority)`).join('\n') || 'None'}

OPTIMIZATION PREFERENCES:
- Study block size: ${blockSize} minutes
- Peak focus time: ${peakMap[peakTime]}
- Break between blocks: ${breakSize} minutes
- Plan horizon: ${days} days

YOUR TASK:
1. Find ALL free time slots in the schedule above
2. Assign study/task sessions into those gaps, respecting existing events
3. Place high-priority tasks earlier and in peak focus hours
4. Add short breaks between blocks
5. Return a day-by-day optimized plan

FORMAT your response as a structured plan with each day as a section. For each suggested session include: time, task/subject, duration, and a brief tip. Be specific with times. End with a brief motivational note 🐼.`;

  try {
    const res = await geminiFetch({
      system_instruction: { parts: [{ text: 'You are a precise academic schedule optimizer. Return structured, actionable plans.' }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 2000, temperature: 0.5 }
    });
    const data = await res.json();
    const plan = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Could not generate plan.';
    lastOptimizerResult = plan;
    saveState();

    // Render the plan with action buttons
    el.innerHTML = `<div class="optimizer-result">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
        <div style="font-size:13px;font-weight:600;color:var(--accent);">⚡ Optimized Plan Ready</div>
        <div style="display:flex;gap:8px;">
          <button class="btn-save" style="font-size:12px;" onclick="addOptimizerEventsToSchedule()">＋ Add to Schedule</button>
          <button class="btn-cancel" style="font-size:12px;" onclick="runOptimizer()">↻ Regenerate</button>
        </div>
      </div>
      <div class="optimizer-plan-text">${esc(plan).replace(/\n/g,'<br>').replace(/\*\*(.*?)\*\*/g,'<b>$1</b>').replace(/##\s*(.*)/g,'<div class="opt-day-header">$1</div>')}</div>
    </div>`;
  } catch(e) {
    el.innerHTML = `<div class="empty">⚠️ Error: ${e.message}</div>`;
  }
}

async function addOptimizerEventsToSchedule() {
  if (!lastOptimizerResult || !state.apiKey) return;
  showToast('🐼 Parsing plan and adding events…');

  const extractPrompt = `Extract all study sessions from this schedule plan and return ONLY a JSON array of events. Each event: {"title":"...","date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM","category":"study","location":"","recurring":"none"}. Today is ${todayStr()}. Return raw JSON array only, no markdown.\n\nPLAN:\n${lastOptimizerResult}`;

  try {
    const res = await geminiFetch({
      contents: [{ role: 'user', parts: [{ text: extractPrompt }] }],
      generationConfig: { maxOutputTokens: 1500, temperature: 0.1 }
    });
    const data = await res.json();
    let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    raw = raw.replace(/```json|```/g, '').trim();
    const events = JSON.parse(raw);
    let added = 0;
    events.forEach(ev => {
      if (ev.title && ev.date && ev.start && ev.end) {
        state.events.push({ id: 'opt_' + Date.now() + Math.random(), ...ev });
        added++;
      }
    });
    saveState(); render();
    showToast(`✅ Added ${added} study sessions to your schedule!`);
  } catch(e) {
    showToast('⚠️ Could not auto-add events — add them manually from the plan.');
  }
}

// ══════════════════════════════════════════════
//  PHASE 4 — GOOGLE CALENDAR SYNC (Feature 17)
// ══════════════════════════════════════════════
const GCAL_SCOPES = 'https://www.googleapis.com/auth/calendar';
let gCalTokenClient = null;
let gCalAccessToken = null;

function updateGCalUI() {
  const connected = !!gCalAccessToken;
  const clientIdEl = document.getElementById('gcal-client-id');
  if (clientIdEl && state.gcalClientId) clientIdEl.value = state.gcalClientId;
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
  const clientId = document.getElementById('gcal-client-id')?.value.trim();
  if (!clientId) {
    setGCalStatus('⚠️ Please enter your Google Client ID first.', 'var(--amber)');
    return;
  }
  state.gcalClientId = clientId;
  saveState();
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
//  PHASE 6.4 — CLOUD SYNC (SUPABASE)
// ══════════════════════════════════════════════
let supabaseRealtimeSubscription = null;
let lastSyncTimestamp = 0;
let syncInProgress = false;

function updateSupabaseUI() {
  const urlEl = document.getElementById('supabase-url');
  const keyEl = document.getElementById('supabase-key');
  const syncIdEl = document.getElementById('supabase-sync-id');
  if (urlEl) urlEl.value = state.supabaseUrl || '';
  if (keyEl) keyEl.value = state.supabaseKey || '';
  if (syncIdEl) syncIdEl.value = state.supabaseSyncId || '';
}

function generateSyncId() {
  const id = 'sync-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);
  state.supabaseSyncId = id;
  const syncIdEl = document.getElementById('supabase-sync-id');
  if (syncIdEl) syncIdEl.value = id;
  saveState();
}

function saveSupabaseConfig() {
  state.supabaseUrl = document.getElementById('supabase-url')?.value.trim() || '';
  state.supabaseKey = document.getElementById('supabase-key')?.value.trim() || '';
  state.supabaseSyncId = document.getElementById('supabase-sync-id')?.value.trim() || '';
  
  if (!state.supabaseUrl || !state.supabaseKey || !state.supabaseSyncId) {
    const el = document.getElementById('supabase-status');
    if (el) {
      el.style.display = 'block';
      el.style.color = 'var(--coral)';
      el.textContent = '❌ Please fill in all fields.';
    }
    return;
  }
  
  saveState();
  initializeCloudSync();
  
  const el = document.getElementById('supabase-status');
  if (el) {
    el.style.display = 'block';
    el.style.color = 'var(--green)';
    el.textContent = '✅ Cloud config saved. Real-time sync enabled.';
  }
  
  // Auto-sync immediately
  syncToCloud(true);
}

async function getSupabaseClient() {
  if (!state.supabaseUrl || !state.supabaseKey) return null;
  if (!window.supabase || !window.supabase.createClient) return null;
  try {
    return window.supabase.createClient(state.supabaseUrl, state.supabaseKey);
  } catch(e) {
    console.error('Failed to create Supabase client:', e);
    return null;
  }
}

function initializeCloudSync() {
  if (!state.supabaseUrl || !state.supabaseKey || !state.supabaseSyncId) return;
  
  // Unsubscribe from previous if any
  if (supabaseRealtimeSubscription) {
    supabaseRealtimeSubscription.unsubscribe();
  }
  
  // Setup real-time listener
  setupRealtimeSyncListener();
  
  // Register periodic background sync (if supported)
  if ('serviceWorker' in navigator && 'periodicSync' in ServiceWorkerRegistration.prototype) {
    navigator.serviceWorker.ready.then(reg => {
      reg.periodicSync.register('auto-sync-cloud', { minInterval: 60 * 60 * 1000 }).catch(() => {
        console.log('Periodic sync registration failed (may not be supported)');
      });
    }).catch(() => {
      console.log('Service Worker not ready for periodic sync');
    });
  }
}

async function setupRealtimeSyncListener() {
  try {
    const supabaseClient = await getSupabaseClient();
    if (!supabaseClient) return;
    
    // Subscribe to changes on this sync ID
    supabaseRealtimeSubscription = supabaseClient
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'lazy_panda_sync',
        filter: `id=eq.${state.supabaseSyncId}`
      }, payload => {
        handleRemoteSync(payload);
      })
      .subscribe();
  } catch(e) {
    console.error('Failed to setup real-time sync listener:', e);
  }
}

async function handleRemoteSync(payload) {
  if (!payload.new || !payload.new.data) return;
  
  try {
    const remoteData = JSON.parse(payload.new.data);
    const remoteTimestamp = new Date(payload.new.updated_at).getTime();
    
    // Conflict resolution: Keep local if edited more recently
    if (remoteTimestamp > lastSyncTimestamp) {
      // Remote is newer, merge intelligently
      mergeCloudData(remoteData);
      lastSyncTimestamp = remoteTimestamp;
    }
  } catch(e) {
    console.error('Error handling remote sync:', e);
  }
}

function mergeCloudData(remoteData) {
  // Smart merge: prefer local newer data, cloud for missing items
  if (remoteData.events && Array.isArray(remoteData.events)) {
    remoteData.events.forEach(remoteEv => {
      const idx = state.events.findIndex(e => e.id === remoteEv.id);
      if (idx < 0) {
        // New event from cloud
        state.events.push(remoteEv);
      }
      // Don't overwrite local (local edits are newer)
    });
  }
  
  if (remoteData.tasks && Array.isArray(remoteData.tasks)) {
    remoteData.tasks.forEach(remoteTask => {
      const idx = state.tasks.findIndex(t => t.id === remoteTask.id);
      if (idx < 0) {
        state.tasks.push(remoteTask);
      }
    });
  }
  
  saveState();
  render();
}

let syncTimeout = null;
function autoSyncToCloud() {
  if (!state.supabaseUrl || !state.supabaseKey || !state.supabaseSyncId) return;
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    syncToCloud(true);
  }, 3000);
}

async function syncToCloud(isAuto = false) {
  if (syncInProgress) return;
  syncInProgress = true;
  
  const el = document.getElementById('supabase-status');
  if (!state.supabaseUrl || !state.supabaseKey || !state.supabaseSyncId) {
    syncInProgress = false;
    if (!isAuto && el) {
      el.style.display = 'block';
      el.style.color = 'var(--amber)';
      el.textContent = '⚠️ Please configure cloud sync first.';
    }
    return;
  }
  if (!isAuto && el) {
    el.style.display = 'block';
    el.style.color = 'var(--text3)';
    el.textContent = '⏳ Syncing to cloud...';
  }
  try {
    const supabaseClient = await getSupabaseClient();
    if (!supabaseClient) throw new Error("Supabase client not available. Check your configuration.");
    
    const payload = { ...state };
    delete payload.apiKey;
    delete payload.supabaseKey;
    
    const now = new Date().toISOString();
    lastSyncTimestamp = new Date(now).getTime();
    
    const { error } = await supabaseClient
      .from('lazy_panda_sync')
      .upsert({ 
        id: state.supabaseSyncId, 
        data: JSON.stringify(payload),
        updated_at: now,
        device_name: navigator.userAgent.substring(0, 100)
      }, { onConflict: 'id' });

    if (error) throw error;
    
    syncInProgress = false;
    if (!isAuto && el) {
      el.style.color = 'var(--green)';
      el.textContent = '✅ Successfully synced to cloud!';
    }
  } catch(e) {
    syncInProgress = false;
    console.error('Sync error:', e);
    if (!isAuto && el) {
      el.style.color = 'var(--coral)';
      el.textContent = '❌ Cloud sync failed: ' + (e.message || 'Unknown error');
    }
  }
}

async function restoreFromCloud() {
  const el = document.getElementById('supabase-status');
  if (!state.supabaseUrl || !state.supabaseKey || !state.supabaseSyncId) {
    if (el) {
      el.style.display = 'block';
      el.style.color = 'var(--amber)';
      el.textContent = '⚠️ Please configure cloud sync first.';
    }
    return;
  }
  if (!confirm('⚠️ This will merge cloud data with your local schedule. Continue?\n\n(New items from cloud will be added, existing local items are preserved.)')) return;
  
  if (el) {
    el.style.display = 'block';
    el.style.color = 'var(--text3)';
    el.textContent = '⏳ Restoring from cloud...';
  }
  try {
    const supabaseClient = await getSupabaseClient();
    if (!supabaseClient) throw new Error("Supabase client not available. Check your configuration.");
    
    const { data, error } = await supabaseClient
      .from('lazy_panda_sync')
      .select('*')
      .eq('id', state.supabaseSyncId)
      .single();

    if (error) throw error;
    if (!data || !data.data) throw new Error("No data found for this Sync ID.");
    
    const cloudState = JSON.parse(data.data);
    lastSyncTimestamp = new Date(data.updated_at).getTime();
    
    // Preserve sensitive local data
    const localApiKey = state.apiKey;
    const localGcalClientId = state.gcalClientId;
    const localWaPhone = state.waPhone;
    
    // Merge: cloud data fills gaps, local data is preserved for existing items
    if (cloudState.events && Array.isArray(cloudState.events)) {
      cloudState.events.forEach(cloudEv => {
        const idx = state.events.findIndex(e => e.id === cloudEv.id);
        if (idx < 0) {
          state.events.push(cloudEv);
        }
      });
    }
    
    if (cloudState.tasks && Array.isArray(cloudState.tasks)) {
      cloudState.tasks.forEach(cloudTask => {
        const idx = state.tasks.findIndex(t => t.id === cloudTask.id);
        if (idx < 0) {
          state.tasks.push(cloudTask);
        }
      });
    }
    
    if (cloudState.grades && Array.isArray(cloudState.grades)) {
      state.grades = cloudState.grades || [];
    }
    
    if (cloudState.attendance && Array.isArray(cloudState.attendance)) {
      state.attendance = cloudState.attendance || [];
    }
    
    // Preserve sensitive keys
    if (!state.apiKey && localApiKey) state.apiKey = localApiKey;
    if (!state.gcalClientId && localGcalClientId) state.gcalClientId = localGcalClientId;
    if (!state.waPhone && localWaPhone) state.waPhone = localWaPhone;
    
    saveState();
    render();
    if (el) {
      el.style.color = 'var(--green)';
      el.textContent = '✅ Successfully merged cloud data!';
    }
  } catch(e) {
    console.error('Restore error:', e);
    if (el) {
      el.style.color = 'var(--coral)';
      el.textContent = '❌ Cloud restore failed: ' + (e.message || 'Unknown error');
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

// ══════════════════════════════════════════════
//  GYM PLAN (102 kg → 80 kg)
// ══════════════════════════════════════════════
let gymBuilt = false;
let gymAnimTimers = {};
let gymThumbTimers = {};

function renderGymView() {
  const container = document.getElementById('gym-view-content');
  if (!container) return;
  if (gymBuilt) return;
  gymBuilt = true;
  container.innerHTML = buildGymHTML();
  initGymJS();
}

function buildGymHTML() {
  return `
<div class="gym-wrap">

<div class="gym-tabs" id="gymTabs">
  <button class="gym-tab gym-tab-active" onclick="gymSwitchTab('overview')">Overview</button>
  <button class="gym-tab" onclick="gymSwitchTab('schedule')">Schedule</button>
  <button class="gym-tab" onclick="gymSwitchTab('exercises')">Exercises</button>
  <button class="gym-tab" onclick="gymSwitchTab('nutrition')">Nutrition</button>
  <button class="gym-tab" onclick="gymSwitchTab('hiit')">HIIT Timer</button>
  <button class="gym-tab" onclick="gymSwitchTab('tips')">Tips</button>
</div>

<!-- OVERVIEW -->
<div class="gym-section active" id="gymtab-overview">
  <div class="gym-hero">
    <div class="gym-hero-label">FAT LOSS JOURNEY</div>
    <div class="gym-hero-title">102 kg → 80 kg</div>
    <div class="gym-hero-sub">6&apos;0&quot; (183 cm) · Age 28 · Karachi 🌙</div>
    <div class="gym-progress-track"><div class="gym-progress-fill" id="gymWeightBar" style="width:0%"></div></div>
    <div class="gym-progress-labels"><span id="gymProgressLost">0 kg lost</span><span>Goal: 22 kg</span></div>
  </div>

  <div class="gym-stats-row">
    <div class="gym-stat"><div class="gym-stat-label">BMR</div><div class="gym-stat-val">2,028</div><div class="gym-stat-sub">kcal / day</div></div>
    <div class="gym-stat"><div class="gym-stat-label">TDEE</div><div class="gym-stat-val">3,143</div><div class="gym-stat-sub">kcal / day</div></div>
    <div class="gym-stat"><div class="gym-stat-label">Target</div><div class="gym-stat-val">2,400</div><div class="gym-stat-sub">kcal / day</div></div>
    <div class="gym-stat"><div class="gym-stat-label">Weekly Loss</div><div class="gym-stat-val" style="color:var(--green)">~0.9</div><div class="gym-stat-sub">kg / week</div></div>
  </div>

  <div class="gym-section-hdr"><span class="gym-section-title">3-PHASE PLAN</span></div>
  <div class="gym-phases">
    <div class="gym-phase-card"><div class="gym-phase-num">Phase 1 · Weeks 1–4</div><div class="gym-phase-title">Foundation</div><div class="gym-phase-detail">Build habits & form. 2,200 kcal/day. 3× LISS cardio. Moderate loads.</div><div class="gym-phase-loss">−3–4 kg</div></div>
    <div class="gym-phase-card"><div class="gym-phase-num">Phase 2 · Weeks 5–8</div><div class="gym-phase-title">Intensify</div><div class="gym-phase-detail">Add HIIT Thursday. +5–10% load weekly. Extend Saturday walk to 60 min. 2,100 kcal/day.</div><div class="gym-phase-loss">−3–4 kg</div></div>
    <div class="gym-phase-card"><div class="gym-phase-num">Phase 3 · Weeks 9–11</div><div class="gym-phase-title">Peak Burn</div><div class="gym-phase-detail">Max fat burn. 45–60 min LISS + 2× HIIT. Maintain strength. 2,000 kcal/day.</div><div class="gym-phase-loss">−2–3 kg</div></div>
  </div>

  <div class="gym-section-hdr" style="margin-top:18px"><span class="gym-section-title">PROGRESS TRACKER</span></div>
  <div class="gym-stat" style="padding:16px;display:block">
    <div style="display:flex;gap:10px;margin-bottom:10px">
      <input type="number" id="gymCurrentWeight" placeholder="Current weight (kg)" step="0.1" min="60" max="130" style="flex:1;background:var(--surface2);border:1px solid var(--border2);border-radius:var(--r-sm);padding:8px 12px;color:var(--text);font-size:13px;font-family:var(--font);outline:none">
      <button onclick="gymUpdateProgress()" style="background:var(--accent);border:none;border-radius:var(--r-sm);padding:8px 16px;color:#fff;font-size:13px;font-weight:500;cursor:pointer;font-family:var(--font);white-space:nowrap">Update</button>
    </div>
    <div id="gymProgressMsg" style="font-size:12px;color:var(--text3)">Enter your current weight to track progress</div>
  </div>
</div>

<!-- SCHEDULE -->
<div class="gym-section" id="gymtab-schedule">
  <div class="gym-section-hdr"><span class="gym-section-title">WEEKLY TRAINING SPLIT</span><span style="font-size:11px;color:var(--text3)">Tap a day for details</span></div>
  <div class="gym-schedule-table" id="gymScheduleTable">
    ${[
      {day:'MON',id:'gym-Mon',focus:'Push — Chest, Shoulders, Triceps',type:'WEIGHTS',cls:'type-weights',dayKey:'push',dur:'~60 min'},
      {day:'TUE',id:'gym-Tue',focus:'LISS Cardio + Core Circuit',type:'CARDIO',cls:'type-cardio',dayKey:'cardio',dur:'~50 min'},
      {day:'WED',id:'gym-Wed',focus:'Pull — Back, Biceps',type:'WEIGHTS',cls:'type-weights',dayKey:'pull',dur:'~60 min'},
      {day:'THU',id:'gym-Thu',focus:'HIIT + Active Recovery',type:'HIIT',cls:'type-hiit',dayKey:'hiit',dur:'~25 min'},
      {day:'FRI',id:'gym-Fri',focus:'Legs + Glutes',type:'WEIGHTS',cls:'type-weights',dayKey:'legs',dur:'~65 min'},
      {day:'SAT',id:'gym-Sat',focus:'Long LISS Walk/Jog (60 min)',type:'CARDIO',cls:'type-cardio',dayKey:'liss',dur:'60 min'},
      {day:'SUN',id:'gym-Sun',focus:'Full Recovery & Rest',type:'REST',cls:'type-rest',dayKey:'rest',dur:'Rest day'}
    ].map(r=>`<div class="gym-sched-row" id="${r.id}" onclick="gymToggleDayDetail('${r.dayKey}','${r.day}','${r.focus}','${r.cls}','${r.dur}',this)" style="cursor:pointer;">
      <div class="gym-sched-day">${r.day}</div>
      <div class="gym-sched-focus">${r.focus}</div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        <div class="gym-sched-badge ${r.cls}">${r.type}</div>
        <span class="gym-sched-chevron">›</span>
      </div>
    </div>`).join('')}
  </div>
  <!-- Day detail panel — populated by gymToggleDayDetail() -->
  <div id="gym-day-detail-panel" class="gym-day-detail hidden"></div>
</div>

<!-- EXERCISES -->
<div class="gym-section" id="gymtab-exercises">
  <div class="gym-tabs" id="gymDayTabs" style="margin-bottom:14px">
    <button class="gym-tab gym-tab-active" onclick="gymSwitchDay('push')">Push Day</button>
    <button class="gym-tab" onclick="gymSwitchDay('pull')">Pull Day</button>
    <button class="gym-tab" onclick="gymSwitchDay('legs')">Leg Day</button>
    <button class="gym-tab" onclick="gymSwitchDay('cardio')">Cardio & Core</button>
  </div>
  <div id="gymExPush" class="gym-ex-list"></div>
  <div id="gymExPull" class="gym-ex-list hidden"></div>
  <div id="gymExLegs" class="gym-ex-list hidden"></div>
  <div id="gymExCardio" class="gym-ex-list hidden"></div>
</div>

<!-- NUTRITION -->
<div class="gym-section" id="gymtab-nutrition">
  <div class="gym-section-hdr"><span class="gym-section-title">DAILY MACROS AT 2,400 KCAL</span></div>
  <div class="gym-stat" style="padding:16px;display:block;margin-bottom:14px">
    ${[
      {name:'Protein',pct:70,color:'var(--accent)',amount:'165 g'},
      {name:'Carbs',pct:85,color:'var(--amber)',amount:'260 g'},
      {name:'Fats',pct:55,color:'var(--blue)',amount:'70 g'},
      {name:'Water',pct:90,color:'var(--green)',amount:'3–4 L'}
    ].map(m=>`<div class="gym-macro-row">
      <div class="gym-macro-name">${m.name}</div>
      <div class="gym-macro-track"><div class="gym-macro-fill" style="width:${m.pct}%;background:${m.color}"></div></div>
      <div class="gym-macro-amount">${m.amount}</div>
    </div>`).join('')}
  </div>

  <div class="gym-section-hdr"><span class="gym-section-title">BEST PROTEIN SOURCES (KARACHI-FRIENDLY)</span></div>
  <div class="gym-stat" style="padding:0;overflow:hidden;margin-bottom:14px">
    <table class="gym-food-table">
      <thead><tr><th>Food</th><th>Protein / 100g</th></tr></thead>
      <tbody>
        ${[['Chicken breast','31 g'],['Tuna / Fish','28 g'],['Beef (lean)','26 g'],['Paneer','18 g'],['Dahi (yogurt)','10 g'],['Daal (cooked)','9 g'],['Eggs','6 g each']].map(([f,p])=>`<tr><td>${f}</td><td class="gym-food-g">${p}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>

  <div class="gym-section-hdr"><span class="gym-section-title">WHAT TO LIMIT</span></div>
  <div class="gym-stat" style="padding:0;overflow:hidden">
    <table class="gym-food-table">
      <thead><tr><th>Food</th><th>Reason</th></tr></thead>
      <tbody>
        ${[
          ['Sugary drinks / chai','Empty calories, spikes insulin'],
          ['Naan / white rice (large portions)','High GI, easy to overeat'],
          ['Biryani / fried items','Calorie-dense, hard to track'],
          ['Late-night eating (after 9 PM)','Disrupts sleep & recovery']
        ].map(([f,r])=>`<tr><td>${f}</td><td style="color:var(--coral);font-size:12px">${r}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
</div>

<!-- HIIT TIMER -->
<div class="gym-section" id="gymtab-hiit">
  <div class="gym-hiit-box">
    <div class="gym-hiit-phase" id="gymHiitPhase" style="color:var(--green)">READY TO START</div>
    <div class="gym-hiit-time" id="gymHiitTime">00:30</div>
    <div style="font-size:12px;color:var(--text3);font-family:var(--mono)">Round <span id="gymHiitRound">0</span> of 14 · Target: 163–182 BPM</div>
    <div style="margin:14px 0;background:var(--surface2);border-radius:999px;height:8px;overflow:hidden">
      <div id="gymHiitBar" style="height:100%;border-radius:999px;background:var(--green);transition:width .3s;width:100%"></div>
    </div>
    <div style="display:flex;gap:10px;justify-content:center">
      <button class="gym-hiit-btn" onclick="gymResetHIIT()">Reset</button>
      <button class="gym-hiit-btn gym-hiit-primary" id="gymHiitToggle" onclick="gymToggleHIIT()">▶ Start</button>
    </div>
    <div id="gymHiitStatus" style="margin-top:12px;font-size:13px;color:var(--text3)">3 min warmup → 14×(30s sprint / 30s rest) → 3 min cooldown · Total: 20 min</div>
  </div>
  <div style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
    <div class="gym-stat"><div class="gym-stat-label">Duration</div><div class="gym-stat-val">20</div><div class="gym-stat-sub">minutes</div></div>
    <div class="gym-stat"><div class="gym-stat-label">Est. Burn</div><div class="gym-stat-val" style="color:var(--coral)">~280</div><div class="gym-stat-sub">kcal</div></div>
    <div class="gym-stat"><div class="gym-stat-label">Sprint Zone</div><div class="gym-stat-val" style="font-size:16px;color:var(--amber)">163–182</div><div class="gym-stat-sub">BPM (85–95%)</div></div>
    <div class="gym-stat"><div class="gym-stat-label">Recovery Zone</div><div class="gym-stat-val" style="font-size:16px;color:var(--green)">96–115</div><div class="gym-stat-sub">BPM (50–60%)</div></div>
  </div>
</div>

<!-- TIPS -->
<div class="gym-section" id="gymtab-tips">
  <div class="gym-section-hdr"><span class="gym-section-title">10 KEY RULES FOR SUCCESS</span></div>
  <div class="gym-tips-list">
    ${[
      ['⚖️','Weigh once per week','Same day, same time, morning after toilet. Judge weekly trends — not daily fluctuations.'],
      ['😴','Sleep 7–8 hours','Poor sleep spikes cortisol and stalls fat loss. This is non-negotiable.'],
      ['📈','Progressive overload','Add a small amount of weight every 1–2 weeks on your main lifts.'],
      ['🍗','Protein every meal','Preserves muscle while in a calorie deficit. Target 160–170 g/day.'],
      ['💧','Drink 500 ml before meals','Naturally reduces appetite without any extra effort.'],
      ['🦵','Never skip legs','Largest muscle group, burns the most calories. Friday is sacred.'],
      ['🌙','Karachi heat rule','Do outdoor cardio before 7 AM or after 7 PM. Stay hydrated.'],
      ['🔁','Consistency beats perfection','One missed session is fine, missing a week is not.'],
      ['📊','Recalculate at 95 kg','Your BMR will drop ~100–150 kcal. Adjust intake downward by ~100 kcal.'],
      ['🎯','Realistic expectation','8–12 kg by August is achievable and sustainable. Every kg matters.']
    ].map(([icon,title,desc])=>`<div class="gym-tip"><div class="gym-tip-icon">${icon}</div><div><div style="font-weight:500;color:var(--text);margin-bottom:2px">${title}</div><div style="font-size:12px;color:var(--text2);line-height:1.5">${desc}</div></div></div>`).join('')}
  </div>
</div>

</div>`;
}

// ── Gym exercise data ──────────────────────────────────────────
const gymExerciseData = {
  push: [
    { name:'Barbell Bench Press', meta:'Chest, Shoulders, Triceps', sets:'4 × 8–10', anim:'bench',
      steps:['Lie flat, eyes under the bar. Grip slightly wider than shoulder-width, thumbs wrapped.','Retract shoulder blades and squeeze into the bench — protects shoulders.','Unrack and hold bar directly above chest, arms extended.','Lower in a controlled arc to lower chest — elbows at 45–75° from torso.','Touch chest lightly (no bounce), press explosively back to start.','Keep feet flat on floor and glutes on bench throughout.'],
      mistakes:['Flaring elbows too wide (90°)','Bouncing bar off chest','Hips lifting off bench'] },
    { name:'Incline Dumbbell Press', meta:'Upper Chest, Front Delts', sets:'3 × 10', anim:'incline',
      steps:['Set bench to 30–45°. Higher shifts too much load to shoulders.','Kick dumbbells up as you lie back. Palms facing forward.','Press dumbbells up and slightly inward so they nearly touch at top.','Lower slowly (2–3 seconds) back to chest level.','Keep shoulder blades pinched together throughout.'],
      mistakes:['Incline too high (>45°)','Dumbbells drifting apart at the bottom'] },
    { name:'Overhead Press (OHP)', meta:'Shoulders, Triceps', sets:'3 × 10', anim:'ohp',
      steps:['Stand or sit upright. Hold bar at shoulder height, elbows slightly forward.','Brace core and glutes tightly — protects lower back.','Press bar directly overhead in a straight vertical path.','Tuck chin back as bar passes face, head forward once clear.','Lock out arms and shrug traps slightly at the top.','Lower controlled back to shoulder height.'],
      mistakes:['Excessive lower back arch','Pressing bar forward instead of straight up'] },
    { name:'Lateral Raises', meta:'Lateral Deltoids', sets:'3 × 15', anim:'lateral',
      steps:['Stand with dumbbells at sides, slight bend in elbows.','Raise both arms out to sides, leading with elbows — not wrists.','Stop when arms are parallel to floor (shoulder height).','Tilt dumbbell so front is lower than back (pouring jug) at the top.','Lower slowly and controlled — 3 seconds down.','Use light weight — most people go far too heavy.'],
      mistakes:['Swinging the body for momentum','Shrugging the traps','Going too heavy'] },
    { name:'Tricep Pushdowns (Cable)', meta:'Triceps (all 3 heads)', sets:'3 × 12', anim:'pushdown',
      steps:['Attach rope or straight bar to high pulley.','Stand facing machine, elbows tucked tightly to your sides.','Push down until arms fully extended — squeeze triceps hard at bottom.','Let weight rise slowly (2 seconds) back to ~90° at elbow.','Only your forearms move — elbows stay pinned throughout.'],
      mistakes:['Elbows lifting forward and away from body','Using whole arm instead of forearm only'] }
  ],
  pull: [
    { name:'Deadlift', meta:'Back, Hamstrings, Glutes', sets:'4 × 6–8', anim:'deadlift',
      steps:['Bar over mid-foot (not touching shins), feet hip-width apart.','Hinge at hips, bend knees, grip bar just outside legs.','Deep breath, brace core maximally, squeeze lats, PUSH the floor away.','Bar stays in contact with your body entire lift — graze shins and thighs.','Lock out by standing tall, hips fully extended. No hyperextension at top.','Lower by pushing hips back first, then bending knees.'],
      mistakes:['Rounding lower back (most dangerous)','Bar drifting away from body','Jerking the bar off the floor'] },
    { name:'Barbell Rows', meta:'Middle Back, Lats, Biceps', sets:'3 × 10', anim:'row',
      steps:['Hinge forward until torso is ~45° from horizontal, knees soft.','Grip bar just outside shoulder-width, arms hanging straight down.','Row the bar into your lower ribcage / upper abdomen — not chest.','Drive elbows back, squeeze shoulder blades together at top.','Lower bar under control — do not let it drop.','Keep lower back neutral throughout.'],
      mistakes:['Rowing into chest instead of abs','Rounding the lower back','Using momentum to swing up'] },
    { name:'Lat Pulldowns', meta:'Latissimus Dorsi, Biceps', sets:'3 × 12', anim:'pulldown',
      steps:['Sit with thighs secured under pad. Grip wider than shoulder-width.','Lean back very slightly (10–15°) — this is NOT a row.','Pull bar down to upper chest by driving elbows toward your hips.','Squeeze your lats at the bottom for 1 second.','Let bar rise slowly (2–3 sec) to full arm extension — feel the stretch.'],
      mistakes:['Pulling behind the neck (dangerous for cervical spine)','Too much body momentum','Short range of motion'] },
    { name:'Face Pulls', meta:'Rear Delts, External Rotators', sets:'3 × 15', anim:'facepull',
      steps:['Attach rope to cable at face/upper-chest height. Step back for tension.','Grip rope with palms facing each other, thumbs up.','Pull rope toward your face, separating hands as you pull.','Each hand goes toward the side of your face / ear.','At end position: elbows flared high, upper arms parallel to floor.','Squeeze rear delts hard. Return slowly.'],
      mistakes:['Pulling too low (front delt instead of rear)','Not separating hands at end','Elbows dropping below shoulders'] },
    { name:'Barbell Curls', meta:'Biceps, Brachialis', sets:'3 × 12', anim:'curl',
      steps:['Stand with underhand grip, hands shoulder-width apart.','Keep elbows pinned to sides throughout — they must NOT drift.','Curl bar up in an arc toward your shoulders.','Squeeze biceps hard at top and hold 1 second.','Lower the bar slowly (3 seconds) to full arm extension.','If you are swinging your torso, the weight is too heavy.'],
      mistakes:['Swinging the torso for momentum','Elbows drifting forward','Partial range of motion'] }
  ],
  legs: [
    { name:'Barbell Squat', meta:'Quads, Glutes, Core', sets:'4 × 8', anim:'squat',
      steps:['Set bar at upper-chest height. Place across upper traps (high bar).','Feet shoulder-width, toes pointing out 15–30°.','Deep breath, brace core maximally before descending.','Push knees out in direction of toes as you descend.','Squat until thighs are at least parallel — hip crease below knee top.','Drive through whole foot to stand — push the floor apart as you rise.'],
      mistakes:['Knees caving inward (valgus collapse)','Heels rising off floor (ankle mobility)','Not reaching parallel depth'] },
    { name:'Romanian Deadlift (RDL)', meta:'Hamstrings, Glutes', sets:'3 × 10', anim:'rdl',
      steps:['Stand holding barbell at hip level, feet hip-width.','Push hips BACK as far as possible — hip hinge, NOT a squat.','Lower bar along your legs until strong hamstring stretch (below knee).','Drive hips forward to return, squeezing glutes hard at top.','Keep slight bend in knees throughout — never fully lock out.'],
      mistakes:['Rounding the back (most common)','Squatting the weight instead of hinging','Bar drifting forward away from body'] },
    { name:'Leg Press', meta:'Quads, Glutes, Hamstrings', sets:'3 × 12', anim:'legpress',
      steps:['Sit in machine, feet shoulder-width on platform, roughly mid-height.','Lower platform until knees reach ~90° — lower back stays on seat.','Press platform back up explosively — do not fully lock out at top.','Higher foot placement = more glutes/hamstrings.','Lower foot placement = more quad emphasis.'],
      mistakes:['Feet too low (knee pain risk)','Knees caving inward during press','Lower back peeling off seat at depth'] },
    { name:'Walking Lunges', meta:'Quads, Glutes, Balance', sets:'3 × 12 per leg', anim:'lunge',
      steps:['Stand with feet together, dumbbells in each hand (or bodyweight).','Step forward ~2–3 feet with right foot.','Lower back knee toward floor — stop just before it touches.','Front shin approximately vertical, knee tracking over toes.','Drive through front heel to step forward — alternate legs.','Keep torso upright throughout.'],
      mistakes:['Front knee caving inward','Torso leaning too far forward','Short stride causing knee to travel past toes'] },
    { name:'Calf Raises', meta:'Gastrocnemius, Soleus', sets:'4 × 15', anim:'calf',
      steps:['Stand on edge of step, balls of feet on edge, heels hanging off.','Lower heels as far down as comfortable — full stretch at bottom.','Rise as high as possible onto toes — full contraction at top.','Hold top position for 1–2 seconds.','Lower slowly (3 seconds) back to full stretch.','Calves respond to slow, full-range reps — rushing kills results.'],
      mistakes:['Short range of motion (most common)','Bouncing at the bottom','Going too fast'] }
  ],
  cardio: [
    { name:'Incline Treadmill Walk', meta:'LISS Cardio · Fat Burning Zone', sets:'45 min · 5–6 km/h · 8–12%', anim:'walk',
      steps:['Set treadmill to 8–12% incline and 5–6 km/h speed.','Walk with natural upright posture — DO NOT hold the handrails.','Keep arms swinging naturally — holding rails negates calorie burn significantly.','Target heart rate: 120–135 BPM (60–70% of max HR = 192).','This is the single most effective low-impact fat-burning tool available.'],
      mistakes:['Holding handrails (negates calorie burn)','Speed too high instead of using incline','Slouching posture'] },
    { name:'Plank', meta:'Core Stability, Anti-Rotation', sets:'3 × 45 seconds', anim:'plank',
      steps:['Forearms on floor, elbows directly under shoulders.','Extend both legs back, toes on floor — straight line head to heels.','Brace core as if about to be punched in the stomach.','Squeeze glutes and quads too — helps maintain straight line.','Do not let hips sag down or pike up.','Breathe normally throughout.'],
      mistakes:['Hips sagging toward floor','Hips piking upward','Holding your breath'] },
    { name:'Bicycle Crunches', meta:'Obliques, Rectus Abdominis', sets:'3 × 20 reps', anim:'bicycle',
      steps:['Lie on back, hands lightly behind head — do not pull your neck.','Lift both feet off floor, knees at 90°.','Bring right knee toward chest while rotating left elbow to meet it.','Simultaneously extend left leg out straight (not touching floor).','Alternate sides in controlled pedalling motion.','Rotation must come from your core (obliques) — not just elbows swinging.'],
      mistakes:['Pulling on neck with hands','Only moving elbows without rotating the core','Feet touching the ground'] },
    { name:'Leg Raises', meta:'Lower Abs, Hip Flexors', sets:'3 × 15', anim:'legraise',
      steps:['Lie flat on back, legs straight, hands under glutes for lower back support.','Keeping legs straight (slight bend ok), raise them to 90°.','Lower slowly (3 seconds) — stop just before heels touch floor.','This constant tension under load is what makes them effective.','Do not use momentum or swing legs up.'],
      mistakes:['Arching lower back off floor','Using momentum to swing legs','Full range collapse at the bottom'] }
  ]
};

// ── Gym Schedule day detail toggle ────────────────────────────
function gymToggleDayDetail(dayKey, day, focus, cls, dur, rowEl) {
  const panel = document.getElementById('gym-day-detail-panel');
  const allRows = document.querySelectorAll('.gym-sched-row');

  // If this row is already active, collapse and return
  if (rowEl.classList.contains('gym-sched-active')) {
    rowEl.classList.remove('gym-sched-active');
    panel.classList.add('hidden');
    panel.innerHTML = '';
    return;
  }

  // Deactivate previously active row
  allRows.forEach(r => r.classList.remove('gym-sched-active'));
  rowEl.classList.add('gym-sched-active');

  // Move panel immediately after the clicked row
  rowEl.insertAdjacentElement('afterend', panel);
  panel.classList.remove('hidden');

  // Build content based on dayKey
  let html = `<div class="gym-day-detail-header">
    <div class="gym-day-detail-badge ${cls}">${day}</div>
    <div>
      <div class="gym-day-detail-title">${focus}</div>
      <div class="gym-day-detail-dur">⏱ ${dur}</div>
    </div>
  </div>`;

  if (dayKey === 'rest') {
    html += `<div class="gym-day-ex">
      <div class="gym-day-ex-header">
        <div class="gym-day-ex-name">🌙 Rest & Recovery</div>
      </div>
      <div class="gym-day-ex-body">
        <div class="gym-day-step"><span class="gym-day-step-num">1</span> Sleep 7–9 hours — this is when muscle repair happens.</div>
        <div class="gym-day-step"><span class="gym-day-step-num">2</span> Light stretching or yoga for 10–15 min to reduce soreness.</div>
        <div class="gym-day-step"><span class="gym-day-step-num">3</span> Hit your protein target (160–170 g) even on rest days.</div>
        <div class="gym-day-step"><span class="gym-day-step-num">4</span> Hydrate well — aim for 3+ litres of water.</div>
        <div class="gym-day-step"><span class="gym-day-step-num">5</span> Avoid full sedentary — a 20-min walk keeps metabolism active.</div>
        <div class="gym-day-mistake">⚠️ Do NOT skip rest — this is not laziness, it is adaptation.</div>
      </div>
    </div>`;
  } else if (dayKey === 'liss') {
    html += `<div class="gym-day-ex">
      <div class="gym-day-ex-header">
        <div class="gym-day-ex-name">🚶 Long LISS Session</div>
        <div class="gym-day-ex-meta">60 min · Incline Walk or Jog</div>
      </div>
      <div class="gym-day-ex-body">
        <div class="gym-day-step"><span class="gym-day-step-num">1</span> Warm up at flat 3 km/h for 5 min to get blood flowing.</div>
        <div class="gym-day-step"><span class="gym-day-step-num">2</span> Set incline to 8–12% and speed to 5–6 km/h.</div>
        <div class="gym-day-step"><span class="gym-day-step-num">3</span> <strong>DO NOT hold the handrails</strong> — this negates 20–30% of calorie burn.</div>
        <div class="gym-day-step"><span class="gym-day-step-num">4</span> Target heart rate: 120–135 BPM (60–70% of max HR 192).</div>
        <div class="gym-day-step"><span class="gym-day-step-num">5</span> At 30-min mark, drink 250 ml of water.</div>
        <div class="gym-day-step"><span class="gym-day-step-num">6</span> Cool down at flat slow walk for 5 min. Total ~60–70 min.</div>
        <div class="gym-day-step"><span class="gym-day-step-num">7</span> Karachi rule: outdoors only before 7 AM or after 7 PM.</div>
        <div class="gym-day-mistake">⚠️ Avoid treadmill at too high speed — incline over speed for LISS.</div>
      </div>
    </div>`;
  } else if (dayKey === 'hiit') {
    html += `<div class="gym-day-ex">
      <div class="gym-day-ex-header">
        <div class="gym-day-ex-name">⚡ HIIT Intervals</div>
        <div class="gym-day-ex-meta">~25 min · Max Effort</div>
      </div>
      <div class="gym-day-ex-body">
        <div class="gym-day-step"><span class="gym-day-step-num">1</span> <strong>Warm-up (5 min):</strong> Jog at easy pace + dynamic stretches.</div>
        <div class="gym-day-step"><span class="gym-day-step-num">2</span> <strong>Intervals × 8 rounds:</strong> 30 sec max effort sprint → 90 sec easy walk/jog.</div>
        <div class="gym-day-step"><span class="gym-day-step-num">3</span> Max effort = you cannot hold a conversation. 85–95% max HR.</div>
        <div class="gym-day-step"><span class="gym-day-step-num">4</span> Options: sprints, cycling, rowing, jump rope, or burpees.</div>
        <div class="gym-day-step"><span class="gym-day-step-num">5</span> <strong>Cool-down (5 min):</strong> Slow walk, full-body stretch, controlled breathing.</div>
        <div class="gym-day-mistake">⚠️ Do not do HIIT on back-to-back days — CNS needs 48 h recovery.</div>
      </div>
    </div>
    <div class="gym-day-ex" style="margin-top:10px">
      <div class="gym-day-ex-header">
        <div class="gym-day-ex-name">🧘 Active Recovery (post-HIIT)</div>
        <div class="gym-day-ex-meta">10–15 min</div>
      </div>
      <div class="gym-day-ex-body">
        <div class="gym-day-step"><span class="gym-day-step-num">1</span> Hip flexor stretch: 30 sec each side.</div>
        <div class="gym-day-step"><span class="gym-day-step-num">2</span> Quad stretch: 30 sec each side.</div>
        <div class="gym-day-step"><span class="gym-day-step-num">3</span> Seated hamstring stretch: 45 sec.</div>
        <div class="gym-day-step"><span class="gym-day-step-num">4</span> Child's pose: 30 sec.</div>
        <div class="gym-day-step"><span class="gym-day-step-num">5</span> Pigeon pose: 30 sec each side.</div>
      </div>
    </div>`;
  } else {
    // Weight training days: push, pull, legs, cardio
    const exercises = gymExerciseData[dayKey] || [];
    exercises.forEach((ex, i) => {
      html += `<div class="gym-day-ex">
        <div class="gym-day-ex-header">
          <div class="gym-day-ex-num">${i + 1}</div>
          <div>
            <div class="gym-day-ex-name">${ex.name}</div>
            <div class="gym-day-ex-meta">${ex.meta}</div>
          </div>
          <div class="gym-day-ex-sets">${ex.sets}</div>
        </div>
        <div class="gym-day-ex-body">
          ${ex.steps.map((s, si) => `<div class="gym-day-step"><span class="gym-day-step-num">${si + 1}</span>${s}</div>`).join('')}
          ${ex.mistakes.map(m => `<div class="gym-day-mistake">⚠️ ${m}</div>`).join('')}
        </div>
      </div>`;
    });
  }

  panel.innerHTML = html;

  // Smooth scroll panel into view
  setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
}

// ── Animation drawing helpers ──────────────────────────────────
function gymLine(ctx, x1,y1,x2,y2,color,lw=2.5) {
  ctx.beginPath(); ctx.strokeStyle=color||'#f0f0f5'; ctx.lineWidth=lw;
  ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
}
function gymCircle(ctx,x,y,r,fill,stroke) {
  ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);
  ctx.fillStyle=fill||'#2a2a3e'; ctx.strokeStyle=stroke||'#7c6ff7'; ctx.lineWidth=2;
  ctx.fill(); ctx.stroke();
}
function gymBarbell(ctx,x1,y,x2) {
  gymLine(ctx,x1-12,y,x2+12,y,'#fbbf24',3);
  [[x1-16,y],[x1-10,y],[x2+10,y],[x2+16,y]].forEach(([wx,wy])=>{
    ctx.beginPath(); ctx.arc(wx,wy,6,0,Math.PI*2);
    ctx.fillStyle='#fbbf24'; ctx.fill();
  });
}
function gymBench(ctx,cx,y,hw) {
  ctx.fillStyle='#1a1a24'; ctx.strokeStyle='#5a5a72'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.roundRect(cx-hw,y,hw*2,11,3); ctx.fill(); ctx.stroke();
  gymLine(ctx,cx-hw+8,y+11,cx-hw+8,y+26,'#5a5a72',2.5);
  gymLine(ctx,cx+hw-8,y+11,cx+hw-8,y+26,'#5a5a72',2.5);
}

const gymAnimDefs = {
  bench:{
    label:'Bench Press',
    draw(ctx,t,w,h){
      const ph=Math.floor(t*3)%3, p=(t*3)%1;
      const ang=ph===0?p*0.65:ph===1?0.65:0.65-p*0.65;
      ctx.clearRect(0,0,w,h);
      const cx=w/2,cy=h*0.42;
      gymBench(ctx,cx,cy+22,w*0.32);
      gymCircle(ctx,cx,cy-50,10);
      gymLine(ctx,cx,cy-40,cx,cy+12,'#f0f0f5',3);
      const bary=cy-10-ang*38;
      gymLine(ctx,cx-22,cy-32,cx-42,cy-20+ang*22,'#9090a8',2.5);
      gymLine(ctx,cx-42,cy-20+ang*22,cx-46,bary,'#9090a8',2.5);
      gymLine(ctx,cx+22,cy-32,cx+42,cy-20+ang*22,'#9090a8',2.5);
      gymLine(ctx,cx+42,cy-20+ang*22,cx+46,bary,'#9090a8',2.5);
      gymBarbell(ctx,cx-46,bary,cx+46);
      const gy=cy+12;
      gymLine(ctx,cx,gy,cx-18,gy+22,'#f0f0f5',2.5); gymLine(ctx,cx-18,gy+22,cx-16,gy+40,'#f0f0f5',2.5);
      gymLine(ctx,cx,gy,cx+18,gy+22,'#f0f0f5',2.5); gymLine(ctx,cx+18,gy+22,cx+16,gy+40,'#f0f0f5',2.5);
      return ['LOWER','PAUSE','PRESS'][ph];
    }
  },
  incline:{
    label:'Incline Press',
    draw(ctx,t,w,h){
      const ph=Math.floor(t*3)%3, p=(t*3)%1;
      const ang=ph===0?p*0.5:ph===1?0.5:0.5-p*0.5;
      ctx.clearRect(0,0,w,h);
      const cx=w/2,cy=h*0.5;
      ctx.save(); ctx.translate(cx,cy); ctx.rotate(-0.35);
      gymCircle(ctx,0,-58,10);
      gymLine(ctx,0,-48,0,18,'#f0f0f5',3);
      const bh=ang*38;
      gymLine(ctx,-20,-28,-38,-12+bh,'#9090a8',2.5); gymLine(ctx,-38,-12+bh,-42,-4+bh,'#9090a8',2.5);
      gymLine(ctx,20,-28,38,-12+bh,'#9090a8',2.5); gymLine(ctx,38,-12+bh,42,-4+bh,'#9090a8',2.5);
      gymBarbell(ctx,-42,-4+bh,42);
      gymLine(ctx,0,18,-12,40,'#f0f0f5',2.5); gymLine(ctx,0,18,12,40,'#f0f0f5',2.5);
      ctx.restore();
      ctx.fillStyle='#1a1a24'; ctx.strokeStyle='#5a5a72'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.roundRect(w*0.1,h*0.62,w*0.4,10,3); ctx.fill(); ctx.stroke();
      return ['LOWER','PAUSE','PRESS'][ph];
    }
  },
  ohp:{
    label:'Overhead Press',
    draw(ctx,t,w,h){
      const ph=Math.floor(t*3)%3, p=(t*3)%1;
      const lift=ph===0?p:ph===1?1:1-p;
      ctx.clearRect(0,0,w,h);
      const cx=w/2,groundY=h*0.87;
      const sy=groundY-88, hy=sy-14;
      gymCircle(ctx,cx,hy,10);
      gymLine(ctx,cx,hy+10,cx,sy+52,'#f0f0f5',3);
      gymLine(ctx,cx-10,sy+52,cx-8,groundY,'#f0f0f5',2.5);
      gymLine(ctx,cx+10,sy+52,cx+8,groundY,'#f0f0f5',2.5);
      const bary=sy+8-lift*65;
      gymLine(ctx,cx-16,sy+5,cx-28+lift*4,sy+18-lift*60,'#9090a8',2.5);
      gymLine(ctx,cx-28+lift*4,sy+18-lift*60,cx-30,bary,'#9090a8',2.5);
      gymLine(ctx,cx+16,sy+5,cx+28-lift*4,sy+18-lift*60,'#9090a8',2.5);
      gymLine(ctx,cx+28-lift*4,sy+18-lift*60,cx+30,bary,'#9090a8',2.5);
      gymBarbell(ctx,cx-30,bary,cx+30);
      return ['PRESS UP','LOCKOUT','LOWER'][ph];
    }
  },
  squat:{
    label:'Barbell Squat',
    draw(ctx,t,w,h){
      const ph=Math.floor(t*3)%3, p=(t*3)%1;
      const d=ph===0?p:ph===1?1:1-p;
      ctx.clearRect(0,0,w,h);
      const cx=w/2,gy=h*0.87;
      const hipY=gy-38-( 1-d)*38;
      const sy=hipY-42+d*18, hy=sy-12;
      gymCircle(ctx,cx,hy,10);
      gymLine(ctx,cx,hy+10,cx,hipY,'#f0f0f5',3);
      gymBarbell(ctx,cx-50,sy+2,cx+50);
      const kY=gy-22+d*5;
      gymLine(ctx,cx-14,hipY,cx-22+d*5,kY,'#f0f0f5',2.5); gymLine(ctx,cx-22+d*5,kY,cx-18,gy,'#f0f0f5',2.5);
      gymLine(ctx,cx+14,hipY,cx+22-d*5,kY,'#f0f0f5',2.5); gymLine(ctx,cx+22-d*5,kY,cx+18,gy,'#f0f0f5',2.5);
      return ['DESCENT','BOTTOM','DRIVE UP'][ph];
    }
  },
  deadlift:{
    label:'Deadlift',
    draw(ctx,t,w,h){
      const ph=Math.floor(t*3)%3, p=(t*3)%1;
      const lift=ph===0?0:ph===1?p:1;
      ctx.clearRect(0,0,w,h);
      const cx=w/2,gy=h*0.88;
      const hipY=gy-36-lift*50, sy=hipY-42-lift*4, hy=sy-12;
      gymCircle(ctx,cx,hy,10);
      gymLine(ctx,cx,hy+10,cx,hipY,'#f0f0f5',3);
      const kY=gy-22+(1-lift)*14;
      gymLine(ctx,cx-12,hipY,cx-14,kY,'#f0f0f5',2.5); gymLine(ctx,cx-14,kY,cx-10,gy,'#f0f0f5',2.5);
      gymLine(ctx,cx+12,hipY,cx+14,kY,'#f0f0f5',2.5); gymLine(ctx,cx+14,kY,cx+10,gy,'#f0f0f5',2.5);
      const handY=sy+50-lift*52;
      gymLine(ctx,cx-18,sy+5,cx-22,sy+22,'#9090a8',2.5); gymLine(ctx,cx-22,sy+22,cx-20,handY,'#9090a8',2.5);
      gymLine(ctx,cx+18,sy+5,cx+22,sy+22,'#9090a8',2.5); gymLine(ctx,cx+22,sy+22,cx+20,handY,'#9090a8',2.5);
      gymBarbell(ctx,cx-20,handY,cx+20);
      return ['SETUP','LIFT','LOCKOUT'][ph];
    }
  },
  curl:{
    label:'Barbell Curl',
    draw(ctx,t,w,h){
      const ph=Math.floor(t*3)%3, p=(t*3)%1;
      const ang=ph===0?p:ph===1?1:1-p;
      ctx.clearRect(0,0,w,h);
      const cx=w/2,gy=h*0.87;
      const sy=gy-88, hy=sy-14;
      gymCircle(ctx,cx,hy,10);
      gymLine(ctx,cx,hy+10,cx,sy+52,'#f0f0f5',3);
      gymLine(ctx,cx-10,sy+52,cx-8,gy,'#f0f0f5',2.5); gymLine(ctx,cx+10,sy+52,cx+8,gy,'#f0f0f5',2.5);
      const ey=sy+20, handY=ey+28-ang*42;
      gymLine(ctx,cx-16,sy+5,cx-20,ey,'#9090a8',2.5); gymLine(ctx,cx-20,ey,cx-20,handY,'#9090a8',2.5);
      gymLine(ctx,cx+16,sy+5,cx+20,ey,'#9090a8',2.5); gymLine(ctx,cx+20,ey,cx+20,handY,'#9090a8',2.5);
      gymBarbell(ctx,cx-20,handY,cx+20);
      return ['CURL UP','SQUEEZE','LOWER'][ph];
    }
  },
  lateral:{
    label:'Lateral Raise',
    draw(ctx,t,w,h){
      const ph=Math.floor(t*3)%3, p=(t*3)%1;
      const raise=ph===0?p:ph===1?1:1-p;
      ctx.clearRect(0,0,w,h);
      const cx=w/2,gy=h*0.87;
      const sy=gy-88, hy=sy-14;
      gymCircle(ctx,cx,hy,10);
      gymLine(ctx,cx,hy+10,cx,sy+52,'#f0f0f5',3);
      gymLine(ctx,cx-10,sy+52,cx-8,gy,'#f0f0f5',2.5); gymLine(ctx,cx+10,sy+52,cx+8,gy,'#f0f0f5',2.5);
      const sp=raise*55, drop=(1-raise)*25;
      gymLine(ctx,cx-14,sy+6,cx-26-sp*0.4,sy+14+drop,'#9090a8',2.5);
      gymLine(ctx,cx-26-sp*0.4,sy+14+drop,cx-22-sp,sy+8+drop*0.5,'#9090a8',2.5);
      gymLine(ctx,cx+14,sy+6,cx+26+sp*0.4,sy+14+drop,'#9090a8',2.5);
      gymLine(ctx,cx+26+sp*0.4,sy+14+drop,cx+22+sp,sy+8+drop*0.5,'#9090a8',2.5);
      gymCircle(ctx,cx-22-sp,sy+8+drop*0.5,4,'#fbbf24','#fbbf24');
      gymCircle(ctx,cx+22+sp,sy+8+drop*0.5,4,'#fbbf24','#fbbf24');
      return ['RAISE','PEAK','LOWER'][ph];
    }
  },
  pushdown:{
    label:'Tricep Pushdown',
    draw(ctx,t,w,h){
      const ph=Math.floor(t*3)%3, p=(t*3)%1;
      const push=ph===0?p:ph===1?1:1-p;
      ctx.clearRect(0,0,w,h);
      const cx=w/2,gy=h*0.87;
      const sy=gy-85, hy=sy-14;
      gymCircle(ctx,cx,hy,10);
      gymLine(ctx,cx,hy+10,cx,sy+52,'#f0f0f5',3);
      gymLine(ctx,cx-10,sy+52,cx-8,gy,'#f0f0f5',2.5); gymLine(ctx,cx+10,sy+52,cx+8,gy,'#f0f0f5',2.5);
      const ey=sy+20, handY=ey+18+push*32;
      gymLine(ctx,cx-14,sy+5,cx-18,ey,'#9090a8',2.5); gymLine(ctx,cx-18,ey,cx-16,handY,'#9090a8',2.5);
      gymLine(ctx,cx+14,sy+5,cx+18,ey,'#9090a8',2.5); gymLine(ctx,cx+18,ey,cx+16,handY,'#9090a8',2.5);
      gymLine(ctx,cx-18,handY,cx+18,handY,'#fbbf24',2.5);
      gymLine(ctx,cx,0,cx,ey,'#5a5a72',1.5);
      return ['PUSH DOWN','SQUEEZE','RELEASE'][ph];
    }
  },
  row:{
    label:'Barbell Row',
    draw(ctx,t,w,h){
      const ph=Math.floor(t*3)%3, p=(t*3)%1;
      const pull=ph===0?p:ph===1?1:1-p;
      ctx.clearRect(0,0,w,h);
      const cx=w/2,gy=h*0.87;
      const hipX=cx, hipY=gy-28, sy=hipY-38, headX=cx+22;
      gymCircle(ctx,headX,sy-10,10);
      gymLine(ctx,headX,sy,cx,hipY,'#f0f0f5',3);
      gymLine(ctx,cx-12,hipY,cx-18,gy,'#f0f0f5',2.5); gymLine(ctx,cx+2,hipY,cx,gy,'#f0f0f5',2.5);
      const handY=sy+14-pull*18;
      gymLine(ctx,headX-8,sy,cx+5,sy+18,'#9090a8',2.5); gymLine(ctx,cx+5,sy+18,cx,handY,'#9090a8',2.5);
      gymBarbell(ctx,cx-5,handY,cx+5);
      return ['ROW UP','SQUEEZE','LOWER'][ph];
    }
  },
  pulldown:{
    label:'Lat Pulldown',
    draw(ctx,t,w,h){
      const ph=Math.floor(t*3)%3, p=(t*3)%1;
      const pull=ph===0?p:ph===1?1:1-p;
      ctx.clearRect(0,0,w,h);
      const cx=w/2, hy=h*0.12;
      gymCircle(ctx,cx,hy,10);
      const sy=hy+14, hipY=sy+45;
      gymLine(ctx,cx,sy,cx,hipY,'#f0f0f5',3);
      gymLine(ctx,cx-20,hipY,cx-24,hipY+12,'#f0f0f5',2.5); gymLine(ctx,cx+20,hipY,cx+24,hipY+12,'#f0f0f5',2.5);
      ctx.fillStyle='#1a1a24'; ctx.strokeStyle='#5a5a72'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.roundRect(cx-28,hipY+12,56,10,3); ctx.fill(); ctx.stroke();
      const bary=sy+5-pull*20;
      gymLine(ctx,cx-16,sy+5,cx-38,sy-pull*22,'#9090a8',2.5);
      gymLine(ctx,cx+16,sy+5,cx+38,sy-pull*22,'#9090a8',2.5);
      gymBarbell(ctx,cx-38,bary,cx+38);
      gymLine(ctx,cx,0,cx,bary,'#5a5a72',1.5);
      return ['PULL','SQUEEZE','RELEASE'][ph];
    }
  },
  facepull:{
    label:'Face Pull',
    draw(ctx,t,w,h){
      const ph=Math.floor(t*3)%3, p=(t*3)%1;
      const pull=ph===0?p:ph===1?1:1-p;
      ctx.clearRect(0,0,w,h);
      const cx=w/2,gy=h*0.87;
      const sy=gy-85, hy=sy-14;
      gymCircle(ctx,cx,hy,10);
      gymLine(ctx,cx,hy+10,cx,sy+52,'#f0f0f5',3);
      gymLine(ctx,cx-10,sy+52,cx-8,gy,'#f0f0f5',2.5); gymLine(ctx,cx+10,sy+52,cx+8,gy,'#f0f0f5',2.5);
      const sp=pull*38, ey=sy;
      gymLine(ctx,cx-14,sy+5,cx-14-sp*0.5,ey-8,'#9090a8',2.5); gymLine(ctx,cx-14-sp*0.5,ey-8,cx-16-sp,ey-4,'#9090a8',2.5);
      gymLine(ctx,cx+14,sy+5,cx+14+sp*0.5,ey-8,'#9090a8',2.5); gymLine(ctx,cx+14+sp*0.5,ey-8,cx+16+sp,ey-4,'#9090a8',2.5);
      gymLine(ctx,cx-16-sp,ey-4,cx+16+sp,ey-4,'#fbbf24',2);
      const ropeX=cx+w*0.3-pull*35;
      gymLine(ctx,ropeX,0,ropeX,hy-2,'#5a5a72',1.5);
      return ['PULL','SQUEEZE','RELEASE'][ph];
    }
  },
  rdl:{
    label:'Romanian Deadlift',
    draw(ctx,t,w,h){
      const ph=Math.floor(t*3)%3, p=(t*3)%1;
      const hinge=ph===0?p:ph===1?1:1-p;
      ctx.clearRect(0,0,w,h);
      const cx=w/2,gy=h*0.88;
      const hipY=gy-38, sx=cx+hinge*18, sy=hipY-42+hinge*32;
      gymCircle(ctx,sx,sy-12,10);
      gymLine(ctx,sx,sy-2,cx,hipY,'#f0f0f5',3);
      gymLine(ctx,cx-10,hipY,cx-8,gy,'#f0f0f5',2.5); gymLine(ctx,cx+10,hipY,cx+8,gy,'#f0f0f5',2.5);
      const handY=gy-18-hinge*10+hinge*38;
      gymLine(ctx,sx-14,sy,sx-18,sy+18,'#9090a8',2.5); gymLine(ctx,sx-18,sy+18,sx-16,handY,'#9090a8',2.5);
      gymLine(ctx,sx+14,sy,sx+18,sy+18,'#9090a8',2.5); gymLine(ctx,sx+18,sy+18,sx+16,handY,'#9090a8',2.5);
      gymBarbell(ctx,sx-16,handY,sx+16);
      return ['HINGE','STRETCH','DRIVE'][ph];
    }
  },
  legpress:{
    label:'Leg Press',
    draw(ctx,t,w,h){
      const ph=Math.floor(t*3)%3, p=(t*3)%1;
      const press=ph===0?p:ph===1?1:1-p;
      ctx.clearRect(0,0,w,h);
      ctx.fillStyle='#1a1a24'; ctx.strokeStyle='#5a5a72'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.roundRect(w*0.06,h*0.22,w*0.32,h*0.65,6); ctx.fill(); ctx.stroke();
      const cx=w*0.32, seatY=h*0.65, hy=h*0.28;
      gymCircle(ctx,cx,hy,10);
      gymLine(ctx,cx,hy+10,cx,seatY,'#f0f0f5',3);
      const kx=cx+22+press*20, ky=seatY-12+press*18, fx=cx+50+press*28, fy=seatY-8+press*22;
      gymLine(ctx,cx+10,seatY-8,kx,ky,'#f0f0f5',2.5); gymLine(ctx,kx,ky,fx,fy,'#f0f0f5',2.5);
      gymLine(ctx,cx-10,seatY-8,kx-14,ky+5,'#f0f0f5',2.5); gymLine(ctx,kx-14,ky+5,fx-18,fy+5,'#f0f0f5',2.5);
      ctx.fillStyle='#22222f'; ctx.strokeStyle='#5a5a72';
      ctx.beginPath(); ctx.roundRect(fx-4,fy-28,18,28,3); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(fx-24,fy-28,18,28,3); ctx.fill(); ctx.stroke();
      return ['LOWER','PAUSE','PRESS'][ph];
    }
  },
  lunge:{
    label:'Walking Lunge',
    draw(ctx,t,w,h){
      const ph=Math.floor(t*3)%3, p=(t*3)%1;
      const d=ph===0?0:ph===1?p:1-p;
      ctx.clearRect(0,0,w,h);
      const cx=w/2,gy=h*0.87;
      const hipY=gy-32-(1-d)*42, sy=hipY-42, hx=cx-5, hy=sy-12;
      gymCircle(ctx,hx,hy,10);
      gymLine(ctx,hx,hy+10,hx,hipY,'#f0f0f5',3);
      const fkY=gy-18+d*14;
      gymLine(ctx,hx-5,hipY,hx-8,fkY,'#f0f0f5',2.5); gymLine(ctx,hx-8,fkY,hx-4,gy,'#f0f0f5',2.5);
      const bkY=gy-4+d*18;
      gymLine(ctx,hx+5,hipY,cx+28,bkY,'#f0f0f5',2.5); gymLine(ctx,cx+28,bkY,cx+24,gy-d*12,'#f0f0f5',2.5);
      gymLine(ctx,hx-22,sy+8,hx-32,sy+22,'#9090a8',2.5);
      gymLine(ctx,hx+12,sy+8,hx+22,sy+22,'#9090a8',2.5);
      return ['STEP','LUNGE DOWN','DRIVE UP'][ph];
    }
  },
  calf:{
    label:'Calf Raise',
    draw(ctx,t,w,h){
      const ph=Math.floor(t*3)%3, p=(t*3)%1;
      const raise=ph===0?p:ph===1?1:1-p;
      ctx.clearRect(0,0,w,h);
      const cx=w/2,gy=h*0.87;
      const liftY=raise*20, sy=gy-88-liftY, hy=sy-14;
      gymCircle(ctx,cx,hy,10);
      gymLine(ctx,cx,hy+10,cx,sy+52,'#f0f0f5',3);
      gymLine(ctx,cx-14,sy+6,cx-28,sy+18,'#9090a8',2.5);
      gymLine(ctx,cx+14,sy+6,cx+28,sy+18,'#9090a8',2.5);
      gymLine(ctx,cx-10,sy+52,cx-8,gy,'#f0f0f5',2.5); gymLine(ctx,cx+10,sy+52,cx+8,gy,'#f0f0f5',2.5);
      gymLine(ctx,cx-22,gy,cx+22,gy,'#5a5a72',2);
      return ['RAISE','HOLD','LOWER'][ph];
    }
  },
  walk:{
    label:'Incline Walk',
    draw(ctx,t,w,h){
      ctx.clearRect(0,0,w,h);
      const cx=w/2, gy=h*0.87;
      const sw=Math.sin(t*Math.PI*4)*0.5;
      const sy=gy-88, hy=sy-14;
      gymCircle(ctx,cx,hy,10);
      gymLine(ctx,cx,hy+10,cx,sy+50,'#f0f0f5',3);
      gymLine(ctx,cx-14,sy+8,cx-26-sw*14,sy+28,'#9090a8',2.5);
      gymLine(ctx,cx+14,sy+8,cx+26+sw*14,sy+28,'#9090a8',2.5);
      const la=sw*22, ra=-sw*22;
      gymLine(ctx,cx-8,sy+50,cx-8+la,gy-18,'#f0f0f5',2.5); gymLine(ctx,cx-8+la,gy-18,cx-6+la*1.2,gy,'#f0f0f5',2.5);
      gymLine(ctx,cx+8,sy+50,cx+8+ra,gy-18,'#f0f0f5',2.5); gymLine(ctx,cx+8+ra,gy-18,cx+10+ra*1.2,gy,'#f0f0f5',2.5);
      ctx.strokeStyle='#22222f'; ctx.lineWidth=4;
      ctx.beginPath(); ctx.moveTo(w*0.05,gy+4); ctx.lineTo(w*0.95,gy+4); ctx.stroke();
      ctx.strokeStyle='rgba(124,111,247,0.25)'; ctx.lineWidth=1; ctx.setLineDash([8,8]);
      ctx.beginPath(); ctx.moveTo(w*0.1,gy-105); ctx.lineTo(w*0.9,gy-80); ctx.stroke();
      ctx.setLineDash([]);
      return 'STRIDE';
    }
  },
  plank:{
    label:'Plank',
    draw(ctx,t,w,h){
      ctx.clearRect(0,0,w,h);
      const br=Math.sin(t*Math.PI*2)*1.5;
      const cy=h*0.55+br, cx=w/2;
      gymLine(ctx,cx-70,cy+10,cx+70,cy-5,'#f0f0f5',3);
      gymCircle(ctx,cx+68,cy-16,10);
      gymLine(ctx,cx-70,cy+10,cx-70,cy+28,'#f0f0f5',2.5); gymLine(ctx,cx-64,cy+10,cx-64,cy+28,'#f0f0f5',2.5);
      gymLine(ctx,cx+28,cy+5,cx+28,cy+26,'#f0f0f5',2.5); gymLine(ctx,cx+36,cy+3,cx+36,cy+26,'#f0f0f5',2.5);
      gymLine(ctx,cx-78,cy+28,cx+44,cy+28,'#5a5a72',1.5);
      ctx.strokeStyle='rgba(124,111,247,0.3)'; ctx.lineWidth=1; ctx.setLineDash([5,5]);
      ctx.beginPath(); ctx.moveTo(cx-78,cy+5); ctx.lineTo(cx+75,cy-18); ctx.stroke();
      ctx.setLineDash([]);
      return 'HOLD';
    }
  },
  bicycle:{
    label:'Bicycle Crunch',
    draw(ctx,t,w,h){
      ctx.clearRect(0,0,w,h);
      const cx=w/2,fy=h*0.6;
      const twist=Math.sin(t*Math.PI*4)*0.4;
      gymLine(ctx,cx-42,fy,cx+42,fy,'#5a5a72',1);
      gymCircle(ctx,cx+twist*18,fy-58,10);
      gymLine(ctx,cx,fy-48,cx,fy,'#f0f0f5',3);
      const lky=fy-18+Math.sin(t*Math.PI*4)*20;
      const rky=fy-18-Math.sin(t*Math.PI*4)*20;
      gymLine(ctx,cx-10,fy,cx-20,lky,'#f0f0f5',2.5); gymLine(ctx,cx-20,lky,cx-15,lky+24,'#f0f0f5',2.5);
      gymLine(ctx,cx+10,fy,cx+20,rky,'#f0f0f5',2.5); gymLine(ctx,cx+20,rky,cx+15,rky+24,'#f0f0f5',2.5);
      const ey=fy-36;
      gymLine(ctx,cx-14,fy-46,cx-24+twist*18,ey,'#9090a8',2.5);
      gymLine(ctx,cx+14,fy-46,cx+24+twist*18,ey,'#9090a8',2.5);
      return Math.floor(t*2)%2===0?'TWIST LEFT':'TWIST RIGHT';
    }
  },
  legraise:{
    label:'Leg Raise',
    draw(ctx,t,w,h){
      const ph=Math.floor(t*3)%3, p=(t*3)%1;
      const raise=ph===0?p:ph===1?1:1-p;
      ctx.clearRect(0,0,w,h);
      const cx=w/2,fy=h*0.65;
      gymLine(ctx,cx-82,fy,cx+82,fy,'#5a5a72',1);
      gymCircle(ctx,cx,fy-52,10);
      gymLine(ctx,cx,fy-42,cx,fy-4,'#f0f0f5',3);
      gymLine(ctx,cx-20,fy-22,cx-30,fy,'#9090a8',2.5);
      gymLine(ctx,cx+20,fy-22,cx+30,fy,'#9090a8',2.5);
      const ang=raise*(Math.PI*0.48);
      const lx=cx-12+Math.cos(Math.PI+ang)*52, ly=fy-4-Math.sin(ang)*52;
      const rx=cx+12+Math.cos(Math.PI+ang)*52, ry=fy-4-Math.sin(ang)*52;
      gymLine(ctx,cx-12,fy-4,lx+5,ly,'#f0f0f5',2.5);
      gymLine(ctx,cx+12,fy-4,rx-5,ry,'#f0f0f5',2.5);
      return ['RAISE','HOLD','LOWER'][ph];
    }
  }
};

// ── Build and run exercise cards ──────────────────────────────
function buildGymExCards(dayKey) {
  const containerId = 'gymEx' + dayKey.charAt(0).toUpperCase() + dayKey.slice(1);
  const container = document.getElementById(containerId);
  if (!container || container.dataset.built) return;
  container.dataset.built = '1';
  const exList = gymExerciseData[dayKey];
  container.innerHTML = exList.map((ex, i) => {
    const idx = dayKey + '_' + i;
    return `<div class="gym-ex-card" id="gymExCard_${idx}" data-anim="${ex.anim}" data-idx="${idx}">
      <div class="gym-ex-header" onclick="gymToggleEx('${idx}')">
        <div class="gym-ex-thumb"><canvas id="gymThumb_${idx}" width="52" height="52"></canvas></div>
        <div class="gym-ex-info">
          <div class="gym-ex-name">${ex.name}</div>
          <div class="gym-ex-meta">${ex.meta}</div>
        </div>
        <div class="gym-ex-sets">${ex.sets}</div>
        <div class="gym-ex-chev" id="gymChev_${idx}">▼</div>
      </div>
      <div class="gym-ex-body" id="gymExBody_${idx}">
        <div class="gym-ex-body-inner">
          <div class="gym-anim-box" id="gymAnimBox_${idx}">
            <canvas id="gymBigCanvas_${idx}" width="560" height="185" style="max-width:100%;height:auto"></canvas>
            <div class="gym-anim-phase" id="gymAnimPhase_${idx}">—</div>
            <div class="gym-anim-lbl">${ex.anim.toUpperCase()}</div>
          </div>
          <div style="margin-bottom:14px">
            <div class="gym-steps-hdr">HOW TO PERFORM</div>
            <ul class="gym-steps">
              ${ex.steps.map((s,si)=>`<li><div class="gym-step-num">${si+1}</div><div>${s}</div></li>`).join('')}
            </ul>
          </div>
          <div>
            <div class="gym-steps-hdr">COMMON MISTAKES</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              ${ex.mistakes.map(m=>`<span class="gym-mistake">⚠ ${m}</span>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
  // Start thumb animations
  exList.forEach((ex, i) => {
    const idx = dayKey + '_' + i;
    gymStartThumbAnim(idx, ex.anim);
  });
}

function gymStartThumbAnim(idx, animType) {
  const canvas = document.getElementById('gymThumb_' + idx);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const def = gymAnimDefs[animType] || gymAnimDefs.bench;
  let start = null;
  if (gymThumbTimers[idx]) cancelAnimationFrame(gymThumbTimers[idx]);
  function frame(ts) {
    if (!start) start = ts;
    const t = ((ts - start) % 3000) / 3000;
    ctx.clearRect(0,0,52,52);
    ctx.save(); ctx.scale(52/560, 52/185);
    def.draw(ctx, t, 560, 185);
    ctx.restore();
    gymThumbTimers[idx] = requestAnimationFrame(frame);
  }
  gymThumbTimers[idx] = requestAnimationFrame(frame);
}

function gymStartBigAnim(idx, animType) {
  const canvas = document.getElementById('gymBigCanvas_' + idx);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const def = gymAnimDefs[animType] || gymAnimDefs.bench;
  let start = null;
  if (gymAnimTimers[idx]) cancelAnimationFrame(gymAnimTimers[idx]);
  function frame(ts) {
    if (!start) start = ts;
    const t = ((ts - start) % 3000) / 3000;
    const phase = def.draw(ctx, t, 560, 185);
    const pel = document.getElementById('gymAnimPhase_' + idx);
    if (pel) pel.textContent = phase || '—';
    gymAnimTimers[idx] = requestAnimationFrame(frame);
  }
  gymAnimTimers[idx] = requestAnimationFrame(frame);
}

function gymToggleEx(idx) {
  const card = document.getElementById('gymExCard_' + idx);
  const body = document.getElementById('gymExBody_' + idx);
  const chev = document.getElementById('gymChev_' + idx);
  const isOpen = card.classList.contains('gym-ex-expanded');
  if (isOpen) {
    card.classList.remove('gym-ex-expanded');
    body.classList.remove('gym-ex-body-open');
    if (chev) chev.style.transform = '';
    if (gymAnimTimers[idx]) { cancelAnimationFrame(gymAnimTimers[idx]); delete gymAnimTimers[idx]; }
  } else {
    card.classList.add('gym-ex-expanded');
    body.classList.add('gym-ex-body-open');
    if (chev) chev.style.transform = 'rotate(180deg)';
    const animType = card.dataset.anim;
    setTimeout(() => gymStartBigAnim(idx, animType), 50);
  }
}

function gymSwitchDay(day) {
  ['push','pull','legs','cardio'].forEach(d => {
    const el = document.getElementById('gymEx' + d.charAt(0).toUpperCase() + d.slice(1));
    if (el) el.classList.toggle('hidden', d !== day);
  });
  document.querySelectorAll('#gymDayTabs .gym-tab').forEach((btn, i) => {
    btn.classList.toggle('gym-tab-active', ['push','pull','legs','cardio'][i] === day);
  });
  buildGymExCards(day);
}

// ── Tab switching ──────────────────────────────────────────────
function gymSwitchTab(tab) {
  document.querySelectorAll('.gym-section').forEach(s => {
    s.classList.remove('active');
    s.classList.remove('hidden');
  });
  const el = document.getElementById('gymtab-' + tab);
  if (el) { el.classList.remove('hidden'); el.classList.add('active'); }
  document.querySelectorAll('#gymTabs .gym-tab').forEach((btn, i) => {
    btn.classList.toggle('gym-tab-active', ['overview','schedule','exercises','nutrition','hiit','tips'][i] === tab);
  });
  if (tab === 'schedule') gymHighlightToday();
  if (tab === 'exercises') buildGymExCards('push');
}

function gymHighlightToday() {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const today = days[new Date().getDay()];
  document.querySelectorAll('.gym-sched-row').forEach(r => r.classList.remove('gym-sched-today'));
  const el = document.getElementById('gym-' + today);
  if (el) el.classList.add('gym-sched-today');
}

// ── Progress tracker ──────────────────────────────────────────
function gymUpdateProgress() {
  const val = parseFloat(document.getElementById('gymCurrentWeight').value);
  const msg = document.getElementById('gymProgressMsg');
  if (isNaN(val) || val < 50 || val > 160) { msg.textContent = 'Please enter a valid weight (50–160 kg)'; return; }
  const lost = Math.max(0, 102 - val);
  const pct = Math.min(100, (lost / 22) * 100);
  document.getElementById('gymWeightBar').style.width = pct + '%';
  document.getElementById('gymProgressLost').textContent = lost.toFixed(1) + ' kg lost';
  if (val <= 80) {
    msg.style.color = 'var(--green)';
    msg.textContent = '🎉 Goal achieved! Incredible work, Atif!';
  } else {
    const remaining = (val - 80).toFixed(1);
    const weeks = Math.ceil((val - 80) / 0.85);
    msg.style.color = 'var(--text2)';
    msg.textContent = `${remaining} kg to goal · ~${weeks} weeks at current pace`;
  }
}

// ── HIIT Timer ─────────────────────────────────────────────────
let gymHiitInterval = null, gymHiitRunning = false;
let gymHiitPhaseIdx = 0, gymHiitSecsLeft = 180;
const gymHiitPhases = [
  { name:'WARMUP', dur:180, color:'var(--blue)', msg:'Easy pace warmup — get blood flowing' },
  ...Array.from({length:14}, (_,i) => i%2===0
    ? { name:'SPRINT!', dur:30, color:'var(--coral)', msg:'MAX EFFORT — push to 85–95% max HR!' }
    : { name:'RECOVER', dur:30, color:'var(--green)', msg:'Active recovery — keep moving, catch breath' }
  ),
  { name:'COOLDOWN', dur:180, color:'var(--blue)', msg:'Easy cooldown pace' }
];

function gymUpdateHIITDisplay() {
  const p = gymHiitPhases[gymHiitPhaseIdx] || gymHiitPhases[gymHiitPhases.length-1];
  const m = Math.floor(gymHiitSecsLeft/60).toString().padStart(2,'0');
  const s = (gymHiitSecsLeft%60).toString().padStart(2,'0');
  const timeEl = document.getElementById('gymHiitTime');
  const phaseEl = document.getElementById('gymHiitPhase');
  const barEl = document.getElementById('gymHiitBar');
  const roundEl = document.getElementById('gymHiitRound');
  const statusEl = document.getElementById('gymHiitStatus');
  if (timeEl) timeEl.textContent = m+':'+s;
  if (phaseEl) { phaseEl.textContent = p.name; phaseEl.style.color = p.color; }
  if (barEl) { barEl.style.width = ((gymHiitSecsLeft/p.dur)*100)+'%'; barEl.style.background = p.color; }
  if (roundEl) roundEl.textContent = Math.min(14, gymHiitPhaseIdx >= 1 ? Math.ceil((gymHiitPhaseIdx)/2) : 0);
  if (statusEl) statusEl.textContent = p.msg;
}

function gymToggleHIIT() {
  const btn = document.getElementById('gymHiitToggle');
  if (gymHiitRunning) {
    clearInterval(gymHiitInterval); gymHiitRunning = false;
    if (btn) btn.textContent = '▶ Resume';
  } else {
    gymHiitRunning = true;
    if (btn) btn.textContent = '⏸ Pause';
    gymHiitInterval = setInterval(() => {
      gymHiitSecsLeft--;
      if (gymHiitSecsLeft <= 0) {
        gymHiitPhaseIdx++;
        if (gymHiitPhaseIdx >= gymHiitPhases.length) {
          clearInterval(gymHiitInterval); gymHiitRunning = false;
          const b = document.getElementById('gymHiitToggle');
          if (b) b.textContent = '✓ Done!';
          return;
        }
        gymHiitSecsLeft = gymHiitPhases[gymHiitPhaseIdx].dur;
        if (navigator.vibrate) navigator.vibrate(200);
      }
      gymUpdateHIITDisplay();
    }, 1000);
  }
}

function gymResetHIIT() {
  clearInterval(gymHiitInterval); gymHiitRunning = false;
  gymHiitPhaseIdx = 0; gymHiitSecsLeft = 180;
  const b = document.getElementById('gymHiitToggle');
  if (b) b.textContent = '▶ Start';
  gymUpdateHIITDisplay();
}

function initGymJS() {
  gymHighlightToday();
  buildGymExCards('push');
  gymUpdateHIITDisplay();
}

window.gymSwitchTab = gymSwitchTab;
window.gymSwitchDay = gymSwitchDay;
window.gymToggleEx = gymToggleEx;
window.gymUpdateProgress = gymUpdateProgress;
window.gymToggleHIIT = gymToggleHIIT;
window.gymResetHIIT = gymResetHIIT;
