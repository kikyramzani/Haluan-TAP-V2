import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { defaultArtifactPath, gatePassed, measureStage, parseGateBaseline, parseGateOptions } from "../scripts/release-gate.mjs";

test("release gate defaults to five mandatory runs and origin/main", () => {
  assert.deepEqual(parseGateOptions([], {}), { runs: 5, base: "origin/main", out: null });
});

test("release gate rejects every run count that could skip all stages", () => {
  for (const value of ["0", "-1", "NaN", "1.5", "", "21"]) {
    assert.throws(() => parseGateOptions(["--runs", value], {}), /--runs|Missing value/);
  }
  assert.equal(parseGateOptions(["--runs", "1"], {}).runs, 1);
  assert.equal(parseGateOptions(["--runs", "20"], {}).runs, 20);
});

test("release gate rejects missing, duplicate, and unknown options", () => {
  assert.throws(() => parseGateOptions(["--out"], {}), /Missing value/);
  assert.throws(() => parseGateOptions(["--runs", "5", "--runs", "5"], {}), /Duplicate option/);
  assert.throws(() => parseGateOptions(["--force", "yes"], {}), /Unknown option/);
});

test("release verdict fails closed on skipped runs, whitespace, tree, or commit movement", () => {
  const valid = {
    requiredRuns: 5,
    completedRuns: 5,
    stagesPassed: true,
    baseResolved: true,
    baselineResolved: true,
    whitespaceClean: true,
    headBefore: "abc",
    headAfter: "abc",
    treeBefore: "",
    treeAfter: "",
  };
  assert.equal(gatePassed(valid), true);
  assert.equal(gatePassed({ ...valid, requiredRuns: 0, completedRuns: 0 }), false);
  assert.equal(gatePassed({ ...valid, completedRuns: 4 }), false);
  assert.equal(gatePassed({ ...valid, whitespaceClean: false }), false);
  assert.equal(gatePassed({ ...valid, treeAfter: "?? gate.log" }), false);
  assert.equal(gatePassed({ ...valid, headAfter: "def" }), false);
});

test("default gate evidence is written under the ignored outputs directory", () => {
  const path = defaultArtifactPath("/repo", "abcdef1234567890", new Date("2026-08-18T00:00:00.000Z"));
  assert.equal(path, "/repo/outputs/release-gates/gate-abcdef123456-2026-08-18T00-00-00-000Z.log");
});

test("release metrics reject empty suites, skipped tests, and every vulnerability", () => {
  const unit = (overrides = "") => `# pass 37\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n${overrides}`;
  const baseline = parseGateBaseline({ unitContractPassed: 37, e2ePassed: 116 });
  assert.equal(measureStage("unit+contract", unit(), 0, baseline).valid, true);
  assert.equal(measureStage("unit+contract", unit().replace("# pass 37", "# pass 36"), 0, baseline).valid, false);
  assert.equal(measureStage("unit+contract", `${unit()}# pass 37\n`, 0, baseline).valid, false, "summary TAP ganda harus ambigu");
  assert.equal(measureStage("unit+contract", unit().replace("# skipped 0", "# skipped 1"), 0, baseline).valid, false);
  assert.equal(measureStage("dependency-audit", "found 0 vulnerabilities", 0, baseline).valid, true);
  assert.equal(measureStage("dependency-audit", "found 1 vulnerability", 0, baseline).valid, false);
  assert.equal(measureStage("e2e", "116 passed (1.5m)", 0, baseline).valid, true);
  assert.equal(measureStage("e2e", "115 passed\n1 skipped", 0, baseline).valid, false);
  assert.equal(measureStage("e2e", "116 passed\n1 flaky", 0, baseline).valid, false);
  assert.equal(measureStage("e2e", "116 passed\n1 did not run", 0, baseline).valid, false);
  assert.throws(() => parseGateBaseline({ unitContractPassed: 0, e2ePassed: 116 }), /positive integer/);
});

test("release CLI refuses an unsafe artifact and leaves a successful temp repo clean", () => {
  const repo = mkdtempSync(join(tmpdir(), "tap-release-gate-"));
  const bin = join(repo, "bin");
  const script = fileURLToPath(new URL("../scripts/release-gate.mjs", import.meta.url));
  const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    mkdirSync(bin);
    writeFileSync(join(repo, ".gitignore"), "outputs/\nbin/\nevidence.log\n");
    writeFileSync(join(repo, "tracked.txt"), "fixture\n");
    writeFileSync(join(repo, "release-gate-baseline.json"), '{"unitContractPassed":1,"e2ePassed":1}\n');
    const fakeNpm = join(bin, "npm");
    writeFileSync(fakeNpm, [
      "#!/bin/sh",
      "case \"$*\" in",
      "  \"run lint -- --max-warnings 0\") exit 0 ;;",
      "  \"test\") printf '# pass 1\\n# fail 0\\n# cancelled 0\\n# skipped 0\\n# todo 0\\n' ;;",
      "  \"audit --audit-level=moderate\") printf 'found 0 vulnerabilities\\n' ;;",
      "  \"run build\") printf 'build complete\\n' ;;",
      // This exact match is an integration oracle: CI must not silently fall
      // back to playwright.config.ts's GitHub-only reporter.
      "  \"run test:e2e -- --reporter=line,html\") [ \"$PLAYWRIGHT_HTML_OPEN\" = \"never\" ] || exit 8; printf '1 passed (1ms)\\n' ;;",
      "  *) printf 'unexpected fake npm args: %s\\n' \"$*\" >&2; exit 9 ;;",
      "esac",
    ].join("\n"));
    chmodSync(fakeNpm, 0o755);

    git("init", "--quiet");
    git("config", "user.email", "gate-test@tap.test");
    git("config", "user.name", "Gate Test");
    git("add", ".gitignore", "tracked.txt", "release-gate-baseline.json");
    git("commit", "--quiet", "-m", "fixture");

    const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` };
    const unsafe = spawnSync(process.execPath, [script, "--runs", "1", "--base", "HEAD", "--out", "gate.log"], { cwd: repo, env, encoding: "utf8" });
    assert.equal(unsafe.status, 2);
    assert.match(unsafe.stderr, /must both be ignored/);

    const sidecarUnsafe = spawnSync(process.execPath, [script, "--runs", "1", "--base", "HEAD", "--out", "evidence.log"], { cwd: repo, env, encoding: "utf8" });
    assert.equal(sidecarUnsafe.status, 2);
    assert.match(sidecarUnsafe.stderr, /evidence\.log\.sha256/);

    const successful = spawnSync(process.execPath, [script, "--runs", "1", "--base", "HEAD"], { cwd: repo, env, encoding: "utf8" });
    assert.equal(successful.status, 0, successful.stderr || successful.stdout);
    assert.equal(git("status", "--porcelain", "--untracked-files=all"), "");

    const outputDir = join(repo, "outputs", "release-gates");
    const logName = readdirSync(outputDir).find((name) => name.endsWith(".log"));
    assert.ok(logName);
    const log = readFileSync(join(outputDir, logName), "utf8");
    const sidecar = readFileSync(join(outputDir, `${logName}.sha256`), "utf8");
    assert.equal(log.split("\n").find((line) => line.startsWith("artifact: ")), `artifact: ${join("outputs", "release-gates", logName)}`);
    assert.doesNotMatch(log, new RegExp(repo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(log, /run lengkap: 1\/1/);
    assert.match(log, /hasil: LULUS/);
    assert.equal(sidecar, `${createHash("sha256").update(log).digest("hex")}  ${logName}\n`);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
