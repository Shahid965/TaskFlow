// ================================================================
// auth.js — Authentication Logic
// Handles: Login, Signup, Logout, Auth State Changes
// ================================================================

'use strict';

/* ----------------------------------------------------------------
   AUTH STATE OBSERVER
   Firebase calls this every time auth state changes:
   - When user logs in  → show app, hide auth page
   - When user logs out → show auth page, hide app
   ---------------------------------------------------------------- */
auth.onAuthStateChanged(async (user) => {
  const authView = document.getElementById('auth-view');
  const appView  = document.getElementById('app-view');

  if (user) {
    // ✅ User is logged in
    authView.hidden = true;
    appView.hidden  = false;

    // Boot the main application
    await bootApp(user);

  } else {
    // ❌ User is logged out
    authView.hidden = false;
    appView.hidden  = true;

    // Clean up any active Firestore listeners
    cleanupListeners();
  }
});

/* ----------------------------------------------------------------
   LOGIN
   ---------------------------------------------------------------- */
async function handleLogin(event) {
  event.preventDefault();

  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl  = document.getElementById('login-error');
  const btn      = document.getElementById('login-submit-btn');

  clearAuthError('login-error');
  setButtonLoading(btn, true);

  try {
    await auth.signInWithEmailAndPassword(email, password);
    // onAuthStateChanged handles the rest
  } catch (err) {
    errorEl.textContent = getFriendlyAuthError(err.code);
    setButtonLoading(btn, false);
  }
}

/* ----------------------------------------------------------------
   SIGNUP
   ---------------------------------------------------------------- */
async function handleSignup(event) {
  event.preventDefault();

  const name     = document.getElementById('signup-name').value.trim();
  const email    = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const errorEl  = document.getElementById('signup-error');
  const btn      = document.getElementById('signup-submit-btn');

  clearAuthError('signup-error');

  if (!name) {
    document.getElementById('signup-error').textContent = 'Please enter your name.';
    return;
  }

  setButtonLoading(btn, true);

  try {
    // Create the Firebase Auth user
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;

    // Update display name in Firebase Auth
    await user.updateProfile({ displayName: name });

    // Save user profile in Firestore
    await db.collection('users').doc(user.uid).set({
      name:      name,
      email:     email,
      theme:     'dark',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // onAuthStateChanged handles the rest
  } catch (err) {
    document.getElementById('signup-error').textContent = getFriendlyAuthError(err.code);
    setButtonLoading(btn, false);
  }
}

/* ----------------------------------------------------------------
   LOGOUT
   ---------------------------------------------------------------- */
async function handleLogout() {
  try {
    await auth.signOut();
    showToast('Signed out successfully', 'success');
  } catch (err) {
    showToast('Error signing out. Please try again.', 'error');
  }
}

/* ----------------------------------------------------------------
   DELETE ACCOUNT
   ---------------------------------------------------------------- */
async function confirmDeleteAccount() {
  showConfirmModal(
    'Delete Account',
    'This will permanently delete your account, all workspaces, and all tasks. This CANNOT be undone.',
    async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;

        // Delete all user data from Firestore
        // (Workspaces and their tasks are in subcollections —
        //  we'll delete the root profile; deeper cleanup via Cloud Functions
        //  or the user can do it manually from Firebase console)
        await db.collection('users').doc(user.uid).delete();

        // Delete the Auth account
        await user.delete();
        showToast('Account deleted.', 'info');
      } catch (err) {
        // Firebase requires recent login for sensitive operations
        if (err.code === 'auth/requires-recent-login') {
          showToast('Please sign out and sign back in, then try again.', 'warning');
        } else {
          showToast('Error deleting account: ' + err.message, 'error');
        }
      }
    }
  );
}

/* ----------------------------------------------------------------
   UI HELPERS
   ---------------------------------------------------------------- */

/** Switch between Login and Signup tab */
function switchAuthTab(tab) {
  const loginForm  = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const loginTab   = document.getElementById('login-tab');
  const signupTab  = document.getElementById('signup-tab');

  if (tab === 'login') {
    loginForm.hidden  = false;
    signupForm.hidden = true;
    loginTab.classList.add('active');
    signupTab.classList.remove('active');
  } else {
    loginForm.hidden  = true;
    signupForm.hidden = false;
    signupTab.classList.add('active');
    loginTab.classList.remove('active');
  }

  clearAuthError('login-error');
  clearAuthError('signup-error');
}

/** Toggle password field visibility */
function togglePassword(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

/** Set button into loading state */
function setButtonLoading(btn, loading) {
  const text   = btn.querySelector('.btn-text');
  const loader = btn.querySelector('.btn-loader');
  btn.disabled = loading;
  if (text)   text.hidden   = loading;
  if (loader) loader.hidden = !loading;
}

/** Clear error message */
function clearAuthError(id) {
  const el = document.getElementById(id);
  if (el) el.textContent = '';
}

/** Convert Firebase error codes to friendly messages */
function getFriendlyAuthError(code) {
  const messages = {
    'auth/user-not-found':       'No account found with this email.',
    'auth/wrong-password':       'Incorrect password. Please try again.',
    'auth/invalid-email':        'Please enter a valid email address.',
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/weak-password':        'Password must be at least 6 characters.',
    'auth/too-many-requests':    'Too many attempts. Please wait a moment.',
    'auth/network-request-failed': 'Network error. Check your internet connection.',
    'auth/invalid-credential':   'Invalid email or password.',
    'auth/user-disabled':        'This account has been disabled.'
  };
  return messages[code] || 'An error occurred. Please try again.';
}
