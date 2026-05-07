import { Sparkles } from "lucide-react";
import {
  isPlatformFeePromoActive,
  PROMO_LABEL,
  PROMO_TAGLINE,
} from "@/lib/promotions";

/**
 * Slim banner mounted above the TopNav whenever the launch promo is on.
 * Shown to everyone — creators benefit (£0 service fee), makers benefit
 * (Fabricate doesn't skim the payout), so a single message works for
 * both audiences.
 */
export function PromoBanner() {
  if (!isPlatformFeePromoActive()) return null;
  return (
    <div className="bg-[#7c3aed] text-white">
      <div className="max-w-[1600px] mx-auto px-5 md:px-8 py-2 flex items-center justify-center gap-2 flex-wrap text-center">
        <Sparkles className="w-3.5 h-3.5" strokeWidth={2.4} />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] font-bold">
          {PROMO_LABEL}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-80">
          · {PROMO_TAGLINE} · 0% service fee on every order
        </span>
      </div>
    </div>
  );
}
