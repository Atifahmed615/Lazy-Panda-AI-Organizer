// ══════════════════════════════════════════════
//  ai.js — Gemini API, chat, voice, notes AI, optimizer
//  Load order: 3rd (depends on state.js, render.js)
// ══════════════════════════════════════════════

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
  const allEvs = getAllEvents().slice(0,20);
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

  const activeHabits = (state.habits || []).filter(h => !h.archived);
  const todayDateStr = todayStr();

  return `You are Lazy Panda 🐼, an intelligent scheduling assistant powered by Gemini AI embedded in a productivity app.

CURRENT DATE & TIME: ${today.toDateString()}, ${today.toLocaleTimeString()}
TODAY IS: ${DAYS[today.getDay()]}

CURRENT WEEKLY WORKLOAD:
Total committed hours: ${totalWeeklyHours.toFixed(1)}h (Limit: ${state.weeklyHourLimit}h)
Status: ${isOverloaded ? 'OVERLOADED (warn the user)' : 'Healthy'}

TODAY'S SCHEDULE:
${todayEvs.length ? todayEvs.map(e=>`- [ID:${e.id}] ${e.title} | ${fmt12(e.start)}–${fmt12(e.end)} | ${e.location||'N/A'} | ${e.category}`).join('\n') : 'No events today'}

ALL UPCOMING EVENTS (next 20):
${allEvs.map(e=>`- [ID:${e.id}] ${e.title} | ${e.date} | ${fmt12(e.start)}–${fmt12(e.end)} | ${e.location||'N/A'} | ${e.recurring||'once'}`).join('\n')}

PENDING TASKS:
${pendingTasks.length ? pendingTasks.map(t=>`- [ID:${t.id}] ${t.name} | Due: ${t.due} | ${t.priority} priority`).join('\n') : 'No pending tasks'}

HABITS (${activeHabits.length} active):
${activeHabits.length ? activeHabits.map(h => {
  const streak = getHabitStreak(h);
  const done = isHabitDoneForDate(h, todayDateStr);
  const progress = getHabitProgress(h, todayDateStr);
  const target = getHabitDailyTarget(h);
  const sched = isHabitScheduledOnDay(h, todayDateStr) ? 'scheduled today' : 'rest day today';
  return `- [ID:${h.id}] ${h.emoji} ${h.name} | type:${h.type}${h.type==='counter'?` (${progress}/${target}${h.unit?' '+h.unit:''})`:''} | streak:${streak} | ${sched}${done?' | DONE today':''}`;
}).join('\n') : 'No habits yet'}

RECENT ACTIONS (last ${Math.min((state.aiRecentActions||[]).length, 5)} things you did for this user — use for context, not repetition):
${(state.aiRecentActions||[]).slice(0,5).map(a=>`- [${new Date(a.at).toLocaleDateString()}] ${a.summary}`).join('\n') || 'None yet'}

DETECTED SCHEDULE CONFLICTS (pre-computed — do NOT contradict these):
${(() => { try { const c = detectAllConflicts(); return c.length ? c.map(x=>`- ${x.date}: "${x.a.title}" (${fmt12(x.a.start)}–${fmt12(x.a.end)}) conflicts with "${x.b.title}" (${fmt12(x.b.start)}–${fmt12(x.b.end)})`).join('\n') : 'None'; } catch(e) { return 'None'; } })()}

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
You can help the user manage their schedule through conversation. When a user wants to add/edit/delete events or tasks, EXECUTE THE ACTION IMMEDIATELY — do not describe what you are about to do, do not list the events you will change, do not ask for confirmation unless something is genuinely ambiguous. Just do it and reply with a short confirmation like "Done! Removed X" or "Added Y for tomorrow at 9 PM." Keep replies under 3 sentences unless the user asks a question. Include a JSON action block for every operation in this exact format:

ACTION:{"type":"create_event","data":{"title":"...","date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM","category":"class|study|meeting|personal|other","location":"...","recurring":"none|daily|weekly|weekends|biweekly|monthly","recurringEndDate":"","color":""}}

ACTION:{"type":"create_task","data":{"name":"...","due":"YYYY-MM-DD","priority":"high|medium|low","recurring":"none|daily|weekly","subtasks":[]}}

ACTION:{"type":"delete_event","data":{"id":"<use the exact ID from [ID:xxx] in the event list above>"}}

ACTION:{"type":"delete_task","data":{"id":"<use the exact ID from [ID:xxx] in the task list above>"}}

ACTION:{"type":"set_reminder","data":{"title":"...","date":"YYYY-MM-DD","time":"HH:MM","note":"optional extra detail"}}

ACTION:{"type":"delete_reminder","data":{"id":"<reminder id>"}}

ACTION:{"type":"create_habit","data":{"name":"...","emoji":"🏃","color":"#7c6ff7","type":"checkoff|counter","target":1,"unit":"","frequency":"daily|weekly","weekdays":[1,2,3,4,5],"reminderTime":"HH:MM"}}

ACTION:{"type":"complete_habit","data":{"id":"<habit id>","amount":1}}

ACTION:{"type":"delete_habit","data":{"id":"<habit id>"}}

ACTIVE REMINDERS:
${(() => { const r = (state.customReminders||[]).filter(r=>!r.fired); return r.length ? r.map(r=>`- [ID:${r.id}] "${r.title}" on ${r.date} at ${fmt12(r.time)}`).join('\n') : 'None'; })()}

Only include the ACTION block when actually performing an operation. If info is missing, ask clarifying questions before executing.

BEHAVIOR RULES:
- NEVER narrate what you are about to do. Just do it.
- NEVER list events before deleting them. Just delete and confirm.
- Keep all replies short — 1 to 3 sentences max.
- After completing an action, you may suggest ONE follow-up in the same short reply.
- If the user is stressed or overwhelmed, acknowledge briefly then give one practical suggestion.
- When a user says "remind me", "set a reminder", "notify me", or anything about reminders/alerts — use set_reminder immediately. The reminder fires at the exact time specified.
- If the user says "remind me before [event]", look up the event start time and subtract the requested minutes to compute the reminder time.
- Notifications require the app to be open or the device to support background wake. Let the user know if they ask about reliability.`;
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
  const results = [];
  let cleanText = text;
  const PREFIX = 'ACTION:';

  // Extract JSON by counting braces — handles nested objects correctly.
  // Regex .*? stops at the first } which breaks nested {"data":{...}} payloads.
  let searchStart = 0;
  while (true) {
    const idx = cleanText.indexOf(PREFIX, searchStart);
    if (idx === -1) break;

    const jsonStart = idx + PREFIX.length;
    if (cleanText[jsonStart] !== '{') { searchStart = idx + 1; continue; }

    let depth = 0, jsonEnd = -1;
    for (let i = jsonStart; i < cleanText.length; i++) {
      if (cleanText[i] === '{') depth++;
      else if (cleanText[i] === '}') { depth--; if (depth === 0) { jsonEnd = i; break; } }
    }
    if (jsonEnd === -1) break; // malformed — stop

    const rawBlock = cleanText.slice(idx, jsonEnd + 1); // "ACTION:{...}"
    const jsonStr  = cleanText.slice(jsonStart, jsonEnd + 1);

    let action;
    try { action = JSON.parse(jsonStr); } catch(e) {
      console.error('Action JSON parse error:', e, jsonStr.substring(0, 120));
      // Still remove the raw block from the bubble so user doesn't see it
      cleanText = cleanText.slice(0, idx) + cleanText.slice(jsonEnd + 1);
      continue;
    }

    // Remove the ACTION block from displayed text
    cleanText = (cleanText.slice(0, idx) + cleanText.slice(jsonEnd + 1)).trim();

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
      const ev = state.events.find(e => e.id === action.data.id);
      if (ev) {
        state.events = state.events.filter(e => e.id !== action.data.id);
        result = `Removed "${ev.title}"`;
        saveState(); render();
      } else {
        console.warn('delete_event: no event found with id', action.data.id);
      }
    } else if (action.type === 'delete_task') {
      const task = state.tasks.find(t => t.id === action.data.id);
      if (task) {
        state.tasks = state.tasks.filter(t => t.id !== action.data.id);
        result = `Removed task "${task.name}"`;
        saveState(); render();
      }
    } else if (action.type === 'set_reminder') {
      if (!Array.isArray(state.customReminders)) state.customReminders = [];
      const rem = {
        id: 'r' + Date.now() + Math.random().toString(36).slice(2),
        title:  action.data.title  || 'Reminder',
        date:   action.data.date   || todayStr(),
        time:   action.data.time   || '09:00',
        note:   action.data.note   || '',
        eventId: action.data.eventId || null,
        fired:  false
      };
      state.customReminders.push(rem);
      result = `Reminder set: "${rem.title}" on ${rem.date} at ${fmt12(rem.time)}`;
      saveState();
    } else if (action.type === 'delete_reminder') {
      if (Array.isArray(state.customReminders)) {
        const rem = state.customReminders.find(r => r.id === action.data.id);
        if (rem) {
          state.customReminders = state.customReminders.filter(r => r.id !== action.data.id);
          result = `Removed reminder "${rem.title}"`;
          saveState();
        }
      }
    } else if (action.type === 'create_habit') {
      if (!Array.isArray(state.habits)) state.habits = [];
      const d = action.data || {};
      const type = d.type === 'counter' ? 'counter' : 'checkoff';
      const frequency = d.frequency === 'weekly' ? 'weekly' : 'daily';
      let weekdays = Array.isArray(d.weekdays) && d.weekdays.length ? d.weekdays.map(Number).filter(n => n>=0 && n<=6) : [0,1,2,3,4,5,6];
      if (frequency === 'daily') weekdays = [0,1,2,3,4,5,6];
      const habit = {
        id: 'h' + Date.now() + Math.random().toString(36).slice(2),
        name: d.name || 'New habit',
        emoji: d.emoji || '⭐',
        color: /^#[0-9a-fA-F]{6}$/.test(d.color || '') ? d.color : HABIT_COLOR_PRESETS[0],
        type,
        target: Math.max(1, Number(d.target) || 1),
        unit: d.unit || '',
        frequency,
        weekdays,
        weeklyTarget: frequency === 'daily' ? 7 : weekdays.length,
        createdAt: todayStr(),
        completions: {},
        reminderTime: /^\d{2}:\d{2}$/.test(d.reminderTime || '') ? d.reminderTime : '',
        archived: false
      };
      state.habits.push(habit);
      result = `Habit "${habit.name}" added`;
      saveState(); render();
    } else if (action.type === 'complete_habit') {
      const h = (state.habits || []).find(x => x.id === action.data.id);
      if (h) {
        const today = todayStr();
        if (!h.completions) h.completions = {};
        if (h.type === 'counter') {
          const amt = Math.max(1, Number(action.data.amount) || 1);
          h.completions[today] = getHabitProgress(h, today) + amt;
        } else {
          h.completions[today] = 1;
        }
        const streak = getHabitStreak(h);
        result = `Marked "${h.name}" done — 🔥 ${streak}-day streak`;
        saveState(); render();
      }
    } else if (action.type === 'delete_habit') {
      const h = (state.habits || []).find(x => x.id === action.data.id);
      if (h) {
        state.habits = state.habits.filter(x => x.id !== action.data.id);
        result = `Removed habit "${h.name}"`;
        saveState(); render();
      }
    }
    if (result) {
      results.push(result);
      // Persist to AI memory so future sessions know what was recently changed
      if (!Array.isArray(state.aiRecentActions)) state.aiRecentActions = [];
      state.aiRecentActions.unshift({ at: new Date().toISOString(), summary: result });
      if (state.aiRecentActions.length > 10) state.aiRecentActions.length = 10;
    }
    // Don't advance searchStart — indices shifted after splice
  }
  return { cleanText: cleanText.trim(), results };
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
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1000, temperature: 0.4 }
    });
    const responseText = await res.text();
    const data = JSON.parse(responseText);
    if (!res.ok) throw new Error(data.error?.message || 'API error');
    
    let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    raw = raw.replace(/```json/g, '').replace(/```/g, '').trim();
    // Replace all literal newlines with spaces to prevent "Unterminated string" JSON parse errors
    raw = raw.replace(/[\n\r]/g, ' ');
    
    let recs;
    try {
      recs = JSON.parse(raw);
    } catch (parseErr) {
      try {
        let s = raw;
        const clean = s.replace(/\\"/g, '');
        if ((clean.match(/"/g) || []).length % 2 !== 0) s += '"';
        const openBraces = (s.match(/\{/g) || []).length - (s.match(/\}/g) || []).length;
        for (let i = 0; i < Math.max(0, openBraces); i++) s += '}';
        const openBrackets = (s.match(/\[/g) || []).length - (s.match(/\]/g) || []).length;
        for (let i = 0; i < Math.max(0, openBrackets); i++) s += ']';
        recs = JSON.parse(s);
        // If the JSON was truncated mid-generation, the last object is incomplete
        if (Array.isArray(recs) && recs.length > 0) {
          recs.pop();
        }
      } catch(e2) {
        return; // Stop execution silently if repair fails
      }
    }
    
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
        generationConfig: { maxOutputTokens: 4096, temperature: 0.4 }
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
      const candidate = data.candidates?.[0];
      const raw = candidate?.content?.parts?.[0]?.text || 'Sorry, I got an empty response.';
      // Warn if response was cut off due to token limit
      const truncated = candidate?.finishReason === 'MAX_TOKENS';
      const { cleanText, results } = parseAndExecuteActions(raw);
      const actionSummary = results.join(', ');
      const displayText = (cleanText || raw) + (truncated ? '\n\n⚠️ My response was cut off — please ask me to continue.' : '');
      addMsg('ai', displayText, actionSummary || null);
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
