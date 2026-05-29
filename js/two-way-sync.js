/**
 * Lazy Panda — Google Calendar Two-Way Sync Module
 * Synchronises additions, updates, and deletions made in Lazy Panda
 * back to the user's native Google Calendar in real-time.
 *
 * Updates use PATCH (not PUT) so we don't blow away Google-side fields
 * we don't model locally (attendees, recurrence, reminders, colorId, etc.).
 */

/**
 * Creates or updates an event in Google Calendar.
 * @param {Object} ev - The Lazy Panda event object
 * @param {string} dateStr - The date string 'YYYY-MM-DD'
 * @returns {Promise<string|null>} The remote Google Calendar Event ID, or null on failure
 */
async function syncEventToGoogle(ev, dateStr) {
  if (!window.gCalAccessToken) return null;

  const [sh, sm] = ev.start.split(':').map(Number);
  const [eh, em] = ev.end.split(':').map(Number);
  const startDt = new Date(dateStr); startDt.setHours(sh, sm, 0, 0);
  const endDt   = new Date(dateStr); endDt.setHours(eh, em, 0, 0);

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const body = {
    summary: ev.title,
    location: ev.location || '',
    start: { dateTime: startDt.toISOString(), timeZone: tz },
    end:   { dateTime: endDt.toISOString(),   timeZone: tz },
    description: ev.notes ? `Notes:\n${ev.notes}` : 'Added by Lazy Panda 🐼'
  };

  const isUpdate = !!ev.gcalEventId;
  const url = isUpdate
    ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(ev.gcalEventId)}`
    : 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

  try {
    const r = await fetch(url, {
      // PATCH on updates preserves Google-side fields we don't manage
      // (attendees, reminders.useDefault, recurrence rules, colorId, etc.).
      // PUT would replace the entire resource and wipe those.
      method: isUpdate ? 'PATCH' : 'POST',
      headers: { Authorization: `Bearer ${window.gCalAccessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (r.ok) {
      const data = await r.json();
      return data.id;
    }
    // 404 on PATCH means the remote was deleted externally — treat as a
    // fresh create so the local copy doesn't drift forever.
    if (isUpdate && r.status === 404) {
      const r2 = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { Authorization: `Bearer ${window.gCalAccessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (r2.ok) {
        const d2 = await r2.json();
        return d2.id;
      }
    }
  } catch (err) {
    console.error('Failed to sync event to Google Calendar:', err);
  }
  return null;
}

/**
 * Deletes an event from Google Calendar.
 * @param {string} gcalEventId - The remote Google Calendar Event ID (no prefix)
 * @returns {Promise<boolean>} Success status
 */
async function deleteEventFromGoogle(gcalEventId) {
  if (!window.gCalAccessToken || !gcalEventId) return false;

  try {
    const r = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(gcalEventId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${window.gCalAccessToken}` }
      }
    );
    // 410 Gone and 404 are both "already deleted on Google's side" — fine.
    return r.ok || r.status === 410 || r.status === 404;
  } catch (err) {
    console.error('Failed to delete event from Google Calendar:', err);
  }
  return false;
}
