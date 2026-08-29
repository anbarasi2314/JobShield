/* ==========================================================================
   JobShield — shared UI utilities (nav, toast, icons, auth)
   ========================================================================== */

const AUTH_KEY = 'jobshield_user';
const SETTINGS_KEY = 'jobshield_settings';

function getStoredUser() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function setStoredUser(user) {
  if (!user) {
    localStorage.removeItem(AUTH_KEY);
    return;
  }
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
}

function getStoredSettings() {
  const defaults = {
    language: 'English',
    theme: 'dark',
    notifications: 'Important only',
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch (e) {
    return defaults;
  }
}

function setStoredSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function renderHeaderAuth() {
  const navRight = document.querySelector('.nav-right');
  if (!navRight) return;
  const user = getStoredUser();

  if (user) {
    navRight.innerHTML = `
      <div class="user-menu">
        <button class="user-pill" type="button" aria-expanded="false">
          <span class="user-avatar">${(user.name || 'U').charAt(0).toUpperCase()}</span>
          <span class="user-name">${user.name || 'User'}</span>
          <span class="user-chevron">▾</span>
        </button>
        <div class="user-dropdown">
          <button type="button" data-user-action="profile">Profile</button>
          <button type="button" data-user-action="history">History</button>
          <button type="button" data-user-action="settings">Settings</button>
          <button type="button" data-user-action="logout">Logout</button>
        </div>
      </div>
    `;

    const pill = navRight.querySelector('.user-pill');
    const dropdown = navRight.querySelector('.user-dropdown');
    if (pill && dropdown) {
      pill.addEventListener('click', (event) => {
        event.stopPropagation();
        const isOpen = dropdown.classList.contains('show');
        dropdown.classList.toggle('show', !isOpen);
        pill.setAttribute('aria-expanded', String(!isOpen));
      });
    }

    navRight.querySelectorAll('[data-user-action]').forEach(button => {
      button.addEventListener('click', () => {
        const action = button.dataset.userAction;
        if (action === 'profile') openUserModal('profile');
        if (action === 'settings') openUserModal('settings');
        if (action === 'history') window.location.href = 'history.html';
        if (action === 'logout') {
          setStoredUser(null);
          renderHeaderAuth();
          renderMobileMenu();
          if (window.location.pathname.endsWith('/analyzer/index.html') || window.location.pathname.endsWith('/analyze.html')) {
            window.location.href = '../index.html';
          }
        }
      });
    });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.user-pill') && !event.target.closest('.user-dropdown')) {
        const dd = document.querySelector('.user-dropdown');
        if (dd) dd.classList.remove('show');
      }
    });
    return;
  }

  navRight.innerHTML = `
    <button class="btn btn-secondary btn-auth" type="button" data-auth="login">Log In</button>
    <button class="btn btn-primary btn-auth" type="button" data-auth="signup">Sign Up</button>
  `;

  navRight.querySelectorAll('[data-auth]').forEach(btn => {
    btn.addEventListener('click', () => openAuthModal(btn.dataset.auth));
  });
}

function renderMobileMenu() {
  const menu = document.querySelector('.mobile-menu');
  if (!menu) return;
  const user = getStoredUser();

  const menuHtml = `
    <a href="index.html">Home</a>
    <a href="how-it-works.html">How It Works</a>
    <a href="about.html">About</a>
    <a href="safety-tips.html">Safety Tips</a>
    ${user ? `<a href="history.html">History</a>` : ''}
    ${user ? `<button type="button" class="btn btn-secondary btn-block user-mobile-item" data-user-action="profile">Profile</button>` : ''}
    ${user ? `<button type="button" class="btn btn-secondary btn-block user-mobile-item" data-user-action="settings">Settings</button>` : ''}
    ${user ? `<button type="button" class="btn btn-secondary btn-block user-mobile-item" data-user-action="logout">Logout</button>` : `<button type="button" class="btn btn-secondary btn-block" data-auth="login">Log In</button><button type="button" class="btn btn-primary btn-block" data-auth="signup">Sign Up</button>`}
  `;
  menu.innerHTML = menuHtml;

  menu.querySelectorAll('[data-auth]').forEach(button => {
    button.addEventListener('click', () => openAuthModal(button.dataset.auth));
  });

  menu.querySelectorAll('[data-user-action]').forEach(button => {
    const action = button.dataset.userAction;
    if (action === 'profile') button.addEventListener('click', () => openUserModal('profile'));
    if (action === 'settings') button.addEventListener('click', () => openUserModal('settings'));
    if (action === 'logout') button.addEventListener('click', () => {
      setStoredUser(null);
      renderHeaderAuth();
      renderMobileMenu();
      window.location.href = 'index.html';
    });
  });
}

