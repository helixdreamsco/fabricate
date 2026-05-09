import type { MetadataRoute } from "next";

/**
 * Robots policy. Allows all major crawlers including AI/LLM bots that
 * power generative search (ChatGPT, Claude, Gemini, Perplexity). Authed
 * application surfaces are blocked because their content is per-user
 * and not useful in search.
 */
export default function robots(): MetadataRoute.Robots {
  const base = "https://fabricate.helixdreams.co";
  const disallow = [
    "/api/",
    "/checkout",
    "/account/verify-email",
    "/account/reset-password",
    "/jobs/",
    "/order/",
    "/maker/",
    "/legal/accept",
  ];
  return {
    rules: [
      // General crawlers — Google, Bing, DuckDuckGo, Apple, Mojeek, etc.
      {
        userAgent: "*",
        allow: ["/"],
        disallow,
      },
      // Explicit allows for AI / generative-search crawlers. These bots
      // sometimes ignore wildcard rules; naming them gives confidence.
      { userAgent: "GPTBot", allow: "/", disallow },
      { userAgent: "OAI-SearchBot", allow: "/", disallow },
      { userAgent: "ChatGPT-User", allow: "/", disallow },
      { userAgent: "ClaudeBot", allow: "/", disallow },
      { userAgent: "Claude-Web", allow: "/", disallow },
      { userAgent: "anthropic-ai", allow: "/", disallow },
      { userAgent: "Google-Extended", allow: "/", disallow },
      { userAgent: "PerplexityBot", allow: "/", disallow },
      { userAgent: "Perplexity-User", allow: "/", disallow },
      { userAgent: "CCBot", allow: "/", disallow },
      { userAgent: "Applebot-Extended", allow: "/", disallow },
      { userAgent: "Bytespider", allow: "/", disallow },
      { userAgent: "Amazonbot", allow: "/", disallow },
      { userAgent: "DuckAssistBot", allow: "/", disallow },
      { userAgent: "MistralAI-User", allow: "/", disallow },
      { userAgent: "Cohere-AI", allow: "/", disallow },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
