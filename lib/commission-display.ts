import type { CommissionType } from "@prisma/client";
import { formatCommission } from "./commission.ts";

type CommissionLike = { commission: number | string | { toString(): string } | null };

/** Numeric tier commissions, nulls dropped (a KETENTUAN_PLATFORM tier's commission is always null). */
export function commissionValues(tiers: readonly CommissionLike[]): number[] {
  return tiers
    .map((tier) => (tier.commission === null || tier.commission === undefined ? null : Number(tier.commission)))
    .filter((value): value is number => value !== null && Number.isFinite(value));
}

export function minMaxCommission(tiers: readonly CommissionLike[]): { min: number | null; max: number | null } {
  const values = commissionValues(tiers);
  if (!values.length) return { min: null, max: null };
  return { min: Math.min(...values), max: Math.max(...values) };
}

/** Range label for a brand/campaign with several tiers. "9% – 12%", a single "9%", or "Ketentuan platform". */
export function commissionRangeLabel(input: { commissionType: CommissionType; min: number | null; max: number | null }): string {
  if (input.commissionType === "KETENTUAN_PLATFORM") return "Ketentuan platform";
  if (input.min === null) return "—";
  if (input.max === null || input.min === input.max) return formatCommission(input.min);
  return `${formatCommission(input.min)} – ${formatCommission(input.max)}`;
}

/** Label for a single already-resolved commission value (e.g. a campaign's lowest tier). */
export function campaignCommissionLabel(input: { commissionType: CommissionType; commission: number | null }): string {
  return input.commissionType === "KETENTUAN_PLATFORM" ? "Ketentuan platform" : formatCommission(input.commission);
}
