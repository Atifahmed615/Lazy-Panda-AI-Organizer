<div align="center">

# 🐼 Lazy Panda — AI Scheduler

**A premium, AI-powered scheduling assistant for students**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-7c6ff7?style=for-the-badge&logo=github)](https://atifahmed615.github.io/Lazy-panda/)
[![PWA](https://img.shields.io/badge/PWA-Installable-34d399?style=for-the-badge&logo=pwa)](https://atifahmed615.github.io/Lazy-panda/)
[![Google Gemini](https://img.shields.io/badge/Powered%20by-Gemini%202.5%20Flash-f87171?style=for-the-badge)](https://gemini.google.com)
[![License](https://img.shields.io/badge/License-MIT-60a5fa?style=for-the-badge)](LICENSE)

*Manage your classes, tasks, deadlines, and fitness goals through a beautiful glassmorphism UI and a conversational AI assistant — all without a backend.*

</div>

---

## ✨ What's Inside

### 📅 Smart Dashboard
- Live countdown timer to your next class
- Today's full schedule on a visual timeline
- Weekly workload tracker (scheduled hours vs. task load)
- AI-generated conflict detection with configurable **travel buffer**
- Smart resolution suggestions powered by Gemini

### 🤖 AI Assistant (Gemini 2.5 Flash)
- Add, edit, and delete events and tasks by chatting naturally
- Understands relative time: *"tomorrow at 9 PM"*, *"after ML class"*, *"next Monday"*
- Detects scheduling conflicts and proposes fixes
- **AI session memory** — remembers your last actions across the conversation
- **AI-settable reminders** — ask the AI to remind you at a specific time
- **Multi-action parsing** — one message can create multiple events/tasks at once
- Offline fallback using Gemini Nano (Chrome only) when no API key is set
- Voice input support via Web Speech API

### 📆 Schedule Manager
- Week grid + list view with search and category filter
- Export to iCal (.ics) format
- Google Calendar sync (OAuth2)
- Share schedule as a compressed URL
- Recurring events: daily, weekly, biweekly, monthly, weekends

### ✅ Task Manager
- Priority levels: 🔴 High / 🟡 Medium / 🟢 Low
- Subtask checklists per task
- Today / Upcoming split view
- Deadline countdown cards
- Undo / Redo for all destructive actions

### 🎯 Focus Mode
- Pomodoro timer — 25-min focus / 5-min break
- Spring-bounce animations and status tracking

### 💪 Gym Plan (Fat Loss Module)
- Full 102 kg → 80 kg fat loss programme built-in
- Weekly training split: Push / Pull / Legs / HIIT / LISS / Rest
- **Interactive schedule** — tap any day to expand step-by-step exercise drill-down with sets, reps, coaching cues, and common mistake warnings
- HIIT interval timer with configurable work/rest rounds
- Nutrition macros, calorie targets, and meal breakdown
- Personal tips & progressive overload guidance
- Weight progress tracker

### 📊 Statistics
- Weekly task completion rate
- Schedule density heatmap
- Productivity trends over time

### ⚙️ Settings & Sync
- 4 themes: Dark, AMOLED (pure black), Light, High Contrast
- Custom accent colour picker
- Configurable **travel buffer** (0–60 min) for conflict detection
- Cloud sync via Google Firebase (Firestore + Google SSO)
- WhatsApp reminders (requires relay server)
- Browser push notifications with localStorage persistence (survives page refresh)
- Task notifications at 8 AM daily
- Export / Import data (JSON backup)

---

## 🎨 Design

Lazy Panda uses a **Glassmorphism + Bento Box** design system:

- `backdrop-filter: blur()` glass cards with depth
- Animated mesh gradient accents (Electric Cyan → Deep Indigo → Neon Violet)
- Atmospheric background gradients that shift per theme
- Spring-physics modal and chat animations (`cubic-bezier(0.34, 1.56, 0.64, 1)`)
- Custom panda mascot with glowing purple AI eyes
- Mobile-first with a fixed glass bottom nav bar and slide-up chat overlay
- **Offline banner** — amber notice when network is lost, auto-dismisses on reconnect

---

## 📱 Install as Mobile App

### Android (Chrome)
1. Open the live URL in **Chrome**
2. Tap the menu → **"Add to Home Screen"** or **"Install App"**
3. Lazy Panda appears as a native app icon

### iPhone (Safari)
1. Open the live URL in **Safari**
2. Tap the **Share** button → **"Add to Home Screen"** → **Add**

> ⚠️ On iPhone, use **Safari** — Chrome on iOS does not support PWA installation.

---

## 🤖 Setting Up the AI Assistant

The AI requires a **free** Google Gemini API key — no credit card needed.

1. Visit [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Sign in with Google → click **"Create API Key"**
3. In Lazy Panda → **Settings** → paste key under **Gemini API Key** → **Save Key**

> 🔒 Your key is stored **only on your device** (localStorage) and sent exclusively to `generativelanguage.googleapis.com`.

### Example AI commands
| Say | What happens |
|-----|-------------|
| *"What classes do I have today?"* | Lists today's schedule |
| *"Add a study session tomorrow at 9 PM for 2 hours"* | Creates the event |
| *"Move my ML class to 6 PM"* | Reschedules it |
| *"Check my schedule for conflicts"* | Runs conflict analysis |
| *"Create a task: Review backprop notes, due today, high priority"* | Creates the task |
| *"What free time do I have today?"* | Calculates gaps |
| *"Remind me 30 minutes before my ML class"* | Sets a push notification reminder |
| *"Add a study session and a gym session for tomorrow"* | Creates both in one message |

---

## 🗂️ File Structure

```
lazy-panda/
├── index.html          # Frontend shell — structure, modals, nav
├── css/
│   └── style.css       # All styles — glass system, bento grid, themes
├── js/
│   ├── state.js        # State, constants, helpers, conflict detection
│   ├── render.js       # All render functions, modal & view management
│   ├── ai.js           # Gemini chat, voice, notes, optimizer, reminders
│   └── app.js          # Event/task CRUD, settings, notifications, init
├── manifest.json       # PWA manifest (name, icons, display mode)
├── sw.js               # Service worker (offline caching + auto-update)
├── icon.png            # App icon (panda mascot)
├── offline.html        # Fallback page when fully offline
└── README.md           # This file
```

> Scripts load in dependency order: `state.js` → `render.js` → `ai.js` → `app.js`

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML5, CSS3, JavaScript (ES2022) |
| Fonts | DM Sans + DM Mono (Google Fonts) |
| AI | Google Gemini 2.5 Flash API |
| Offline AI | Gemini Nano (Chrome AI Origin Trial) |
| Cloud Sync | Firebase Firestore & Google Auth |
| Calendar | Google Calendar API (OAuth2) |
| Storage | Browser `localStorage` |
| Hosting | GitHub Pages |
| PWA | Web App Manifest + Service Worker |

**No frameworks. No build tools. No backend. No tracking.**

---

## 🚀 Deploy Your Own

1. **Fork** this repository on GitHub
2. Go to **Settings → Pages**
3. Set source → **Deploy from branch → `main` → `/ (root)`**
4. Your app is live at `https://YOUR_USERNAME.github.io/REPO_NAME/`

> For Google Calendar sync: create an OAuth2 Web App client in [Google Cloud Console](https://console.cloud.google.com) and add your GitHub Pages URL as an authorized origin.

---

## 📆 Pre-loaded Class Schedule

The app ships with a full NED University weekly timetable:

| Day | Class | Time | Location |
|-----|-------|------|----------|
| Monday | Machine Learning | 18:00 – 21:00 | NED CIS Department |
| Tuesday | Mathematics for AI | 18:00 – 21:00 | NED CIS Department |
| Wednesday | Introduction to AI | 18:00 – 21:00 | NED CIS Department |
| Thursday | Understanding Holy Quran 1 | 18:00 – 21:00 | NED Auditorium |
| Friday | AI-Driven Dev & Claude Code | 20:00 – 22:00 | Online |
| Sat & Sun | PGD: Machine Learning | 11:00 – 13:00 | NED Textile Department |
| Saturday | CAIPP | 14:00 – 18:00 | PNEC CS Department |
| Sat & Sun | AI-Driven Dev & Claude Code | 20:00 – 22:00 | Online |

All events are editable, deletable, and overridable directly in the app.

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` – `6` | Switch between views |
| `N` | New event |
| `T` | New task |
| `/` | Focus schedule search |
| `?` | Open shortcuts help |
| `Ctrl+Z` | Undo last deletion |
| `Ctrl+Shift+Z` | Redo |
| `Esc` | Close modal / overlay |

---

## 🔒 Privacy

- No accounts, no sign-up required
- All data lives on your device (localStorage)
- API key sent only to Google Gemini — never to any other server
- Backup exports **do not include** your API key
- No analytics, no tracking, no ads

---

## 📄 License

MIT — free to use, fork, and modify.

---

<div align="center">
  <sub>Built with ☕, bamboo 🎋, and late-night purple energy · MS AI Student · NED University, Karachi</sub>
</div>
