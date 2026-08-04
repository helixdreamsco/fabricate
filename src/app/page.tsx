import { LandingHero } from "@/components/landing/LandingHero";
import { NetworkStrip } from "@/components/landing/NetworkStrip";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Footer } from "@/components/landing/Footer";
import { FREE_GENERATIONS_PER_DAY } from "@/lib/design/jobs";
import { LoggedInHome } from "@/components/home/LoggedInHome";
import { JsonLd } from "@/components/seo/JsonLd";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const HOMEPAGE_JSON_LD = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": "https://fabricate.helixdreams.co/#organization",
    name: "Fabricate",
    legalName: "HELIXDREAMSCO LTD",
    url: "https://fabricate.helixdreams.co",
    logo: "https://fabricate.helixdreams.co/icon-512.png",
    description:
      "London-based 3D-printing marketplace connecting creators with local makers.",
    parentOrganization: {
      "@type": "Organization",
      name: "helixdreamsco",
      url: "https://helixdreams.co",
    },
    address: {
      "@type": "PostalAddress",
      addressLocality: "London",
      addressCountry: "GB",
    },
    sameAs: [],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": "https://fabricate.helixdreams.co/#website",
    url: "https://fabricate.helixdreams.co",
    name: "Fabricate",
    publisher: { "@id": "https://fabricate.helixdreams.co/#organization" },
    inLanguage: "en-GB",
  },
  {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": "https://fabricate.helixdreams.co/#service",
    serviceType: "Custom 3D Printing Marketplace",
    provider: { "@id": "https://fabricate.helixdreams.co/#organization" },
    areaServed: {
      "@type": "City",
      name: "London",
      containedInPlace: { "@type": "Country", name: "United Kingdom" },
    },
    audience: {
      "@type": "Audience",
      audienceType:
        "Creators, hobbyists, indie hardware founders, fashion designers, tabletop gamers, cosplayers",
    },
    description:
      "Upload an STL or STEP file, receive an instant quote, and a local maker prints and delivers your design. Built for creative, entrepreneurial, and hobbyist use — not industrial replacement parts.",
    offers: {
      "@type": "Offer",
      priceCurrency: "GBP",
      availability: "https://schema.org/InStock",
      url: "https://fabricate.helixdreams.co/",
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What is Fabricate?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Fabricate is a London-based 3D-printing marketplace. Creators upload a 3D model (STL or STEP), get an instant quote, and a local maker prints and hands the part over. It's built for creators, hobbyists, and indie founders rather than industrial repair.",
        },
      },
      {
        "@type": "Question",
        name: "How fast can I get a part?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Most jobs are bid on within hours and fulfilled in 24-72 hours. Pickup is direct from the maker; courier delivery is also available.",
        },
      },
      {
        "@type": "Question",
        name: "What does Fabricate cost?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Service fee is normally £2 base plus 10% of the print subtotal. During the launch promo, the service fee is waived — you pay only your maker's quote plus any add-ons.",
        },
      },
      {
        "@type": "Question",
        name: "What is Fabricate good for?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Tabletop miniatures, cosplay props, custom jewellery, fashion accessories, indie hardware prototypes, custom keycaps, architecture school models, sculptural art, and other creative use cases. It is not designed for industrial mass production or generic repair work.",
        },
      },
      {
        "@type": "Question",
        name: "How do I become a maker?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Sign up at fabricate.helixdreams.co/makers, complete identity verification via Stripe, list your printer setup and materials, and you can start bidding on jobs the same day.",
        },
      },
    ],
  },
];

export default async function Home() {
  const session = await auth();

  if (session?.user?.id) {
    const memberships = await prisma.communityMember.findMany({
      where: { userId: session.user.id },
      include: {
        community: {
          include: {
            _count: {
              select: { members: true },
            },
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    });

    // Maker counts per community: how many of each community's members
    // have a MakerProfile. One round-trip — group by community.
    const myCommunityIds = memberships.map((m) => m.communityId);
    const makerCountRows = myCommunityIds.length === 0 ? [] : await prisma.communityMember.findMany({
      where: {
        communityId: { in: myCommunityIds },
        user: { makerProfile: { isNot: null } },
      },
      select: { communityId: true },
    });
    const makerCountByCommunity = makerCountRows.reduce<Record<string, number>>((acc, r) => {
      acc[r.communityId] = (acc[r.communityId] ?? 0) + 1;
      return acc;
    }, {});

    const communities = memberships.map((m) => ({
      id: m.community.id,
      slug: m.community.slug,
      name: m.community.name,
      iconHue: m.community.iconHue,
      discountPct: m.community.discountPct,
      freeMode: m.community.freeMode,
      priorityQueue: m.community.priorityQueue,
      memberOnlyMakers: m.community.memberOnlyMakers,
      memberCount: m.community._count.members,
      makerCount: makerCountByCommunity[m.community.id] ?? 0,
    }));

    const first =
      session.user.name?.split(" ")[0] ??
      session.user.email?.split("@")[0] ??
      null;
    return <LoggedInHome userFirstName={first} communities={communities} />;
  }

  // The hero's "live" pill quotes a real figure rather than a decorative one.
  // Below a handful of makers we'd rather say nothing than advertise a
  // thin network, so the pill falls back to "London · live".
  const makerCount = await prisma.makerProfile.count();

  return (
    <>
      <JsonLd data={HOMEPAGE_JSON_LD} />
      <LandingHero
        makerCount={makerCount >= 5 ? makerCount : null}
        freeGenerations={FREE_GENERATIONS_PER_DAY}
      />
      <NetworkStrip />
      <HowItWorks />
      <Footer />
    </>
  );
}
