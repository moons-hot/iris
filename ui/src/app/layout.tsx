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
      <body className="min-h-screen bg-background">
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
