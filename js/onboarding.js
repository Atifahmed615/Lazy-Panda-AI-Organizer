// ══════════════════════════════════════════════
//  onboarding.js — First-run guided tour
//  Phase 3, gated by state.flags.onboarding
// ══════════════════════════════════════════════

const ONBOARDING_SLIDES = [
  {
    art: '🐼',
    title: 'Meet Lazy Panda',
    body: 'Your AI-powered scheduler. Built to handle classes, tasks, deadlines, and habits — all without an account.',
  },
  {
    art: '📱',
    title: 'Install it like a real app',
    body: 'On iPhone: tap Share → "Add to Home Screen". On Android: tap menu → "Install App". You\'ll get an icon, offline access, and push notifications.',
  },
  {
    art: '🤖',
    title: 'Turn on the AI assistant',
    body: 'Open Settings → AI Assistant → paste a free Gemini API key. Once enabled, the panda can add events, fix conflicts, and answer "what does my week look like?" — by voice or text.',
  },
  {
    art: '✨',
    title: 'Type, don\'t click',
    body: 'Enable "Natural-language quick-add" in Labs. Then type things like "study ML tomorrow 6-9pm at NED" and the AI parses it into a real event.',
  },
  {
    art: '🔗',
    title: 'Share & sync',
    body: 'Cloud Sync (Settings → Google) keeps your schedule across devices. Share Link gives friends a read-only view. iCal export pulls everything into Apple/Google Calendar.',
  },
];

let _onboardingIdx = 0;

function maybeShowOnboarding() {
  if (!state.flags?.onboarding) return;
  if (state.onboardingDone) return;
  startOnboarding();
}
window.maybeShowOnboarding = maybeShowOnboarding;

function startOnboarding() {
  _onboardingIdx = 0;
  renderOnboardingStep();
}
window.startOnboarding = startOnboarding;

function renderOnboardingStep() {
  let overlay = document.getElementById('onboarding-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'onboarding-overlay';
    overlay.className = 'onboarding-overlay';
    document.body.appendChild(overlay);
  }
  const total = ONBOARDING_SLIDES.length;
  const slide = ONBOARDING_SLIDES[_onboardingIdx];
  const isLast = _onboardingIdx === total - 1;
  const dots = ONBOARDING_SLIDES.map((_, i) => `<div class="onboarding-dot ${i === _onboardingIdx ? 'active' : ''}"></div>`).join('');
  overlay.innerHTML = `<div class="onboarding-card" role="dialog" aria-labelledby="ob-title" aria-describedby="ob-body">
    <div class="onboarding-art" aria-hidden="true">${slide.art}</div>
    <div class="onboarding-title" id="ob-title">${esc(slide.title)}</div>
    <div class="onboarding-body" id="ob-body">${esc(slide.body)}</div>
    <div class="onboarding-progress" aria-label="${_onboardingIdx + 1} of ${total}">${dots}</div>
    <div class="onboarding-actions">
      <button class="btn-cancel" onclick="finishOnboarding(true)">Skip</button>
      ${_onboardingIdx > 0 ? `<button class="btn-cancel" onclick="prevOnboardingStep()">← Back</button>` : ''}
      <button class="btn-save" onclick="${isLast ? 'finishOnboarding(false)' : 'nextOnboardingStep()'}">${isLast ? 'Get started' : 'Next →'}</button>
    </div>
  </div>`;
}

function nextOnboardingStep() {
  _onboardingIdx = Math.min(_onboardingIdx + 1, ONBOARDING_SLIDES.length - 1);
  renderOnboardingStep();
}
window.nextOnboardingStep = nextOnboardingStep;

function prevOnboardingStep() {
  _onboardingIdx = Math.max(0, _onboardingIdx - 1);
  renderOnboardingStep();
}
window.prevOnboardingStep = prevOnboardingStep;

function finishOnboarding(skipped) {
  state.onboardingDone = true;
  saveState();
  const overlay = document.getElementById('onboarding-overlay');
  if (overlay) overlay.remove();
  if (!skipped) showToast('Welcome aboard 🐼');
}
window.finishOnboarding = finishOnboarding;
