import type { Metadata } from "next";
import { Geist, Geist_Mono, Archivo_Black } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/session-provider";
import { SigninBar } from "@/components/signin-bar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Chunky brutalist display face for the oversized headings (Balenciaga/Seal refs).
const archivoBlack = Archivo_Black({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KRYPTONDROP | Trustless Per-Second GPU Compute Rentals on Monad",
  description:
    "Trustless per-second GPU compute rental & autonomous Agent-to-Agent (A2A) compute allocation platform built on Monad Testnet.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${archivoBlack.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SessionProvider>
          <SigninBar />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
