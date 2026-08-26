// Deployed production must never accept a developer email transport. `NODE_ENV`
// alone is not enough: `next start` reports "production" locally and in E2E, so
// the deployment marker decides whether developer modes may run at all.
function deployedProduction() {
  return process.env.VERCEL_ENV === "production";
}

export function emailTestModeEnabled() {
  return !deployedProduction() && process.env.NODE_ENV !== "production" && process.env.AUTH_EMAIL_MODE === "test";
}

export function debugEmailCode(code: string) {
  return emailTestModeEnabled() ? code : undefined;
}

export function localEmailModeEnabled() {
  if (deployedProduction() || process.env.AUTH_EMAIL_MODE !== "local") return false;
  try {
    const endpoint = new URL(process.env.AUTH_EMAIL_LOCAL_ENDPOINT ?? "");
    return endpoint.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(endpoint.hostname);
  } catch {
    return false;
  }
}

export function authEmailEnabled() {
  return emailTestModeEnabled() || localEmailModeEnabled() || Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}
