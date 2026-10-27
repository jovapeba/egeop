import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "eGEOPOLIS — Strategy • Nations • Power",
  description:
    "Work, train, fight, trade and govern. An open-source MMO social-strategy game inspired by e-Sim.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/favicon.png", type: "image/png" },
      { url: "/logo.png", type: "image/png" },
    ],
    apple: "/logo.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
