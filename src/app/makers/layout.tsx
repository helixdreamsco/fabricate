import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Become a maker · Earn from your 3D printer in London",
  description:
    "List your 3D printer on Fabricate. Bid on local creator jobs in London, set your own hours, weekly Stripe payouts. No monthly fee, no quotas — print when you want.",
  alternates: { canonical: "/makers" },
  openGraph: {
    title: "Earn from your 3D printer · Fabricate makers",
    description:
      "Your idle printer, earning between projects. List in 5 minutes, bid on creator jobs nearby, weekly payouts via Stripe Connect.",
    url: "/makers",
  },
};

export default function MakersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
