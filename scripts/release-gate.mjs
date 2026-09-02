import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Runs the quality gate and writes down what it actually measured.
 *
 * A gate result is only evidence if it names the commit, records clean endpoint
 * snapshots of the tree, preserves the stage output, and cannot skip its own
 * work through malformed arguments. The log and its SHA-256 sidecar live under
 * ignored `outputs/` by default, so recording evidence cannot dirty the source
 * tree after the final cleanliness check.
 *
 *   node scripts/release-gate.mjs [--runs 5] [--base origin/main] [--out path.log]
 */

const USAGE = "Usage: node scripts/release-gate.mjs [--runs 1..20] [--base git-ref] [--out ignored-or-external-path.log]";
const VALUE_OPTIONS = new Set(["--runs", "--base", "--out"]);

export function parseGateOptions(args, env = process.env) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (!VALUE_OPTIONS.has(name)) throw new Error(`Unknown option: ${name}\n${USAGE}`);
    if (values.has(name)) throw new Error(`Duplicate option: ${name}\n${USAGE}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}\n${USAGE}`);
    values.set(name, value);
    index += 1;
  }

  const rawRuns = values.get("--runs") ?? "5";
  if (!/^[1-9]\d*$/.test(rawRuns)) throw new Error(`--runs must be a positive integer from 1 to 20; received ${rawRuns}`);
  const runs = Number(rawRuns);
  if (!Number.isSafeInteger(runs) || runs > 20) throw new Error(`--runs must be a positive integer from 1 to 20; received ${rawRuns}`);

  const base = values.get("--base") ?? env.GATE_BASE ?? "origin/main";
  if (!base.trim()) throw new Error("--base must name a commit or ref");
  return { runs, base, out: values.get("--out") ?? null };
}

export function gatePassed(input) {
  return Number.isSafeInteger(input.requiredRuns)
    && input.requiredRuns > 0
    && input.completedRuns === input.requiredRuns
    && input.stagesPassed
    && input.baseResolved
    && input.baselineResolved
    && input.whitespaceClean
    && input.headBefore === input.headAfter
    && input.treeBefore === ""
    && input.treeAfter === "";
}

export function parseGateBaseline(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("release-gate-baseline.json must contain an object");
  const unitContractPassed = value.unitContractPassed;
  const e2ePassed = value.e2ePassed;
  for (const [name, count] of Object.entries({ unitContractPassed, e2ePassed })) {
    if (!Number.isSafeInteger(count) || count <= 0) throw new Error(`${name} must be a positive integer in release-gate-baseline.json`);
  }
  /**
   * e2eSkipped boleh nol, jadi ia diperiksa terpisah dari dua angka di atas.
   *
   * Gerbang ini dulu menuntut `skipped === 0` mati-matian. Syarat itu tidak
   * pernah bisa dipenuhi: dua test.skip() di suite memang selalu menyala
   * (keyboard.spec.ts melewati WebKit karena perangkat sentuh tidak punya
   * tombol Tab, mobile-nav.spec.ts melewati proyek di atas 900px karena bar
   * bawahnya memang tidak dirender di sana). Jadi gerbangnya merah terlepas
   * dari mutu kodenya. Angka yang diharapkan tetap menangkap skip baru yang
   * tidak disengaja, tanpa menuntut hal yang mustahil.
   */
  const e2eSkipped = value.e2eSkipped;
  if (!Number.isSafeInteger(e2eSkipped) || e2eSkipped < 0) {
    throw new Error("e2eSkipped must be a non-negative integer in release-gate-baseline.json");
  }
  return { unitContractPassed, e2ePassed, e2eSkipped };
}

export function defaultArtifactPath(repoRoot, head, now = new Date()) {
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  return resolve(repoRoot, "outputs", "release-gates", `gate-${head.slice(0, 12)}-${timestamp}.log`);
}

