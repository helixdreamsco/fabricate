import type { Metadata } from "next";
import { Inter, Space_Mono } from "next/font/google";
import "./globals.css";
import { TopNav } from "@/components/shell/TopNav";
import { PreLaunchBanner } from "@/components/shell/PreLaunchBanner";
import { OrderProvider } from "@/lib/order-store";

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
  title: "Fabricate — Upload. Pay. Print.",
  description:
    "The 2-tap 3D printing marketplace. Upload an STL, get an instant quote, receive your part without the usual back-and-forth.",
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
        <OrderProvider>
          <PreLaunchBanner />
          <TopNav />
          <main className="flex-1 flex flex-col">{children}</main>
        </OrderProvider>
      </body>
    </html>
  );
}
