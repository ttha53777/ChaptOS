"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "chaptos_org_logo";

function readLogo(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function useOrgLogo(): {
  logoUrl: string | null;
  setLogo: (dataUrl: string) => void;
  clearLogo: () => void;
} {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    setLogoUrl(readLogo());

    // Keep in sync across components in the same tab via a custom event
    function onLogoChange() {
      setLogoUrl(readLogo());
    }
    window.addEventListener("chaptos_logo_changed", onLogoChange);
    // Also sync across browser tabs
    window.addEventListener("storage", onLogoChange);
    return () => {
      window.removeEventListener("chaptos_logo_changed", onLogoChange);
      window.removeEventListener("storage", onLogoChange);
    };
  }, []);

  const setLogo = useCallback((dataUrl: string) => {
    localStorage.setItem(STORAGE_KEY, dataUrl);
    setLogoUrl(dataUrl);
    window.dispatchEvent(new Event("chaptos_logo_changed"));
  }, []);

  const clearLogo = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setLogoUrl(null);
    window.dispatchEvent(new Event("chaptos_logo_changed"));
  }, []);

  return { logoUrl, setLogo, clearLogo };
}