function pathIsInside(parent, child) {
  const childRelative = relative(parent, child);
  return childRelative === "" || (!childRelative.startsWith(`..${sep}`) && childRelative !== ".." && !isAbsolute(childRelative));
}

function git(...gitArgs) {
  return execFileSync("git", gitArgs, { encoding: "utf8" }).trim();
}

function run(command, commandArgs, options = {}) {
  const started = Date.now();
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  return {
    status: result.status,
    signal: result.signal,
    error: result.error,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    seconds: ((Date.now() - started) / 1000).toFixed(1),
  };
}

function lastLines(output, limit = 25) {
  return output.trimEnd().split("\n").slice(-limit).join("\n");
}

function ensureArtifactPathIsSafe(repoRoot, out) {
  const sidecar = `${out}.sha256`;
  if (existsSync(out) || existsSync(sidecar)) throw new Error(`Refusing to overwrite release evidence: ${existsSync(out) ? out : sidecar}`);
  if (!pathIsInside(repoRoot, out)) return;

  for (const artifactPath of [out, sidecar]) {
    const ignored = spawnSync("git", ["check-ignore", "--quiet", "--no-index", artifactPath], { cwd: repoRoot });
    if (ignored.status !== 0) {
      throw new Error(`Artifact and checksum paths inside the repository must both be ignored so the gate cannot dirty its own tree: ${artifactPath}`);
    }
  }
}

function uniqueSummaryCount(output, name, prefix = "") {
  const expression = new RegExp(`^${prefix}(\\d+) ${name}(?:\\s|\\(|$)`, "gm");
  const matches = [...output.matchAll(expression)];
  return matches.length === 1 ? Number(matches[0][1]) : Number.NaN;
}

export function measureStage(stage, output, status, baseline) {
  if (stage === "lint") return { label: status === 0 ? "0 errors/warnings" : "failed", valid: status === 0 };
  if (stage === "unit+contract") {
    const count = (name) => {
      const matches = [...output.matchAll(new RegExp(`^# ${name} (\\d+)$`, "gm"))];
      return matches.length === 1 ? Number(matches[0][1]) : Number.NaN;
    };
    const values = { pass: count("pass"), fail: count("fail"), skipped: count("skipped"), todo: count("todo"), cancelled: count("cancelled") };
    const parsed = Object.values(values).every(Number.isFinite);
    return {
      label: parsed ? `${values.pass}/${baseline?.unitContractPassed ?? "?"} passed · ${values.fail} failed · ${values.skipped} skipped · ${values.todo} todo · ${values.cancelled} cancelled` : "TIDAK TERBACA/AMBIGU",
      valid: status === 0 && parsed && values.pass === baseline?.unitContractPassed && values.fail === 0 && values.skipped === 0 && values.todo === 0 && values.cancelled === 0,
    };
  }
  if (stage === "dependency-audit") {
    const matches = [...output.matchAll(/found (\d+) vulnerabilit(?:y|ies)/g)];
    const count = matches.length === 1 ? Number(matches[0][1]) : Number.NaN;
    return { label: Number.isFinite(count) ? `${count} vulnerabilities` : "TIDAK TERBACA", valid: status === 0 && count === 0 };
  }
  if (stage === "clear-fetch-cache") return { label: status === 0 ? "cleared" : "failed", valid: status === 0 };
  if (stage === "build") return { label: status === 0 ? "success" : "failed", valid: status === 0 };
  if (stage === "e2e") {
    const passed = uniqueSummaryCount(output, "passed", "\\s*");
    const optionalCount = (name) => {
      const matches = [...output.matchAll(new RegExp(`^\\s*(\\d+) ${name}(?:\\s|\\(|$)`, "gm"))];
      return matches.length === 0 ? 0 : matches.length === 1 ? Number(matches[0][1]) : Number.NaN;
    };
    const skipped = optionalCount("skipped");
    const flaky = optionalCount("flaky");
    const didNotRun = optionalCount("did not run");
    return {
      label: Number.isFinite(passed)
        ? `${passed}/${baseline?.e2ePassed ?? "?"} passed · ${skipped}/${baseline?.e2eSkipped ?? "?"} skipped · ${flaky} flaky · ${didNotRun} did not run`
        : "TIDAK TERBACA/AMBIGU",
      valid: status === 0 && passed === baseline?.e2ePassed && skipped === baseline?.e2eSkipped && flaky === 0 && didNotRun === 0,
    };
  }
  return { label: "TIDAK TERBACA", valid: false };
}

