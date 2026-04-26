"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { type TacticalMode } from "@marine/shared";

interface TacticalModeContextType {
  mode: TacticalMode;
  setMode: (mode: TacticalMode) => void;
  adminOverride: boolean;
  setAdminOverride: (override: boolean) => void;
}

const TacticalModeContext = createContext<TacticalModeContextType | undefined>(undefined);

export function TacticalModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<TacticalMode>("STANDARD");
  const [adminOverride, setAdminOverride] = useState(false);

  // Load from local storage on mount
  useEffect(() => {
    const savedMode = localStorage.getItem("marine-tactical-mode") as TacticalMode;
    if (savedMode) setMode(savedMode);
    
    const savedOverride = localStorage.getItem("marine-admin-override") === "true";
    setAdminOverride(savedOverride);
  }, []);

  // Sync to local storage
  const handleSetMode = (newMode: TacticalMode) => {
    setMode(newMode);
    localStorage.setItem("marine-tactical-mode", newMode);
  };

  const handleSetAdminOverride = (override: boolean) => {
    setAdminOverride(override);
    localStorage.setItem("marine-admin-override", String(override));
  };

  return (
    <TacticalModeContext.Provider 
      value={{ 
        mode, 
        setMode: handleSetMode, 
        adminOverride, 
        setAdminOverride: handleSetAdminOverride 
      }}
    >
      {children}
    </TacticalModeContext.Provider>
  );
}

export function useTacticalMode() {
  const context = useContext(TacticalModeContext);
  if (context === undefined) {
    throw new Error("useTacticalMode must be used within a TacticalModeProvider");
  }
  return context;
}
