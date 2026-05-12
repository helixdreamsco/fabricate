import type { Metadata } from "next";
import { Inter, Space_Mono } from "next/font/google";
import "./globals.css";
import { TopNav } from "@/components/shell/TopNav";
import { PromoBanner } from "@/components/shell/PromoBanner";
import { OrderProvider } from "@/lib/order-store";
import { SessionProviderClient } from "@/components/auth/SessionProviderClient";
import { PlausibleScript } from "@/components/analytics/PlausibleScript";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "700", "900"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://fabricate.helixdreams.co"),
  title: {
    default: "Fabricate — London's 3D Printing Marketplace",
    template: "%s · Fabricate",
  },
  description:
    "London's 3D printing marketplace for creators — cosplay props, custom keycaps, jewellery, minis and prototypes printed by nearby makers. Upload a file, get an instant quote, pick up the part. 1–10 pieces, not factory runs.",
  applicationName: "Fabricate",
  keywords: [
    "3d printing london",
    "3d printing service london",
    "3d printing near me",
    "custom 3d printing uk",
    "3d print on demand london",
    "cosplay 3d printing",
    "cosplay prop printing",
    "custom keycaps uk",
    "custom keycaps 3d print",
    "miniature printing london",
    "dnd miniature printing uk",
    "fashion 3d printing",
    "jewellery 3d printing",
    "indie hardware prototyping",
    "stl to part",
    "rapid prototyping london",
    "3d printing marketplace uk",
    "fabricate",
    "helixdreamsco",
  ],
  authors: [{ name: "helixdreamsco", url: "https://helixdreams.co" }],
  creator: "helixdreamsco",
  publisher: "HELIXDREAMSCO LTD",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "Fabricate",
    locale: "en_GB",
    url: "https://fabricate.helixdreams.co",
    title: "Fabricate — London's 3D Printing Marketplace",
    description:
      "Make it real. London's 3D-printing marketplace for cosplayers, designers, makers and creators. Upload a file, get an instant quote, a nearby maker prints it.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Fabricate — London's 3D Printing Marketplace",
    description:
      "Cosplay props, keycaps, jewellery, minis — printed by London makers. 0% platform fees this month.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/icon-256.png",
    apple: "/icon-256.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceMono.variable} h-full antialiased`}
    >
      <head>
        <PlausibleScript />
      </head>
      <body className="min-h-full flex flex-col">
        <SessionProviderClient>
          <OrderProvider>
            <PromoBanner />
            <TopNav />
            <main className="flex-1 flex flex-col">{children}</main>
          </OrderProvider>
        </SessionProviderClient>
      </body>
    </html>
  );
}
