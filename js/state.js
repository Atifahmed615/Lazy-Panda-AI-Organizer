// ══════════════════════════════════════════════
//  state.js — Data store, state helpers, utilities
//  Load order: 1st (no dependencies)
// ══════════════════════════════════════════════

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
const HABIT_COLOR_PRESETS = ['#7c6ff7', '#34d399', '#60a5fa', '#fbbf24', '#f87171', '#a78bfa', '#22d3ee', '#fb923c'];
let uploadedDocs = [];
let lastOptimizerResult = null;

function defaultEvents() {
  return [];
}

function defaultHabits() {
  return [];
}

function defaultTasks() {
  return [];
}

// ══════════════════════════════════════════════
//  FEATURE FLAGS
//  Every in-progress feature lives behind a flag. Default off.
//  Toggle in Settings → Labs, or via console: state.flags.X = true; saveState();
// ══════════════════════════════════════════════
function defaultFlags() {
  return {
    // Phase 1 — pure additive
    markdownNotes: false,    // render event notes as markdown
    energyTags: false,       // energy field on events + picker
    taskDuration: false,     // estMinutes field on tasks + picker
    pomodoroStats: false,    // log focus sessions + weekly stat card
    // Phase 2 — new views
    eisenhower: false,       // 2x2 priority/urgency matrix view
    flashcards: false,       // SM-2 spaced repetition module
    // Phase 3 — dashboard surface
    nlQuickAdd: false,       // natural-language quick-add bar
    onboarding: false,       // first-run guided tour
    weeklyReview: false,     // Sunday-evening AI recap
    // Phase 4 — calendar interactions
    dragReschedule: false,   // drag events on the week grid
    taskCalendarDrag: false, // drag tasks onto free slots
    autoScheduler: false,    // AI auto-place tasks across the week
    // Phase 5 — infra / cross-cutting
    icalSubscribe: false,    // live .ics subscribe URL
    privacyLock: false,      // PIN/WebAuthn on app boot
  };
}

let state = { events: [], tasks: [], habits: [], attendance: [], grades: [], apiKey: '', theme: 'dark', accent: '#7c6ff7', currentView: DEFAULT_VIEW, showFreeTime: true, weeklyHourLimit: 100, travelBufferMins: 10, aiRecentActions: [], customReminders: [], hideGcalPromo: false, userName: 'Boss', aiPersonality: 'Sassy', flags: defaultFlags(), focusLog: [], flashcards: [], onboardingDone: false };

// Undo/Redo stacks for destructive actions
let undoStack = [];
let redoStack = [];
const MAX_UNDO_ENTRIES = 20;

// ══════════════════════════════════════════════
//  SCHEMA MIGRATIONS
//  Single source of truth for default values on legacy records.
//  When a new phase adds a field, add it here so old data stays valid.
//  Each function is idempotent — safe to call repeatedly on the same record.
// ══════════════════════════════════════════════
function migrateEvent(ev) {
  if (!ev || typeof ev !== 'object') return ev;
  if (!ev.recurringEndDate) ev.recurringEndDate = '';
  if (!ev.color) ev.color = '';
  if (typeof ev.notes !== 'string') ev.notes = '';
  if (ev.energy === undefined) ev.energy = null;           // Phase 1: high|medium|low|null
  if (ev.taskId === undefined) ev.taskId = '';             // Phase 4: link back to task
  if (typeof ev.gcalEventId !== 'string') ev.gcalEventId = ev.gcalEventId || '';
  return ev;
}

function migrateTask(t) {
  if (!t || typeof t !== 'object') return t;
  if (!Array.isArray(t.subtasks)) t.subtasks = [];
  if (!t.recurring) t.recurring = 'none';
  if (t.recurringDay === undefined) t.recurringDay = new Date((t.due || todayStr()) + 'T12:00:00').getDay();
  if (!Array.isArray(t.doneDates)) t.doneDates = [];
  if (t.estMinutes === undefined) t.estMinutes = null;     // Phase 1: rough duration estimate
  return t;
}

