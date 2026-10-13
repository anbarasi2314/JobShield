/* Frontend account-form prototype only; never stores or verifies credentials. */
(() => {
  const signupMode = new URLSearchParams(window.location.search).get('mode') === 'signup';
  const form = document.getElementById('auth-form');
  const nameField = document.getElementById('name-field');
  const nameInput = document.getElementById('auth-name');
  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const status = document.getElementById('auth-status');
  const errors = {
    name: document.getElementById('name-error'),
    email: document.getElementById('email-error'),
    password: document.getElementById('password-error'),
  };

  document.title = `${signupMode ? 'Sign Up' : 'Login'} — JobShield`;
  document.getElementById('auth-title').textContent = signupMode ? 'Create your account' : 'Login';
  document.getElementById('auth-intro').textContent = signupMode
    ? 'Set up an account to get started with JobShield.'
    : 'Access your JobShield account.';
  document.getElementById('auth-submit').textContent = signupMode ? 'Create account' : 'Login';
  nameField.hidden = !signupMode;
  nameInput.required = signupMode;
  passwordInput.autocomplete = signupMode ? 'new-password' : 'current-password';
  document.getElementById('auth-switch').innerHTML = signupMode
    ? 'Already have an account? <a href="auth.html?mode=login">Login</a>'
    : 'New to JobShield? <a href="auth.html?mode=signup">Sign Up</a>';

  function clearErrors() {
    Object.values(errors).forEach(error => { error.textContent = ''; });
    [nameInput, emailInput, passwordInput].forEach(input => input.removeAttribute('aria-invalid'));
    status.textContent = '';
    status.classList.remove('is-error');
  }

  function setError(input, element, message) {
    element.textContent = message;
    input.setAttribute('aria-invalid', 'true');
  }

  form.addEventListener('submit', event => {
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

    if (!valid) {
      status.textContent = 'Please correct the highlighted fields.';
      status.classList.add('is-error');
      return;
    }

    status.textContent = 'Form validation passed, but no account action was taken. Connect a secure authentication service to enable login and registration.';
  });
})();
