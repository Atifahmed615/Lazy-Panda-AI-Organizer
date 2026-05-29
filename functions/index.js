/**
 * Lazy Panda — Firebase Cloud Functions
 * 
 * Scheduled function that runs every 5 minutes to check all users'
 * schedules and send push notifications for:
 *   - Upcoming events (10 min before)
 *   - Pending habits that haven't been completed
 *   - Overdue tasks
 * 
 * Messages are personalized based on the user's chosen AI personality
 * (Sassy, Gentle, or Professional) and their preferred name.
 */

const functions = require("firebase-functions");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

const db = getFirestore();
const messaging = getMessaging();

// ── Personality templates ──────────────────────────────────────────────
const PERSONALITY = {
  Sassy: {
    eventSoon: (name, title, mins) =>
      `Hey ${name}, "${title}" starts in ${mins} min. Maybe stop scrolling? 🐼`,
    habitNag: (name, habits) =>
      `${name}, you still have ${habits} habit${habits > 1 ? 's' : ''} untouched today. The panda is judging you. 🐼👀`,
    taskOverdue: (name, task) =>
      `"${task}" was due today, ${name}. It's not going to finish itself. 🐼`,
  },
  Gentle: {
    eventSoon: (name, title, mins) =>
      `Hi ${name}! Just a friendly reminder — "${title}" starts in ${mins} minutes. You got this! 🐼💚`,
    habitNag: (name, habits) =>
      `Hey ${name}, you have ${habits} habit${habits > 1 ? 's' : ''} left for today. No pressure — every step counts! 🐼`,
    taskOverdue: (name, task) =>
      `Gentle reminder: "${task}" is due today, ${name}. You can do it! 🐼`,
  },
  Professional: {
    eventSoon: (name, title, mins) =>
      `Reminder: "${title}" begins in ${mins} minutes.`,
    habitNag: (name, habits) =>
      `${habits} habit${habits > 1 ? 's' : ''} pending for today.`,
    taskOverdue: (name, task) =>
      `Task overdue: "${task}". Action required.`,
  },
};

function getPersonality(style) {
  return PERSONALITY[style] || PERSONALITY.Sassy;
}

// ── Helper: current time in user's timezone ──────────────────────────
function getUserNow(timezone) {
  try {
    const now = new Date();
    const str = now.toLocaleString("en-US", { timeZone: timezone });
    return new Date(str);
  } catch {
    return new Date();
  }
}

function timeToMins(t) {
  if (!t || typeof t !== "string") return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

// ── Main scheduled function: runs every 5 minutes ───────────────────
exports.lazyPandaScheduler = functions.pubsub
  .schedule("every 5 minutes")
  .timeZone("UTC")
  .onRun(async (context) => {
    const usersSnap = await db.collection("users").get();

    for (const doc of usersSnap.docs) {
      const data = doc.data();
      if (!data.fcmTokens || data.fcmTokens.length === 0) continue;
      if (!data.schedule) continue;

      const tz = data.timezone || "UTC";
      const userNow = getUserNow(tz);
      const nowMins = userNow.getHours() * 60 + userNow.getMinutes();
      const todayStr = `${userNow.getFullYear()}-${String(userNow.getMonth() + 1).padStart(2, "0")}-${String(userNow.getDate()).padStart(2, "0")}`;

      // Skip if schedule data is for a different day
      if (data.schedule.date !== todayStr) continue;

      const userName = data.userName || "Boss";
      const personality = getPersonality(data.aiPersonality);
      const notifMinutes = data.schedule.notifMinutes || 10;
      const notifications = [];

      // ── Check upcoming events ──
      if (data.schedule.events) {
        for (const ev of data.schedule.events) {
          const startMins = timeToMins(ev.start);
          const diff = startMins - nowMins;
          if (diff > 0 && diff <= notifMinutes + 2) {
            notifications.push({
              title: `🐼 ${ev.title} in ${Math.round(diff)} min`,
              body: personality.eventSoon(userName, ev.title, Math.round(diff)),
              tag: `ev-${todayStr}-${ev.id}`,
            });
          }
        }
      }

      // ── Check pending habits (nag at 11 AM, 3 PM, 8 PM) ──
      const nagHours = [11, 15, 20];
      if (
        data.schedule.pendingHabits &&
        data.schedule.pendingHabits.length > 0 &&
        nagHours.includes(userNow.getHours()) &&
        userNow.getMinutes() < 5
      ) {
        const count = data.schedule.pendingHabits.length;
        const emojis = data.schedule.pendingHabits
          .map((h) => h.emoji)
          .join(" ");
        notifications.push({
          title: `🐼 ${count} Habit${count > 1 ? "s" : ""} Pending ${emojis}`,
          body: personality.habitNag(userName, count),
          tag: `habit-nag-${todayStr}-${userNow.getHours()}`,
        });
      }

      // ── Check overdue tasks (nag at 9 AM) ──
      if (
        data.schedule.pendingTasks &&
        data.schedule.pendingTasks.length > 0 &&
        userNow.getHours() === 9 &&
        userNow.getMinutes() < 5
      ) {
        for (const task of data.schedule.pendingTasks.slice(0, 3)) {
          notifications.push({
            title: `🐼 Task Due: ${task.name}`,
            body: personality.taskOverdue(userName, task.name),
            tag: `task-${todayStr}-${task.id}`,
          });
        }
      }

      // ── Send all notifications ──
      for (const notif of notifications) {
        const message = {
          data: {
            title: notif.title,
            body: notif.body,
            tag: notif.tag,
          },
          tokens: data.fcmTokens,
        };

        try {
          const response = await messaging.sendEachForMulticast(message);
          // Clean up invalid tokens
          if (response.failureCount > 0) {
            const invalidTokens = [];
            response.responses.forEach((resp, idx) => {
              if (!resp.success) {
                const code = resp.error?.code;
                if (
                  code === "messaging/invalid-registration-token" ||
                  code === "messaging/registration-token-not-registered"
                ) {
                  invalidTokens.push(data.fcmTokens[idx]);
                }
              }
            });
            if (invalidTokens.length > 0) {
              await doc.ref.update({
                fcmTokens:
                  require("firebase-admin/firestore").FieldValue.arrayRemove(
                    ...invalidTokens
                  ),
              });
            }
          }
        } catch (err) {
          console.error(`FCM send error for user ${doc.id}:`, err);
        }
      }
    }
  });

// ══════════════════════════════════════════════
//  HTTP — iCal subscription feed (Phase 5)
//  GET /icalFeed?uid=<uid>&token=<token>
//  Returns a live .ics generated from the user's mirror in Firestore.
//  The token must match users/{uid}.icalToken — rotate by regenerating in the app.
// ══════════════════════════════════════════════

function _icsEscape(s) {
  return String(s || "").replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\r?\n/g, "\\n");
}
function _icsDateTime(date, time) {
  return date.replace(/-/g, "") + "T" + time.replace(":", "") + "00";
}
function _addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

