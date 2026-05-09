import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

/**
 * Dynamic sitemap covering static marketing pages plus public maker /
 * community profiles. Authed surfaces (jobs, checkout, dashboards) are
 * intentionally excluded — robots.ts disallows them.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://fabricate.helixdreams.co";
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${base}/makers`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/communities`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/track`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/press`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/acceptable-use`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];

  let dynamicEntries: MetadataRoute.Sitemap = [];
  try {
    const [makers, communities] = await Promise.all([
      prisma.makerProfile.findMany({
        select: { id: true, updatedAt: true },
        where: { printers: { some: { active: true } } },
        take: 1000,
      }),
      prisma.community.findMany({
        select: { slug: true, updatedAt: true },
        take: 500,
      }),
    ]);
    dynamicEntries = [
      ...makers.map((m) => ({
        url: `${base}/makers/${m.id}`,
        lastModified: m.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
      ...communities.map((c) => ({
        url: `${base}/c/${c.slug}`,
        lastModified: c.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      })),
    ];
  } catch {
    // DB unreachable at build time — return static only.
  }

  return [...staticEntries, ...dynamicEntries];
}
