import "@/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";

import { IrisNav } from "@/components/iris/iris-nav";
import { IrisSessionProvider } from "@/components/iris/session-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: "Iris - purpose-bound patient context",
  description:
    "Hardware-backed authentication, purpose-bound clinical views, and a tamper-evident access trail.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} dark`}>
      {/* suppressHydrationWarning: browser extensions (e.g. ColorZilla) inject
          attributes like cz-shortcut-listen onto <body> before React hydrates. */}
      <body className="min-h-screen bg-background" suppressHydrationWarning>
        <TooltipProvider>
          <IrisSessionProvider>
            <IrisNav />
            {children}
            <Toaster position="top-right" />
          </IrisSessionProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