const STAGES = [
  // Rute katalog mengambil CSV dengan `next: { revalidate: 300 }`, dan Next
  // menyimpan hasilnya di .next/cache. Tanpa dibersihkan, satu putaran gate
  // bisa mengukur fixture versi lama: E2E hijau atas data yang sudah tidak
  // ada di berkasnya. Gate yang mengukur data basi bukan bukti apa pun.
  {
    name: "clear-fetch-cache",
    command: ["node", "-e", "require('node:fs').rmSync('.next/cache', { recursive: true, force: true })"],
  },
  { name: "lint", command: ["npm", "run", "lint", "--", "--max-warnings", "0"] },
  { name: "unit+contract", command: ["npm", "test"] },
  { name: "dependency-audit", command: ["npm", "audit", "--audit-level=moderate"] },
  { name: "build", command: ["npm", "run", "build"] },
  // Force one machine-readable reporter while retaining the HTML evidence
  // uploaded by CI. The GitHub annotation reporter is not line-oriented and
  // therefore is not the evidence contract parsed by measureStage().
  {
    name: "e2e",
    command: ["npm", "run", "test:e2e", "--", "--reporter=line,html"],
    env: { PLAYWRIGHT_HTML_OPEN: "never" },
  },
];

export function main(args = process.argv.slice(2), env = process.env) {
  let options;
  try {
    options = parseGateOptions(args, env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }

  const repoRoot = git("rev-parse", "--show-toplevel");
  const headBefore = git("rev-parse", "HEAD");
  const out = resolve(options.out ?? defaultArtifactPath(repoRoot, headBefore));
  const artifactDisplay = pathIsInside(repoRoot, out) ? relative(repoRoot, out) : out;
  try {
    ensureArtifactPathIsSafe(repoRoot, out);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }

  const lines = [];
  const say = (line) => { lines.push(line); console.log(line); };
  const preserveOutput = (stage, result) => {
    lines.push(`\n>>> ${stage} stdout`);
    lines.push(result.stdout.trimEnd() || "(empty)");
    lines.push(`<<< ${stage} stdout`);
    lines.push(`>>> ${stage} stderr`);
    lines.push(result.stderr.trimEnd() || "(empty)");
    if (result.error) lines.push(`spawn error: ${result.error.message}`);
    if (result.signal) lines.push(`signal: ${result.signal}`);
    lines.push(`<<< ${stage} stderr`);
  };

  mkdirSync(dirname(out), { recursive: true });
  const treeBefore = git("status", "--porcelain", "--untracked-files=all");
  let baseline;
  let baselineError = null;
  try {
    baseline = parseGateBaseline(JSON.parse(readFileSync(resolve(repoRoot, "release-gate-baseline.json"), "utf8")));
  } catch (error) {
    baselineError = error instanceof Error ? error.message : String(error);
  }
  const baselineResolved = Boolean(baseline);
  const baseCheck = run("git", ["rev-parse", "--verify", `${options.base}^{commit}`], { cwd: repoRoot });
  const baseResolved = baseCheck.status === 0;
  const whitespace = baseResolved
    ? run("git", ["diff", "--check", `${options.base}..HEAD`], { cwd: repoRoot })
    : { status: null, stdout: "", stderr: "base ref did not resolve", error: null, signal: null, seconds: "0.0" };
  const whitespaceClean = whitespace.status === 0;

  say(`release gate · ${new Date().toISOString()}`);
  say(`commit sebelum: ${headBefore}`);
  say(`tree sebelum: ${treeBefore ? `${treeBefore.split("\n").length} perubahan (TIDAK BERSIH)` : "bersih"}`);
  say(`base: ${options.base} · ${baseResolved ? baseCheck.stdout.trim() : "TIDAK DITEMUKAN"}`);
  say(`baseline: ${baselineResolved ? `unit+contract ${baseline.unitContractPassed} · e2e ${baseline.e2ePassed} lulus + ${baseline.e2eSkipped} dilewati` : `GAGAL — ${baselineError}`}`);
  say(`whitespace ${options.base}..HEAD: ${whitespaceClean ? "bersih" : "GAGAL"}`);
  say(`port: E2E ${env.E2E_PORT ?? "3101"} · legacy ${env.E2E_LEGACY_PORT ?? "3104"} · mock ${env.MOCK_REDIS_PORT ?? "6381"}`);
  say(`runs wajib: ${options.runs}`);
  say(`artifact: ${artifactDisplay}`);
  if (!baseResolved) preserveOutput("base-check", baseCheck);
  if (baseResolved && !whitespaceClean) preserveOutput("whitespace-check", whitespace);

  let stagesPassed = !treeBefore && baseResolved && baselineResolved && whitespaceClean;
  let completedRuns = 0;
  if (!stagesPassed) say("preflight: GAGAL — tahap quality tidak dijalankan");

  for (let runNumber = 1; runNumber <= options.runs && stagesPassed; runNumber += 1) {
    say(`\n--- run ${runNumber}/${options.runs} ---`);
    let runPassed = true;
    for (const stage of STAGES) {
      const result = run(stage.command[0], stage.command.slice(1), {
        cwd: repoRoot,
        env: { ...env, ...stage.env },
      });
      const output = `${result.stdout}${result.stderr}`;
      const metric = measureStage(stage.name, output, result.status, baseline);
      const statusLabel = result.status === null ? `null${result.signal ? `/${result.signal}` : ""}` : String(result.status);
      say(`${stage.name}: exit=${statusLabel} · metric=${metric.label} · ${result.seconds}s`);
      preserveOutput(`run ${runNumber} · ${stage.name}`, result);
      if (!metric.valid) {
        runPassed = false;
        stagesPassed = false;
        if (result.status === 0) say(`${stage.name}: GAGAL — command lulus tetapi evidence metric tidak memenuhi kontrak gate`);
        const tail = lastLines(output);
        if (tail) console.log(tail);
        break;
      }
    }
    if (runPassed) completedRuns += 1;
  }

  const headAfter = git("rev-parse", "HEAD");
  const treeAfter = git("status", "--porcelain", "--untracked-files=all");
  const passed = gatePassed({
    requiredRuns: options.runs,
    completedRuns,
    stagesPassed,
    baseResolved,
    baselineResolved,
    whitespaceClean,
    headBefore,
    headAfter,
    treeBefore,
    treeAfter,
  });

  say(`\ncommit sesudah: ${headAfter}`);
  say(`tree sesudah: ${treeAfter ? `${treeAfter.split("\n").length} perubahan (TIDAK BERSIH)` : "bersih"}`);
  say(`run lengkap: ${completedRuns}/${options.runs}`);
  say(`snapshot stabil: ${headBefore === headAfter && !treeBefore && !treeAfter ? "ya — commit dan tree sama pada kedua endpoint" : "TIDAK"}`);
  say(`hasil: ${passed ? "LULUS" : "GAGAL"}`);

  const body = `${lines.join("\n")}\n`;
  writeFileSync(out, body, { flag: "wx" });
  const checksum = createHash("sha256").update(body).digest("hex");
  writeFileSync(`${out}.sha256`, `${checksum}  ${basename(out)}\n`, { flag: "wx" });
  console.log(`\nsha256: ${checksum}`);
  console.log(`checksum: ${out}.sha256`);
  return passed ? 0 : 1;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) process.exitCode = main();
