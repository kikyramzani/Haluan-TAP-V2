import { buildCampaignCatalog } from "../lib/catalog.ts";

const source = process.env.CAMPAIGN_CATALOG_CSV_URL || "https://docs.google.com/spreadsheets/d/1uPzMJ1S7RAYgZagFAyT1gE2O7SPcTQCKc5852H1i4mQ/export?format=csv&gid=0";
const response = await fetch(source, { headers: { accept: "text/csv" } });
if (!response.ok) throw new Error(`Catalog source response ${response.status}`);

const { campaigns, issues } = buildCampaignCatalog(await response.text());
const brands = [...new Set(issues.map((issue) => issue.brand))].sort((a, b) => a.localeCompare(b));

process.stdout.write(`Published records: ${campaigns.length}\n`);
process.stdout.write(`Excluded cells: ${issues.length}\n`);
process.stdout.write(`Brands requiring ops cleanup: ${brands.length}\n\n`);
for (const issue of issues) {
  process.stdout.write(`row ${issue.row}\t${issue.brand}\t${issue.field}\t${JSON.stringify(issue.value)}\t${issue.reason}\n`);
}

if (!issues.length) process.stdout.write("PASS: no ambiguous rate cells found.\n");
