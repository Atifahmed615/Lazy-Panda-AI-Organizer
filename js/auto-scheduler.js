// ══════════════════════════════════════════════
//  auto-scheduler.js — Phase 4
//  AI fills your open tasks into free-time gaps over the coming week.
//  Gated by state.flags.autoScheduler.
// ══════════════════════════════════════════════

const AS_DAY_START_MIN = 8 * 60;   // 8 AM
const AS_DAY_END_MIN   = 22 * 60;  // 10 PM
const AS_MIN_GAP       = 30;       // ignore gaps shorter than 30 min

let _pendingAutoSchedule = null;   // proposed events awaiting Accept

function _computeWeekFreeSlots() {
  const slots = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const ds = dateStr(d);
    const evs = getEventsForDay(ds, d.getDay()).slice().sort((a, b) => timeMins(a.start) - timeMins(b.start));
    let cursor = AS_DAY_START_MIN;
    evs.forEach(ev => {
      const s = Math.max(AS_DAY_START_MIN, timeMins(ev.start));
      const e = Math.min(AS_DAY_END_MIN,   timeMins(ev.end));
      if (s - cursor >= AS_MIN_GAP) slots.push({ date: ds, dayName: DAYS[d.getDay()], startMin: cursor, endMin: s });
      cursor = Math.max(cursor, e);
    });
    if (AS_DAY_END_MIN - cursor >= AS_MIN_GAP) slots.push({ date: ds, dayName: DAYS[d.getDay()], startMin: cursor, endMin: AS_DAY_END_MIN });
  }
  return slots;
}

function _minToHHMM(m) {
  return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
}

function _eligibleTasksForScheduling() {
  // Open, non-recurring tasks with an estimate AND a due date within the next 14 days.
  const today = todayStr();
  const horizon = new Date(); horizon.setDate(horizon.getDate() + 14);
  const horizonStr = dateStr(horizon);
  return state.tasks
    .filter(t => !isTaskComplete(t))
    .filter(t => (t.recurring || 'none') === 'none')
    .filter(t => t.due && t.due >= today && t.due <= horizonStr)
    .filter(t => Number(t.estMinutes) > 0);
}

async function runAutoScheduler() {
  if (!state.apiKey) { showToast('Add a Gemini API key in Settings first'); return; }
  const tasks = _eligibleTasksForScheduling();
  if (!tasks.length) {
    showToast('No tasks with duration estimates and due dates in the next 14 days.');
    return;
  }
  const slots = _computeWeekFreeSlots();
  if (!slots.length) {
    showToast('No free time this week — your calendar is full.');
    return;
  }
  // Show "thinking" state
  const body = document.getElementById('auto-sched-body');
  const acceptBtn = document.getElementById('auto-sched-accept');
  if (body) body.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text3);">🤖 Asking Gemini to plan your week…</div>`;
  if (acceptBtn) acceptBtn.disabled = true;
  openModal('auto-scheduler-modal');

  try {
    const plan = await _askGeminiToSchedule(tasks, slots);
    if (!Array.isArray(plan) || !plan.length) throw new Error('No plan returned');
    _pendingAutoSchedule = plan;
    _renderAutoSchedulePreview(plan, tasks);
    if (acceptBtn) acceptBtn.disabled = false;
  } catch (e) {
    console.warn('[auto-scheduler]', e);
    if (body) body.innerHTML = `<div style="color:var(--coral);padding:16px;">Couldn't generate a plan: ${esc(e.message || String(e))}</div>`;
    if (acceptBtn) acceptBtn.disabled = true;
  }
}
window.runAutoScheduler = runAutoScheduler;

