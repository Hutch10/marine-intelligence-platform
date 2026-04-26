import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Marine Bio Platform",
    template: "%s | Marine Bio Platform",
  },
  description: "Ocean Intelligence Platform for marine biology research.",
};

import { TacticalModeProvider } from "@/lib/context/tactical-mode";
import { MarineMapsProvider } from "@/lib/maps-provider";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <MarineMapsProvider>
          <TacticalModeProvider>
            {children}
          </TacticalModeProvider>
        </MarineMapsProvider>
      </body>
    </html>
  );
}