function openAuthModal(mode = 'login', returnTo = null) {
  const existing = document.querySelector('.auth-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'auth-modal';
  const title = mode === 'signup' ? 'Create your account' : 'Log In or Sign Up to continue';
  const subtitle = mode === 'signup' ? 'Sign up to continue to the analyzer.' : 'Log in or sign up to continue to the analyzer.';
  modal.innerHTML = `
    <div class="auth-overlay" data-close-auth="true"></div>
    <div class="auth-card card">
      <button class="auth-close" type="button" aria-label="Close dialog">×</button>
      <div class="auth-head">
        <span class="eyebrow">Account</span>
        <h3>${title}</h3>
        <p>${subtitle}</p>
      </div>
      <form class="auth-form" data-auth-form="${mode}">
        ${mode === 'signup' ? '<label><span>Name</span><input type="text" name="name" required placeholder="Your name"></label>' : ''}
        <label><span>Email</span><input type="email" name="email" required placeholder="you@example.com"></label>
        <label><span>Password</span><input type="password" name="password" required placeholder="••••••••"></label>
        <button class="btn btn-primary btn-block" type="submit">${mode === 'signup' ? 'Sign Up' : 'Log In'}</button>
      </form>
      <div class="auth-switch">
        <span>${mode === 'signup' ? 'Already have an account?' : 'Need an account?'}</span>
        <button type="button" class="text-button" data-auth-switch="${mode === 'signup' ? 'login' : 'signup'}">${mode === 'signup' ? 'Log In' : 'Sign Up'}</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const form = modal.querySelector('.auth-form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      name: (formData.get('name') || '').toString().trim(),
      email: (formData.get('email') || '').toString().trim(),
      password: (formData.get('password') || '').toString().trim(),
    };

    if (!payload.email || !payload.password || (mode === 'signup' && !payload.name)) {
      showToast('Please complete all required fields.');
      return;
    }

    const user = {
      name: payload.name || (payload.email.split('@')[0] || 'User'),
      email: payload.email,
    };
    setStoredUser(user);
    renderHeaderAuth();
    renderMobileMenu();
    modal.remove();

    if (returnTo) {
      window.location.href = returnTo;
    } else if (window.location.pathname.includes('/analyzer/')) {
      window.location.href = '../index.html';
    }
  });

  modal.querySelector('.auth-close').addEventListener('click', () => modal.remove());
  modal.querySelector('[data-close-auth="true"]').addEventListener('click', () => modal.remove());
  modal.querySelector('[data-auth-switch]').addEventListener('click', () => {
    modal.remove();
    openAuthModal(modal.querySelector('[data-auth-switch]').dataset.authSwitch, returnTo);
  });
}

function openUserModal(tab = 'profile') {
  const existing = document.querySelector('.auth-modal');
  if (existing) existing.remove();

  const user = getStoredUser() || { name: 'User', email: '' };
  const settings = getStoredSettings();

  const modal = document.createElement('div');
  modal.className = 'auth-modal';
  modal.innerHTML = `
    <div class="auth-overlay" data-close-auth="true"></div>
    <div class="auth-card card user-modal-card">
      <button class="auth-close" type="button" aria-label="Close dialog">×</button>
      <div class="auth-head">
        <span class="eyebrow">Account</span>
        <h3>${tab === 'settings' ? 'Settings' : 'Profile'}</h3>
        <p>${tab === 'settings' ? 'Update your preferences.' : 'Edit your basic account details.'}</p>
      </div>
      <div class="auth-tabs">
        <button class="tab-button ${tab === 'profile' ? 'active' : ''}" type="button" data-user-tab="profile">Profile</button>
        <button class="tab-button ${tab === 'settings' ? 'active' : ''}" type="button" data-user-tab="settings">Settings</button>
      </div>
      <form class="auth-form user-form" data-user-form="${tab}">
        ${tab === 'profile' ? `
          <label><span>Name</span><input type="text" name="name" value="${user.name || ''}" required></label>
          <label><span>Email</span><input type="email" name="email" value="${user.email || ''}" required></label>
          <button class="btn btn-primary btn-block" type="submit">Save profile</button>
        ` : `
          <label>
            <span>Language</span>
            <select name="language">
              <option ${settings.language === 'English' ? 'selected' : ''}>English</option>
              <option ${settings.language === 'Hindi' ? 'selected' : ''}>Hindi</option>
              <option ${settings.language === 'Spanish' ? 'selected' : ''}>Spanish</option>
              <option ${settings.language === 'French' ? 'selected' : ''}>French</option>
            </select>
          </label>
          <label>
            <span>Theme</span>
            <select name="theme">
              <option ${settings.theme === 'dark' ? 'selected' : ''}>dark</option>
              <option ${settings.theme === 'light' ? 'selected' : ''}>light</option>
            </select>
          </label>
          <label>
            <span>Notifications</span>
            <select name="notifications">
              <option ${settings.notifications === 'Important only' ? 'selected' : ''}>Important only</option>
              <option ${settings.notifications === 'Daily digest' ? 'selected' : ''}>Daily digest</option>
              <option ${settings.notifications === 'Off' ? 'selected' : ''}>Off</option>
            </select>
          </label>
          <button class="btn btn-primary btn-block" type="submit">Save settings</button>
        `}
      </form>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelectorAll('[data-user-tab]').forEach(tabButton => {
    tabButton.addEventListener('click', () => {
      modal.remove();
      openUserModal(tabButton.dataset.userTab);
    });
  });

  const form = modal.querySelector('.user-form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);

    if (form.dataset.userForm === 'profile') {
      const name = (formData.get('name') || '').toString().trim();
      const email = (formData.get('email') || '').toString().trim();
      if (!name || !email) {
        showToast('Please provide both a name and email.');
        return;
      }
      const nextUser = { ...getStoredUser(), name, email };
      setStoredUser(nextUser);
      renderHeaderAuth();
      renderMobileMenu();
      showToast('Profile saved');
    }

    if (form.dataset.userForm === 'settings') {
      const settings = getStoredSettings();
      settings.language = formData.get('language') || settings.language;
      settings.theme = formData.get('theme') || settings.theme;
      settings.notifications = formData.get('notifications') || settings.notifications;
      setStoredSettings(settings);
      showToast('Settings saved');
    }

    modal.remove();
  });

  modal.querySelector('.auth-close').addEventListener('click', () => modal.remove());
  modal.querySelector('[data-close-auth="true"]').addEventListener('click', () => modal.remove());
}

