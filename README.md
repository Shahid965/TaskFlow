TaskFLow Live Link - https://taskflow-shah.netlify.app/

# TaskFlow OS v2 — Setup Guide

## ⚡ Quick Start (5 Minutes)

### Step 1 — Set Up Firebase (free)

**A. Create a Firebase Project**
1. Go to [firebase.google.com](https://firebase.google.com) → Sign in with Google
2. Click **"Add project"** → Name it `TaskFlow` → Click **Create project**

**B. Enable Login (Email & Password)**
1. Left sidebar → **Authentication** → **Get started**
2. Click **Email/Password** → Toggle **Enable** → Click **Save**

**C. Create the Database**
1. Left sidebar → **Firestore Database** → **Create database**
2. Choose **"Start in test mode"** → Click **Next**
3. Pick a location (e.g. `asia-south1` for India) → Click **Done**

**D. Get Your Config Keys**
1. Click the **⚙️ gear icon** (top left) → **Project settings**
2. Scroll to **"Your apps"** → Click **`</>`** (Web icon) → Register app
3. You'll see a config object like this:

```js
const firebaseConfig = {
  apiKey:            "AIzaSy...",
  authDomain:        "taskflow-xxx.firebaseapp.com",
  projectId:         "taskflow-xxx",
  storageBucket:     "taskflow-xxx.appspot.com",
  messagingSenderId: "12345...",
  appId:             "1:12345:web:abc..."
};
```

**E. Paste into `firebase-config.js`**

Open `firebase-config.js` in any text editor (Notepad is fine) and replace each `PASTE_YOUR_..._HERE` placeholder with your actual values. Save the file.

---

### Step 2 — Open the App

**Just double-click `index.html`** — it opens in your browser.

That's it! ✅

---

## 📁 File Structure

```
/TaskFlow
├── index.html          ← The complete app (all views in one file)
├── styles.css          ← All styling
├── firebase-config.js  ← YOUR Firebase credentials go here
├── auth.js             ← Login / Signup / Logout logic
├── app.js              ← Workspaces, Tasks, Dashboard, all features
│
├── /assets
│   ├── icons/
│   └── images/
│
└── README.md           ← This file
```

---

## 🚀 Features

### 🔐 Authentication
- Sign up with email & password
- Sign in on any device
- Data is 100% private — no one else can see your tasks

### 🔄 Real-Time Sync
- Open on your laptop AND your phone — changes appear on both instantly
- Works offline — changes sync when you reconnect
- Powered by Firebase Firestore

### 📦 Workspaces
- Create as many workspaces as you want
- Each workspace is completely separate from the others
- Examples: `📚 Studies`, `💼 Work`, `🏠 Home`, `💪 Fitness`, `🚀 Projects`
- Pick an emoji and color for each
- See all workspaces as cards on one overview page
- Click any card to open that workspace

### ✅ Tasks (within each workspace)
- Add, edit, delete tasks
- Each task has: Title, Description, Status, Priority, Due Date, Notes
- **Status:** To Do / In Progress / Done
- **Priority:** Low / Medium / High / Critical
- Filter tasks by status
- Check off tasks directly from the list

### 📊 Dashboard
- Total tasks, completed, pending, overdue — across ALL workspaces
- Preview of each workspace with task summary
- Personalized greeting

### ⚙️ Settings
- Change your display name
- Dark / Light mode toggle (synced to your account)
- Sign out
- Delete account

---

## 📱 Using on Your Phone

Since this is a local HTML file, the simplest ways to use it on your phone:

**Option 1: GitHub Pages (Recommended, Free)**
1. Create a free [GitHub](https://github.com) account
2. Create a new repository, upload your 5 files
3. Go to Settings → Pages → Source: main branch → Save
4. Your app is live at `https://yourname.github.io/taskflow/`
5. Open this URL on your phone and add it to your home screen

**Option 2: Netlify (Drag & Drop)**
1. Go to [netlify.com](https://netlify.com) → Sign up free
2. Drag your `TaskFlow` folder onto the Netlify dashboard
3. Get a live URL instantly — open it on any device

**Option 3: Local Network**
1. Install [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) in VS Code
2. Right-click `index.html` → Open with Live Server
3. Note your IP address (e.g. `192.168.1.5:5500`)
4. Open `http://192.168.1.5:5500` on your phone (same WiFi)

---

## 🔒 Security Note

The default Firestore rules (test mode) allow any authenticated user to read/write their own data. This is fine for personal use.

For extra security, go to **Firestore → Rules** and replace with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

This ensures users can only access their own data.

---

## ❓ Troubleshooting

| Problem | Solution |
|---------|----------|
| "Missing Firebase config" error | Make sure you filled in all 6 values in `firebase-config.js` |
| Login not working | Check that Email/Password auth is enabled in Firebase Console |
| Data not syncing | Check Firestore is created in Firebase Console |
| App shows blank page | Open browser DevTools (F12) → Console tab for error messages |
| "Permission denied" | Make sure Firestore is in test mode, or update security rules |

---

## 🛠 Tech Stack

- **HTML / CSS / JavaScript** — Pure, no frameworks
- **Firebase Authentication** — Login & Signup
- **Firebase Firestore** — Real-time cloud database & sync
- **Google Fonts (Inter)** — Typography

---

![HTML](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat&logo=firebase&logoColor=black)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=flat&logo=pwa&logoColor=white)
![Netlify](https://img.shields.io/badge/Netlify-00C7B7?style=flat&logo=netlify&logoColor=white)


*Built with ❤️ — TaskFlow OS v2.0*
