const LOCAL_SVG_LOGOS = new Set(`abbott bagsmart beplain biolage biore blackmores dove dyson facerinna hairnerds hansaplast himalaya illiyoon jisulife kerastase la-roche-posay lancome liby loreal minimalist natura nuface opella pg pigeon purito revlon rider shu-uemura skinfood swisse tirtir torras toshiba ulike unicharm unilever vaseline watsons wings`.split(" "));
const LOCAL_PNG_LOGOS = new Set(`avoskin bardi beauty-of-joseon blp-beauty bonbox charm curcuma-plus dear-me-beauty everwhite for-love-and-lemons hada-labo hale haveltea inthebox jacquelle jib-indonesia joocyee kay-beauty klinbos labore lip-ice maange mamypoko matrix maxim melano mise-en-scene moell mom-uung my-baby naavagreen neozen nurilab nutrimart polki realfood simplus skin-aqua softex torriden tresemme usmile vitabumin wosado you-beauty zinus zwitsal`.split(" "));

function extensions(keys: string, extension: string) {
  return Object.fromEntries(keys.split(" ").map((key) => [key, extension]));
}

const LOCAL_BATCH_2_LOGOS: Record<string, string> = {
  ...extensions(`acome advance aeris aestika-hair airbot alt-perfumery alunicorn bebiotic bluebutton bostanten cicido-indonesia cooger crusita crystallure cuit-babywear deorex earth-love-life ecentio eloi-coco enchen erspo ertos eze-nails focalure freemir fss-for-skin-sake gaabor glow-better gm-bear goojodoq goto-living han-river herbloom hogasan house-of-ease imboost iswhite jiniso kiip kymm-skin lencir lozy-hijab mad-for-makeup marina masami miranda mito-electronic mlen-diary modofo momelca nabnib natasha-skincare newlab noera noroid ovale pinkflash plan-your-skin realfit sagi salsa-cosmetics sanvanina secret-clean skmei slavina soulyu-beauty speeds stein summerscent sunhouse superego tentang-anak teratu-beauty timephoria top-toy true-to-skin ultima-ii vidoran votre white-story wonderlux ynm`, "png"),
  ...extensions(`alchemy azzura eglux goute ownskin pose pramy sweety taco`, "svg"),
  ...extensions(`careso cleora pero-indonesia premiere-beaute`, "webp"),
  ...extensions(`lanbena`, "jpg"),
  ...extensions(`aoera biodef biyu brighty cbd-haircare cimol-bojot-aa dorskin everpure finally-found-you greney guele hairmony healthyway hint instaperfect jiera kikoya-snack mercon-merah-putih mine-perfumery olike otwoo porto putri roona samono sariwangi scentplus scora sculpt sinda tulandut vitalis xora-hijab`, "png"),
  ...extensions(`airuidu asheeqahijab03 asoka asta-homeware case-sultan-jryu cpm dasterbeauty gain-yum gehel haji-salman harmits-project inbex kafamilk kakimi kallyoutfit keelat kktop lashboss le-ding-ding les-catino majestic-karpet man-shabara mastap-id mexshamall mixio momami mukena-aminah nalandu no-void-minds octarine ownerjashujanraf piyambak-inc princess-kesli ratu-sprei real-heavy rifanyhijab seagloca sweet-sally tokolobo uphome vitmaker xlyz yesplus`, "jpg"),
  ...extensions(`mirael`, "svg"),
  ...extensions(`zuma-indonesia`, "jpeg"),
  ...extensions(`barber-daily cubbie gendes glamazing`, "png"),
  ...extensions(`aitu aiueo all-perfect autumn bodimax bravhom cuan-kabel dilidili-shop heefn huafit icebiu magister mirror-space monster-audio ohsome onlife panova rapatech robot semut-bersih seruni-living whiteinc xmvp yesall youware`, "jpg"),
  ...extensions(`heyxi pol-perabot`, "png"),
  ...extensions(`2r-memey-cosmetic avero barsten bika-ambon-rica-rico bukuagen-store ellara elvicto expert-care gloowbi golden-home-living hg-men jj-glow kojis kuda-laut-biru lavees-cosmedics lightplus luminetumblr77 madia-kitchenware moderno-houseware nco-parfum papaso sandy-collection thipank tusen unitary`, "jpg"),
};

