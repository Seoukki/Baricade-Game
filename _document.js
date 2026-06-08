import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="id">
      <Head>
        <meta name="description" content="Barricade — Strategic board game, 2 players, real-time" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🚧</text></svg>" />
        <meta property="og:title" content="Barricade Game" />
        <meta property="og:description" content="Real-time 2-player strategic board game" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
