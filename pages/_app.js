import "../styles/globals.css";
import { LanguageProvider, useLang } from "../context/LanguageContext";

function LangBtn() {
  const { tr, toggleLang } = useLang();
  return (
    <button onClick={toggleLang}
      style={{position:"fixed",top:12,right:12,zIndex:100,background:"rgba(255,255,255,0.85)",backdropFilter:"blur(8px)",border:"1.5px solid rgba(212,207,198,0.8)",borderRadius:99,padding:"6px 14px",fontSize:12,fontWeight:600,color:"var(--muted)",cursor:"pointer",boxShadow:"0 2px 8px rgba(0,0,0,0.08)",fontFamily:"DM Sans,sans-serif",letterSpacing:"0.02em"}}>
      🌐 {tr("lang_toggle")}
    </button>
  );
}
export default function App({ Component, pageProps }) {
  return (
    <LanguageProvider>
      <LangBtn />
      <Component {...pageProps} />
    </LanguageProvider>
  );
}
