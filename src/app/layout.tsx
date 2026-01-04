import type { Metadata, Viewport } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";

const roboto = Roboto({
  weight: ["300", "400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-roboto",
});

export const metadata: Metadata = {
  title: "Messagis - Pour nous deux",
  description: "Une messagerie privée, élégante et rapide.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Messagis",
  },
};

export const viewport: Viewport = {
  themeColor: "#FFFC00",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

import AppWrapper from "@/components/AppWrapper";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="h-full">
      <body
        className={`${roboto.variable} font-sans antialiased h-full bg-white text-[#4a4a4a]`}
      >
        <AppWrapper>{children}</AppWrapper>
      </body>
    </html>
  );
}
