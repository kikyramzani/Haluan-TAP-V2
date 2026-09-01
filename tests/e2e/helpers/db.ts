import { prisma } from "../../../lib/db.ts";
import { brandKey as computeBrandKey } from "../../../lib/brand-key.ts";

/**
 * E2E runs against the SAME real dev Postgres every other part of this
 * project uses. Not a separate database, not CSV fixtures. That means two
 * hard rules for every helper in this file:
 *
 * 1. NEVER create, update, or delete a Brand/Campaign/CampaignTier/CampaignLink
 *    row that isn't prefixed `e2e-` (brandKey). The real migrated catalog
 *    (691 brands) is the one thing this whole rebuild was never allowed to touch.
 * 2. Every throwaway User/Creator/Session/SampleRequest a spec creates must be
 *    cleaned up by that spec (usually in a `finally` or after the assertions),
 *    identified by an `e2e-`-prefixed email or name so a failed cleanup is at
 *    least easy to find and hand-remove later.
 */

const FIXTURE_PREFIX = "e2e-";

export type CatalogFixtures = Awaited<ReturnType<typeof seedCatalogFixtures>>;

/**
 * A small, deliberate set of brands covering the same edge cases the old
 * CSV-fixture suite used to exercise: single-tier, multi-tier (lowest-tier
 * link selection), sample support, a null-commission tier (the "-" display
 * path. No longer a parse failure, since Postgres never stores an unparsed
 * cell, but the same display rule still needs coverage), an expired
 * campaign, a "new SKU" flag, and a Shopee (KETENTUAN_PLATFORM) brand.
 */
export async function seedCatalogFixtures() {
  const category = await prisma.category.findUniqueOrThrow({ where: { slug: "beauty-health" } });
  const now = Date.now();
  const suffix = String(now);

  const singleName = `E2E Single ${suffix}`;
  const single = await prisma.brand.create({
    data: {
      brandKey: computeBrandKey(singleName),
      displayName: singleName,
      categoryId: category.id,
      campaigns: {
        create: {
          platform: "TIKTOK_SHOP",
          commissionType: "PERSENTASE",
          slug: `${FIXTURE_PREFIX}single-${suffix}`,
          status: "ACTIVE",
          hasSample: true,
          tiers: { create: [{ label: "Tier 1", commission: 8, sortIndex: 0 }] },
          links: { create: [{ url: "https://affiliate.example.com/e2e-single", isPrimary: true, sortIndex: 0 }] },
        },
      },
    },
    include: { campaigns: { include: { tiers: true, links: true } } },
  });

  // Lowest-commission tier must be the one whose link is offered. Never the
  // most expensive one, and never just "the first row".
  const multiTierName = `E2E MultiTier ${suffix}`;
  const multiTier = await prisma.brand.create({
    data: {
      brandKey: computeBrandKey(multiTierName),
      displayName: multiTierName,
      categoryId: category.id,
      campaigns: {
        create: {
          platform: "TIKTOK_SHOP",
          commissionType: "PERSENTASE",
          slug: `${FIXTURE_PREFIX}multitier-${suffix}`,
          status: "ACTIVE",
          tiers: {
            create: [
              { label: "Tier tinggi", commission: 15, sortIndex: 0 },
              { label: "Tier rendah", commission: 9, sortIndex: 1 },
              { label: "Tier tengah", commission: 12, sortIndex: 2 },
            ],
          },
          links: {
            create: [
              { url: "https://affiliate.example.com/e2e-multi-tinggi", isPrimary: true, sortIndex: 0 },
              { url: "https://affiliate.example.com/e2e-multi-rendah", isPrimary: false, sortIndex: 1 },
              { url: "https://affiliate.example.com/e2e-multi-tengah", isPrimary: false, sortIndex: 2 },
            ],
          },
        },
      },
    },
    include: { campaigns: { include: { tiers: true, links: true } } },
  });

  // A tier with no commission on an otherwise-numeric campaign. The "-"
  // display path. (Admin UI forbids this combination at creation time; a
  // direct Prisma write is the only way to reach it, and reaching it is
  // exactly what this fixture is for.)
  const unknownCommissionName = `E2E Unknown Commission ${suffix}`;
  const unknownCommission = await prisma.brand.create({
    data: {
      brandKey: computeBrandKey(unknownCommissionName),
      displayName: unknownCommissionName,
      categoryId: category.id,
      campaigns: {
        create: {
          platform: "TIKTOK_SHOP",
          commissionType: "PERSENTASE",
          slug: `${FIXTURE_PREFIX}unknown-${suffix}`,
          status: "ACTIVE",
          tiers: { create: [{ label: "Tier tanpa komisi", commission: null, sortIndex: 0 }] },
          links: { create: [{ url: "https://affiliate.example.com/e2e-unknown", isPrimary: true, sortIndex: 0 }] },
        },
      },
    },
    include: { campaigns: { include: { tiers: true, links: true } } },
  });

  const expiredName = `E2E Expired ${suffix}`;
  const expired = await prisma.brand.create({
    data: {
      brandKey: computeBrandKey(expiredName),
      displayName: expiredName,
      categoryId: category.id,
      campaigns: {
        create: {
          platform: "TIKTOK_SHOP",
          commissionType: "PERSENTASE",
          slug: `${FIXTURE_PREFIX}expired-${suffix}`,
          status: "ACTIVE",
          validUntil: new Date(now - 30 * 24 * 60 * 60 * 1000),
          tiers: { create: [{ label: "Tier 1", commission: 25, sortIndex: 0 }] },
          links: { create: [{ url: "https://affiliate.example.com/e2e-expired", isPrimary: true, sortIndex: 0 }] },
        },
      },
    },
    include: { campaigns: { include: { tiers: true, links: true } } },
  });

  const newSkuName = `E2E New SKU ${suffix}`;
  const newSku = await prisma.brand.create({
    data: {
      brandKey: computeBrandKey(newSkuName),
      displayName: newSkuName,
      categoryId: category.id,
      campaigns: {
        create: {
          platform: "TIKTOK_SHOP",
          commissionType: "PERSENTASE",
          slug: `${FIXTURE_PREFIX}newsku-${suffix}`,
          status: "ACTIVE",
          newSku: true,
          tiers: { create: [{ label: "Tier 1", commission: 11, sortIndex: 0 }] },
          links: { create: [{ url: "https://affiliate.example.com/e2e-newsku", isPrimary: true, sortIndex: 0 }] },
        },
      },
    },
    include: { campaigns: { include: { tiers: true, links: true } } },
  });

  const shopeeName = `E2E Shopee ${suffix}`;
  const shopee = await prisma.brand.create({
    data: {
      brandKey: computeBrandKey(shopeeName),
      displayName: shopeeName,
      categoryId: category.id,
      campaigns: {
        create: {
          platform: "SHOPEE_AFFILIATE",
          commissionType: "KETENTUAN_PLATFORM",
          slug: `shopee-${computeBrandKey(shopeeName)}`,
          status: "ACTIVE",
          hasSample: true,
          tiers: { create: [{ label: "Campaign Shopee", commission: null, sortIndex: 0 }] },
          links: { create: [{ url: "https://shopee.co.id/e2e-shopee", isPrimary: true, sortIndex: 0 }] },
        },
      },
    },
    include: { campaigns: { include: { tiers: true, links: true } } },
  });

  return { single, multiTier, unknownCommission, expired, newSku, shopee, suffix };
}

