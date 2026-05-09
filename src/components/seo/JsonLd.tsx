/**
 * Inline JSON-LD <script> for structured-data hints. Used by Google,
 * Bing, and increasingly by LLM-powered search engines (ChatGPT,
 * Perplexity, Gemini) to extract entity facts from a page.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify is safe here — we control the input shape.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