function migrateHabit(h) {
  if (!h || typeof h !== 'object') return h;
  if (!h.id) h.id = 'h' + Date.now() + Math.random().toString(36).slice(2);
  if (!h.type) h.type = 'checkoff';
  if (!h.frequency) h.frequency = 'daily';
  if (h.target == null) h.target = h.type === 'counter' ? 1 : 1;
  if (!h.unit) h.unit = '';
  if (!h.color) h.color = HABIT_COLOR_PRESETS[0];
  if (!h.emoji) h.emoji = '⭐';
  if (!Array.isArray(h.weekdays)) h.weekdays = [0,1,2,3,4,5,6];
  if (h.weeklyTarget == null) h.weeklyTarget = h.frequency === 'daily' ? 7 : (h.weekdays.length || 7);
  if (!h.createdAt) h.createdAt = todayStr();
  if (!h.completions || typeof h.completions !== 'object') h.completions = {};
  if (typeof h.reminderTime !== 'string') h.reminderTime = '';
  if (h.archived === undefined) h.archived = false;
  return h;
}

// Top-level state migration: defaults for new top-level keys.
function migrateState(s) {
  if (!s || typeof s !== 'object') return s;
  if (!s.flags || typeof s.flags !== 'object') s.flags = defaultFlags();
  else s.flags = { ...defaultFlags(), ...s.flags };       // merge in any newly-introduced flags
  if (!Array.isArray(s.focusLog)) s.focusLog = [];        // Phase 1
  if (!Array.isArray(s.flashcards)) s.flashcards = [];    // Phase 2
  if (typeof s.onboardingDone !== 'boolean') s.onboardingDone = false;
  if (typeof s.icalToken !== 'string') s.icalToken = '';   // Phase 5: lazily generated when subscription used
  if (typeof s.privacyLockEnabled !== 'boolean') s.privacyLockEnabled = false; // Phase 5
  if (typeof s.privacyLockHash !== 'string') s.privacyLockHash = '';
  return s;
}

function loadState() {
  try {
    const saved = localStorage.getItem(STATE_STORAGE_KEY);
    if (saved) {
      state = { ...state, ...JSON.parse(saved) };
      if (!Array.isArray(state.events)) state.events = [];
      if (!Array.isArray(state.tasks)) state.tasks = [];
      // Migration: remove duplicate events.
      // Sort: recurring events first (they are the canonical source of truth).
      // Then remove any event — regardless of title — that shares start+end with a
      // recurring event and has recurring:'none'. This catches AI-added one-offs like
      // "CS5137 Machine Learning" that duplicate a recurring "Machine Learning" entry.
      // Finally, deduplicate remaining events by exact title+start+end.
      const _beforeDedup = state.events.length;
      const _recurringRank = r => (r && r !== 'none') ? 0 : 1;
      state.events.sort((a, b) => _recurringRank(a.recurring) - _recurringRank(b.recurring));
      // Build set of start|end times covered by recurring events
      const _recurringSlots = new Set(
        state.events
          .filter(ev => ev.recurring && ev.recurring !== 'none')
          .map(ev => `${ev.start}|${ev.end}`)
      );
      // Remove one-off events at the same time slot as a recurring event
      state.events = state.events.filter(ev => {
        if ((!ev.recurring || ev.recurring === 'none') && _recurringSlots.has(`${ev.start}|${ev.end}`)) return false;
        return true;
      });
      // Deduplicate remaining events by title+start+end
      const _dedupSeen = new Set();
      state.events = state.events.filter(ev => {
        const key = `${ev.title.trim().toLowerCase()}|${ev.start}|${ev.end}`;
        if (_dedupSeen.has(key)) return false;
        _dedupSeen.add(key);
        return true;
      });
      // Persist cleaned state immediately
      if (state.events.length !== _beforeDedup) {
        try { localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(state)); } catch(e) {}
      }
    } else {
      state.events = defaultEvents();
      state.tasks = defaultTasks();
      state.habits = defaultHabits();
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
    if (!state.weeklyHourLimit) state.weeklyHourLimit = 100;
    if (state.travelBufferMins === undefined) state.travelBufferMins = 10;
    if (!Array.isArray(state.aiRecentActions)) state.aiRecentActions = [];
    if (!Array.isArray(state.customReminders)) state.customReminders = [];
    if (state.hideGcalPromo === undefined) state.hideGcalPromo = false;
    // Used by js/proactive.js — list of event ids the user marked complete,
    // and list of missed-event ids whose reschedule prompt was dismissed.
    if (!Array.isArray(state.completedEvents)) state.completedEvents = [];
    if (!Array.isArray(state.dismissedMissedEvents)) state.dismissedMissedEvents = [];
    // Prune fired reminders older than today
    state.customReminders = state.customReminders.filter(r => !r.fired || r.date >= todayStr());
    // Centralized schema migration — each record gets its default fields filled in.
    migrateState(state);
    state.events.forEach(migrateEvent);
    state.tasks.forEach(migrateTask);
    if (!Array.isArray(state.habits)) state.habits = [];
    state.habits.forEach(migrateHabit);
    document.documentElement.setAttribute('data-theme', state.theme || 'dark');
    if (state.accent) document.documentElement.style.setProperty('--accent', state.accent);
    const statusEl = document.getElementById('api-status-sidebar');
    if (statusEl) {
      statusEl.textContent = state.apiKey ? '⬤ Connected' : '⬤ No key';
      statusEl.style.color = state.apiKey ? 'var(--green)' : 'var(--coral)';
    }
  } catch(e) { state.events = defaultEvents(); state.tasks = defaultTasks(); state.habits = defaultHabits(); state.attendance = []; state.grades = []; state.theme = 'dark'; state.accent = '#7c6ff7'; }
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
  
  // Invalidate caches
  calendarCache = {};
  _conflictCache = null;

  // Auto-sync full state to Firestore (debounced).
  if (typeof autoSyncToCloud === 'function') autoSyncToCloud();
  // Also mirror today's compact schedule snapshot so the scheduled
  // Cloud Function (functions/index.js) sees the latest tasks/habits/events
  // and pushes accurate notifications. Without this, the mirror would be
  // stale within minutes of any edit.
  if (typeof autoMirrorScheduleToFcm === 'function') autoMirrorScheduleToFcm();
}

