import type { Metadata } from "next";
import { Geist, Manrope } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });

export const metadata: Metadata = {
  title: "IntentCart — Agentic Shopping, Bounded Checkout",
  description: "Turn a shopping request into an approved, auditable Razorpay checkout.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geist.variable} ${manrope.variable} antialiased`}>{children}</body>
    </html>
  );
}
