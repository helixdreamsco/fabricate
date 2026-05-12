import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Track your 3D print order",
  description:
    "Look up the status of a Fabricate order by ID. See bidding, printing, and pickup progress for your job on London's 3D-printing marketplace.",
  alternates: { canonical: "/track" },
  robots: { index: true, follow: true },
};

export default function TrackLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
