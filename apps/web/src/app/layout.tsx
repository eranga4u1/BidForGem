import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ServiceWorker } from "@/components/ServiceWorker";

export const metadata: Metadata = {
  title: "Gem — Bidding Platform",
  description: "Create profiles, list gems, and bid in live auctions.",
  applicationName: "Gem",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Gem" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
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
          <div className="app">{children}</div>
        </AuthProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
