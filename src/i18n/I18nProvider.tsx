/**
 * Language + direction context. Flips the whole document between English (LTR)
 * and Arabic (RTL, calligraphic). Persisted in localStorage so startup never
 * flashes the wrong language.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { translate, type Lang } from "./dict";

interface I18nCtx {
  lang: Lang;
  dir: "ltr" | "rtl";
  t: (key: string) => string;
  setLang: (lang: Lang) => void;
}

const Ctx = createContext<I18nCtx | null>(null);
const STORAGE_KEY = "lv_lang";

function readInitial(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "ar" || v === "en") return v;
  } catch {
    /* private mode etc. */
  }
  return "en";
}

/** Apply direction + language to the document root so every layer mirrors. */
function applyToDocument(lang: Lang) {
  const dir = lang === "ar" ? "rtl" : "ltr";
  const root = document.documentElement;
  root.setAttribute("lang", lang);
  root.setAttribute("dir", dir);
  root.setAttribute("data-lang", lang);
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readInitial);

  useEffect(() => {
    applyToDocument(lang);
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    setLangState(next);
  }, []);

  const t = useCallback((key: string) => translate(lang, key), [lang]);

  const value = useMemo<I18nCtx>(
    () => ({ lang, dir: lang === "ar" ? "rtl" : "ltr", t, setLang }),
    [lang, t, setLang],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside provider");
  return v;
}
