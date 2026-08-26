import type { SampleStatus } from "./models.ts";

export const SAMPLE_STATUS_TRANSITIONS: Record<SampleStatus, SampleStatus[]> = {
  submitted: ["review", "rejected", "on_hold"],
  review: ["approved", "rejected", "on_hold"],
  approved: ["shipped", "rejected", "on_hold"],
  rejected: [],
  on_hold: ["review", "rejected"],
  shipped: ["received"],
  received: ["content_submitted"],
  content_submitted: [],
};
