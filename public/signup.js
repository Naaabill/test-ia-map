import {
  createUserWithEmailAndPassword,
  getAuth,
  updateProfile,
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';

import { initializeApp as initializeFirebaseApp } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js';

(() => {
  const config = window.__APP_CONFIG || {};
  const firstNameInput = document.getElementById('signup-first-name');
  const lastNameInput = document.getElementById('signup-last-name');
  const emailInput = document.getElementById('signup-email');
  const passwordInput = document.getElementById('signup-password');
  const signupBtn = document.getElementById('signup-btn');
  const message = document.getElementById('auth-message');
  let auth = null;

  const showMessage = (text) => {
    if (message) {
      message.textContent = text;
    }
  };

  const getValue = (element) => String(element?.value || '').trim();

  const normalizeAuthError = (error) => {
    const code = error?.code || '';
    const rawMessage = error?.message || String(error || '');
    switch (code) {
      case 'auth/email-already-in-use':
        return 'Cet email est déjà associé à un compte.';
      case 'auth/weak-password':
        return 'Le mot de passe est trop faible.';
      case 'auth/invalid-email':
        return 'Format d\'email invalide.';
      case 'auth/operation-not-allowed':
        return 'Création bloquée: activez Email/Password dans Firebase.';
      case 'auth/network-request-failed':
        return 'Erreur réseau: vérifiez votre connexion.';
      default:
        return `Création échouée: ${rawMessage}${code ? ` (${code})` : ''}`;
    }
  };

  const initFirebase = () => {
    if (!config || !config.firebaseConfig) {
      showMessage('Configuration Firebase absente.');
      return false;
    }
    try {
      const app = initializeFirebaseApp(config.firebaseConfig);
      auth = getAuth(app);
      return true;
    } catch (error) {
      showMessage(`Erreur Firebase: ${error.message || error}`);
      return false;
    }
  };

  const onSignUp = async () => {
    const firstName = getValue(firstNameInput);
    const lastName = getValue(lastNameInput);
    const email = getValue(emailInput);
    const password = getValue(passwordInput);

    if (!firstName || !lastName || !email || !password) {
      showMessage('Prénom, nom, email et mot de passe sont obligatoires.');
      return;
    }
    if (password.length < 6) {
      showMessage('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (!auth) {
      showMessage('Firebase non initialisé.');
      return;
    }

    try {
      await createUserWithEmailAndPassword(auth, email, password);
      const user = auth.currentUser;
      if (user && `${firstName} ${lastName}`.trim()) {
        await updateProfile(user, {
          displayName: `${firstName} ${lastName}`.trim(),
        });
      }
      showMessage('Compte créé. Redirection...');
      setTimeout(() => {
        window.location.assign('/');
      }, 700);
    } catch (error) {
      showMessage(normalizeAuthError(error));
      console.error('Sign-up error:', error);
    }
  };

  const init = () => {
    if (!initFirebase()) {
      return;
    }
    if (signupBtn) {
      signupBtn.addEventListener('click', onSignUp);
    }
  };

  init();
})();
