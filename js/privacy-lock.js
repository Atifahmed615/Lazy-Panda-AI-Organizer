// ══════════════════════════════════════════════
//  privacy-lock.js — Phase 5
//  Optional 4-digit PIN lock on app boot. Off by default.
//  PIN is salted+hashed via SHA-256; plaintext never persisted.
// ══════════════════════════════════════════════

async function _sha256(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function _hashPin(pin) {
  // Static device-local salt baked from the user's API key (or fallback). Best-effort obfuscation, not a security boundary.
  const salt = (state.apiKey || 'lazy-panda-default-salt').slice(0, 12);
  return _sha256(salt + ':' + pin);
}

function maybeShowPrivacyLock() {
  if (!state.flags?.privacyLock) return false;
  if (!state.privacyLockEnabled || !state.privacyLockHash) return false;
  showPrivacyLockOverlay();
  return true;
}
window.maybeShowPrivacyLock = maybeShowPrivacyLock;

function showPrivacyLockOverlay() {
  if (document.getElementById('privacy-lock-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'privacy-lock-overlay';
  overlay.className = 'onboarding-overlay';
  overlay.style.zIndex = '9999';
  overlay.innerHTML = `<div class="onboarding-card" style="max-width:340px;">
    <div class="onboarding-art" aria-hidden="true">🔒</div>
    <div class="onboarding-title">Enter PIN</div>
    <div class="onboarding-body" id="pl-msg" style="color:var(--text3);">Type your 4-digit code to unlock.</div>
    <input id="pl-pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" class="form-input" style="text-align:center;font-size:24px;letter-spacing:8px;padding:14px;width:160px;margin:8px auto 16px;" oninput="onPinInput(event)">
    <div style="font-size:11px;color:var(--text3);">Lazy Panda has not transmitted this PIN anywhere.</div>
  </div>`;
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('pl-pin-input')?.focus(), 50);
  // Prevent app interaction while locked
  document.body.style.overflow = 'hidden';
}

async function onPinInput(e) {
  const val = e.target.value;
  if (val.length < 4) return;
  const hash = await _hashPin(val);
  if (hash === state.privacyLockHash) {
    hidePrivacyLockOverlay();
  } else {
    e.target.value = '';
    const msg = document.getElementById('pl-msg');
    if (msg) { msg.textContent = 'Wrong PIN — try again'; msg.style.color = 'var(--coral)'; }
  }
}
window.onPinInput = onPinInput;

function hidePrivacyLockOverlay() {
  const overlay = document.getElementById('privacy-lock-overlay');
  if (overlay) overlay.remove();
  document.body.style.overflow = '';
}

// ── Settings actions ──
async function setPrivacyPin() {
  const pin = (prompt('Choose a 4-digit PIN (digits only):') || '').trim();
  if (!/^\d{4}$/.test(pin)) { alert('PIN must be exactly 4 digits.'); return; }
  state.privacyLockHash = await _hashPin(pin);
  state.privacyLockEnabled = true;
  saveState();
  showToast('🔒 Privacy lock enabled.');
}
window.setPrivacyPin = setPrivacyPin;

function disablePrivacyLock() {
  if (!confirm('Disable the privacy lock?')) return;
  state.privacyLockEnabled = false;
  state.privacyLockHash = '';
  saveState();
  showToast('Privacy lock disabled.');
}
window.disablePrivacyLock = disablePrivacyLock;
