import Head from 'next/head';
import Script from 'next/script';

export default function Home() {
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

      <Script
        src="https://unpkg.com/maplibre-gl/dist/maplibre-gl.js"
        strategy="beforeInteractive"
      />
      <Script src="/app.js" strategy="afterInteractive" />
    </>
  );
}
