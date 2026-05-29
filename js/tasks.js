/**
 * Lazy Panda — Tasks CRUD Module
 * Handles all task creation, editing, completion toggle, sub-tasks, and deletion.
 * Recurrence/completion calculations live in state.js; this file is UI + mutation only.
 */

let taskModalSubtasks = [];

function renderTaskModalSubtasks() {
  const el = document.getElementById('tk-subtasks-list');
  if (!el) return;
  el.innerHTML = taskModalSubtasks.map(st => `<div class="subtask-editor-item">
    <span>${esc(st.name)}</span>
    <button type="button" onclick="removeTaskModalSubtask('${esc(st.id)}')">x</button>
  </div>`).join('');
}

function addTaskModalSubtask() {
  const input = document.getElementById('tk-subtask-input');
  const name = input.value.trim();
  if (!name) return;
  taskModalSubtasks.push({ id: 'st' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), name, done: false });
  input.value = '';
  renderTaskModalSubtasks();
}

function removeTaskModalSubtask(id) {
  taskModalSubtasks = taskModalSubtasks.filter(st => st.id !== id);
  renderTaskModalSubtasks();
}

function showAddTaskModal() {
  taskModalSubtasks = [];
  document.getElementById('tk-name').value = '';
  document.getElementById('tk-due').value = todayStr();
  document.getElementById('tk-priority').value = 'medium';
  document.getElementById('tk-recurring').value = 'none';
  document.getElementById('tk-recurring-day').value = String(new Date().getDay());
  document.getElementById('tk-subtask-input').value = '';
  const estEl = document.getElementById('tk-est-minutes');
  if (estEl) estEl.value = '';
  renderTaskModalSubtasks();
  applyTaskModalFlagVisibility();
  openModal('task-modal');
}

function applyTaskModalFlagVisibility() {
  if (!state.flags) state.flags = defaultFlags();
  const group = document.getElementById('tk-duration-group');
  if (group) group.style.display = state.flags.taskDuration ? '' : 'none';
}

function saveTask() {
  const name = document.getElementById('tk-name').value.trim();
  if (!name) { alert('Please enter a task name'); return; }
  const estRaw = document.getElementById('tk-est-minutes')?.value;
  const estMinutes = estRaw && Number(estRaw) > 0 ? Math.min(600, Number(estRaw)) : null;
  state.tasks.push({
    id: 't'+Date.now(),
    name,
    due: document.getElementById('tk-due').value,
    priority: document.getElementById('tk-priority').value,
    subtasks: taskModalSubtasks,
    recurring: document.getElementById('tk-recurring').value,
    recurringDay: Number(document.getElementById('tk-recurring-day').value),
    doneDates: [],
    done: false,
    estMinutes,
  });
  saveState(); render();
  closeModal('task-modal');
}

function toggleTask(id, date = todayStr()) {
  const t = state.tasks.find(t=>t.id===id);
  if (!t) return;

  // Animate the checkbox before the DOM re-renders
  const checkEl = document.querySelector(`.task-check[onclick*="'${id}'"]`);
  if (checkEl) {
    checkEl.classList.remove('checking');
    // Force reflow so removing+re-adding the class restarts the animation
    void checkEl.offsetWidth;
    checkEl.classList.add('checking');
  }

  if ((t.recurring || 'none') !== 'none') {
    t.doneDates = t.doneDates || [];
    if (t.doneDates.includes(date)) t.doneDates = t.doneDates.filter(d => d !== date);
    else t.doneDates.push(date);
  } else {
    t.done = !t.done;
    if ((t.subtasks || []).length && t.done) t.subtasks.forEach(st => st.done = true);
  }

  // Haptic: stronger pulse when completing, lighter when unchecking
  if (isTaskDoneForDate(t, date)) haptic(45);
  else haptic(20);

  // Delay render slightly so the animation has time to play
  setTimeout(() => { saveState(); render(); }, 180);
}

function toggleSubtask(taskId, subtaskId) {
  const t = state.tasks.find(task => task.id === taskId);
  const st = t?.subtasks?.find(item => item.id === subtaskId);
  if (!st) return;
  st.done = !st.done;
  t.done = t.subtasks.length ? t.subtasks.every(item => item.done) : !!t.done;
  saveState();
  render();
}

function deleteTask(id) {
  haptic(50);
  const task = state.tasks.find(t => t.id === id);
  let entry = null;
  if (task) {
    entry = pushUndoEntry({ type: 'delete_task', payload: { ...task } });
  }
  state.tasks = state.tasks.filter(t=>t.id!==id);
  saveState(); render();
  if (entry) showDeleteUndoToast(entry);
}
