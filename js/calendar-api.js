/**
 * Lazy Panda — Google Calendar Integration API Module
 * Handles OAuth2 authentication, token storage, calendar synchronization,
 * and event importing/exporting with Google Calendar API v3.
 *
 * NOTE: All shared module state is hung off `window.` so that the other
 * scripts loaded as classic <script> tags (two-way-sync.js, proactive.js,
 * app.js, render.js) can actually see it. Top-level `let`/`const` in a
 * classic script does NOT attach to window, which previously caused every
 * `window.gCalAccessToken` check elsewhere to return undefined and silently
 * skip every PATCH/DELETE call to Google.
 */

window.GCAL_SCOPES = 'https://www.googleapis.com/auth/calendar';
window.gCalTokenClient = null;
window.gCalAccessToken = localStorage.getItem('gCalAccessToken') || null;
window.gCalExpiry = parseInt(localStorage.getItem('gCalExpiry') || '0', 10);

if (window.gCalAccessToken && Date.now() > window.gCalExpiry) {
  window.gCalAccessToken = null;
  localStorage.removeItem('gCalAccessToken');
  localStorage.removeItem('gCalExpiry');
}

function updateGCalUI() {
  const connected = !!window.gCalAccessToken;
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

window.dismissGCalPromo = function() {
  state.hideGcalPromo = true;
  saveState();
  if (typeof renderGCalBanner === 'function') renderGCalBanner();
};

async function connectGoogleCalendar() {
  const clientId = "52765318311-k4294hrac4e2716tnt3sfh177j2vm61p.apps.googleusercontent.com";
  setGCalStatus('Loading Google Sign-In…', 'var(--text3)');
  try {
    await loadGISLibrary();
    window.gCalTokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: window.GCAL_SCOPES,
      callback: (resp) => {
        if (resp.error) { setGCalStatus('❌ Auth error: ' + resp.error, 'var(--coral)'); return; }
        window.gCalAccessToken = resp.access_token;
        window.gCalExpiry = Date.now() + (resp.expires_in * 1000) - 60000;
        localStorage.setItem('gCalAccessToken', window.gCalAccessToken);
        localStorage.setItem('gCalExpiry', String(window.gCalExpiry));
        updateGCalUI();
      }
    });
    window.gCalTokenClient.requestAccessToken({ prompt: 'consent' });
  } catch(e) {
    setGCalStatus('❌ ' + e.message, 'var(--coral)');
  }
}

function disconnectGoogleCalendar() {
  if (window.gCalAccessToken) window.google?.accounts?.oauth2?.revoke(window.gCalAccessToken);
  window.gCalAccessToken = null;
  window.gCalExpiry = 0;
  localStorage.removeItem('gCalAccessToken');
  localStorage.removeItem('gCalExpiry');
  updateGCalUI();
  const el = document.getElementById('gcal-status');
  if (el) { el.style.display = 'none'; }
}

async function syncToGoogleCalendar() {
  if (!window.gCalAccessToken) return;
  setGCalStatus('⏳ Syncing events to Google Calendar…', 'var(--text3)');
  const now = new Date();
  const eventsToSync = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(now); d.setDate(now.getDate() + i);
    const ds = d.toISOString().split('T')[0];
    getEventsForDay(ds, d.getDay()).forEach(ev => eventsToSync.push({ ev, ds }));
  }
  let synced = 0, errors = 0, skipped = 0;
  for (const { ev, ds } of eventsToSync.slice(0, 50)) {
    // Skip events that already have a Google id — those are handled by
    // the per-edit two-way sync. Bulk sync is only for first-time push.
    if (ev.gcalEventId) { skipped++; continue; }
    const remoteId = await syncEventToGoogle(ev, ds);
    if (remoteId) {
      ev.gcalEventId = remoteId;
      synced++;
    } else {
      errors++;
    }
  }
  if (synced > 0) saveState();
  setGCalStatus(
    `✅ Synced ${synced} new event${synced === 1 ? '' : 's'}` +
    (skipped ? `, skipped ${skipped} already-synced` : '') +
    (errors ? ` (${errors} errors)` : '') + '.',
    'var(--green)'
  );
}

async function importFromGoogleCalendar() {
  if (!window.gCalAccessToken) return;
  setGCalStatus('⏳ Importing from Google Calendar…', 'var(--text3)');
  try {
    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + 30 * 86400000).toISOString();
    const r = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=50`,
      { headers: { Authorization: `Bearer ${window.gCalAccessToken}` } }
    );
    const data = await r.json();
    const items = data.items || [];
    let imported = 0, updated = 0;
    items.forEach(item => {
      if (!item.start?.dateTime) return; // skip all-day
      const start = new Date(item.start.dateTime);
      const end   = new Date(item.end.dateTime);
      const ds = start.toISOString().split('T')[0];
      const pad = n => String(n).padStart(2,'0');
      const startStr = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
      const endStr   = `${pad(end.getHours())}:${pad(end.getMinutes())}`;

      // Dedupe on the Google event id — survives renames, time changes, etc.
      const existing = state.events.find(e => e.gcalEventId === item.id);
      if (existing) {
        // Refresh local copy with whatever's currently in Google
        existing.title    = item.summary || existing.title || 'Untitled';
        existing.date     = ds;
        existing.start    = startStr;
        existing.end      = endStr;
        existing.location = item.location || '';
        existing.notes    = item.description || existing.notes || '';
        updated++;
        return;
      }
      state.events.push({
        id: 'e' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        title: item.summary || 'Untitled',
        date: ds,
        start: startStr,
        end: endStr,
        location: item.location || '',
        category: 'other',
        recurring: 'none',
        notes: item.description || '',
        gcalEventId: item.id
      });
      imported++;
    });
    saveState(); render();
    setGCalStatus(
      `✅ Imported ${imported} new` + (updated ? `, updated ${updated} existing` : '') + '.',
      'var(--green)'
    );
  } catch(e) {
    setGCalStatus('❌ Import failed: ' + e.message, 'var(--coral)');
  }
}
