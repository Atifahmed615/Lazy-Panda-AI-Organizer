/**
 * Lazy Panda — Habits Management Module
 * Handles all CRUD operations, modals, counters, streaks, and completions for habits.
 */

let editingHabitId = null;
const DAY_INITIALS = ['S','M','T','W','T','F','S'];

function _buildHabitWeekdayPicker(selected) {
  const wrap = document.getElementById('hb-weekday-picker');
  if (!wrap) return;
  wrap.innerHTML = DAY_INITIALS.map((d, i) => {
    const on = selected.includes(i);
    return `<button type="button" class="hb-day-pill${on ? ' on' : ''}" data-day="${i}" onclick="toggleHabitWeekday(${i})">${d}</button>`;
  }).join('');
}

function _buildHabitColorPicker(selected) {
  const wrap = document.getElementById('hb-color-picker');
  if (!wrap) return;
  wrap.innerHTML = HABIT_COLOR_PRESETS.map(c => {
    const on = (selected || '').toLowerCase() === c.toLowerCase();
    return `<button type="button" class="hb-color-swatch${on ? ' on' : ''}" data-color="${c}" style="background:${c};" aria-label="Color ${c}" onclick="selectHabitColor('${c}')"></button>`;
  }).join('');
}

function toggleHabitWeekday(day) {
  const btn = document.querySelector('.hb-day-pill[data-day="' + day + '"]');
  if (!btn) return;
  btn.classList.toggle('on');
}

function selectHabitColor(color) {
  document.querySelectorAll('.hb-color-swatch').forEach(el => el.classList.toggle('on', el.dataset.color === color));
}

function _getHabitFormSelectedWeekdays() {
  return Array.from(document.querySelectorAll('.hb-day-pill.on')).map(b => Number(b.dataset.day));
}

function _getHabitFormColor() {
  const on = document.querySelector('.hb-color-swatch.on');
  return on ? on.dataset.color : HABIT_COLOR_PRESETS[0];
}

function updateHabitTypeUI() {
  const type = document.getElementById('hb-type').value;
  document.getElementById('hb-counter-row').style.display = type === 'counter' ? '' : 'none';
}

function updateHabitFrequencyUI() {
  const freq = document.getElementById('hb-frequency').value;
  document.getElementById('hb-weekdays-row').style.display = freq === 'weekly' ? '' : 'none';
}

function showAddHabitModal() {
  editingHabitId = null;
  document.getElementById('habit-modal-title').textContent = 'Add Habit';
  document.getElementById('hb-name').value = '';
  document.getElementById('hb-emoji').value = '⭐';
  document.getElementById('hb-type').value = 'checkoff';
  document.getElementById('hb-target').value = 1;
  document.getElementById('hb-unit').value = '';
  document.getElementById('hb-frequency').value = 'daily';
  document.getElementById('hb-reminder').value = '';
  document.getElementById('hb-delete-btn').style.display = 'none';
  _buildHabitWeekdayPicker([1,2,3,4,5]);
  _buildHabitColorPicker(HABIT_COLOR_PRESETS[0]);
  updateHabitTypeUI();
  updateHabitFrequencyUI();
  openModal('habit-modal');
}

function editHabit(id) {
  const h = (state.habits || []).find(x => x.id === id);
  if (!h) return;
  editingHabitId = id;
  document.getElementById('habit-modal-title').textContent = 'Edit Habit';
  document.getElementById('hb-name').value = h.name || '';
  document.getElementById('hb-emoji').value = h.emoji || '⭐';
  document.getElementById('hb-type').value = h.type || 'checkoff';
  document.getElementById('hb-target').value = h.target || 1;
  document.getElementById('hb-unit').value = h.unit || '';
  document.getElementById('hb-frequency').value = h.frequency || 'daily';
  document.getElementById('hb-reminder').value = h.reminderTime || '';
  document.getElementById('hb-delete-btn').style.display = '';
  _buildHabitWeekdayPicker(Array.isArray(h.weekdays) && h.weekdays.length ? h.weekdays : [1,2,3,4,5]);
  _buildHabitColorPicker(h.color || HABIT_COLOR_PRESETS[0]);
  updateHabitTypeUI();
  updateHabitFrequencyUI();
  openModal('habit-modal');
}

