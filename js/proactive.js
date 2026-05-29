/**
 * Lazy Panda — Proactive AI Auto-Rescheduling Module
 * Monitors missed events and tasks, programmatically computes free slots tomorrow, 
 * queries Gemini for personalized sassy/gentle rescheduling suggestions,
 * and renders an interactive dashboard notification card.
 */

// Initialize proactive tracking arrays in global state.
// Note: this runs at script-parse time, which is BEFORE app.js calls
// loadState(). The fields below are picked up either way because
// loadState() merges defaults — but if state ever moves to a setter-based
// store, this guard would need to move into a post-loadState hook.
if (typeof state !== 'undefined' && state) {
  if (!state.completedEvents) state.completedEvents = [];
  if (!state.dismissedMissedEvents) state.dismissedMissedEvents = [];
}

function getTomorrowStr() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split('T')[0];
}

/**
 * Finds a free time block tomorrow of a given duration (in minutes).
 * Checks against existing events scheduled for tomorrow.
 * Default range: 09:00 AM to 09:00 PM (540 to 1260 mins).
 */
function findFreeSlotTomorrow(durationMins) {
  const tomorrowDateStr = getTomorrowStr();
  // Get all events for tomorrow
  const tomorrowEvents = state.events.filter(ev => ev.date === tomorrowDateStr);
  
  // Potential starting times every hour from 9 AM to 7 PM
  const candidateStarts = [540, 600, 660, 720, 780, 840, 900, 960, 1020, 1080, 1140];
  
  for (const start of candidateStarts) {
    const end = start + durationMins;
    
    // Check if this window overlaps with any of tomorrow's events
    const hasOverlap = tomorrowEvents.some(ev => {
      const evStart = timeMins(ev.start);
      const evEnd = timeMins(ev.end);
      return (start < evEnd && end > evStart);
    });
    
    if (!hasOverlap) {
      // Found a free slot! Convert back to HH:MM format
      const pad = n => String(n).padStart(2, '0');
      const startStr = `${pad(Math.floor(start / 60))}:${pad(start % 60)}`;
      const endStr = `${pad(Math.floor(end / 60))}:${pad(end % 60)}`;
      return { start: startStr, end: endStr };
    }
  }
  
  // Fallback to 10:00 AM tomorrow if no free slot found
  const start = 600;
  const end = start + durationMins;
  const pad = n => String(n).padStart(2, '0');
  return { 
    start: `${pad(Math.floor(start / 60))}:${pad(start % 60)}`, 
    end: `${pad(Math.floor(end / 60))}:${pad(end % 60)}` 
  };
}

/**
 * Monitors missed events and tasks. Run on app load and periodically.
 */
async function checkMissedSchedule() {
  const wrap = document.getElementById('ai-proactive-reschedule');
  if (!wrap) return;

  const now = nowMins();
  const today = todayStr();
  
  // Find missed study sessions today
  const todayEvents = state.events.filter(ev => ev.date === today);
  const missedStudyEvent = todayEvents.find(ev => {
    // Only target user-scheduled study/personal blocks that have ended
    const isTargetCategory = ev.category === 'study' || ev.category === 'personal';
    const hasEnded = timeMins(ev.end) < now;
    
    const isCompleted = state.completedEvents.includes(ev.id);
    const isDismissed = state.dismissedMissedEvents.includes(ev.id);
    
    return isTargetCategory && hasEnded && !isCompleted && !isDismissed;
  });

  if (!missedStudyEvent) {
    wrap.style.display = 'none';
    return;
  }

  // Calculate duration of missed event
  const duration = timeMins(missedStudyEvent.end) - timeMins(missedStudyEvent.start);
  const slot = findFreeSlotTomorrow(duration > 0 ? duration : 60);

  const formattedNewStart = fmt12(slot.start);
  const formattedOldStart = fmt12(missedStudyEvent.start);
  const userName = state.userName || 'Boss';
  const personality = state.aiPersonality || 'Sassy';

  // Render a loading state while we get a customized AI scolding/reschedule message
  wrap.style.display = 'flex';
  wrap.innerHTML = `
    <div class="ai-proactive-icon">🐼</div>
    <div class="ai-proactive-text"><b>Panda is checking on your missed tasks...</b></div>
  `;

  // Default fallback templates
  const fallbacks = {
    Sassy: `Hey ${userName}, I noticed you ditched your "${missedStudyEvent.title}" session at ${formattedOldStart}. Let's try again tomorrow at ${formattedNewStart}? 👀`,
    Gentle: `Hi ${userName}! No worries at all about missing your "${missedStudyEvent.title}" session today. Let's schedule a fresh start tomorrow at ${formattedNewStart}? 💚`,
    Professional: `Action Recommended: The "${missedStudyEvent.title}" session scheduled for today was missed. Reschedule to tomorrow at ${formattedNewStart}?`
  };

  let messageText = fallbacks[personality] || fallbacks.Sassy;

  // If Gemini API is configured, get a personalized, highly contextual sass/motivation scolding!
  if (state.apiKey) {
    const prompt = `Generate a single short action sentence (under 20 words) in ${personality} style addressing the user as ${userName}.
    Point out they missed their "${missedStudyEvent.title}" session at ${formattedOldStart} today, and suggest automatically rescheduling it to tomorrow at ${formattedNewStart}.
    Make it punchy, conversational, and highly specific to these details. Do not use markdown or JSON.`;

    try {
      const res = await geminiFetch({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 60, temperature: 0.8 }
      });
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text && text.trim()) {
        messageText = text.trim();
      }
    } catch (e) {
      console.warn("Proactive AI Gemini fetch failed, using fallback.", e);
    }
  }

  wrap.innerHTML = `
    <div class="ai-proactive-icon">🐼</div>
    <div class="ai-proactive-text"><b>Panda Proactive:</b> ${messageText}</div>
    <div class="ai-proactive-actions">
      <button class="btn-proactive-reschedule" onclick="rescheduleMissedEvent('${missedStudyEvent.id}', '${slot.start}', '${slot.end}')">Reschedule</button>
      <button class="btn-proactive-dismiss" onclick="dismissMissedEvent('${missedStudyEvent.id}')">Dismiss</button>
    </div>
  `;
}

