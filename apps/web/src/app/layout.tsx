import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { ServiceWorker } from "@/components/ServiceWorker";
import { AuthProvider } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Gem — Live Gem Auctions",
  description: "Browse vetted gem listings and bid in live, server-timed auctions.",
  applicationName: "Gem",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Gem" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#070912",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
