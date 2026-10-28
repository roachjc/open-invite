import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Manrope } from "next/font/google";
import "./globals.css";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});
const brand = Manrope({
  subsets: ["latin"],
  weight: ["800"],
  variable: "--font-brand",
});

export const metadata: Metadata = {
  icons: { icon: "/icon.svg" },
  title: "Open Invite",
  description: "See what your friends are doing. Join if you're free.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} ${brand.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