/**
 * Rate-limit buckets (Phase 7 moved these onto Postgres. See lib/rate-limit.ts)
 * persist across separate test runs, not just within one. Re-running a spec
 * file repeatedly against the same real dev Postgres while debugging can
 * exhaust a shared IP-scoped bucket (e.g. "catalog-public") well before the
 * fixed window naturally expires. Clearing it at the start of a run keeps
 * local iteration from tripping over its own prior runs.
 */
export async function resetRateLimitScope(scope: string) {
  await prisma.rateLimitBucket.deleteMany({ where: { scope } });
}

export async function cleanupCatalogFixtures() {
  // brandKey is computed from displayName via the real brandKey() (see the
  // fix below. A manually-prefixed brandKey that doesn't match
  // brandKey(displayName) breaks every real lookup-by-brand-name flow, e.g.
  // resolveCampaignId() in lib/requests.ts), so fixtures are identified by
  // their "E2E " displayName prefix instead.
  const brands = await prisma.brand.findMany({ where: { displayName: { startsWith: "E2E " } }, select: { id: true } });
  const brandIds = brands.map((b) => b.id);
  if (!brandIds.length) return;
  const campaigns = await prisma.campaign.findMany({ where: { brandId: { in: brandIds } }, select: { id: true } });
  const campaignIds = campaigns.map((c) => c.id);
  await prisma.linkClick.deleteMany({ where: { campaignId: { in: campaignIds } } });
  await prisma.savedCampaign.deleteMany({ where: { campaignId: { in: campaignIds } } });
  await prisma.sampleRequest.deleteMany({ where: { campaignId: { in: campaignIds } } });
  await prisma.campaignTier.deleteMany({ where: { campaignId: { in: campaignIds } } });
  await prisma.campaignLink.deleteMany({ where: { campaignId: { in: campaignIds } } });
  await prisma.brandPlatformStat.deleteMany({ where: { brandId: { in: brandIds } } });
  // CampaignEngagementStat cascades from Campaign (see prisma/schema.prisma),
  // so it needs no explicit delete here.
  await prisma.campaign.deleteMany({ where: { brandId: { in: brandIds } } });
  await prisma.brand.deleteMany({ where: { id: { in: brandIds } } });
}

/**
 * A featured brand with one live campaign, plus its already-resolved
 * CampaignEngagementStat row. Written directly instead of running the
 * nightly cron, because a spec must never depend on real click/save volume
 * existing in the shared database.
 */
