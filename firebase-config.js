// ================================================================
// firebase-config.js
// ================================================================
// SETUP INSTRUCTIONS:
// 1. Go to https://firebase.google.com and sign in with Google
// 2. Click "Add project" → name it "TaskFlow" → Create
// 3. In left sidebar → Authentication → Get started → Email/Password → Enable
// 4. In left sidebar → Firestore Database → Create database → Test mode → Done
// 5. Click gear icon ⚙️ → Project settings → Your apps → Click </> → Register
// 6. Copy the firebaseConfig values below and replace the placeholders
// 7. Save this file → Open index.html → Done! ✅
// ================================================================

const firebaseConfig = {
  apiKey: "AIzaSyB4FltWvIONFtvpoliMdSXjKgtIZatqj3s",
  authDomain: "taskflow-1a08a.firebaseapp.com",
  projectId: "taskflow-1a08a",
  storageBucket: "taskflow-1a08a.firebasestorage.app",
  messagingSenderId: "326227969050",
  appId: "1:326227969050:web:7b48926c5c3c8bcd5dfda3"
};

// Initialize Firebase (do not edit below this line)
firebase.initializeApp(firebaseConfig);

// Export references used by auth.js and app.js
const auth = firebase.auth();
const db   = firebase.firestore();

// Enable offline persistence so the app works without internet
// (data syncs automatically when reconnected)
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
  if (err.code === 'failed-precondition') {
    // Multiple tabs open — offline persistence only works in one tab at a time
    console.warn('Offline persistence unavailable: multiple tabs open.');
  } else if (err.code === 'unimplemented') {
    console.warn('Offline persistence not supported in this browser.');
  }
});