function initNav() {
  const toggle = document.querySelector('.nav-toggle');
  const menu = document.querySelector('.mobile-menu');
  if (!toggle || !menu) return;
  toggle.addEventListener('click', () => {
    menu.classList.toggle('open');
    const isOpen = menu.classList.contains('open');
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.innerHTML = isOpen ? Icons.close(20) : Icons.menu(20);
  });
  menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    menu.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = Icons.menu(20);
  }));
}

function guardAnalyzeLinks() {
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href*="analyzer"]');
    const legacyLink = event.target.closest('a[href*="analyze.html"]');
    const targetLink = link || legacyLink;
    if (!targetLink) return;

    const href = targetLink.getAttribute('href');
    if (!href || !/(analyzer|analyze\.html)/i.test(href)) return;

    if (!getStoredUser()) {
      event.preventDefault();
      const safeHref = href.startsWith('http') ? href : href;
      openAuthModal('login', safeHref);
    }
  });

  const pathname = window.location.pathname.toLowerCase();
  if (pathname.includes('/analyzer/') || pathname.endsWith('/analyze.html')) {
    if (!getStoredUser()) {
      const returnHref = location.pathname.includes('/analyzer/') ? '../index.html?auth=required' : 'index.html?auth=required';
      openAuthModal('login', returnHref);
    }
  }
}

// ---- Toast ----
let toastTimer = null;
function showToast(message) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.innerHTML = `${Icons.check(16)}<span></span>`;
  el.querySelector('span').textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---- Inline icon set (stroke-based, currentColor) ----
const Icons = {
  shield: (s=24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5l-8-3Z"/><path d="m9 12 2 2 4-4"/></svg>`,
  menu: (s=24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>`,
  close: (s=24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
  arrowRight: (s=24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  doc: (s=24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h5l5 5v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M13 3v5h5M9 13h6M9 17h6M9 9h1"/></svg>`,
  link: (s=24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 14.5 14.5 9.5"/><path d="M11 6.5 12.4 5a4 4 0 0 1 5.6 5.7L16.5 12"/><path d="M13 17.5 11.6 19a4 4 0 0 1-5.6-5.7L7.5 12"/></svg>`,
  image: (s=24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5.5-5.5a2 2 0 0 1 2.8 0L18 18"/></svg>`,
  bulb: (s=24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4.9 1 .9 1.7V16h5.2v-.4c0-.7.3-1.3.9-1.7A6 6 0 0 0 12 3Z"/></svg>`,
  upload: (s=24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>`,
  trash: (s=24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/></svg>`,
  swap: (s=24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4M3 12v-2a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 12v2a4 4 0 0 1-4 4H3"/></svg>`,
  info: (s=24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 8h.01"/></svg>`,
  alert: (s=24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>`,
  check: (s=24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
  download: (s=24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/></svg>`,
  share: (s=24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2.4"/><circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="19" r="2.4"/><path d="m8.1 10.7 7.8-4.4M8.1 13.3l7.8 4.4"/></svg>`,
  refresh: (s=24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15.3-6.4L21 8M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.3 6.4L3 16M3 21v-5h5"/></svg>`,
  history: (s=24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5M12 7v5l4 2"/></svg>`,
  search: (s=24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>`,
  eye: (s=24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  lock: (s=24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>`,
  zap: (s=24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/></svg>`,
  target: (s=24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6" fill="currentColor"/></svg>`,
};

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  renderHeaderAuth();
  renderMobileMenu();
  guardAnalyzeLinks();
  document.querySelectorAll('[data-icon]').forEach(el => {
    const name = el.getAttribute('data-icon');
    const size = parseInt(el.getAttribute('data-icon-size') || '24', 10);
    if (Icons[name]) el.innerHTML = Icons[name](size);
  });
  const toggle = document.querySelector('.nav-toggle');
  if (toggle) toggle.innerHTML = Icons.menu(20);
});
