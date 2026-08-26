import { redirect } from "next/navigation";
import AdminAuthClient from "./AdminAuthClient";
import { getAdminUser } from "../../../lib/auth";
import { authEmailEnabled } from "../../../lib/email-auth";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  const admin = await getAdminUser().catch(() => null);
  if (admin) redirect("/admin");
  return <AdminAuthClient emailVerificationEnabled={authEmailEnabled()} />;
}
