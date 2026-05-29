// ══════════════════════════════════════════════
//  flashcards.js — SM-2 spaced repetition
//  Load order: between habits.js and render.js
//  Gated by state.flags.flashcards
// ══════════════════════════════════════════════

// SM-2 algorithm (Piotr Wozniak, 1987). Quality grade 0–5.
// Updates the card's interval (days), repetitions, ease factor, and next due date.
function sm2Schedule(card, q) {
  q = Math.max(0, Math.min(5, q | 0));
  let ef = Number(card.ease) || 2.5;
  let reps = Number(card.reps) || 0;
  let interval;
  if (q < 3) {
    reps = 0;
    interval = 1;
  } else {
    reps += 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 6;
    else interval = Math.round((Number(card.interval) || 1) * ef);
    ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (ef < 1.3) ef = 1.3;
  }
  card.ease = Math.round(ef * 100) / 100;
  card.reps = reps;
  card.interval = interval;
  card.lastReviewed = todayStr();
  // Compute new due date
  const d = new Date();
  d.setDate(d.getDate() + interval);
  card.due = dateStr(d);
  return card;
}

function getDueFlashcards() {
  const today = todayStr();
  return (Array.isArray(state.flashcards) ? state.flashcards : [])
    .filter(c => !c.archived && (!c.due || c.due <= today))
    .sort((a, b) => (a.due || '').localeCompare(b.due || ''));
}

function getDueFlashcardCount() {
  // Only count when the flag is on so the badge doesn't surface a hidden feature.
  if (!state.flags?.flashcards) return 0;
  return getDueFlashcards().length;
}
window.getDueFlashcardCount = getDueFlashcardCount;

// ── CRUD ─────────────────────────────────────────────────────────────────────
let editingFlashcardId = null;

function showAddFlashcardModal(id) {
  editingFlashcardId = id || null;
  const card = id ? state.flashcards.find(c => c.id === id) : null;
  document.getElementById('flashcard-modal-title').textContent = card ? 'Edit Flashcard' : 'Add Flashcard';
  document.getElementById('fc-deck').value = card?.deck || '';
  document.getElementById('fc-front').value = card?.front || '';
  document.getElementById('fc-back').value = card?.back || '';
  document.getElementById('fc-delete-btn').style.display = card ? '' : 'none';
  openModal('flashcard-modal');
}
window.showAddFlashcardModal = showAddFlashcardModal;

function saveFlashcard() {
  const front = document.getElementById('fc-front').value.trim();
  const back = document.getElementById('fc-back').value.trim();
  const deck = document.getElementById('fc-deck').value.trim();
  if (!front || !back) { alert('Front and back are both required.'); return; }
  if (!Array.isArray(state.flashcards)) state.flashcards = [];
  if (editingFlashcardId) {
    const c = state.flashcards.find(x => x.id === editingFlashcardId);
    if (c) { c.front = front; c.back = back; c.deck = deck; }
  } else {
    state.flashcards.push({
      id: 'fc' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      deck, front, back,
      ease: 2.5, reps: 0, interval: 0,
      due: todayStr(),
      lastReviewed: null,
      createdAt: todayStr(),
      archived: false,
    });
  }
  saveState();
  closeModal('flashcard-modal');
  renderFlashcards();
  if (typeof applyFlagNavVisibility === 'function') applyFlagNavVisibility();
}
window.saveFlashcard = saveFlashcard;

function deleteFlashcardFromModal() {
  if (!editingFlashcardId) return;
  if (!confirm('Delete this flashcard?')) return;
  state.flashcards = state.flashcards.filter(c => c.id !== editingFlashcardId);
  editingFlashcardId = null;
  saveState();
  closeModal('flashcard-modal');
  renderFlashcards();
  if (typeof applyFlagNavVisibility === 'function') applyFlagNavVisibility();
}
window.deleteFlashcardFromModal = deleteFlashcardFromModal;