async function _askGeminiToSchedule(tasks, slots) {
  const prompt = `Plan a study schedule. Return ONLY a JSON array. No prose, no code fences.

Each element is one placement:
{
  "taskId": string,            // must exist in OPEN_TASKS
  "date": "YYYY-MM-DD",        // must fall within a slot's date
  "start": "HH:MM",            // 24h, snapped to 15 min
  "end":   "HH:MM",            // 24h, snapped to 15 min, must equal start + estMinutes (or less if slot is short)
  "rationale": string          // ≤ 60 chars, why this slot
}

Rules:
- One task → one placement. Skip tasks you can't fit, don't double-book.
- Stay strictly inside the FREE_SLOTS — never overlap another event.
- Prefer earlier days for higher-priority tasks and earlier-due-date tasks.
- Don't pack more than 3 hours of placements per day.
- If a task estimate is longer than every available slot, split into the first slot that fits at least 60 minutes (but still one placement per task — pick the best one).

OPEN_TASKS:
${tasks.map(t => `- {taskId:"${t.id}", name:${JSON.stringify(t.name)}, due:"${t.due}", priority:"${t.priority}", estMinutes:${t.estMinutes}}`).join('\n')}

FREE_SLOTS (24h, local):
${slots.map(s => `- {date:"${s.date}", day:"${s.dayName}", start:"${_minToHHMM(s.startMin)}", end:"${_minToHHMM(s.endMin)}", durationMin:${s.endMin - s.startMin}}`).join('\n')}

Now return the JSON array.`;

  const res = await geminiFetch({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json', maxOutputTokens: 1200 }
  });
  if (!res.ok) throw new Error('Gemini API ' + res.status);
  const body = await res.json();
  const txt = body?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return JSON.parse(txt);
}

function _renderAutoSchedulePreview(plan, tasks) {
  const body = document.getElementById('auto-sched-body');
  if (!body) return;
  const taskById = Object.fromEntries(tasks.map(t => [t.id, t]));
  const rows = plan.map((p, i) => {
    const t = taskById[p.taskId];
    if (!t) return '';
    return `<label style="display:flex;align-items:flex-start;gap:10px;padding:10px;background:var(--surface2);border-radius:8px;margin-bottom:6px;cursor:pointer;">
      <input type="checkbox" checked data-plan-idx="${i}" style="margin-top:3px;flex-shrink:0;">
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:500;color:var(--text);">${esc(t.name)}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px;">${esc(p.date)} · ${esc(p.start)}–${esc(p.end)} · ${esc(t.priority)} priority</div>
        ${p.rationale ? `<div style="font-size:11px;color:var(--text2);margin-top:4px;font-style:italic;">${esc(p.rationale)}</div>` : ''}
      </div>
    </label>`;
  }).filter(Boolean).join('');
  const skipped = tasks.filter(t => !plan.find(p => p.taskId === t.id));
  body.innerHTML = `<div style="font-size:12px;color:var(--text2);margin-bottom:10px;">Uncheck anything you don't want. Accept to add the rest as time-blocked events.</div>
    ${rows || '<div style="color:var(--text3);">Nothing scheduled.</div>'}
    ${skipped.length ? `<div style="font-size:11px;color:var(--text3);margin-top:10px;">Skipped (no room): ${skipped.map(t => esc(t.name)).join(', ')}</div>` : ''}`;
}

function acceptAutoSchedule() {
  if (!_pendingAutoSchedule) return;
  const checked = Array.from(document.querySelectorAll('#auto-sched-body input[type="checkbox"]:checked'))
    .map(i => Number(i.dataset.planIdx))
    .map(idx => _pendingAutoSchedule[idx])
    .filter(Boolean);
  let added = 0;
  checked.forEach(p => {
    const t = state.tasks.find(x => x.id === p.taskId);
    if (!t) return;
    const ev = {
      id: 'e' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      title: t.name,
      date: p.date,
      start: p.start,
      end: p.end,
      category: 'study',
      location: '',
      recurring: 'none',
      recurringEndDate: '',
      color: '',
      notes: p.rationale ? `Auto-scheduled by AI: ${p.rationale}` : 'Auto-scheduled by AI',
      energy: null,
      taskId: t.id,
      gcalEventId: '',
    };
    state.events.push(ev);
    added++;
  });
  _pendingAutoSchedule = null;
  saveState(); render();
  closeModal('auto-scheduler-modal');
  showToast(`✓ Added ${added} time-blocked event${added === 1 ? '' : 's'}`);
}
window.acceptAutoSchedule = acceptAutoSchedule;