/**
 * Automatically duplicates the missed event for tomorrow at the computed slot and deletes the old one.
 */
window.rescheduleMissedEvent = async function(id, newStart, newEnd) {
  const ev = state.events.find(e => e.id === id);
  if (!ev) return;

  const tomorrowStrVal = getTomorrowStr();
  
  // Create rescheduled event for tomorrow
  const rescheduledEv = {
    ...ev,
    id: 'e' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    date: tomorrowStrVal,
    start: newStart,
    end: newEnd,
    recurring: 'none',
    gcalEventId: '' // Clear out old gCal ID so it pushes a fresh one
  };

  // 1. Remove old event from local state & delete from Google Calendar if connected
  if (ev.gcalEventId && window.gCalAccessToken) {
    await deleteEventFromGoogle(ev.gcalEventId);
  }
  state.events = state.events.filter(e => e.id !== id);

  // 2. Add new event to local state
  state.events.push(rescheduledEv);
  
  // 3. Mark the old ID as dismissed to prevent re-nagging
  state.dismissedMissedEvents.push(id);
  
  // 4. Save state & re-render
  saveState();
  render();

  // 5. Upload new event to Google Calendar if connected
  if (window.gCalAccessToken) {
    syncEventToGoogle(rescheduledEv, tomorrowStrVal).then(gcalId => {
      if (gcalId) {
        rescheduledEv.gcalEventId = gcalId;
        saveState();
      }
    });
  }

  // 6. Hide card & trigger haptic
  const wrap = document.getElementById('ai-proactive-reschedule');
  if (wrap) wrap.style.display = 'none';
  if (navigator.vibrate) navigator.vibrate(40);
  
  showToast(`📅 Rescheduled "${ev.title}" to tomorrow at ${fmt12(newStart)}!`);
};

/**
 * Dismisses the rescheduling card for the current missed event.
 */
window.dismissMissedEvent = function(id) {
  state.dismissedMissedEvents.push(id);
  saveState();
  
  const wrap = document.getElementById('ai-proactive-reschedule');
  if (wrap) wrap.style.display = 'none';
  
  showToast("Dismissed rescheduling suggestion.");
};

// ── Lifecycle: kick off the missed-schedule check ──────────────────────────
// The previous implementation fired 3 seconds after this *file* parsed,
// which on a slow first paint could run before app.js had called
// loadState() — so state.events was empty and the check produced false
// negatives. Hook to DOMContentLoaded (and a short post-load delay to let
// state hydrate from localStorage / Firestore restore), and re-run on
// visibilitychange so coming back to the tab catches anything that was
// missed while the app was backgrounded.
function _scheduleMissedCheck(delay = 1500) {
  setTimeout(() => {
    if (typeof checkMissedSchedule === 'function' &&
        typeof state !== 'undefined' && state && Array.isArray(state.events)) {
      checkMissedSchedule();
    }
  }, delay);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => _scheduleMissedCheck(1500));
} else {
  _scheduleMissedCheck(1500);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') _scheduleMissedCheck(500);
});

// Re-check on hash-based navigation back to the dashboard.
window.addEventListener('hashchange', () => {
  if (location.hash === '#dashboard' || location.hash === '') {
    _scheduleMissedCheck(300);
  }
});

