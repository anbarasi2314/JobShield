import { auth, isFirebaseConfigured } from './firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

const signedOutElements = document.querySelectorAll('[data-auth-signed-out]');
const signedInElements = document.querySelectorAll('[data-auth-signed-in]');
const userLabels = document.querySelectorAll('[data-auth-user-email]');
const logoutButtons = document.querySelectorAll('[data-auth-logout]');

function showSignedOut() {
  signedOutElements.forEach(element => { element.hidden = false; });
  signedInElements.forEach(element => { element.hidden = true; });
}

function showSignedIn(user) {
  const email = user.email || user.displayName || 'Signed in';
  signedOutElements.forEach(element => { element.hidden = true; });
  signedInElements.forEach(element => { element.hidden = false; });
  userLabels.forEach(element => {
    element.textContent = email;
    element.title = email;
  });
}

showSignedOut();
if (!isFirebaseConfigured || !auth) {
  document.documentElement.dataset.firebaseAuth = 'unconfigured';
} else {
  onAuthStateChanged(auth, user => {
    document.documentElement.dataset.firebaseAuth = user ? 'signed-in' : 'signed-out';
    if (user) showSignedIn(user);
    else showSignedOut();
  }, error => {
    document.documentElement.dataset.firebaseAuth = 'error';
    console.error('Unable to restore Firebase authentication state:', error);
    showSignedOut();
  });
}

logoutButtons.forEach(button => {
  button.addEventListener('click', async () => {
    if (!auth || !isFirebaseConfigured) return;
    button.disabled = true;
    button.textContent = 'Signing out…';
    try {
      await signOut(auth);
      window.location.assign('index.html');
    } catch (error) {
      console.error('Firebase sign-out failed:', error);
      button.disabled = false;
      button.textContent = 'Logout';
      const message = 'Logout failed. Check your connection and try again.';
      if (typeof window.showToast === 'function') window.showToast(message);
      else window.alert(message);
    }
  });
});
