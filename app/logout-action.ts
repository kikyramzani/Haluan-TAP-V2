"use server";

import { redirect } from "next/navigation";
import { destroySession } from "../lib/auth";

/**
 * Dipakai sebagai `action` form baik dari dashboard creator maupun admin.
 *
 * Kegagalan `destroySession()` (mis. Redis sedang bermasalah) tidak boleh
 * menjatuhkan seluruh halaman ke `global-error.tsx` untuk sekadar klik keluar
 *. Cookie tetap dibersihkan bila memungkinkan, dan pengguna tetap diarahkan
 * pulang. Pola yang sama seperti app/api/auth/logout/route.ts.
 */
export async function logoutAction() {
  try {
    await destroySession();
  } catch {
    // Diteruskan: redirect di bawah tetap jalan walau datastore bermasalah.
  }
  redirect("/");
}
