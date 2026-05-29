/**
 * Lazy Panda — FCM Push Notifications Module (foreground + token lifecycle)
 *
 * Responsibilities:
 *   - Request Notification permission (after a soft explainer prompt)
 *   - Register an FCM token tied to the firebase-messaging-sw.js
 *   - Persist the token + lightweight today-schedule mirror to Firestore so
 *     the scheduled Cloud Function (functions/index.js) can decide which
 *     pushes to send on the user's behalf
 *   - Receive foreground messages from FCM and surface them as a toast
 *     (the SW handles the background case)
 *
 * The schedule mirror is debounced and re-fires from every saveState() call
 * (see state.js). Without that, the Cloud Function would only ever see
 * yesterday's snapshot and either fire stale notifications or fire none at
 * all on day N+1.
 */

const FCM_VAPID_KEY = 'BIFdw2Yw2Fl5W7U-SrSTSyioUrNxIS5AzTOF8Uc3rOMcPiNRcJYwq-Ia24z3A72uFjPNIP9mpbYpZ_RaJHdcUL4';
let fcmToken = null;

/**
 * Soft explainer + native permission prompt. Returns true if granted.
 */
async function requestNotificationPermissionWithExplainer() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;

  // Don't re-ask within the same session if user already saw the explainer
  if (sessionStorage.getItem('lp_notif_explained') !== '1') {
    sessionStorage.setItem('lp_notif_explained', '1');
    const ok = confirm(
      "🐼 Lazy Panda would like to send you reminders before classes, " +
      "habit nags throughout the day, and a morning agenda — even when " +
      "the app isn't open.\n\nYour browser will ask for permission next."
    );
    if (!ok) return false;
  }
  const perm = await Notification.requestPermission();
  return perm === 'granted';
}

async function initFCM() {
  if (!window.fcmMessaging) return;
  try {
    const granted = await requestNotificationPermissionWithExplainer();
    if (!granted) {
      updateFCMStatusUI(false, 'Notification permission denied.');
      return;
    }
    const reg = await navigator.serviceWorker.getRegistration();
    const token = await window.fcmMessaging.getToken({
      vapidKey: FCM_VAPID_KEY,
      serviceWorkerRegistration: reg
    });
    if (token) {
      fcmToken = token;
      console.log('FCM Token:', token.substring(0, 20) + '...');
      saveFCMTokenToFirestore(token);
      updateFCMStatusUI(true);
    }
  } catch (err) {
    console.error('FCM init error:', err);
    updateFCMStatusUI(false, err.message);
  }
}

function saveFCMTokenToFirestore(token) {
  if (!window.auth || !window.auth.currentUser || !window.db) return;
  window.db.collection('users').doc(window.auth.currentUser.uid).set({
    fcmTokens: firebase.firestore.FieldValue.arrayUnion(token),
    fcmUpdatedAt: Date.now(),
    userName: state.userName || 'Boss',
    aiPersonality: state.aiPersonality || 'Sassy',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  }, { merge: true });
}

/**
 * Mirror today's schedule + pending tasks/habits to Firestore so the
 * scheduled Cloud Function knows what to send. Must be called whenever
 * relevant state changes, not just on sign-in.
 */
function syncScheduleToFirestore() {
  if (!window.auth || !window.auth.currentUser || !window.db) return;
  const uid = window.auth.currentUser.uid;
  const today = todayStr();
  const todayEvs = getTodayEvents().map(e => ({
    id: e.id, title: e.title, start: e.start, end: e.end,
    category: e.category, location: e.location || ''
  }));
  const pTasks = state.tasks
    .filter(t => !isTaskComplete(t) && t.due === today)
    .map(t => ({ id: t.id, name: t.name, priority: t.priority }));
  const pHabits = (state.habits || [])
    .filter(h => !h.archived && isHabitScheduledOnDay(h, today) && !isHabitDoneForDate(h, today))
    .map(h => ({ id: h.id, name: h.name, emoji: h.emoji }));
  window.db.collection('users').doc(uid).set({
    schedule: {
      date: today,
      events: todayEvs,
      pendingTasks: pTasks,
      pendingHabits: pHabits,
      notifMinutes: state.notifMinutes || 10
    },
    userName: state.userName || 'Boss',
    aiPersonality: state.aiPersonality || 'Sassy',
    updatedAt: Date.now()
  }, { merge: true }).catch(e => console.error('syncScheduleToFirestore failed:', e));
}

// Debounced wrapper called from saveState() — keeps Firestore mirror current
// without spamming a write on every keystroke.
let _scheduleMirrorTimeout = null;
function autoMirrorScheduleToFcm() {
  if (!window.auth || !window.auth.currentUser) return;
  if (_scheduleMirrorTimeout) clearTimeout(_scheduleMirrorTimeout);
  _scheduleMirrorTimeout = setTimeout(syncScheduleToFirestore, 3000);
}
window.autoMirrorScheduleToFcm = autoMirrorScheduleToFcm;

// Foreground FCM message handler. We deliberately show ONLY a toast here;
// emitting a `new Notification(...)` in addition can cause the SW to also
// fire its own notification for the same payload, which surfaces a duplicate
// on some browsers. The SW (firebase-messaging-sw.js) handles the background
// case; in-foreground we want a quieter in-app affordance.
try {
  if (window.fcmMessaging) {
    window.fcmMessaging.onMessage(payload => {
      const data = payload.data || {};
      const title = data.title || payload.notification?.title || 'Panda says';
      const body  = data.body  || payload.notification?.body  || '';
      if (typeof showToast === 'function') {
        showToast(`${title}${body ? ': ' + body : ''}`);
      }
    });
  }
} catch(e) {}

function updateFCMStatusUI(enabled, error) {
  const el = document.getElementById('fcm-status');
  if (!el) return;
  if (enabled) {
    el.textContent = 'Push notifications active. Reminders work even when the app is closed.';
    el.style.color = 'var(--green)';
  } else if (error) {
    el.textContent = 'Push setup issue: ' + error;
    el.style.color = 'var(--amber)';
  } else {
    el.textContent = 'Not configured yet.';
    el.style.color = 'var(--text3)';
  }
}
