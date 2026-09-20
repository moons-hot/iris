import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Iris Mission Control | Fleet operations",
  description:
    "Ground mission control for Iris: fleet vitals, alerts, and delayed Tiger downlink logs.",
};

export default function GroundbaseLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
