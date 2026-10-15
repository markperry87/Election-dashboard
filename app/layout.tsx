import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BC Election Watch",
  description: "BC election probabilities: prediction markets blended with the median of five polling models (338Canada, Northern Vibe, Vote-Scope, Astra and Opus 5.5), plus popular-vote estimates and source history.",
  other: {
    "codex-preview": "development",
  },
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
