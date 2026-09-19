import type { Metadata } from "next";
import { Instrument_Serif, Inter } from "next/font/google";
import Script from "next/script";

import "../styles/globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument",
});

export const metadata: Metadata = {
  title: "Iris | Deep-space health investigation",
  description: "Onboard health investigation for long-duration spaceflight.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${instrument.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <Script id="iris-theme" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem("iris-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.classList.toggle("dark",t==="dark");document.documentElement.style.colorScheme=t}catch(e){}})();`}
        </Script>
        <div className="iris-stars" aria-hidden="true" />
        <div className="iris-app">{children}</div>
      </body>
    </html>
  );
}
