import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Iris Groundbase | Fleet mission control",
  description:
    "Ground mission control for Iris: fleet vitals, alerts, and delayed Tiger downlink logs.",
};

export default function GroundbaseLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
