/**
 * Lazy Panda — Local Browser Notifications Module
 * In-foreground / in-tab notifications fired by a 60-second polling loop.
 * (Background notifications when the tab is closed are handled by FCM —
 * see js/fcm.js + functions/index.js.)
 *
 * Persists "already fired" keys to localStorage so a page refresh doesn't
 * either re-fire the same reminder or lose the state for the rest of the day.
 */

let notifCheckInterval = null;

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
// Key format in localStorage: 'lp_notif_fired' → { "YYYY-MM-DD": ["key1",...] }
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

    // WhatsApp reminder (sendWhatsAppReminder is defined in app.js)
    const waKey = `wa-${today}-${ev.id}`;
    if (state.waPhone && state.waServer && !notifiedEvents.has(waKey)) {
      _markNotifFired(waKey);
      if (typeof sendWhatsAppReminder === 'function') {
        sendWhatsAppReminder(ev, Math.round(diff));
      }
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
