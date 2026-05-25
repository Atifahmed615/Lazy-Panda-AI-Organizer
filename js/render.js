// ══════════════════════════════════════════════
//  render.js — All DOM rendering functions
//  Load order: 2nd (depends on state.js)
// ══════════════════════════════════════════════

// ══════════════════════════════════════════════
//  EMPTY STATE ILLUSTRATIONS
// ══════════════════════════════════════════════

const _PANDA_SLEEP = `<img src="panda.svg" width="72" height="72" aria-hidden="true">`;

const _PANDA_PARTY = `<div style="position:relative;display:inline-block;"><img src="panda.svg" width="72" height="72" aria-hidden="true"><div style="position:absolute;top:-15px;right:-10px;font-size:24px;">✨</div></div>`;

const _PANDA_THINK = `<img src="panda.svg" width="72" height="72" aria-hidden="true">`;

const _PANDA_WAVE = `<img src="panda.svg" width="72" height="72" aria-hidden="true">`;

function emptyState(type) {
  const configs = {
    schedule:  { art: _PANDA_SLEEP, title: 'Nothing scheduled today',  sub: 'Enjoy the free time, or add an event.', action: "showAddModal()", actionLabel: '+ Add event' },
    upcoming:  { art: _PANDA_WAVE,  title: 'No upcoming events',        sub: 'Your week is wide open.' },
    tasks:     { art: _PANDA_PARTY, title: 'All done!',                 sub: 'No tasks for today. You crushed it.' },
    tasklist:  { art: _PANDA_THINK, title: 'Nothing upcoming',          sub: 'Add a task to get started.', action: "showAddTaskModal()", actionLabel: '+ Add task' },
    events:    { art: _PANDA_SLEEP, title: 'No events yet',             sub: 'Add your classes and appointments.', action: "showAddModal()", actionLabel: '+ Add event' },
    alltasks:  { art: _PANDA_THINK, title: 'No tasks yet',              sub: 'Break your goals into tasks.', action: "showAddTaskModal()", actionLabel: '+ Add task' },
    deadlines: { art: _PANDA_WAVE,  title: 'No deadlines!',             sub: 'You\'re ahead of schedule. Keep it up.' },
    habits:    { art: _PANDA_THINK, title: 'No habits yet',             sub: 'Build a streak — start with one habit you want to do daily.', action: "showAddHabitModal()", actionLabel: '+ Add habit' },
    habitsToday:{ art: _PANDA_PARTY, title: 'All habits done!',          sub: 'You hit every habit today. Streaks intact.' },
  };
  const c = configs[type] || configs.schedule;
  return `<div class="empty-state">
    <div class="empty-state-art">${c.art}</div>
    <div class="empty-state-title">${c.title}</div>
    <div class="empty-state-sub">${c.sub}</div>
    ${c.action ? `<button class="empty-state-action" onclick="${c.action}">${c.actionLabel}</button>` : ''}
  </div>`;
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
  safeRender(renderHabitsWidget,   'habitsWidget');
  safeRender(renderConflictBanner, 'conflictBanner');
  safeRender(renderGCalBanner,     'gcalBanner');
  safeRender(updateBadge,          'badge');
  safeRender(updateHabitBadge,     'habitBadge');

  // Only re-render views that are currently visible — avoids wasted work on hidden panels
  if (isViewVisible('schedule'))   safeRender(renderCalendar,           'calendar');
  if (isViewVisible('schedule') || isViewVisible('dashboard'))
                                   safeRender(renderAllEvents,          'allEvents');
  if (isViewVisible('tasks'))      safeRender(renderAllTasks,           'allTasks');
  if (isViewVisible('deadlines'))  safeRender(renderDeadlines,          'deadlines');
  if (isViewVisible('stats'))      safeRender(renderStats,              'stats');
  if (isViewVisible('habits'))     safeRender(renderHabits,             'habits');
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
    el.innerHTML = emptyState('schedule'); return;
  }
  const now = nowMins();
  el.innerHTML = evs.map((ev, i) => {
    const cat = CAT_COLORS[ev.category] || CAT_COLORS.other;
    const evColor = getEventColor(ev);
    const past = timeMins(ev.end) < now;
    const active = timeMins(ev.start) <= now && timeMins(ev.end) > now;
    const borderColor = getPriorityBorderColor(ev);
    return `<div class="timeline-item priority-stripe" data-id="${esc(ev.id)}" data-type="event" role="button" tabindex="0" aria-label="${esc(ev.title)}, ${fmt12(ev.start)} to ${fmt12(ev.end)}${ev.location ? ', Location: ' + ev.location : ''}${active ? ', currently in progress' : ''}${past ? ', completed' : ''}" onclick="editEvent('${esc(ev.id)}')" onkeydown="if(event.key==='Enter' || event.key===' ') { event.preventDefault(); editEvent('${esc(ev.id)}'); }" style="--i:${i};--priority-stripe-color:${borderColor};${past?'opacity:0.45':''}${active?';background:var(--surface2);border-color:var(--border2)':''}">
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

  const renderTask = (t, i) => `<div class="task-item" data-id="${esc(t.id)}" data-type="task" style="--i:${i}">
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

  todayEl.innerHTML = todayTasks.length ? todayTasks.map(renderTask).join('') : emptyState('tasks');
  upcomingEl.innerHTML = upcomingTasks.length ? upcomingTasks.map(renderTask).join('') : emptyState('tasklist');
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
function renderAllEvents() {
  const el = document.getElementById('all-events-list');
  if (!el) return;
  const evs = getAllEvents();
  if (!evs.length) { el.innerHTML = emptyState('events'); return; }
  el.innerHTML = evs.map((ev, i) => {
    const cat = CAT_COLORS[ev.category] || CAT_COLORS.other;
    const evColor = getEventColor(ev);
    return `<div class="timeline-item" data-id="${esc(ev.id)}" data-type="event" style="--i:${i}" role="button" tabindex="0" aria-label="${esc(ev.title)}, ${esc(ev.date)}, ${fmt12(ev.start)} to ${fmt12(ev.end)}${ev.location ? ', Location: ' + ev.location : ''}" onclick="editEvent('${esc(ev.id)}')" onkeydown="if(event.key==='Enter' || event.key===' ') { event.preventDefault(); editEvent('${esc(ev.id)}'); }">
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
  }).join('');
}

function renderAllTasks() {
  const el = document.getElementById('all-tasks-list');
  if (!el) return;
  const tasks = [...state.tasks].sort((a,b)=>{
    if(isTaskComplete(a)!==isTaskComplete(b)) return isTaskComplete(a)?1:-1;
    return a.due.localeCompare(b.due);
  });
  const today = todayStr();
  if (!tasks.length) { el.innerHTML = emptyState('alltasks'); return; }
  el.innerHTML = tasks.map((t, i) => `<div class="task-item" data-id="${esc(t.id)}" data-type="task" style="--i:${i};border-bottom:1px solid var(--border);padding:10px 0;">
    <div class="task-check${isTaskDoneForDate(t, today)?' done':''}" role="checkbox" tabindex="0" aria-checked="${isTaskComplete(t)}" aria-label="Mark '${esc(t.name)}' as ${isTaskComplete(t) ? 'incomplete' : 'complete'}" onclick="toggleTask('${esc(t.id)}', '${today}')" onkeydown="if(event.key==='Enter' || event.key===' ') { event.preventDefault(); toggleTask('${esc(t.id)}', '${today}'); }"></div>
    <div class="task-text">
      <div class="task-name${isTaskComplete(t)?' done':''}">${esc(t.name)}${renderSubtaskProgress(t)}</div>
      ${renderSubtasks(t)}
      <div class="task-due">Due: ${esc(t.due)} • ${esc(t.priority)} priority</div>
    </div>
    <div class="priority-dot" style="background:${PRIORITY_COLORS[t.priority]||'#9090a8'}"></div>
    <span onclick="deleteTask('${esc(t.id)}')" style="font-size:14px;color:var(--text3);cursor:pointer;margin-left:8px;padding:4px;" role="button" tabindex="0" aria-label="Delete task '${esc(t.name)}'" onkeydown="if(event.key==='Enter' || event.key===' ') { event.preventDefault(); deleteTask('${esc(t.id)}'); }">🗑️</span>
  </div>`).join('');
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
const views = ['dashboard','schedule','tasks','deadlines','focus','habits','settings','stats','shared'];
function showView(v, options) {
  const opts = options || {};
  if (!isValidView(v)) v = DEFAULT_VIEW;

  // Close drawer if it was open (drawer items: settings)
  closeMobileDrawer(false);
  closeChatOverlay(false);
  state.currentView = v;
  if (opts.persist !== false) saveState();
  
  // Set view visibility + trigger entrance animation
  views.forEach(id => {
    const el = document.getElementById('view-'+id);
    if (!el) return;
    el.classList.toggle('hidden', id !== v);
    if (id === v) {
      // Replay card-in animation by briefly removing no-anim, then adding it back
      el.classList.remove('no-anim');
      requestAnimationFrame(() => {
        // After one frame the animation plays; after cards settle, lock to no-anim
        setTimeout(() => el.classList.add('no-anim'), 600);
      });
    }
    const nav = document.getElementById('nav-'+id);
    if(nav) nav.classList.toggle('active', id===v);
    const mnav = document.getElementById('mnav-'+id);
    if(mnav) mnav.classList.toggle('active', id===v);
  });
  
  // Highlight "More" tab if viewing overflow items (Focus, Stats, Settings live in More drawer)
  const overflowViews = ['settings','stats','focus'];
  const mnavMore = document.getElementById('mnav-more');
  if(mnavMore) {
    mnavMore.classList.toggle('active', overflowViews.includes(v));
  }

  const titles = { dashboard:'Dashboard', schedule:'Schedule', tasks:'Tasks', deadlines:'Deadlines', focus:'Focus', habits:'Habits', settings:'Settings', stats:'Statistics' };
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
    const travelBufEl = document.getElementById('settings-travel-buffer');
    if(travelBufEl) travelBufEl.value = state.travelBufferMins ?? 10;
    updateNotifStatusUI();
    updateGCalUI();
    updateWAUI();
    updateAppVersionUI();
    if (typeof updateSupabaseUI === 'function') updateSupabaseUI();
  }
  if(v==='schedule') { requestAnimationFrame(() => { renderCalendar(); }); }
  if(v==='deadlines') renderDeadlines();
  if(v==='stats') renderStats();
  if(v==='habits') renderHabits();

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
  
  const dayCounts = [0,0,0,0,0,0,0]; // Sun-Sat
  
  // Weekly Schedule Hours & Heatmap
  for (let i = 0; i < 7; i++) {
    const d = new Date(week.start);
    d.setDate(d.getDate() + i);
    const evs = getEventsForDay(dateStr(d), d.getDay());
    dayCounts[d.getDay()] = evs.length;
    
    evs.forEach(ev => {
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
  const taskDash = (taskPct / 100) * 94.25;

  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const maxDay = Math.max(...dayCounts, 1);
  const busiestDay = dayNames[dayCounts.indexOf(Math.max(...dayCounts))];

  // Category breakdown multi-segment donut
  const totalCatMins = Object.values(catMins).reduce((a, b) => a + b, 0) || 1;
  let multiDonutHtml = '';
  let legendHtml = '';
  let offset = 0;
  
  const sortedCats = Object.entries(catMins).filter(([, m]) => m > 0).sort((a,b)=>b[1]-a[1]);
  if (sortedCats.length === 0) {
    multiDonutHtml = `<circle cx="18" cy="18" r="15" fill="none" stroke="var(--surface2)" stroke-width="6"></circle>`;
    legendHtml = `<div style="font-size:12px; color:var(--text3);">No events scheduled</div>`;
  } else {
    sortedCats.forEach(([cat, m]) => {
      const pct = m / totalCatMins;
      const dash = pct * 94.25;
      const color = (CAT_COLORS[cat] || CAT_COLORS.other).color;
      const gap = sortedCats.length > 1 ? 2 : 0;
      const visibleDash = Math.max(0, dash - gap);
      
      multiDonutHtml += `<circle cx="18" cy="18" r="15" fill="none" stroke="${color}" stroke-width="6"
          stroke-dasharray="${visibleDash} 94.25" stroke-dashoffset="${-offset}" stroke-linecap="round"></circle>`;
      offset += dash;
      
      const pctStr = Math.round(pct * 100);
      legendHtml += `<div style="display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text2);">
        <div style="width:10px; height:10px; border-radius:50%; background:${color};"></div>
        ${esc(cat)} (${pctStr}%)
      </div>`;
    });
  }

  el.innerHTML = `
    <!-- Top SVG Donut Charts -->
    <div class="stats-grid">
      <div class="stat-card" style="align-items:center; text-align:center; padding:20px 10px;">
        <div class="stat-label">Task Completion</div>
        <div style="position:relative; width:90px; height:90px; margin: 12px 0;">
          <svg width="90" height="90" viewBox="0 0 36 36" style="transform: rotate(-90deg);">
            <circle cx="18" cy="18" r="15" fill="none" stroke="var(--surface2)" stroke-width="6"></circle>
            <circle cx="18" cy="18" r="15" fill="none" stroke="var(--accent)" stroke-width="6" stroke-dasharray="${taskDash} 94.25" stroke-linecap="round"></circle>
          </svg>
          <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); font-size:18px; font-weight:bold; color:var(--text1);">${taskPct}%</div>
        </div>
        <div class="stat-sub">this month</div>
      </div>

      <div class="stat-card" style="align-items:center; text-align:center; padding:20px 10px;">
        <div class="stat-label">Time Breakdown</div>
        <div style="position:relative; width:90px; height:90px; margin: 12px 0;">
          <svg width="90" height="90" viewBox="0 0 36 36" style="transform: rotate(-90deg);">
            ${multiDonutHtml}
          </svg>
          <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); font-size:16px; font-weight:bold; color:var(--text1);">${Math.round(totalMins/60)}h</div>
        </div>
        <div class="stat-sub">scheduled this week</div>
      </div>
    </div>
    
    <!-- Legend for Time Category -->
    <div class="stat-card" style="margin-top:12px; display:flex; flex-direction:row; flex-wrap:wrap; gap:12px; justify-content:center; padding:12px;">
      ${legendHtml}
    </div>

    <!-- Secondary Numeric Stats -->
    <div class="stats-grid" style="margin-top:12px;">
      <div class="stat-card">
        <div class="stat-label">Busiest Day</div>
        <div class="stat-value">${busiestDay}</div>
        <div class="stat-sub">${Math.max(...dayCounts)} events this week</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Open Tasks</div>
        <div class="stat-value">${state.tasks.filter(t=>!isTaskComplete(t)).length}</div>
        <div class="stat-sub">remaining to do</div>
      </div>
    </div>

    <!-- Weekly Heatmap Bar Chart -->
    <div class="stat-card" style="margin-top:12px; padding:16px;">
      <div class="stat-label" style="text-align:center; margin-bottom:12px;">Activity Heatmap</div>
      <div style="display:flex; gap:8px; justify-content:space-between; align-items:flex-end; height:100px;">
        ${dayNames.map((d,i) => `
          <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:6px;">
            <div style="font-size:11px; color:var(--text3); font-weight:600;">${dayCounts[i]}</div>
            <div style="width:100%; max-width:24px; height:${Math.max(4, Math.round((dayCounts[i]/maxDay)*60))}px; background:var(--accent); border-radius:6px 6px 4px 4px; opacity:${0.3 + (dayCounts[i]/maxDay)*0.7};"></div>
            <div style="font-size:11px; color:var(--text2);">${d}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderConflictBanner() {
  const existing = document.querySelector('.conflict-banner');
  if (existing) existing.remove();
  const conflicts = detectConflicts();
  if (!conflicts.length) return;
  const banner = document.createElement('div');
  banner.className = 'conflict-banner';
  banner.innerHTML = `
  <div style="display:flex;align-items:center;gap:8px;">
    <span style="font-size:18px;">⚠️</span>
    <div>
      <div style="font-weight:600;font-size:13px;margin-bottom:4px;">${conflicts.length} Schedule Conflict${conflicts.length > 1 ? 's' : ''} Detected</div>
      ${conflicts.map(c => `<div style="font-size:12px;color:var(--text2);margin-top:2px;">
        <b>${esc(c.date)}</b>: &ldquo;${esc(c.a.title)}&rdquo; (${fmt12(c.a.start)}–${fmt12(c.a.end)}) overlaps with &ldquo;${esc(c.b.title)}&rdquo; (${fmt12(c.b.start)}–${fmt12(c.b.end)})
      </div>`).join('')}
    </div>
    <span onclick="this.parentElement.parentElement.remove()" style="cursor:pointer;color:var(--text3);margin-left:auto;padding:2px 6px;font-size:14px;">&#x2715;</span>
  </div>`;
  const dashboard = document.getElementById('view-dashboard');
  if (dashboard) dashboard.insertAdjacentElement('afterbegin', banner);
}

// ══════════════════════════════════════════════
//  HABITS VIEW
// ══════════════════════════════════════════════
function _habitsActive() {
  return (state.habits || []).filter(h => !h.archived);
}

function _habitsScheduledToday() {
  const today = todayStr();
  return _habitsActive().filter(h => isHabitScheduledOnDay(h, today));
}

function renderHabitsWidget() {
  const wrap = document.getElementById('habits-widget-wrap');
  if (!wrap) return;
  const scheduled = _habitsScheduledToday();
  if (!scheduled.length) { wrap.innerHTML = ''; return; }
  const today = todayStr();
  const done = scheduled.filter(h => isHabitDoneForDate(h, today)).length;
  const pct = scheduled.length ? Math.round((done / scheduled.length) * 100) : 0;
  const dash = (pct / 100) * 94.25;
  const topStreaks = _habitsActive()
    .map(h => ({ h: h, s: getHabitStreak(h) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3);

  wrap.innerHTML = `
    <div class="habits-dashboard-widget" onclick="showView('habits')" role="button" tabindex="0"
         onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();showView('habits');}">
      <div class="habits-dw-ring">
        <svg width="64" height="64" viewBox="0 0 36 36" style="transform: rotate(-90deg);">
          <circle cx="18" cy="18" r="15" fill="none" stroke="var(--surface2)" stroke-width="5"></circle>
          <circle cx="18" cy="18" r="15" fill="none" stroke="var(--accent)" stroke-width="5" stroke-dasharray="${dash} 94.25" stroke-linecap="round"></circle>
        </svg>
        <div class="habits-dw-ring-text">${done}/${scheduled.length}</div>
      </div>
      <div class="habits-dw-body">
        <div class="habits-dw-label">HABITS TODAY</div>
        <div class="habits-dw-title">${pct === 100 ? 'All habits done — nice. 🐼' : (scheduled.length - done) + ' habit' + (scheduled.length - done === 1 ? '' : 's') + ' left today'}</div>
        ${topStreaks.length ? `<div class="habits-dw-streaks">${topStreaks.map(x => `<span class="habits-dw-streak"><span style="color:${esc(x.h.color)};">${esc(x.h.emoji)}</span> ${esc(x.h.name)} · 🔥${x.s}</span>`).join('')}</div>` : ''}
      </div>
    </div>
  `;
}

function _habitDayGrid(habit, days) {
  if (!days) days = 60;
  const today = new Date();
  let html = '';
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const ds = dateStr(d);
    const scheduled = isHabitScheduledOnDay(habit, ds);
    const beforeStart = ds < habit.createdAt;
    const done = isHabitDoneForDate(habit, ds);
    const progress = getHabitProgress(habit, ds);
    const target = getHabitDailyTarget(habit);
    let cls = 'hb-cell';
    let style = '';
    let title = ds;
    if (beforeStart) {
      cls += ' hb-cell-empty';
      title += ' · before habit started';
    } else if (!scheduled) {
      cls += ' hb-cell-rest';
      title += ' · rest day';
    } else if (done) {
      cls += ' hb-cell-done';
      style = 'background:' + habit.color + ';';
      title += ' · done' + (habit.type === 'counter' ? ' (' + progress + '/' + target + ')' : '');
    } else if (progress > 0) {
      cls += ' hb-cell-partial';
      const pct = Math.min(1, progress / target);
      style = 'background:' + hexToRgba(habit.color, 0.25 + pct * 0.55) + ';';
      title += ' · partial (' + progress + '/' + target + ')';
    } else {
      cls += ' hb-cell-miss';
      title += ' · missed';
    }
    html += '<div class="' + cls + '" style="' + style + '" title="' + esc(title) + '"></div>';
  }
  return html;
}

function _habitTodayControl(habit) {
  const today = todayStr();
  const progress = getHabitProgress(habit, today);
  const target = getHabitDailyTarget(habit);
  const done = isHabitDoneForDate(habit, today);

  if (habit.type === 'counter') {
    return `
      <div class="hb-counter">
        <button class="hb-counter-btn" onclick="event.stopPropagation();decrementHabit('${esc(habit.id)}')" aria-label="Decrease">−</button>
        <div class="hb-counter-val${done ? ' done' : ''}">
          <div class="hb-counter-num">${progress}<span class="hb-counter-target">/${target}</span></div>
          ${habit.unit ? `<div class="hb-counter-unit">${esc(habit.unit)}</div>` : ''}
        </div>
        <button class="hb-counter-btn primary" style="background:${esc(habit.color)};" onclick="event.stopPropagation();incrementHabit('${esc(habit.id)}')" aria-label="Increase">+</button>
      </div>
    `;
  }
  return `
    <button class="hb-check${done ? ' done' : ''}" style="${done ? 'background:' + esc(habit.color) + ';border-color:' + esc(habit.color) + ';' : 'border-color:' + esc(habit.color) + ';'}"
            onclick="event.stopPropagation();toggleHabitDone('${esc(habit.id)}')"
            aria-label="Mark '${esc(habit.name)}' ${done ? 'incomplete' : 'complete'}" aria-pressed="${done}">
      ${done ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
    </button>
  `;
}

function renderHabits() {
  const todayWrap = document.getElementById('habits-today-wrap');
  const allWrap = document.getElementById('habits-all-wrap');
  if (!todayWrap || !allWrap) return;
  const active = _habitsActive();
  if (!active.length) {
    todayWrap.innerHTML = emptyState('habits');
    allWrap.innerHTML = '';
    return;
  }
  const scheduled = _habitsScheduledToday();

  if (scheduled.length) {
    todayWrap.innerHTML = `<div class="habits-today-card">
      <div class="habits-today-list">
        ${scheduled.map((h, i) => {
          const week = getHabitWeekProgress(h);
          const streak = getHabitStreak(h);
          return `<div class="hb-today-row" style="--i:${i};" data-id="${esc(h.id)}" onclick="editHabit('${esc(h.id)}')">
            <div class="hb-today-icon" style="background:${hexToRgba(h.color, 0.18)};color:${esc(h.color)};">${esc(h.emoji)}</div>
            <div class="hb-today-info">
              <div class="hb-today-name">${esc(h.name)}</div>
              <div class="hb-today-meta">
                <span>🔥 ${streak} day${streak === 1 ? '' : 's'}</span>
                <span>·</span>
                <span>${week.done}/${week.scheduled} this week</span>
                ${h.frequency === 'weekly' ? `<span>·</span><span>${h.weekdays.length}×/wk</span>` : ''}
              </div>
            </div>
            ${_habitTodayControl(h)}
          </div>`;
        }).join('')}
      </div>
    </div>`;
  } else {
    todayWrap.innerHTML = emptyState('habitsToday');
  }

  allWrap.innerHTML = `<div class="habits-cards-grid">
    ${active.map((h, i) => {
      const streak = getHabitStreak(h);
      const longest = getHabitLongestStreak(h);
      const rate = Math.round(getHabitCompletionRate(h, 30) * 100);
      const week = getHabitWeekProgress(h);
      return `<div class="habit-card" style="--i:${i};border-top:3px solid ${esc(h.color)};" onclick="editHabit('${esc(h.id)}')">
        <div class="habit-card-head">
          <div class="hb-today-icon" style="background:${hexToRgba(h.color, 0.18)};color:${esc(h.color)};">${esc(h.emoji)}</div>
          <div style="flex:1;min-width:0;">
            <div class="habit-card-name">${esc(h.name)}</div>
            <div class="habit-card-sub">
              ${h.type === 'counter' ? `${esc(String(h.target))}${h.unit ? ' ' + esc(h.unit) : ''} / day` : 'Check off daily'}
              ${h.frequency === 'weekly' ? ` · ${h.weekdays.length}×/wk` : ''}
              ${h.reminderTime ? ` · ⏰ ${fmt12(h.reminderTime)}` : ''}
            </div>
          </div>
          ${_habitTodayControl(h)}
        </div>
        <div class="habit-card-stats">
          <div class="hb-stat"><div class="hb-stat-val">🔥 ${streak}</div><div class="hb-stat-lbl">current</div></div>
          <div class="hb-stat"><div class="hb-stat-val">🏆 ${longest}</div><div class="hb-stat-lbl">longest</div></div>
          <div class="hb-stat"><div class="hb-stat-val">${rate}%</div><div class="hb-stat-lbl">30 days</div></div>
          <div class="hb-stat"><div class="hb-stat-val">${week.done}/${week.scheduled}</div><div class="hb-stat-lbl">this wk</div></div>
        </div>
        <div class="habit-grid" aria-label="Last 60 days for ${esc(h.name)}">${_habitDayGrid(h, 60)}</div>
        <div class="habit-grid-legend">
          <span>60 days ago</span>
          <span>Today</span>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

function updateHabitBadge() {
  const badge = document.getElementById('habit-badge');
  if (!badge) return;
  const remaining = _habitsScheduledToday().filter(h => !isHabitDoneForDate(h, todayStr())).length;
  badge.textContent = remaining || '';
  badge.style.display = remaining ? '' : 'none';
}
