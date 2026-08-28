import { requireUser } from "../../../lib/auth";
import { prisma } from "../../../lib/db";
import { computeProfileCompleteness } from "../../../lib/profile-completeness";
import ProfilTabs from "./ProfilTabs";

/**
 * /dashboard/profil — Phase 5 creator profile: four independently-saved
 * tabs (Data Pribadi, Alamat, Social Media, Kategori), each backed by its
 * own Server Action in ./actions.ts. Auth + onboarding gating already
 * happens in app/dashboard/layout.tsx; this page only needs requireUser()
 * again because Server Actions (called from the tab forms) cannot rely on
 * the layout's gate having run.
 */
export default async function ProfilPage() {
  const user = await requireUser("/dashboard");

  const creator = await prisma.creator.findUniqueOrThrow({
    where: { userId: user.id },
    include: {
      address: true,
      categories: { select: { categoryId: true } },
    },
  });

  const completeness = computeProfileCompleteness({
    name: user.name,
    phone: user.phone,
    provinceId: creator.address?.provinceId,
    regencyId: creator.address?.regencyId,
    districtId: creator.address?.districtId,
    villageId: creator.address?.villageId,
    detailAddress: creator.address?.detailAddress,
    postalCode: creator.address?.postalCode,
    recipientPhone: creator.address?.recipientPhone,
  });

  const address = creator.address;
  const [provinces, categories, regencies, districts, villages] = await Promise.all([
    prisma.province.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // Pre-populated option lists for the existing wilayah chain, so the
    // cascading selects render fully populated on first paint instead of
    // needing a client-side round trip for an address that already exists.
    address?.provinceId
      ? prisma.regency.findMany({ where: { provinceId: address.provinceId }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
    address?.regencyId
      ? prisma.district.findMany({ where: { regencyId: address.regencyId }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
    address?.districtId
      ? prisma.village.findMany({ where: { districtId: address.districtId }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);

  return (
    <>
      <section className="dashboard-section">
        <div className="dashboard-title">
          <div>
            <span>PROFIL CREATOR</span>
            <h2>Kelengkapan profil</h2>
          </div>
        </div>
        <div className={`activation-card ${completeness.complete ? "verified" : ""}`}>
          <div className="activation-score">
            {completeness.percent}
            <small>%</small>
          </div>
          <div>
            <span>STATUS PROFIL</span>
            <h2>{completeness.complete ? "Profil kamu sudah lengkap." : "Lengkapi profil untuk mempercepat verifikasi."}</h2>
            <p>{completeness.complete ? "Semua data wajib sudah tersimpan." : `Masih perlu: ${completeness.missingFields.join(", ")}.`}</p>
          </div>
        </div>
      </section>

      <ProfilTabs
        dataPribadi={{ name: user.name, phone: user.phone, nickname: creator.nickname, bio: creator.bio }}
        alamat={{
          recipientName: address?.recipientName ?? "",
          provinceId: address?.provinceId ?? "",
          regencyId: address?.regencyId ?? "",
          districtId: address?.districtId ?? "",
          villageId: address?.villageId ?? "",
          detailAddress: address?.detailAddress ?? "",
          rt: address?.rt ?? "",
          rw: address?.rw ?? "",
          postalCode: address?.postalCode ?? "",
          recipientPhone: address?.recipientPhone ?? "",
        }}
        provinces={provinces}
        initialRegencies={regencies}
        initialDistricts={districts}
        initialVillages={villages}
        socialMedia={{
          tiktokUsername: creator.tiktokUsername ?? "",
          tiktokFollowers: creator.tiktokFollowers,
          instagramUsername: creator.instagramUsername ?? "",
          instagramFollowers: creator.instagramFollowers,
          youtubeUsername: creator.youtubeUsername ?? "",
          youtubeFollowers: creator.youtubeFollowers,
          shopeeUsername: creator.shopeeUsername ?? "",
          shopeeFollowers: creator.shopeeFollowers,
          tiktokAffiliateUsername: creator.tiktokAffiliateUsername ?? "",
          tiktokAffiliateFollowers: creator.tiktokAffiliateFollowers,
        }}
        categories={categories}
        selectedCategoryIds={creator.categories.map((c) => c.categoryId)}
      />
    </>
  );
}
