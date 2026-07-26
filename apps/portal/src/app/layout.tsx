import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import PwaRegister from "./PwaRegister";

export const metadata: Metadata = {
  title: "Dastarkhwan",
  description: "Multi-brand POS Portal",
  manifest: "/manifest.json",
  icons: { icon: "/icons/favicon.svg", apple: "/icons/icon-192.svg" },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "Dastarkhwan",
  },
};

export const viewport: Viewport = {
  themeColor: "#1e293b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider afterSignInUrl="/dashboard">
      <html lang="en" suppressHydrationWarning>
        <body>
          <PwaRegister />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