function saveHabit() {
  const name = document.getElementById('hb-name').value.trim();
  if (!name) { alert('Please enter a habit name'); return; }
  const type = document.getElementById('hb-type').value;
  const frequency = document.getElementById('hb-frequency').value;
  const target = Math.max(1, Number(document.getElementById('hb-target').value) || 1);
  const unit = document.getElementById('hb-unit').value.trim();
  const reminderTime = document.getElementById('hb-reminder').value || '';
  let weekdays = _getHabitFormSelectedWeekdays();
  if (frequency === 'daily' || !weekdays.length) weekdays = [0,1,2,3,4,5,6];
  const color = _getHabitFormColor();
  const emoji = document.getElementById('hb-emoji').value.trim() || '⭐';

  if (!Array.isArray(state.habits)) state.habits = [];

  if (editingHabitId) {
    const idx = state.habits.findIndex(h => h.id === editingHabitId);
    if (idx >= 0) {
      const existing = state.habits[idx];
      state.habits[idx] = {
        ...existing,
        name, emoji, color, type, target, unit, frequency, weekdays, reminderTime,
        weeklyTarget: frequency === 'daily' ? 7 : weekdays.length
      };
    }
  } else {
    state.habits.push({
      id: 'h' + Date.now() + Math.random().toString(36).slice(2),
      name, emoji, color, type, target, unit, frequency, weekdays,
      weeklyTarget: frequency === 'daily' ? 7 : weekdays.length,
      createdAt: todayStr(),
      completions: {},
      reminderTime,
      archived: false
    });
  }
  if (navigator.vibrate) navigator.vibrate(30);
  saveState(); render();
  closeModal('habit-modal');
}

function deleteHabitFromModal() {
  if (!editingHabitId) return;
  const h = (state.habits || []).find(x => x.id === editingHabitId);
  if (!h) { closeModal('habit-modal'); return; }
  if (!confirm('Delete habit "' + h.name + '"? Streak history will be lost.')) return;
  state.habits = state.habits.filter(x => x.id !== editingHabitId);
  editingHabitId = null;
  saveState(); render();
  closeModal('habit-modal');
  showToast('Habit deleted');
}

function _findHabit(id) {
  return (state.habits || []).find(h => h.id === id);
}

function toggleHabitDone(id) {
  const h = _findHabit(id);
  if (!h) return;
  const today = todayStr();
  if (!h.completions) h.completions = {};
  if (isHabitDoneForDate(h, today)) {
    delete h.completions[today];
  } else {
    h.completions[today] = h.type === 'counter' ? getHabitDailyTarget(h) : 1;
    if (navigator.vibrate) navigator.vibrate(20);
    const streak = getHabitStreak(h);
    if (streak > 0 && streak % 7 === 0) showToast('🔥 ' + streak + '-day streak on ' + h.name + '!');
  }
  saveState(); render();
}

function incrementHabit(id) {
  const h = _findHabit(id);
  if (!h) return;
  const today = todayStr();
  if (!h.completions) h.completions = {};
  const cur = getHabitProgress(h, today);
  const target = getHabitDailyTarget(h);
  h.completions[today] = cur + 1;
  if (navigator.vibrate) navigator.vibrate(15);
  // Toast when target newly reached
  if (cur < target && cur + 1 >= target) {
    const streak = getHabitStreak(h);
    showToast('✅ ' + h.name + ' — done! 🔥 ' + streak);
  }
  saveState(); render();
}

function decrementHabit(id) {
  const h = _findHabit(id);
  if (!h) return;
  const today = todayStr();
  if (!h.completions) h.completions = {};
  const cur = getHabitProgress(h, today);
  if (cur <= 0) return;
  if (cur - 1 <= 0) delete h.completions[today];
  else h.completions[today] = cur - 1;
  if (navigator.vibrate) navigator.vibrate(15);
  saveState(); render();
}