exports.icalFeed = functions.https.onRequest(async (req, res) => {
  try {
    const uid = (req.query.uid || "").toString();
    const token = (req.query.token || "").toString();
    if (!uid || !token) {
      res.status(400).type("text/plain").send("Missing uid or token");
      return;
    }
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) { res.status(404).type("text/plain").send("Unknown user"); return; }
    const data = userDoc.data() || {};
    const storedToken = data.icalToken || (data.settings && data.settings.icalToken);
    if (!storedToken || storedToken !== token) {
      res.status(403).type("text/plain").send("Invalid token");
      return;
    }
    const events = Array.isArray(data.events) ? data.events : [];
    const tzid = data.timezone || "UTC";
    const todayStr = new Date().toISOString().slice(0, 10);
    const horizon = _addDays(todayStr, 90);

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Lazy Panda//AI Organizer//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Lazy Panda Schedule",
      "X-WR-TIMEZONE:" + tzid,
    ];

    for (const ev of events) {
      const rec = ev.recurring || "none";
      const baseDate = ev.date;
      if (!baseDate || !ev.start || !ev.end) continue;

      // Expand recurring events into individual occurrences over the next 90 days.
      const occurrences = [];
      if (rec === "none") {
        if (baseDate >= todayStr && baseDate <= horizon) occurrences.push(baseDate);
      } else {
        const startDate = baseDate < todayStr ? todayStr : baseDate;
        for (let d = startDate; d <= horizon; d = _addDays(d, 1)) {
          if (ev.recurringEndDate && d > ev.recurringEndDate) break;
          const dow = new Date(d + "T12:00:00Z").getUTCDay();
          const baseDow = new Date(baseDate + "T12:00:00Z").getUTCDay();
          let include = false;
          if (rec === "daily") include = true;
          else if (rec === "weekly") include = dow === baseDow;
          else if (rec === "weekends") include = dow === 0 || dow === 6;
          else if (rec === "biweekly") {
            const weeks = Math.floor((new Date(d) - new Date(baseDate)) / (7 * 86400000));
            include = dow === baseDow && weeks >= 0 && weeks % 2 === 0;
          } else if (rec === "monthly") {
            include = new Date(baseDate + "T12:00:00Z").getUTCDate() === new Date(d + "T12:00:00Z").getUTCDate();
          }
          if (include) occurrences.push(d);
        }
      }

      occurrences.forEach((date) => {
        lines.push(
          "BEGIN:VEVENT",
          "UID:" + ev.id + "-" + date + "@lazypanda",
          "DTSTART;TZID=" + tzid + ":" + _icsDateTime(date, ev.start),
          "DTEND;TZID=" + tzid + ":" + _icsDateTime(date, ev.end),
          "SUMMARY:" + _icsEscape(ev.title),
          "LOCATION:" + _icsEscape(ev.location || ""),
          "DESCRIPTION:" + _icsEscape(ev.notes || ""),
          "CATEGORIES:" + _icsEscape(ev.category || "other"),
          "END:VEVENT"
        );
      });
    }
    lines.push("END:VCALENDAR");

    res.set("Cache-Control", "public, max-age=600"); // 10-min CDN cache
    res.type("text/calendar; charset=utf-8");
    res.send(lines.join("\r\n"));
  } catch (e) {
    console.error("icalFeed error:", e);
    res.status(500).type("text/plain").send("Internal error");
  }
});
