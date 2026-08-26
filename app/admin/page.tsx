import { requireAdmin } from "../../lib/auth";
import { logoutAction } from "../logout-action";
import AdminClient from "./AdminClient";

export default async function AdminPage() {
  const admin = await requireAdmin();
  return <AdminClient adminName={admin.name} logoutAction={logoutAction}/>;
}
