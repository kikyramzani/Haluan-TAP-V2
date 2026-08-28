import type { $Enums } from "@prisma/client";
import { SAMPLE_STATUS_LABEL } from "../../../../lib/sample-status";

export type SampleRequestStatus = $Enums.SampleRequestStatus;

export const STATUS_LABELS = SAMPLE_STATUS_LABEL;

export const STATUS_ORDER: SampleRequestStatus[] = ["PENDING", "APPROVED", "SHIPPED", "COMPLETED", "REJECTED", "CANCELLED"];

export function formatDate(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}
