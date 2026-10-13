import { auth, isFirebaseConfigured, persistenceReady } from './firebase.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

(() => {
  const signupMode = new URLSearchParams(window.location.search).get('mode') === 'signup';
  const form = document.getElementById('auth-form');
  const nameField = document.getElementById('name-field');
  const nameInput = document.getElementById('auth-name');
  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const confirmInput = document.getElementById('auth-confirm-password');
  const status = document.getElementById('auth-status');
  const submitButton = document.getElementById('auth-submit');
  const setupNotice = document.getElementById('firebase-setup-notice');
  const errors = {
    name: document.getElementById('name-error'),
    email: document.getElementById('email-error'),
    password: document.getElementById('password-error'),
    confirm: document.getElementById('confirm-error'),
  };

  document.title = `${signupMode ? 'Sign Up' : 'Login'} — JobShield`;
  document.getElementById('auth-title').textContent = signupMode ? 'Create your account' : 'Login';
  document.getElementById('auth-intro').textContent = signupMode
    ? 'Create an account to continue with JobShield.'
    : 'Welcome back. Log in to your JobShield account.';
  submitButton.textContent = signupMode ? 'Create account' : 'Login';
  nameField.hidden = !signupMode;
  nameInput.required = signupMode;
  document.getElementById('confirm-field').hidden = !signupMode;
  confirmInput.required = signupMode;
  passwordInput.autocomplete = signupMode ? 'new-password' : 'current-password';
  confirmInput.autocomplete = 'new-password';
  document.getElementById('auth-switch').innerHTML = signupMode
    ? 'Already have an account? <a href="auth.html?mode=login">Login</a>'
    : 'New to JobShield? <a href="auth.html?mode=signup">Sign Up</a>';

  if (!isFirebaseConfigured || !auth) {
    setupNotice.hidden = false;
    submitButton.disabled = true;
    status.textContent = 'Firebase is not configured. Add your Firebase web app config in js/firebase.js to enable account access.';
    status.classList.add('is-error');
  }

  function clearErrors() {
    Object.values(errors).forEach(error => { error.textContent = ''; });
    [nameInput, emailInput, passwordInput, confirmInput].forEach(input => input.removeAttribute('aria-invalid'));
    status.textContent = '';
    status.classList.remove('is-error', 'is-success');
  }

  function setError(input, element, message) {
    element.textContent = message;
    input.setAttribute('aria-invalid', 'true');
  }

  function firebaseErrorMessage(error) {
    const messages = {
      'auth/invalid-email': 'Enter a valid email address.',
      'auth/user-not-found': 'No account was found for this email. Check it or create an account.',
      'auth/wrong-password': 'The password is incorrect. Try again or reset your password.',
      'auth/invalid-credential': 'The email or password is incorrect. Check your details and try again.',
      'auth/invalid-login-credentials': 'The email or password is incorrect. Check your details and try again.',
      'auth/email-already-in-use': 'An account already exists for this email. Try logging in instead.',
      'auth/weak-password': 'Choose a stronger password with at least 8 characters.',
      'auth/too-many-requests': 'Too many attempts. Wait a while before trying again.',
      'auth/network-request-failed': 'Could not connect to Firebase. Check your internet connection and try again.',
      'auth/operation-not-allowed': 'Email/password authentication is not enabled in Firebase Console.',
      'auth/unauthorized-domain': 'This website domain is not authorized in Firebase Authentication settings.',
      'auth/invalid-api-key': 'The Firebase web API key is invalid. Check js/firebase.js.',
      'auth/persistence-failed': 'This browser could not enable persistent sign-in. Check browser privacy settings and try again.',
    };
    return messages[error?.code] || 'Authentication failed. Check the Firebase setup and try again.';
  }

  function setLoading(isLoading) {
    submitButton.disabled = isLoading || !isFirebaseConfigured;
    submitButton.innerHTML = isLoading
      ? '<span class="auth-spinner" aria-hidden="true"></span>Working…'
      : (signupMode ? 'Create account' : 'Login');
    form.setAttribute('aria-busy', String(isLoading));
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    clearErrors();
    let valid = true;

    if (signupMode && !nameInput.value.trim()) {
      setError(nameInput, errors.name, 'Enter your name.');
      valid = false;
    }

    const email = emailInput.value.trim();
    if (!email) {
      setError(emailInput, errors.email, 'Enter your email address.');
      valid = false;
    } else if (!emailInput.validity.valid) {
      setError(emailInput, errors.email, 'Enter a valid email address, such as name@example.com.');
      valid = false;
    }

    if (!passwordInput.value) {
      setError(passwordInput, errors.password, 'Enter your password.');
      valid = false;
    } else if (signupMode && passwordInput.value.length < 8) {
      setError(passwordInput, errors.password, 'Use at least 8 characters for your password.');
      valid = false;
    }

    if (signupMode && !confirmInput.value) {
      setError(confirmInput, errors.confirm, 'Confirm your password.');
      valid = false;
    } else if (signupMode && passwordInput.value !== confirmInput.value) {
      setError(confirmInput, errors.confirm, 'The passwords do not match.');
      valid = false;
    }

    if (!valid) {
      status.textContent = 'Please correct the highlighted fields.';
      status.classList.add('is-error');
      return;
    }

    if (!isFirebaseConfigured || !auth) {
      setupNotice.hidden = false;
      status.textContent = 'Firebase is not configured. Follow the setup steps in js/firebase.js to enable authentication.';
      status.classList.add('is-error');
      return;
    }

    setLoading(true);
    try {
      const persistenceEnabled = await persistenceReady;
      if (!persistenceEnabled) throw { code: 'auth/persistence-failed' };
      if (signupMode) {
        const credential = await createUserWithEmailAndPassword(auth, email, passwordInput.value);
        const displayName = nameInput.value.trim();
        let profileWarning = '';
        if (displayName) {
          try {
            await updateProfile(credential.user, { displayName });
          } catch (profileError) {
            console.warn('Account created, but the profile name could not be saved:', profileError);
            profileWarning = ' Your account is active, but the display name could not be saved.';
          }
        }
        status.textContent = `Account created. You are signed in and will be redirected shortly.${profileWarning}`;
      } else {
        await signInWithEmailAndPassword(auth, email, passwordInput.value);
        status.textContent = 'Login successful. Redirecting…';
      }
      status.classList.add('is-success');
      window.setTimeout(() => window.location.assign('index.html'), 650);
    } catch (error) {
      console.error('Firebase authentication failed:', error);
      status.textContent = firebaseErrorMessage(error);
      status.classList.add('is-error');
      setLoading(false);
    }
  });
})();
