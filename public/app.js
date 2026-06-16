import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';
import {
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';

(() => {
  const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
  const DEFAULT_CENTER = [2.35, 48.85];
  const DEFAULT_ZOOM = 2;

  const config = window.__APP_CONFIG || {};
  const authOverlay = document.getElementById('auth-overlay');
  const authMessage = document.getElementById('auth-message');
  const userInfo = document.getElementById('user-info');
  const locationPanel = document.getElementById('location-panel');
  const mapRoot = document.getElementById('map');
  const signInButtonMount = document.getElementById('google-signin-button');
  const emailLoginInput = document.getElementById('email-login');
  const emailPasswordInput = document.getElementById('email-password');
  const emailSignInBtn = document.getElementById('email-signin-btn');
  const locateMeBtn = document.getElementById('locate-me-btn');
  const manualLatInput = document.getElementById('manual-lat');
  const manualLonInput = document.getElementById('manual-lon');
  const manualLocationBtn = document.getElementById('set-manual-location-btn');
  const locationStatus = document.getElementById('location-status');
  const logoutBtn = document.getElementById('logout-btn');

  let map = null;
  let locationMarker = null;
  let auth = null;
  let db = null;
  let currentUser = null;
  let lastProfile = null;
  let isGoogleSignInInProgress = false;

  const normalizeAuthError = (error, context) => {
    const rawCode = error?.code || '';
    const message = error?.message || String(error || '');
    const code = String(rawCode);

    if (context === 'firebase-signin') {
      switch (code) {
        case 'auth/operation-not-allowed':
          return `Connexion bloquée: activez Google dans Firebase → Authentication > Sign-in method.`;
        case 'auth/invalid-credential':
          return 'Jeton Google invalide ou non compatible: vérifiez que Google est bien activé dans Firebase.';
        case 'auth/user-not-found':
          return 'Aucun compte ne correspond à cet email.';
        case 'auth/wrong-password':
          return 'Mot de passe incorrect.';
        case 'auth/invalid-email':
          return 'Format d\'email invalide.';
        case 'auth/invalid-login-credentials':
          return 'Email ou mot de passe invalide.';
        case 'auth/too-many-requests':
          return 'Trop de tentatives: réessayez dans quelques minutes.';
        case 'auth/unauthorized-domain':
          return 'Domaine non autorisé: ajoutez votre domaine dans Firebase Authentication > Settings > Authorized domains.';
        case 'auth/popup-closed-by-user':
          return 'Connexion annulée: vous avez fermé la fenêtre Google.';
        case 'auth/popup-blocked':
          return 'Popup bloquée par le navigateur: autorisez les popups pour ce site.';
        case 'auth/network-request-failed':
          return 'Erreur réseau: vérifiez la connexion ou un blocage (ad-block / proxy).';
        case 'auth/internal-error':
          return 'Erreur interne Firebase: réessayez dans quelques secondes.';
        default:
          return `Connexion échouée: ${message}${code ? ` (${code})` : ''}`;
      }
    }

    return `Erreur ${context}: ${message}${code ? ` (${code})` : ''}`;
  };

  const showAuthError = (message) => {
    if (!authMessage) return;
    authMessage.textContent = message;
  };

  const getValue = (element) => (element ? String(element.value || '').trim() : '');

  const hideAuth = () => {
    if (!authOverlay) return;
    authOverlay.classList.add('is-hidden');
  };

  const showAuth = () => {
    if (!authOverlay) return;
    authOverlay.classList.remove('is-hidden');
    if (locationPanel) {
      locationPanel.classList.add('is-hidden');
    }
  };

  const showLocationPanel = () => {
    if (!locationPanel) return;
    locationPanel.classList.remove('is-hidden');
  };

  const updateUserInfo = (profile) => {
    if (!userInfo) return;
    const label = profile?.name ? `${profile.name} (${profile.email || 'email masqué'})` : 'Utilisateur connecté';
    userInfo.textContent = label;
  };

  const isValidLatitude = (value) => Number.isFinite(value) && value >= -90 && value <= 90;
  const isValidLongitude = (value) => Number.isFinite(value) && value >= -180 && value <= 180;

  const renderLocation = async ({ lat, lng }, source, persist = true) => {
    if (!window.maplibregl || !map) {
      return;
    }

    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
      locationStatus.textContent = 'Coordonnées invalides';
      return;
    }

    const coords = [longitude, latitude];

    if (!locationMarker) {
      locationMarker = new window.maplibregl.Marker({ color: '#0f766e' }).setLngLat(coords).addTo(map);
    } else {
      locationMarker.setLngLat(coords);
    }

    map.flyTo({
      center: coords,
      zoom: 11,
      duration: 500,
    });

    locationStatus.textContent = `${source} · ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    if (persist && currentUser && db) {
      saveLocationToFirestore(latitude, longitude, source).catch(() => {
        locationStatus.textContent = `${locationStatus.textContent} (non sauvegardé dans Firestore)`;
      });
    }

    localStorage.setItem(
      'user_location',
      JSON.stringify({
        lat: latitude,
        lng: longitude,
        source,
        at: new Date().toISOString(),
      })
    );
  };

  const initMap = () => {
    if (!mapRoot || map) {
      return;
    }

    map = new window.maplibregl.Map({
      container: 'map',
      style: MAP_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      hash: false,
    });
    map.addControl(new window.maplibregl.NavigationControl(), 'top-right');
  };

  const saveLocationToFirestore = async (lat, lng, source) => {
    if (!db || !currentUser) {
      return;
    }

    const reference = doc(db, 'users', currentUser.uid, 'locations', 'home');
    await setDoc(
      reference,
      {
        lat,
        lng,
        source: source || 'manuel',
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  };

  const loadLocationFromFirestore = async () => {
    if (!db || !currentUser) {
      return;
    }

    const reference = doc(db, 'users', currentUser.uid, 'locations', 'home');
    const snapshot = await getDoc(reference);
    if (!snapshot.exists()) {
      return;
    }

    const data = snapshot.data();
    const lat = Number(data.lat);
    const lng = Number(data.lng);
    if (isValidLatitude(lat) && isValidLongitude(lng)) {
      await renderLocation({ lat, lng }, 'Dernière position enregistrée', false);
    }
  };

  const handleNoAuth = () => {
    currentUser = null;
    lastProfile = null;
    if (locationMarker) {
      locationMarker.remove();
      locationMarker = null;
    }
    if (map) {
      map.remove();
      map = null;
    }
    if (manualLatInput) manualLatInput.value = '';
    if (manualLonInput) manualLonInput.value = '';
    locationStatus.textContent = '';
    initGoogleAuth();
    showAuth();
  };

  const handleAuth = (user) => {
    if (!user) {
      handleNoAuth();
      return;
    }

    currentUser = user;
    const profile = {
      sub: user.uid,
      name: user.displayName || user.email || 'Utilisateur connecté',
      email: user.email || 'Inconnu',
      picture: user.photoURL || '',
    };

    lastProfile = profile;
    localStorage.setItem('google_user', JSON.stringify(profile));
    updateUserInfo(profile);
    hideAuth();
    showLocationPanel();
    initMap();

    const fallbackLocation = localStorage.getItem('user_location');
    let hasFallback = false;
    let fallback = null;
    if (fallbackLocation) {
      try {
        fallback = JSON.parse(fallbackLocation);
        hasFallback =
          !!fallback &&
          isValidLatitude(Number(fallback.lat)) &&
          isValidLongitude(Number(fallback.lng));
      } catch (error) {
        // Ignore invalid local cache.
      }
    }

    loadLocationFromFirestore().catch(() => {
      if (hasFallback) {
        renderLocation(
          {
            lat: Number(fallback.lat),
            lng: Number(fallback.lng),
          },
          `Fallback local (${fallback.source || 'local'})`,
          false
        );
      }
    });
  };

  const initGoogleAuth = () => {
    if (!signInButtonMount) {
      return;
    }

    if (signInButtonMount.dataset.googleBound === '1') {
      return;
    }

    signInButtonMount.dataset.googleBound = '1';
    signInButtonMount.addEventListener('click', onGooglePopupSignIn);
  };

  const getConfigMissingMessage = () => {
    if (!config || !config.firebaseConfig) {
      return 'Configuration Firebase absente.';
    }

    const required = [
      'apiKey',
      'authDomain',
      'projectId',
      'storageBucket',
      'messagingSenderId',
      'appId',
    ];
    const hasMissing = required.some((key) => !config.firebaseConfig[key]);
    if (hasMissing) {
      return 'Variables Firebase manquantes. Remplissez NEXT_PUBLIC_FIREBASE_* dans .env.';
    }

    return null;
  };

  const initializeFirebase = () => {
    const configMissing = getConfigMissingMessage();
    if (configMissing) {
      showAuthError(configMissing);
      return false;
    }

    try {
      const app = initializeApp(config.firebaseConfig);
      auth = getAuth(app);
      db = getFirestore(app, config.firebaseDatabaseId || 'main');
      onAuthStateChanged(auth, handleAuth);
      return true;
    } catch (error) {
      showAuthError(`Erreur Firebase: ${error.message}`);
      return false;
    }
  };

  const onGooglePopupSignIn = async () => {
    if (!auth) {
      showAuthError('Firebase non initialisé.');
      return;
    }
    if (isGoogleSignInInProgress) {
      return;
    }

    try {
      isGoogleSignInInProgress = true;
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      showAuthError(normalizeAuthError(error, 'firebase-signin'));
      console.error('Google sign-in error:', error);
    } finally {
      isGoogleSignInInProgress = false;
    }
  };

  const onEmailSignIn = async () => {
    const email = getValue(emailLoginInput);
    const password = getValue(emailPasswordInput);
    if (!email || !password) {
      showAuthError('Email et mot de passe requis.');
      return;
    }

    if (!auth) {
      showAuthError('Firebase non initialisé.');
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      showAuthError(normalizeAuthError(error, 'firebase-signin'));
      console.error('Email sign-in error:', error);
    }
  };

  const resetSession = async () => {
    if (!auth) {
      return;
    }

    try {
      await signOut(auth);
    } catch (error) {
      showAuthError(`Erreur déconnexion: ${error.message || error}`);
    }
    localStorage.removeItem('google_user');
  };

  const onLocateMe = () => {
    if (!navigator.geolocation) {
      locationStatus.textContent = 'Géolocalisation indisponible sur ce navigateur.';
      return;
    }

    locationStatus.textContent = 'Récupération de la position...';

    navigator.geolocation.getCurrentPosition(
      (position) => {
        renderLocation(
          {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
          'Position actuelle'
        );
      },
      (error) => {
        locationStatus.textContent = `Erreur géolocalisation: ${error.message}`;
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 120000,
      }
    );
  };

  const onSetManualLocation = () => {
    const lat = Number(manualLatInput.value);
    const lng = Number(manualLonInput.value);
    if (!isValidLatitude(lat) || !isValidLongitude(lng)) {
      locationStatus.textContent = 'Veuillez saisir des coordonnées valides.';
      return;
    }

    renderLocation({ lat, lng }, 'Position saisie');
  };

  const initEvents = () => {
    if (emailSignInBtn) {
      emailSignInBtn.addEventListener('click', onEmailSignIn);
    }
    if (locateMeBtn) {
      locateMeBtn.addEventListener('click', onLocateMe);
    }
    if (manualLocationBtn) {
      manualLocationBtn.addEventListener('click', onSetManualLocation);
    }
    if (logoutBtn) {
      logoutBtn.addEventListener('click', resetSession);
    }
  };

  const bootstrap = () => {
    initEvents();

    const initialized = initializeFirebase();
    if (!initialized) {
      return;
    }

    initGoogleAuth();
    if (!auth.currentUser) {
      showAuth();
    }
  };

  bootstrap();
})();
