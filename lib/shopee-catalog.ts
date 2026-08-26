const MONTH = "januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember";

export function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function extractShopeeUrls(value: string) {
  return value.match(/https?:\/\/[^\s,]+/g)?.map((url) => url.replace(/[);]+$/, "")) ?? [];
}

export function cleanShopeeBrand(raw: string, firstUrl: string) {
  let brand = raw.slice(0, raw.indexOf(firstUrl))
    .replace(/[\s:–—-]+$/, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  brand = brand
    .replace(/^new\s+/i, "")
    .replace(/\s+authorized\s+store(?:\s+.*)?$/i, "")
    .replace(/\s+store\s+(?:jakarta|bandung|surabaya|tangerang|bekasi|depok|bogor|medan|semarang|makassar)(?:\s+.*)?$/i, "")
    .replace(/\s+official\s+(?:shop|store)(?:\s+.*)?$/i, "")
    .replace(/\s+official\s+haluan(?:\s*-\s*\d+)?$/i, "")
    .replace(new RegExp(`\\s+(?:new\\s+)?(?:${MONTH})(?:\\s*-\\s*(?:${MONTH}))?(?:\\s+20\\d{2})?(?:\\s*-\\s*\\d+)?$`, "i"), "")
    .replace(/\s+new\s+20\d{2}(?:\s*-\s*20\d{2})?$/i, "")
    .replace(/\s+20\d{2}(?:\s*-\s*20\d{2})?(?:\s*-\s*\d+)?$/i, "")
    .replace(/\s*\([^)]*\)\s*$/i, "")
    .replace(/\s*-\s*\d+$/i, "")
    .replace(/\s+(?:official|star seller)$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  const aliases: Array<[RegExp, string]> = [
    [/^AXIS\s*-\s*Y$/i, "AXIS-Y"],
    [/^Acome\b.*$/i, "Acome"],
    [/^Baseus\b.*$/i, "Baseus"],
    [/^Bonbox\b.*$/i, "Bonbox"],
    [/^COOGER\b.*$/i, "COOGER"],
    [/^Ecentio\b.*$/i, "Ecentio"],
    [/^Elshe\s*Skin$/i, "ElsheSkin"],
    [/^Esqa Cosmetics$/i, "ESQA Cosmetics"],
    [/^Garnier(?:\s+Official)?$/i, "Garnier"],
    [/^Glad2Glow$/i, "Glad2Glow"],
    [/^GOOJODOQ\b.*$/i, "GOOJODOQ"],
    [/^Han River\b.*$/i, "Han River"],
    [/^KiiP\b.*$/i, "KiiP"],
    [/^Madame Gie$/i, "Madame Gie"],
    [/^(?:New\s+)?Makeover$/i, "Make Over"],
    [/^MLEN Diary\b.*$/i, "MLEN Diary"],
    [/^Motorola\b.*$/i, "Motorola"],
    [/^Npure$/i, "NPURE"],
    [/^realme\b.*$/i, "realme"],
    [/^SKIN1004(?:\s+New)?$/i, "SKIN1004"],
    [/^Loreal\s+Profes+ion+el(?:\s+Indonesia)?$/i, "L'Oréal Professionnel"],
    [/^3CE\b.*$/i, "3CE"],
    [/^2R\s*&\s*Memey\s+Cosmetic$/i, "2R & Memey Cosmetic"],
    [/^Scarlett(?: Whitening)?$/i, "Scarlett Whitening"],
    [/^Somethinc(?: Makeup)?$/i, "SOMETHINC"],
    [/^SAMONO\b.*$/i, "SAMONO"],
    [/^Xiaomi\b.*$/i, "Xiaomi"],
  ];
  return aliases.find(([pattern]) => pattern.test(brand))?.[1] ?? brand;
}
