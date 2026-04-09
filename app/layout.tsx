import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#F59E0B",
};

export const metadata: Metadata = {
  title: "Pesa AI — SMS Payments on HashKey Chain",
  description:
    "AI-powered SMS PayFi agent for Africa, settled on HashKey Chain via HSP. Built for the On-Chain Horizon Hackathon 2026.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Pesa AI",
  },
  openGraph: {
    title: "Pesa AI — Send money with a text",
    description: "Send money with a text. Settled on-chain via HSP PayFi on HashKey Chain.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pesa AI",
    description: "AI-powered SMS payments on HashKey Chain — for the 1 billion unbanked",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/logo.svg" />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} bg-pesa-bg text-pesa-text`}>
        {children}
      </body>
    </html>
  );
}
