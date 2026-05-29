/**
 * Lazy Panda — Cloud Sync Module (Firebase Auth + Firestore)
 * Initialises Firebase, signs the user in with Google, restores full state
 * from Firestore on sign-in, and pushes local edits back up on a debounce.
 *
 * Two separate debouncers live here:
 *  - autoSyncToCloud:           full-state mirror (events/tasks/habits/grades…)
 *  - autoMirrorScheduleToFcm:   compact "today only" snapshot the scheduled
 *                               Cloud Function reads to decide what push
 *                               notifications to send. CRITICAL: this used
 *                               to only fire on sign-in, so any mid-day
 *                               edits never reached the server and any push
 *                               sent next day was based on yesterday's data.
 */

let firebaseUnsubscribe = null;
let lastSyncTimestamp = 0;
let syncInProgress = false;

const firebaseConfig = {
  apiKey: "AIzaSyABHSM6EFseBSxqKMajA0OPEoQd81KkJDM",
  authDomain: "gen-lang-client-0412969424.firebaseapp.com",
  projectId: "gen-lang-client-0412969424",
  storageBucket: "gen-lang-client-0412969424.firebasestorage.app",
  messagingSenderId: "428339420555",
  appId: "1:428339420555:web:8b040024cd3c039ca0638e",
  measurementId: "G-R0DYVP159S"
};

// Initialize Firebase — hung off window so fcm.js can read them.
window.firebaseApp = null;
window.auth = null;
window.db = null;
window.fcmMessaging = null;
try {
  if (firebase.apps.length === 0) {
    window.firebaseApp = firebase.initializeApp(firebaseConfig);
  } else {
    window.firebaseApp = firebase.app();
  }
  window.auth = firebase.auth();
  window.db = firebase.firestore();
  if (typeof firebase.messaging !== 'undefined' && firebase.messaging.isSupported()) {
    window.fcmMessaging = firebase.messaging();
  }
} catch (e) {
  console.error("Firebase init error:", e);
}

function updateFirebaseUI(user) {
  // Trigger FCM init + schedule mirror when user signs in
  if (user && window.fcmMessaging && typeof initFCM === 'function') {
    initFCM();
    if (typeof syncScheduleToFirestore === 'function') syncScheduleToFirestore();
  }
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

if (window.auth) {
  window.auth.onAuthStateChanged(user => {
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
  window.auth.signInWithPopup(provider).catch(e => {
    console.error("Sign in failed", e);
    const el = document.getElementById('firebase-status');
    if (el) {
      el.textContent = 'Sign in failed: ' + e.message;
      el.style.color = 'var(--coral)';
    }
  });
}

function signOut() {
  window.auth.signOut().then(() => {
    updateFirebaseUI(null);
  });
}

function initializeCloudSync() {
  // No-op — Firebase handles everything via onAuthStateChanged above.
}

function setupRealtimeSyncListener(uid) {
  if (firebaseUnsubscribe) firebaseUnsubscribe();

  firebaseUnsubscribe = window.db.collection('users').doc(uid).onSnapshot(doc => {
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
  if (!window.auth || !window.auth.currentUser) return;
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    syncToCloud(true);
  }, 3000);
}

async function syncToCloud(isAuto = false) {
  if (syncInProgress) return;
  syncInProgress = true;

  const user = window.auth?.currentUser;
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

    await window.db.collection('users').doc(user.uid).set(payload, { merge: true });

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
  const user = window.auth?.currentUser;
  const el = document.getElementById('firebase-status');
  if (!user) return;

  if (el) {
    el.style.color = 'var(--text3)';
    el.textContent = `⏳ Restoring from cloud... (${user.email})`;
  }

  try {
    const doc = await window.db.collection('users').doc(user.uid).get();
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