// Batch enam: halaman komisi extra program afiliasi, seluruhnya WebP. Provenance
// per file ada di BRAND-LOGO-SOURCES.md.
const KOMISI_EXTRA_LOGOS = new Set(`3ce amaterasun animate azarine herborist huawei laushine-beauty make-over oppo some-by-mi tecno baseus cerave chalonese cool-vita dazzle-me docare dr-beemed elsheskin embryolisse emina erha-store etude evangeline-perfume gamen garnier hanasui hnh implora infinix innisfree kahf kiehl-s-indonesia l-oreal-professionnel luxcrime maybelline miniso miranda-hair-care mosseru mustika-ratu npure nubia onix perfect-white purbasari realme robot-pc rose-all-day saff-and-co sandisk skin1004 sulwhasoo tavi ugreen vivan wardah xiaomi`.split(" "));

const LOCAL_LOGO_ALIASES: Array<[RegExp, string]> = [
  [/^avoskin(?:\s+new\s+list)?$/i, "avoskin"],
  [/^(?:boj|beauty\s+of\s+j[eo]a?os[eo]n)/i, "beauty-of-joseon"],
  [/^blp(?:\s+beauty)?$/i, "blp-beauty"],
  [/^had[aa]\s*labo$/i, "hada-labo"],
  [/^labore(?:\s*\(paragon\))?$/i, "labore"],
  [/^(?:lrp\s*\/\s*)?la\s+roche[ -]posay$/i, "la-roche-posay"],
  [/^l['’]?oreal/i, "loreal"],
  [/^matrix(?:\s+id)?$/i, "matrix"],
  [/^mise\s+en\s+sc[eè]ne$/i, "mise-en-scene"],
  [/^moe?ll?$/i, "moell"],
  [/^opella(?:\s+id)?$/i, "opella"],
  [/^p\s*&\s*g$/i, "pg"],
  [/^pigeon(?:\s+teens?)?(?:\s+1)?$/i, "pigeon"],
  [/^swisse(?:\s+vitamin)?(?:\s*[-–]\s*indonesia)?$/i, "swisse"],
  [/^unilever\s*\(zwitsal\)$/i, "zwitsal"],
  [/^unilever/i, "unilever"],
  [/^(?:y\.?o\.?u|you)(?:\s+beauty|\s*\(hebe\))?$/i, "you-beauty"],
  [/^bostanten/i, "bostanten"],
  [/^cleora/i, "cleora"],
  [/^deorex/i, "deorex"],
  [/^erto['’]?s/i, "ertos"],
  [/^erspo/i, "erspo"],
  [/^kiip lifestyle$/i, "kiip"],
  [/^lencir/i, "lencir"],
  [/^masami/i, "masami"],
  [/^modofo/i, "modofo"],
  [/^(?:ownerjashujanraf\s*\|\s*)?ownskin/i, "ownskin"],
  [/^tentang anak/i, "tentang-anak"],
  [/^asheeq?a(?:\s+)?hijab(?:\s+)?0?3$/i, "asheeqahijab03"],
  [/^gain\s*yum/i, "gain-yum"],
  [/^zuma(?:\s+indonesia)?$/i, "zuma-indonesia"],
  [/^2r\s*(?:&|and)?\s*memey\s*cosmetic$/i, "2r-memey-cosmetic"],
  // The same brand under a longer shop name. One asset, several spellings in the
  // catalog. An alias rather than a second copy of the same image.
  [/^cimol\s*bojot\.?\s*aa$/i, "cimol-bojot-aa"],
  [/^elvicto/i, "elvicto"],
  [/^goojodoq/i, "goojodoq"],
  [/^le\s*ding\s*ding$/i, "le-ding-ding"],
  [/^purito/i, "purito"],
  [/^samono/i, "samono"],
  [/^make\s*over$/i, "make-over"],
  [/^some\s*by\s*mi$/i, "some-by-mi"],
];

function localLogoKey(brand: string) {
  const alias = LOCAL_LOGO_ALIASES.find(([pattern]) => pattern.test(brand))?.[1];
  if (alias) return alias;
  return brand.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const BRAND_MEDIA: Array<[RegExp, string]> = [
  [/^mistine$/i, "/brand-media/mistine.jpg"],
  [/^laneige$/i, "/brand-media/laneige.jpg"],
  [/^anua$/i, "/brand-media/anua.jpg"],
  [/^makarizo$/i, "/brand-media/makarizo.jpg"],
  [/^advan$/i, "/brand-media/advan.jpg"],
  [/^somethinc$/i, "/brand-media/somethinc.jpg"],
  [
    /^gmeelan$/i,
    "https://gmeebeauty.com/cdn/shop/files/LOGO_5x_35452bbb-dd54-4c19-95aa-14e98e72505e.png?v=1711009654&width=760",
  ],
  [/^cetaphil$/i, "/brand-media/cetaphil.webp"],
  [/^oraimo$/i, "/brand-media/oraimo.webp"],
  [/^harlette$/i, "/brand-media/harlette.webp"],
  [/^glad2glow$/i, "/brand-media/glad2glow.webp"],
  [/^omg/i, "/brand-media/omg.webp"],
  [/^clear$/i, "/brand-media/clear.webp"],
  [/^judydoll$/i, "/brand-media/judydoll.webp"],
  [/^morris$/i, "/brand-media/morris.webp"],
  [/^nivea$/i, "/brand-media/nivea.webp"],
  [/^scarlett$/i, "/brand-media/scarlett.webp"],
  [/^skintific$/i, "/brand-media/skintific.webp"],
  [/^raecca$/i, "/brand-media/raecca.webp"],
  [/^d['’]?alba$/i, "/brand-media/dalba.webp"],
];

const BRAND_COVERS: Array<[RegExp, string]> = [
  [/^advan$/i, "/brand-media/advan.jpg"],
  [/^somethinc$/i, "/brand-media/somethinc.jpg"],
];

export function brandLogo(brand: string) {
  const key = localLogoKey(brand);
  if (KOMISI_EXTRA_LOGOS.has(key)) return `/brand-logos/${key}.webp`;
  if (LOCAL_BATCH_2_LOGOS[key]) return `/brand-logos/${key}.${LOCAL_BATCH_2_LOGOS[key]}`;
  if (LOCAL_SVG_LOGOS.has(key)) return `/brand-logos/${key}.svg`;
  if (LOCAL_PNG_LOGOS.has(key)) return `/brand-logos/${key}.png`;
  if (key === "cypruz") return "/brand-logos/cypruz.webp";
  const local = BRAND_MEDIA.find(([pattern]) => pattern.test(brand));
  if (local) return local[1];
  // Missing assets intentionally fall back to initials until a verified local logo is added.
  return null;
}

export function brandCover(brand: string) {
  return BRAND_COVERS.find(([pattern]) => pattern.test(brand))?.[1] ?? null;
}

export function brandInitials(brand: string) {
  return brand.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

/**
 * Every asset path the resolver can return, for the test that keeps the tables
 * and the files on disk from drifting apart. A registered key whose file is
 * missing renders a broken image, and nothing else in the suite would notice.
 */
export function registeredLogoPaths() {
  return [
    ...[...KOMISI_EXTRA_LOGOS].map((key) => `/brand-logos/${key}.webp`),
    ...Object.entries(LOCAL_BATCH_2_LOGOS).map(([key, extension]) => `/brand-logos/${key}.${extension}`),
    ...[...LOCAL_SVG_LOGOS].map((key) => `/brand-logos/${key}.svg`),
    ...[...LOCAL_PNG_LOGOS].map((key) => `/brand-logos/${key}.png`),
    "/brand-logos/cypruz.webp",
    ...BRAND_MEDIA.map(([, path]) => path).filter((path) => path.startsWith("/")),
    ...BRAND_COVERS.map(([, path]) => path),
  ];
}

/** Keys must resolve to exactly one asset; two tables claiming one key is a bug. */
export function duplicateLogoKeys() {
  const keys = [
    ...KOMISI_EXTRA_LOGOS,
    ...Object.keys(LOCAL_BATCH_2_LOGOS),
    ...LOCAL_SVG_LOGOS,
    ...LOCAL_PNG_LOGOS,
  ];
  return keys.filter((key, index) => keys.indexOf(key) !== index);
}
