// ══════════════════════════════════════════════
//  weekly-review.js — Sunday-evening recap card
//  Phase 3, gated by state.flags.weeklyReview
//  Client-side trigger (no Cloud Function dependency).
//  On Sunday ≥ 18:00 OR any day with no review-this-week, surfaces a card
//  on the dashboard with last-week stats + AI-generated narrative.
// ══════════════════════════════════════════════

function _weekStartFor(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function maybeShowWeeklyReview() {
  if (!state.flags?.weeklyReview) return;
  const now = new Date();
  const isSunday = now.getDay() === 0;
  const isEvening = now.getHours() >= 18;
  // Trigger if it's Sunday evening, OR any time on Monday before review has been shown this week.
  const thisWeekStart = _weekStartFor(now);
  const last = state.lastWeeklyReviewAt ? new Date(state.lastWeeklyReviewAt) : null;
  const showedThisWeek = last && last >= thisWeekStart;
  const shouldShow = !showedThisWeek && ((isSunday && isEvening) || now.getDay() === 1);
  if (!shouldShow) return;
  renderWeeklyReviewCard();
}
window.maybeShowWeeklyReview = maybeShowWeeklyReview;

function computeWeeklyReviewStats() {
  const now = new Date();
  const thisWeekStart = _weekStartFor(now);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(thisWeekStart);
  lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
  const lastStartStr = dateStr(lastWeekStart);
  const lastEndStr = dateStr(lastWeekEnd);

  // Task completion last week
  const lastWeekTasks = state.tasks.filter(t => t.due >= lastStartStr && t.due <= lastEndStr && (t.recurring || 'none') === 'none');
  const completed = lastWeekTasks.filter(t => isTaskComplete(t)).length;
  const taskRate = lastWeekTasks.length ? Math.round((completed / lastWeekTasks.length) * 100) : null;

  // Focus minutes last week
  const focusMins = (state.focusLog || [])
    .filter(s => s.date >= lastStartStr && s.date <= lastEndStr)
    .reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);

  // Habits — average streak length on active habits
  const active = (state.habits || []).filter(h => !h.archived);
  const streaks = active.map(getHabitStreak);
  const avgStreak = streaks.length ? Math.round(streaks.reduce((a, b) => a + b, 0) / streaks.length) : 0;
  const longestStreak = streaks.length ? Math.max(...streaks) : 0;

  // Next-week look-ahead — open tasks due in the next 7 days
  const next7 = new Date(now); next7.setDate(next7.getDate() + 7);
  const upcoming = state.tasks
    .filter(t => !isTaskComplete(t) && t.due >= dateStr(now) && t.due <= dateStr(next7))
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 5);

  return {
    lastStartStr, lastEndStr,
    lastWeekTaskTotal: lastWeekTasks.length,
    lastWeekTaskCompleted: completed,
    taskRate,
    focusMins,
    avgStreak,
    longestStreak,
    upcoming,
  };
}

async function generateReviewNarrative(stats) {
  // Fallback narrative if no API key
  const fallback = [];
  if (stats.taskRate != null) fallback.push(`You closed ${stats.lastWeekTaskCompleted} of ${stats.lastWeekTaskTotal} tasks (${stats.taskRate}%).`);
  if (stats.focusMins) fallback.push(`Focused for ${Math.floor(stats.focusMins / 60)}h ${stats.focusMins % 60}m.`);
  if (stats.longestStreak) fallback.push(`Longest habit streak: ${stats.longestStreak} days.`);
  if (stats.upcoming.length) fallback.push(`Next up: ${stats.upcoming.slice(0, 3).map(t => t.name).join(', ')}.`);
  const fallbackText = fallback.join(' ') || 'A new week begins — make it count.';
  if (!state.apiKey) return fallbackText;

  try {
    const prompt = `You are Lazy Panda, a ${state.aiPersonality || 'Sassy'} scheduling assistant.
Write a SHORT (2-3 sentences, ~60 words) weekly review for ${state.userName || 'Boss'}.
Be specific to the numbers. Tone matches personality. End with one concrete suggestion for next week.

LAST WEEK STATS:
- Tasks: ${stats.lastWeekTaskCompleted}/${stats.lastWeekTaskTotal} done (${stats.taskRate ?? 'n/a'}%)
- Focus time: ${stats.focusMins} minutes
- Longest habit streak: ${stats.longestStreak} days
- Avg streak across habits: ${stats.avgStreak}

NEXT WEEK (top open tasks):
${stats.upcoming.map(t => `- ${t.name} (due ${t.due}, ${t.priority})`).join('\n') || '- nothing scheduled yet'}

Write the message now. No greeting, no signature.`;

    const res = await geminiFetch({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 220 }
    });
    if (!res.ok) return fallbackText;
    const body = await res.json();
    return (body?.candidates?.[0]?.content?.parts?.[0]?.text || fallbackText).trim();
  } catch (e) {
    console.warn('[weekly-review] AI narrative failed:', e);
    return fallbackText;
  }
}

async function renderWeeklyReviewCard() {
  const dash = document.getElementById('view-dashboard');
  if (!dash) return;
  // Don't insert twice
  if (document.getElementById('weekly-review-card')) return;
  const stats = computeWeeklyReviewStats();
  const card = document.createElement('div');
  card.id = 'weekly-review-card';
  card.className = 'weekly-review-card';
  card.innerHTML = `<div class="wrc-header">Weekly Review</div>
    <div class="wrc-title">Last week, ${esc(stats.lastStartStr)} → ${esc(stats.lastEndStr)}</div>
    <div class="wrc-stats">
      ${stats.taskRate != null ? `<div class="wrc-stat"><b>${stats.taskRate}%</b>tasks done</div>` : ''}
      <div class="wrc-stat"><b>${Math.floor(stats.focusMins/60)}h ${stats.focusMins%60}m</b>focus time</div>
      <div class="wrc-stat"><b>${stats.longestStreak}d</b>longest streak</div>
    </div>
    <div class="wrc-narrative" id="wrc-narrative">Loading insights...</div>
    <button class="wrc-close" onclick="dismissWeeklyReview()">Dismiss</button>`;
  // Insert at the very top of the dashboard
  dash.insertBefore(card, dash.firstChild);
  const narrEl = document.getElementById('wrc-narrative');
  const text = await generateReviewNarrative(stats);
  if (narrEl) narrEl.textContent = text;
}
window.renderWeeklyReviewCard = renderWeeklyReviewCard;

function dismissWeeklyReview() {
  state.lastWeeklyReviewAt = new Date().toISOString();
  saveState();
  const card = document.getElementById('weekly-review-card');
  if (card) card.remove();
}
window.dismissWeeklyReview = dismissWeeklyReview;
