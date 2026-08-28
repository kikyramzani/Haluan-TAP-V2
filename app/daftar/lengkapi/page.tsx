import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "../../../lib/auth";
import { prisma } from "../../../lib/db";
import OnboardingForm from "./OnboardingForm";

export default async function LengkapiProfilPage() {
  const user = await requireUser("/dashboard");
  const creator = await prisma.creator.findUnique({ where: { userId: user.id }, select: { onboardingCompletedAt: true } });
  if (creator?.onboardingCompletedAt) redirect("/dashboard");

  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });

  return (
    <main>
      <nav className="nav shell">
        <Link className="brand" href="/" aria-label="TAP by Haluan home">
          <strong>TAP</strong>
        </Link>
      </nav>
      <section className="form-page shell">
        <aside className="form-intro">
          <span className="eyebrow">Satu langkah lagi</span>
          <h1>
            Lengkapi profil <br />
            <em>sebelum masuk dashboard.</em>
          </h1>
          <p>Nama, WhatsApp, dan kategori konten membantu tim Haluan mencocokkan akunmu dengan master creator MCN.</p>
        </aside>
        <div className="form-panel">
          <OnboardingForm defaultName={user.name} defaultPhone={user.phone} categories={categories} />
        </div>
      </section>
    </main>
  );
}
