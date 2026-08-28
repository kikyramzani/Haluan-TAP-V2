import type { $Enums } from "@prisma/client";

type SampleRequestStatus = $Enums.SampleRequestStatus;

export const SAMPLE_STATUS_TRANSITIONS: Record<SampleRequestStatus, SampleRequestStatus[]> = {
  PENDING: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["SHIPPED", "REJECTED"],
  SHIPPED: ["COMPLETED"],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

export const SAMPLE_STATUS_LABEL: Record<SampleRequestStatus, string> = {
  PENDING: "Menunggu",
  APPROVED: "Disetujui",
  SHIPPED: "Dikirim",
  COMPLETED: "Selesai",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
};
