/**
 * Which commit is this, actually?
 *
 * A green suite proves something about a SHA; it says nothing about which SHA the
 * domain in front of you is serving. Vercel exposes the commit that triggered the
 * build, so the two can be tied together from outside — by an operator, a smoke
 * check, or a promotion workflow — instead of being assumed to match.
 */
export const dynamic = "force-dynamic";

/**
 * An unset variable and a variable set to "" mean the same thing here, and only one
 * of them survives `??`. Reporting `commit: ""` would read as "no commit" to a human
 * and as a value to a comparison, which is the worse of both answers.
 */
function present(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function GET() {
  const commit = present(process.env.VERCEL_GIT_COMMIT_SHA);
  const environment = present(process.env.VERCEL_ENV) ?? "development";
  const deploymentId = present(process.env.VERCEL_DEPLOYMENT_ID);
  // A production deployment that cannot name its own commit is a deployment nobody
  // can verify. `ok:false` plus a named reason lets a smoke check fail loudly instead
  // of comparing against null and shrugging; outside production, missing metadata is
  // the normal state of a local run and stays ok.
  const reason = environment === "production"
    ? !commit || !/^[0-9a-f]{40}$/.test(commit) ? "GIT_SHA_UNAVAILABLE" : !deploymentId ? "DEPLOYMENT_ID_UNAVAILABLE" : null
    : null;
  return Response.json(
    {
      ok: reason === null,
      ...(reason ? { reason } : {}),
      environment,
      commit,
      shortCommit: commit ? commit.slice(0, 12) : null,
      branch: present(process.env.VERCEL_GIT_COMMIT_REF),
      // The deployment id changes on every build, so a redeploy of the same commit is
      // still distinguishable from the build that came before it.
      deploymentId,
      region: present(process.env.VERCEL_REGION),
      observedAt: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