// ── List + summary render ────────────────────────────────────────────────────
function renderFlashcards() {
  const summary = document.getElementById('flashcards-summary');
  const list = document.getElementById('flashcards-list');
  const pane = document.getElementById('flashcard-review-pane');
  if (!summary || !list) return;

  if (!Array.isArray(state.flashcards)) state.flashcards = [];
  const cards = state.flashcards.filter(c => !c.archived);
  const due = getDueFlashcards();
  const learned = cards.filter(c => (c.reps || 0) >= 3).length;

  summary.className = 'fc-summary';
  summary.innerHTML = `
    <div class="stat-card"><div class="stat-label">Total</div><div class="stat-value">${cards.length}</div></div>
    <div class="stat-card"><div class="stat-label">Due today</div><div class="stat-value" style="color:${due.length ? 'var(--accent)' : 'var(--text)'};">${due.length}</div></div>
    <div class="stat-card"><div class="stat-label">Learned</div><div class="stat-value">${learned}</div></div>
  `;

  if (pane && !pane.classList.contains('hidden')) {
    pane.classList.add('hidden');
  }

  if (!cards.length) {
    list.innerHTML = `<div class="empty"><div class="empty-icon">🧠</div>No flashcards yet. Tap "+ Add Card" to start your first deck.</div>`;
    return;
  }

  // Group by deck
  const byDeck = {};
  cards.forEach(c => { const d = c.deck || 'General'; (byDeck[d] ||= []).push(c); });
  list.innerHTML = Object.entries(byDeck).map(([deck, items]) => {
    return `<div style="margin-bottom:16px;">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.06em;color:var(--text3);text-transform:uppercase;margin-bottom:6px;">${esc(deck)} <span style="color:var(--text3);font-weight:400;">· ${items.length} card${items.length === 1 ? '' : 's'}</span></div>
      ${items.map(c => `<div class="fc-list-item">
        <div style="flex:1;min-width:0;">
          <div class="fc-front">${esc(c.front)}</div>
          <div class="fc-back">${esc(c.back)}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:6px;">ease ${(c.ease || 2.5).toFixed(2)} · ${c.reps || 0} reps · next ${esc(c.due || 'today')}</div>
        </div>
        <div class="fc-actions">
          <button onclick="showAddFlashcardModal('${esc(c.id)}')" title="Edit">✏️</button>
        </div>
      </div>`).join('')}
    </div>`;
  }).join('');
}
window.renderFlashcards = renderFlashcards;

// ── Review queue ─────────────────────────────────────────────────────────────
let reviewQueue = [];
let reviewIndex = 0;
let reviewShowingBack = false;

function startFlashcardReview() {
  reviewQueue = getDueFlashcards();
  reviewIndex = 0;
  reviewShowingBack = false;
  if (!reviewQueue.length) { showToast('Nothing due — come back later 🧠'); return; }
  renderReviewCard();
}
window.startFlashcardReview = startFlashcardReview;

function renderReviewCard() {
  const pane = document.getElementById('flashcard-review-pane');
  const list = document.getElementById('flashcards-list');
  if (!pane || !list) return;
  if (reviewIndex >= reviewQueue.length) {
    pane.classList.add('hidden');
    list.classList.remove('hidden');
    showToast('Review complete! 🎉');
    renderFlashcards();
    if (typeof applyFlagNavVisibility === 'function') applyFlagNavVisibility();
    return;
  }
  list.classList.add('hidden');
  pane.classList.remove('hidden');
  const card = reviewQueue[reviewIndex];
  const side = reviewShowingBack ? card.back : card.front;
  const label = reviewShowingBack ? 'Answer' : 'Question';
  pane.innerHTML = `
    <div style="text-align:center;font-size:12px;color:var(--text3);margin-bottom:12px;">${reviewIndex + 1} / ${reviewQueue.length}</div>
    <div class="fc-review-card" onclick="flipReviewCard()">
      <div class="fc-side-label">${label}</div>
      <div class="fc-side-text">${esc(side)}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:16px;">${reviewShowingBack ? 'Grade your answer below' : 'Tap to reveal'}</div>
    </div>
    ${reviewShowingBack ? `<div class="fc-review-grade">
      <button class="fc-grade-btn" onclick="gradeReviewCard(0)" style="border-color:#f87171;">Again<span class="fc-grade-hint">forgot</span></button>
      <button class="fc-grade-btn" onclick="gradeReviewCard(3)" style="border-color:#fbbf24;">Hard<span class="fc-grade-hint">recalled with effort</span></button>
      <button class="fc-grade-btn" onclick="gradeReviewCard(4)" style="border-color:#34d399;">Good<span class="fc-grade-hint">normal</span></button>
      <button class="fc-grade-btn" onclick="gradeReviewCard(5)" style="border-color:#7c6ff7;">Easy<span class="fc-grade-hint">trivial</span></button>
    </div>` : ''}
    <div style="text-align:center;margin-top:16px;">
      <button class="btn-ghost" onclick="endFlashcardReview()" style="font-size:12px;">End session</button>
    </div>
  `;
}
function flipReviewCard() { reviewShowingBack = !reviewShowingBack; renderReviewCard(); }
window.flipReviewCard = flipReviewCard;

function gradeReviewCard(q) {
  const card = reviewQueue[reviewIndex];
  if (card) {
    const target = state.flashcards.find(c => c.id === card.id);
    if (target) sm2Schedule(target, q);
    saveState();
  }
  reviewIndex++;
  reviewShowingBack = false;
  renderReviewCard();
}
window.gradeReviewCard = gradeReviewCard;

function endFlashcardReview() {
  reviewIndex = reviewQueue.length;
  renderReviewCard();
}
window.endFlashcardReview = endFlashcardReview;
