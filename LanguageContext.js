import { createContext, useContext, useState, useEffect } from "react";
import t from "../lib/i18n";

const LangCtx = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState("id");

  useEffect(() => {
    const saved = localStorage.getItem("barricade_lang");
    if (saved === "en" || saved === "id") setLang(saved);
  }, []);

  const toggleLang = () => {
    const next = lang === "id" ? "en" : "id";
    setLang(next);
    localStorage.setItem("barricade_lang", next);
  };

  const tr = (key) => t[lang]?.[key] ?? t["id"][key] ?? key;

  return (
    <LangCtx.Provider value={{ lang, tr, toggleLang }}>
      {children}
    </LangCtx.Provider>
  );
}

export const useLang = () => useContext(LangCtx);
