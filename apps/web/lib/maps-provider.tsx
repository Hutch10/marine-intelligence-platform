"use client";

import React, { ReactNode, useEffect, useState } from "react";

interface MarineMapsProviderProps {
  children: ReactNode;
  apiKey?: string;
}

/**
 * Tactical "Oceanic Dark" style for Google Maps.
 * Suppresses standard civilian labels and uses high-contrast dark tones.
 */
export const TACTICAL_OCEAN_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#212121" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
  {
    featureType: "administrative",
    elementType: "geometry",
    stylers: [{ color: "#757575" }],
  },
  {
    featureType: "administrative.country",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9e9e9e" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#000000" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#3d3d3d" }],
  },
];

export function MarineMapsProvider({ children, apiKey }: MarineMapsProviderProps) {
  const [APIProvider, setAPIProvider] = useState<React.ComponentType<{
    apiKey: string;
    solutionChannel?: string;
    children?: ReactNode;
  }> | null>(null);

  useEffect(() => {
    import("@vis.gl/react-google-maps").then((m) => {
      setAPIProvider(() => m.APIProvider as React.ComponentType<{
        apiKey: string;
        solutionChannel?: string;
        children?: ReactNode;
      }>);
    });
  }, []);

  // During SSR and before client mount: render children without the maps API wrapper.
  // APIProvider uses browser-only Google Maps internals that cannot SSR.
  if (!APIProvider) {
    return <>{children}</>;
  }

  const googleMapsApiKey = apiKey || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  if (!googleMapsApiKey) {
    console.warn("[Marine Maps] No Google Maps API Key provided. Map renders in developmental mode.");
  }

  return (
    <APIProvider apiKey={googleMapsApiKey} solutionChannel="GMP_GCC_react_v1">
      {children}
    </APIProvider>
  );
}