export async function seedHotDealFixture() {
  const category = await prisma.category.findUniqueOrThrow({ where: { slug: "beauty-health" } });
  const suffix = String(Date.now());
  const displayName = `E2E HotDeal ${suffix}`;

  const brand = await prisma.brand.create({
    data: {
      brandKey: computeBrandKey(displayName),
      displayName,
      categoryId: category.id,
      featured: true,
      campaigns: {
        create: {
          platform: "TIKTOK_SHOP",
          commissionType: "PERSENTASE",
          slug: `${FIXTURE_PREFIX}hotdeal-${suffix}`,
          status: "ACTIVE",
          hasSample: true,
          tiers: { create: [{ label: "Tier 1", commission: 11, sortIndex: 0 }] },
          links: { create: [{ url: "https://affiliate.example.com/e2e-hotdeal", isPrimary: true, sortIndex: 0 }] },
        },
      },
    },
    include: { campaigns: true },
  });

  const campaign = brand.campaigns[0];
  await prisma.campaignEngagementStat.upsert({
    where: { campaignId: campaign.id },
    create: { campaignId: campaign.id, badge: "TOP_BRAND" },
    update: { badge: "TOP_BRAND" },
  });

  return { displayName, slug: campaign.slug };
}

/**
 * Deletes a throwaway account by email. Most child rows cascade from User/Creator
 * automatically (see prisma/schema.prisma), but LinkClick.creator has no cascade
 * (it must survive a creator's deletion for aggregate stats), so it's cleared
 * explicitly first. Otherwise a creator who visited a /go/ link during the test
 * would leave the delete blocked on a foreign key. Safe to call even if the
 * account never existed.
 */
export async function cleanupUserByEmail(email: string) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, creator: { select: { id: true } } } });
  if (!user) return;
  if (user.creator) await prisma.linkClick.deleteMany({ where: { creatorId: user.creator.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

export async function cleanupUsersByEmails(emails: string[]) {
  for (const email of emails) await cleanupUserByEmail(email);
}

/**
 * SUPER_ADMIN has no allowlist env var (see lib/auth.ts). It can only be
 * granted by an existing super admin via /admin/pengguna, which is a
 * chicken-and-egg problem for a fresh e2e database. Same direct-Prisma-write
 * pattern used to seed the first real super admin in earlier phases of this
 * rebuild (see the plan's Phase 4 progress log).
 *
 * There's deliberately no equivalent promoteToAdmin(). Plain ADMIN is
 * reconciled against ADMIN_EMAILS on every single admin-gated request
 * (lib/auth.ts's reconcileAdminRole), and a role that doesn't match the
 * allowlist is immediately demoted back to CREATOR with its session
 * invalidated (`sessionsInvalidBefore: new Date()`). Verified by hitting
 * this directly. A direct-Prisma role write survives exactly zero requests.
 * The only way to get real ADMIN access here is the allowlisted ADMIN_EMAIL
 * account itself (register-or-login into it, matching admin-workspace.spec.ts).
 */
export async function promoteToSuperAdmin(email: string) {
  await prisma.user.update({ where: { email }, data: { role: "SUPER_ADMIN" } });
}

/**
 * Fills a real wilayah chain + the rest of the 9 fields
 * computeProfileCompleteness() checks, and verifies membership. The two
 * preconditions checkSampleGate() enforces before a sample request can be
 * created. Driving the full /dashboard/profil cascading-select UI just to
 * reach this precondition would test that UI, not the sample lifecycle this
 * helper exists to set up quickly.
 */
/**
 * Direct-Prisma equivalent of submitting /daftar/lengkapi's OnboardingForm
 * (see app/daftar/lengkapi/actions.ts's completeOnboarding): sets
 * Creator.onboardingCompletedAt and attaches one category. This is the ONE
 * gate app/dashboard/layout.tsx checks before any /dashboard/* route renders
 *. CompleteCreatorProfileAndVerify() below does not touch it, since that
 * helper exists for the separate sample-request membership gate. A spec that
 * only cares about a /dashboard/* sub-route's own behavior (not the
 * onboarding form itself, which the main creator-journey test drives for
 * real through the UI) can call this instead of re-driving that form.
 */
export async function completeOnboarding(email: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const category = await prisma.category.findFirstOrThrow();
  await prisma.creator.upsert({
    where: { userId: user.id },
    create: { userId: user.id, onboardingCompletedAt: new Date(), categories: { create: [{ categoryId: category.id }] } },
    update: { onboardingCompletedAt: new Date() },
  });
}

export async function completeCreatorProfileAndVerify(email: string) {
  const province = await prisma.province.findFirstOrThrow();
  const regency = await prisma.regency.findFirstOrThrow({ where: { provinceId: province.id } });
  const district = await prisma.district.findFirstOrThrow({ where: { regencyId: regency.id } });
  const village = await prisma.village.findFirstOrThrow({ where: { districtId: district.id } });

  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const creator = await prisma.creator.update({
    where: { userId: user.id },
    data: {
      membership: "VERIFIED",
      address: {
        upsert: {
          create: {
            provinceId: province.id,
            regencyId: regency.id,
            districtId: district.id,
            villageId: village.id,
            detailAddress: "Jl. E2E Test Nomor 1",
            postalCode: "12345",
            recipientName: "E2E Creator",
            recipientPhone: "628123456789",
          },
          update: {},
        },
      },
    },
  });
  return creator;
}
