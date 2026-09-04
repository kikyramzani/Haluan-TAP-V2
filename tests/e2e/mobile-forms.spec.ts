import { expect, test, type Page } from "@playwright/test";

/**
 * Penjagaan untuk empat cacat mobile yang tidak pernah terukur sebelumnya.
 *
 * Keempatnya sengaja ditulis supaya benar di SEMUA lebar, bukan hanya di
 * ponsel, sehingga tidak ada satu pun test.skip() baru: aturan dasarnya memang
 * berlaku di mana-mana, dan versi mobile-nya hanya memperketat.
 */

/**
 * Halaman yang benar-benar memuat field untuk diketik TANPA sesi.
 *
 * /request-sample, /dashboard/profil, /daftar/lengkapi, dan seluruh formulir
 * admin sengaja tidak ada di sini: form-nya baru dirender setelah ada sesi
 * yang lolos gerbangnya, jadi kunjungan anonim tidak memuat satu pun input dan
 * pengujiannya akan lulus tanpa mengukur apa pun. Ketiga keluarga selector-nya
 * dijaga oleh pengujian probe di bawah.
 */
const FORM_PAGES = ["/daftar", "/daftar?mode=login", "/admin/login"];

/**
 * Keluarga selector yang menata field di seluruh ruang kerja. Semuanya berbagi
 * SATU aturan di workspace.css, dan aturan itulah yang dulu menulis 14px.
 */
const CONTROL_SCOPES = ["form-panel", "two-col", "auth-form", "admin-request-form"];

/**
 * Ambang Safari iOS. Field ber-font-size di bawah 16px memaksa seluruh viewport
 * membesar saat difokus — halaman bergeser, header terpotong, dan pengguna
 * harus mencubit keluar setiap kali selesai mengetik. Tidak ada cara
 * mematikannya lewat CSS selain menaikkan ukuran hurufnya; user-scalable=no
 * memang menghentikannya tapi itu kegagalan aksesibilitas.
 *
 * Sumber kebenarannya --text-control di tokens.css.
 */
const IOS_ZOOM_THRESHOLD = 16;

async function controlFontSizes(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("input, select, textarea"))
      // Checkbox dan radio tidak menampilkan teks yang diketik, jadi Safari
      // tidak pernah memperbesar viewport untuk keduanya.
      .filter((el) => !["checkbox", "radio", "hidden", "file"].includes((el as HTMLInputElement).type))
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({
        id: el.id || el.getAttribute("name") || el.tagName.toLowerCase(),
        fontSize: Number.parseFloat(getComputedStyle(el).fontSize),
      })),
  );
}

for (const path of FORM_PAGES) {
  test(`field di ${path} tidak memicu zoom paksa iOS`, async ({ page }) => {
    await page.goto(path);
    const controls = await controlFontSizes(page);
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      expect(control.fontSize, `${path} → ${control.id} hanya ${control.fontSize}px`).toBeGreaterThanOrEqual(
        IOS_ZOOM_THRESHOLD,
      );
    }
  });
}

/**
 * Formulir di balik sesi, diuji lewat probe.
 *
 * Merender halamannya sungguhan berarti mendaftar, memverifikasi email, dan
 * menyelesaikan onboarding hanya untuk membaca satu nilai CSS — dan tetap
 * tidak akan menyentuh formulir admin. Yang perlu dibuktikan di sini bukan
 * halamannya, melainkan bahwa ATURAN-nya tetap ≥16px, dan probe mengukur
 * aturan yang sama persis dengan yang dipakai halaman aslinya.
 */
test("aturan field ruang kerja tetap di atas ambang zoom iOS", async ({ page }) => {
  await page.goto("/daftar");

  const measured = await page.evaluate((scopes) => {
    const host = document.createElement("div");
    document.body.append(host);
    const results = scopes.flatMap((scope) =>
      ["input", "select", "textarea"].map((tag) => {
        host.className = scope;
        host.innerHTML = `<${tag}></${tag}>`;
        const el = host.firstElementChild as HTMLElement;
        return { scope, tag, fontSize: Number.parseFloat(getComputedStyle(el).fontSize) };
      }),
    );
    host.remove();
    return results;
  }, CONTROL_SCOPES);

  expect(measured.length).toBe(CONTROL_SCOPES.length * 3);
  // Probe hanya berarti kalau aturannya memang menyentuh elemen ini. Kalau
  // selectornya dihapus suatu saat, nilainya jatuh ke default browser (~13px)
  // dan pengujian di bawah akan gagal — itu perilaku yang diinginkan.
  for (const item of measured) {
    expect(item.fontSize, `.${item.scope} ${item.tag} hanya ${item.fontSize}px`).toBeGreaterThanOrEqual(
      IOS_ZOOM_THRESHOLD,
    );
  }
});

/**
 * Pengurutan dulu hidup DI DALAM panel facet, dan panel itu display:none
 * sampai tombol "Filter" ditekan. Jadi di setiap ponsel satu-satunya cara
 * mengurutkan katalog adalah membuka panel yang namanya justru tidak
 * menjanjikan pengurutan.
 */
test("pengurutan katalog terlihat tanpa membuka panel filter", async ({ page }) => {
  await page.goto("/deals");
  const sort = page.locator("#catalog-sort");
  await expect(sort).toBeVisible();

  // Panel facet-nya sendiri harus tetap tertutup — kalau ia kebetulan terbuka,
  // pengujian di atas jadi tidak membuktikan apa pun.
  const toggle = page.locator(".facet-toggle");
  if (await toggle.isVisible()) {
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  }
});

/**
 * .search-clear tampil 28px dan itu keputusan visual yang benar untuk field
 * setinggi 48px. Yang salah adalah 28px itu sekaligus jadi ukuran targetnya.
 */
test("tombol hapus pencarian punya sasaran sentuh penuh", async ({ page }) => {
  await page.goto("/deals");
  await page.locator(".search-field input").fill("a");
  const clear = page.locator(".search-clear");
  await expect(clear).toBeVisible();

  // Kotak sentuhnya datang dari ::after, jadi boundingBox() tombolnya sendiri
  // masih 28px. Yang diukur adalah kotak yang benar-benar menerima klik.
  const hit = await clear.evaluate((el) => {
    const rect = getComputedStyle(el, "::after");
    return { width: Number.parseFloat(rect.width), height: Number.parseFloat(rect.height) };
  });
  expect(hit.width).toBeGreaterThanOrEqual(44);
  expect(hit.height).toBeGreaterThanOrEqual(44);
});

/**
 * Sebagai elemen inline, tautan footer hanya setinggi line-height × 14px ≈ 22px
 * — di bawah 24px yang WCAG 2.2 kriteria 2.5.8 tuntut. Pengecualian "tautan di
 * dalam kalimat" tidak berlaku: ini daftar navigasi, bukan prosa.
 */
test("setiap tautan footer memenuhi ambang sasaran WCAG", async ({ page }) => {
  await page.goto("/deals");
  const links = await page.locator(".footer-col a").all();
  expect(links.length).toBeGreaterThan(0);
  for (const link of links) {
    const box = await link.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height, `"${(await link.textContent())?.trim()}" hanya ${box!.height}px`).toBeGreaterThanOrEqual(24);
  }
});
