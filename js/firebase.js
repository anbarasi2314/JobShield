/*
 * Firebase Web SDK setup for JobShield on GitHub Pages.
 *
 * CONFIGURATION: Firebase Console → Project settings → General → Your apps →
 * select your Web app → SDK setup and configuration → Config.
 * Copy apiKey, authDomain, projectId, and appId into the object below.
 * These are public web-client identifiers; never add service-account JSON,
 * Admin SDK credentials, or private keys to a browser application.
 *
 * Authentication requires Firebase Console → Authentication → Sign-in method
 * → Email/Password enabled, plus the Pages hostname in Authorized domains.
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

// Replace only these placeholder values with the config for YOUR Firebase Web app.
export const firebaseConfig = {
  apiKey: "AIzaSyBFOF8oNjo2ZCK3ccOWWCrocvEJgSIDXx0",
  authDomain: "jobshield-52365.firebaseapp.com",
  projectId: "jobshield-52365",
  storageBucket: "jobshield-52365.firebasestorage.app",
  messagingSenderId: "826489659723",
  appId: "1:826489659723:web:1d5f5521a51ea9cb5e88ce",
  measurementId: "G-19589ZZ5MX"
};

const hasPlaceholder = value =>
  typeof value !== 'string' || !value.trim() || /REPLACE_WITH|YOUR[_ -]/i.test(value);
const configValuesPresent = Object.values(firebaseConfig).every(value => !hasPlaceholder(value));
const configShapeValid = configValuesPresent
  && /^AIza[\w-]{20,}$/.test(firebaseConfig.apiKey)
  && /^[a-z0-9][a-z0-9-]{3,}[a-z0-9]$/.test(firebaseConfig.projectId)
  && /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(firebaseConfig.authDomain)
  && firebaseConfig.appId.length >= 8;

export const isFirebaseConfigured = configShapeValid;
export let firebaseConfigError = configValuesPresent && !configShapeValid
  ? 'Firebase web config values are incomplete or malformed. Re-copy the Web app config into js/firebase.js.'
  : null;

export let app = null;
export let auth = null;
export let persistenceReady = Promise.resolve(false);

if (isFirebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    persistenceReady = setPersistence(auth, browserLocalPersistence)
      .then(() => true)
      .catch(error => {
        console.error('Firebase local persistence could not be enabled:', error);
        return false;
      });
  } catch (error) {
    console.error('Firebase initialization failed:', error);
    firebaseConfigError = 'Firebase could not initialize. Verify the Web app configuration in js/firebase.js.';
    app = null;
    auth = null;
  }
} else if (!firebaseConfigError) {
  firebaseConfigError = 'Firebase Web app config is missing. Copy the config from Firebase Console into js/firebase.js.';
}

export { app as firebaseApp };
