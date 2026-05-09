import type { Metadata } from "next";
import { Inter, Space_Mono } from "next/font/google";
import "./globals.css";
import { TopNav } from "@/components/shell/TopNav";
import { PromoBanner } from "@/components/shell/PromoBanner";
import { OrderProvider } from "@/lib/order-store";
import { SessionProviderClient } from "@/components/auth/SessionProviderClient";

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
    "Bring your design to life with London's makers. Upload an STL, get an instant quote, and receive your part — minis, jewellery, cosplay, prototypes, custom keycaps. Local pickup, fast turnaround.",
  applicationName: "Fabricate",
  keywords: [
    "3d printing service london",
    "custom 3d printing",
    "3d print on demand",
    "miniature printing london",
    "cosplay prop printing",
    "indie hardware prototyping",
    "fashion 3d printing",
    "custom keycaps",
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
      "Upload an STL, get an instant quote, and a London-based maker brings your design to life. For creators, makers, and indie hardware founders.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Fabricate — London's 3D Printing Marketplace",
    description:
      "Upload an STL, get a quote, get the part. London makers · 0% fees this month.",
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
