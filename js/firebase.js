/*
 * Firebase web configuration (public client values only).
 * Replace every placeholder with the Firebase Console web-app config.
 * Never put service-account credentials or private keys in this file.
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

export const firebaseConfig = {
  apiKey: 'REPLACE_WITH_FIREBASE_WEB_API_KEY',
  authDomain: 'REPLACE_WITH_PROJECT_ID.firebaseapp.com',
  projectId: 'REPLACE_WITH_PROJECT_ID',
  appId: 'REPLACE_WITH_FIREBASE_WEB_APP_ID',
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(value =>
  typeof value === 'string' && value.length > 0 && !value.startsWith('REPLACE_WITH_')
);

let auth = null;
let persistenceReady = Promise.resolve();

if (isFirebaseConfigured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  persistenceReady = setPersistence(auth, browserLocalPersistence)
    .then(() => true)
    .catch(error => {
      console.error('Firebase local persistence could not be enabled:', error);
      return false;
    });
}

export { auth, persistenceReady };
