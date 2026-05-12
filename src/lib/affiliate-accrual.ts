/**
 * Affiliate accrual — fires at payment capture (inside the same Prisma
 * transaction that creates the Payment row). Walks the Plan A logic
 * locked in with Miles:
 *
 *   Plan A — "creator waiver wins on collision".
 *
 *   - Creator-only eligible:
 *       waiver already applied to quotedPricePence at checkout;
 *       maker-side 8% cut still computed → routed to creator's
 *       affiliate balance.
 *
 *   - Maker-only eligible:
 *       creator paid the full service fee; maker keeps the 8% cut
 *       (Payment.platformFeePence force-zeroed); creator's service
 *       fee snapshot → maker's affiliate balance.
 *
 *   - Both eligible (collision):
 *       creator's waiver still applies (already at checkout); maker
 *       loses theirs (platformFeePence stands); both affiliates get
 *       a flat 50p consolation from Fabricate.
 *
 *   - Race-lost (creator snapshot says eligible but flag already
 *     flipped): silently no-op. Fabricate eats the £0 service-fee
 *     reduction; no kickback.
 *
 * After accrual: the relevant user(s) have affiliateBonusClaimed
 * flipped to true (single-use, enforced atomically via updateMany).
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { AFFILIATE_COLLISION_CONSOLATION_PENCE } from "./affiliate";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"> | Prisma.TransactionClient;

export type AccrualResult = {
  /** When >0, set Payment.platformFeePence to this value (overrides
   *  the default 8%) — happens when maker waiver fires and maker
   *  keeps the full bid. */
  overridePlatformFeePence: number | null;
  /** Audit summary for logging. */
  summary: string;
};

/** Apply Plan A. `defaultPlatformFeePence` is the value the Payment
 *  row would otherwise be created with (the snapshotted 8%). */
export async function applyAffiliateAccrual({
  tx,
  jobId,
  creatorUserId,
  makerUserId,
  defaultPlatformFeePence,
}: {
  tx: Tx;
  jobId: string;
  creatorUserId: string;
  makerUserId: string;
  defaultPlatformFeePence: number;
}): Promise<AccrualResult> {
  const job = await tx.job.findUnique({
    where: { id: jobId },
    select: {
      creatorAffiliateWaiverApplied: true,
      serviceFeeSnapshotPence: true,
    },
  });
  if (!job) return { overridePlatformFeePence: null, summary: "no_job" };

  // Re-check eligibility at capture time. The snapshot on Job tells us
  // the creator *was* eligible at checkout; we must confirm they still
  // are (no concurrent first-job beat them to the flag flip).
  const creator = await tx.user.findUnique({
    where: { id: creatorUserId },
    select: {
      referredByCodeId: true,
      affiliateBonusClaimed: true,
    },
  });
  const maker = await tx.user.findUnique({
    where: { id: makerUserId },
    select: {
      referredByCodeId: true,
      affiliateBonusClaimed: true,
    },
  });

  const creatorEligibleNow =
    Boolean(
      job.creatorAffiliateWaiverApplied &&
        creator?.referredByCodeId &&
        !creator.affiliateBonusClaimed,
    );
  const makerEligibleNow = Boolean(
    maker?.referredByCodeId && !maker.affiliateBonusClaimed,
  );

  // Both: collision. Apply Plan A — creator keeps waiver, maker doesn't,
  // both affiliates get the consolation. Both first-job slots are spent.
  if (creatorEligibleNow && makerEligibleNow) {
    await accrue({
      tx,
      codeId: creator!.referredByCodeId!,
      jobId,
      amountPence: AFFILIATE_COLLISION_CONSOLATION_PENCE,
      reason: "collision",
    });
    await accrue({
      tx,
      codeId: maker!.referredByCodeId!,
      jobId,
      amountPence: AFFILIATE_COLLISION_CONSOLATION_PENCE,
      reason: "collision",
    });
    await flipClaimedFlag(tx, creatorUserId);
    await flipClaimedFlag(tx, makerUserId);
    return {
      overridePlatformFeePence: null,
      summary: `collision: 50p + 50p`,
    };
  }

  // Creator only: redirect the maker-side 8% to creator's affiliate.
  if (creatorEligibleNow) {
    await accrue({
      tx,
      codeId: creator!.referredByCodeId!,
      jobId,
      amountPence: defaultPlatformFeePence,
      reason: "creator_referral",
    });
    await flipClaimedFlag(tx, creatorUserId);
    return {
      overridePlatformFeePence: null,
      summary: `creator_referral: ${defaultPlatformFeePence}p → affiliate`,
    };
  }

  // Maker only: maker keeps the 8% (override platformFee to 0), creator's
  // service fee snapshot → maker's affiliate.
  if (makerEligibleNow) {
    const accrualAmount = job.serviceFeeSnapshotPence;
    if (accrualAmount > 0) {
      await accrue({
        tx,
        codeId: maker!.referredByCodeId!,
        jobId,
        amountPence: accrualAmount,
        reason: "maker_referral",
      });
    }
    await flipClaimedFlag(tx, makerUserId);
    return {
      overridePlatformFeePence: 0,
      summary: `maker_referral: maker keeps 8%, ${accrualAmount}p → affiliate`,
    };
  }

  return { overridePlatformFeePence: null, summary: "no_affiliate" };
}

async function accrue({
  tx,
  codeId,
  jobId,
  amountPence,
  reason,
}: {
  tx: Tx;
  codeId: string;
  jobId: string;
  amountPence: number;
  reason: "creator_referral" | "maker_referral" | "collision";
}) {
  await tx.affiliateEarning.create({
    data: { codeId, jobId, amountPence, reason },
  });
  await tx.affiliateCode.update({
    where: { id: codeId },
    data: {
      balancePence: { increment: amountPence },
      lifetimeEarnedPence: { increment: amountPence },
    },
  });
}

/** Race-safe single-use flip — only succeeds if the flag is currently
 *  false, so two concurrent captures can't both claim the same first-job
 *  bonus. The caller has already gated on `!affiliateBonusClaimed` in
 *  the snapshot; this is the atomic write. */
async function flipClaimedFlag(tx: Tx, userId: string): Promise<void> {
  await tx.user.updateMany({
    where: { id: userId, affiliateBonusClaimed: false },
    data: { affiliateBonusClaimed: true },
  });
}
