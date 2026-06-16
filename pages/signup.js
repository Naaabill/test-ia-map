import Head from 'next/head';
import Script from 'next/script';

export default function Signup() {
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
        <title>Créer un compte</title>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="stylesheet" href="/style.css" />
      </Head>
      <main className="auth-overlay">
        <section className="auth-card">
          <h1>Créer un compte</h1>
          <div className="auth-form">
            <input id="signup-first-name" type="text" placeholder="Prénom" />
            <input id="signup-last-name" type="text" placeholder="Nom" />
            <input id="signup-email" type="email" placeholder="adresse@email.com" />
            <input id="signup-password" type="password" placeholder="mot de passe" />
            <button id="signup-btn" className="accent-btn">
              S’inscrire
            </button>
          </div>
          <p id="auth-message" className="muted"></p>
          <a className="auth-link" href="/">
            Déjà un compte ? Se connecter
          </a>
        </section>
      </main>

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
      <Script src="/signup.js" strategy="afterInteractive" type="module" />
    </>
  );
}
