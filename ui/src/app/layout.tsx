import type { Metadata } from "next";

import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Iris | Deep-space health investigation",
  description: "Onboard health investigation for long-duration spaceflight.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