function resetData() {
  if (!confirm('Reset everything? All data will be lost.')) return;
  // Clear all data and settings
  state.events = [];
  state.tasks = [];
  state.habits = [];
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
  state.weeklyHourLimit = 100;
  state.travelBufferMins = 10;
  state.aiRecentActions = [];
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

// Minimal, safe markdown → HTML. Operates on already-escaped text so it's XSS-safe by construction.
// Handles: headings (# ## ###), bold **x**, italic *x*, inline `code`, lists (- or 1.), links [t](u), paragraphs.
// Anything beyond this falls back to a paragraph.
function renderMarkdown(src) {
  if (!src) return '';
  let s = esc(src);
  // Headings (process line-by-line to avoid interfering with inline syntax)
  s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  s = s.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  s = s.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // Lists
  s = s.replace(/(^|\n)([-*] .+(?:\n[-*] .+)*)/g, (_, prefix, block) => {
    const items = block.split('\n').map(l => l.replace(/^[-*] /, '')).map(t => `<li>${t}</li>`).join('');
    return prefix + `<ul>${items}</ul>`;
  });
  s = s.replace(/(^|\n)(\d+\. .+(?:\n\d+\. .+)*)/g, (_, prefix, block) => {
    const items = block.split('\n').map(l => l.replace(/^\d+\. /, '')).map(t => `<li>${t}</li>`).join('');
    return prefix + `<ol>${items}</ol>`;
  });
  // Inline: bold, italic, code, links
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Links — only http/https/mailto are kept; everything else is dropped.
  s = s.replace(/\[([^\]]+)\]\(((?:https?:|mailto:)[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // Paragraphs from blank lines
  const blocks = s.split(/\n{2,}/).map(b => {
    if (/^\s*<(h[1-3]|ul|ol|p)/.test(b)) return b;
    return `<p>${b.replace(/\n/g, '<br>')}</p>`;
  });
  return blocks.join('');
}
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
      // Skip exact duplicates (same title + same time = duplicate data, not a real conflict)
      if (a.title.trim().toLowerCase() === b.title.trim().toLowerCase() && a.start === b.start && a.end === b.end) continue;
      const buf = Number(state.travelBufferMins) || 0;
      const aStart = timeMins(a.start), aEnd = timeMins(a.end) + buf;
      const bStart = timeMins(b.start), bEnd = timeMins(b.end) + buf;
      if (aStart < bEnd && bStart < aEnd) {
        conflicts.push({ a, b });
      }
    }
  }
  return conflicts;
}

// ══════════════════════════════════════════════
//  HABIT HELPERS
// ══════════════════════════════════════════════

// Returns numeric progress for a habit on a given date.
// Checkoff: 0 or 1. Counter: any non-negative integer.
function getHabitProgress(habit, dateStr) {
  if (!habit || !habit.completions) return 0;
  const v = habit.completions[dateStr];
  if (typeof v === 'number') return v;
  if (v === true) return 1;
  return 0;
}

// Habit's daily target (1 for checkoff, habit.target for counter)
function getHabitDailyTarget(habit) {
  if (!habit) return 1;
  if (habit.type === 'counter') return Math.max(1, Number(habit.target) || 1);
  return 1;
}

function isHabitDoneForDate(habit, dateStr) {
  return getHabitProgress(habit, dateStr) >= getHabitDailyTarget(habit);
}

// Whether this habit is expected (scheduled) on the given weekday.
// Daily → every day. Weekly → on the configured weekdays. Otherwise → every day.
function isHabitScheduledOnDay(habit, dateString) {
  const dow = new Date(dateString + 'T12:00:00').getDay();
  if (habit.frequency === 'daily') return true;
  if (habit.frequency === 'weekly') {
    if (Array.isArray(habit.weekdays) && habit.weekdays.length) return habit.weekdays.includes(dow);
    return true;
  }
  return true;
}

// Streak counts back from today (or yesterday if today isn't done yet)
// over all scheduled days. A scheduled day that wasn't met breaks the streak.
// Unscheduled days are skipped and do NOT break the streak.
function getHabitStreak(habit) {
  if (!habit) return 0;
  let streak = 0;
  const today = new Date();
  const todayStrVal = todayStr();
  const startedToday = isHabitDoneForDate(habit, todayStrVal);
  // If today is scheduled but not yet done, start counting from yesterday so
  // an in-progress day doesn't drop the streak to 0 mid-day.
  const startOffset = startedToday ? 0 : (isHabitScheduledOnDay(habit, todayStrVal) ? 1 : 0);
  for (let i = startOffset; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const ds = dateStr(d);
    if (ds < habit.createdAt) break;
    if (!isHabitScheduledOnDay(habit, ds)) continue;
    if (isHabitDoneForDate(habit, ds)) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

function getHabitLongestStreak(habit) {
  if (!habit || !habit.completions) return 0;
  const keys = Object.keys(habit.completions).filter(k => isHabitDoneForDate(habit, k)).sort();
  if (!keys.length) return 0;
  let longest = 0, current = 0;
  let prev = null;
  // Walk every day from earliest completion to today; scheduled-but-missed days break the streak.
  const start = new Date(keys[0] + 'T12:00:00');
  const end = new Date();
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const ds = dateStr(d);
    if (!isHabitScheduledOnDay(habit, ds)) continue;
    if (isHabitDoneForDate(habit, ds)) {
      current++;
      if (current > longest) longest = current;
    } else {
      current = 0;
    }
  }
  return longest;
}

// How many scheduled days this week the user actually completed (Sun → Sat).
function getHabitWeekProgress(habit) {
  const week = getWeekBounds();
  let done = 0, scheduled = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(week.start);
    d.setDate(week.start.getDate() + i);
    const ds = dateStr(d);
    if (!isHabitScheduledOnDay(habit, ds)) continue;
    scheduled++;
    if (isHabitDoneForDate(habit, ds)) done++;
  }
  return { done, scheduled };
}

// Average completion rate over the last N days (0..1). Excludes unscheduled days.
function getHabitCompletionRate(habit, days = 30) {
  let done = 0, scheduled = 0;
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const ds = dateStr(d);
    if (ds < habit.createdAt) continue;
    if (!isHabitScheduledOnDay(habit, ds)) continue;
    scheduled++;
    if (isHabitDoneForDate(habit, ds)) done++;
  }
  return scheduled ? done / scheduled : 0;
}

let _conflictCache = null;
let _conflictCacheKey = '';

function detectAllConflicts() {
  // Cache key: event count + travel buffer + concatenated event ids (fast proxy for state change)
  const key = `${state.events.length}|${state.travelBufferMins}|${state.events.map(e=>e.id+e.start+e.end).join(',')}`;
  if (_conflictCache !== null && _conflictCacheKey === key) return _conflictCache;

  const results = [];
  const now = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const ds = d.toISOString().split('T')[0];
    const found = detectConflicts(ds, d.getDay());
    found.forEach(c => results.push({ date: ds, ...c }));
  }
  _conflictCache = results;
  _conflictCacheKey = key;
  return results;
}
