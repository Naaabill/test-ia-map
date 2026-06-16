import Head from 'next/head';
import Script from 'next/script';

export default function Home() {
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
  };
  const firebaseDatabaseId = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || 'main';

  return (
    <>
      <Head>
        <title>Carte OpenFreeMap</title>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="stylesheet" href="https://unpkg.com/maplibre-gl/dist/maplibre-gl.css" />
        <link rel="stylesheet" href="/style.css" />
      </Head>
      <main id="map" />
      <section id="auth-overlay" className="auth-overlay">
        <div className="auth-card">
          <h1>Connexion</h1>
          <p>Connectez-vous pour accéder à la carte.</p>
          <button id="google-signin-button" type="button" className="accent-btn">
            Connexion Google
          </button>

          <div className="auth-form">
            <h2>Ou connectez-vous par email</h2>
            <input id="email-login" type="email" placeholder="adresse@email.com" />
            <input id="email-password" type="password" placeholder="mot de passe" />
            <button id="email-signin-btn" className="accent-btn">
              Se connecter
            </button>
          </div>

          <a className="auth-link" href="/signup">
            Créer un compte
          </a>

          <p id="auth-message" className="muted"></p>
        </div>
      </section>

      <aside id="location-panel" className="location-panel is-hidden">
        <h2 id="user-info">Utilisateur</h2>
        <div className="location-group">
          <button id="locate-me-btn">Utiliser ma position</button>
        </div>
        <div className="manual-coords">
          <label htmlFor="manual-lat">Latitude</label>
          <input id="manual-lat" type="number" step="any" placeholder="48.8566" />
          <label htmlFor="manual-lon">Longitude</label>
          <input id="manual-lon" type="number" step="any" placeholder="2.3522" />
          <button id="set-manual-location-btn">Définir la position</button>
        </div>
        <p id="location-status" className="muted"></p>
        <button id="logout-btn" className="ghost-btn">Déconnexion</button>
      </aside>

        <Script
        id="app-config"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{
          __html: `window.__APP_CONFIG = ${JSON.stringify({
            firebaseDatabaseId,
            firebaseConfig,
          })};`,
        }}
      />
      <Script
        src="https://unpkg.com/maplibre-gl/dist/maplibre-gl.js"
        strategy="beforeInteractive"
      />
      <Script src="/app.js" strategy="afterInteractive" type="module" />
    </>
  );
}
