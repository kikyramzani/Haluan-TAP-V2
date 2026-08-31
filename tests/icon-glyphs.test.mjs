import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Glyph Unicode yang dulu dipakai sebagai ikon. Semuanya sudah diganti komponen
 * <Icon /> (app/components/Icon.tsx) karena pembaca layar membacakannya apa
 * adanya — "black diamond", "up-right arrow" — dan bentuknya berubah-ubah antar
 * font dan platform. Test ini menahan mereka supaya tidak menyelinap kembali.
 *
 * app/admin/ dikecualikan: ruang kerja internal itu belum ikut migrasi ini.
 */
const RETIRED = ["↗", "→", "←", "↓", "✓", "✕", "☆", "★", "◉", "◎", "⧉", "⌕", "↻", "◇", "☾", "☀", "◈", "＋", "◯", "⌂", "⌁", "△", "◔", "◆"];

/**
 * Tanda baca sungguhan, bukan ikon — sengaja dibiarkan sebagai teks:
 * "·" pemisah, "…" pada tombol yang sedang memproses, "—" untuk nilai kosong,
 * dan "⌘"/"K" di dalam <kbd> yang memang melambangkan tombol keyboard.
 */
const ALLOWED_AS_TEXT = ["·", "…", "—", "⌘"];

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "admin") continue;
      files.push(...walk(full));
    } else if (entry.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

test("tidak ada glyph Unicode yang dipakai sebagai ikon di luar app/admin", () => {
  const offenders = [];
  for (const file of walk("app")) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      // Baris komentar boleh memakai panah untuk menggambarkan alur (mis.
      // "PENDING → APPROVED"), karena tidak pernah sampai ke layar.
      const trimmed = line.trim();
      if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) return;
      for (const glyph of RETIRED) {
        if (line.includes(glyph)) offenders.push(`${file}:${index + 1} → ${glyph}`);
      }
    });
  }
  assert.deepEqual(offenders, [], `Glyph yang sudah dipensiunkan muncul lagi:\n${offenders.join("\n")}`);
});

test("daftar pengecualian tidak tumpang tindih dengan daftar yang dipensiunkan", () => {
  const overlap = ALLOWED_AS_TEXT.filter((glyph) => RETIRED.includes(glyph));
  assert.deepEqual(overlap, []);
});
