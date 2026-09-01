import { createServer } from "node:http";

/**
 * Minimal standalone email-capture server for e2e runs.
 *
 * AUTH_EMAIL_MODE=test (debugCode embedded directly in the register/verify
 * API response, auto-filled by app/daftar/AuthClient.tsx) looked like it
 * would avoid needing this file entirely. But lib/email-mode.ts's
 * emailTestModeEnabled() explicitly requires NODE_ENV !== "production", and
 * Next.js's `next start` (what playwright.config.ts's webServer runs, same
 * as a real deployment) unconditionally forces NODE_ENV="production"
 * regardless of what's passed in. So AUTH_EMAIL_MODE=test is silently inert
 * under this harness. Verified against Next's own source
 * (node_modules/next/dist/server/lib/router-server.js). AUTH_EMAIL_MODE=local
 * has no such NODE_ENV restriction (see lib/email-mode.ts's
 * localEmailModeEnabled(), gated only on VERCEL_ENV), so that's the mode
 * actually used. This server is the "local" HTTP endpoint the app POSTs
 * verification codes to (see lib/email-auth.ts's sendEmailCode()).
 */
const port = Number(process.env.MOCK_EMAIL_PORT ?? 6390);
let emails = [];

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200).end("ok");
    return;
  }

  if (req.method === "POST" && url.pathname === "/__email") {
    let body = "";
    for await (const chunk of req) body += chunk;
    emails.push(JSON.parse(body));
    res.writeHead(204).end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/__emails") {
    const to = url.searchParams.get("to");
    const matches = to ? emails.filter((entry) => entry.email === to) : emails;
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ emails: matches }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/__reset") {
    emails = [];
    res.writeHead(204).end();
    return;
  }

  res.writeHead(404).end();
});

server.listen(port, "127.0.0.1", () => {
  console.log(`mock email server ready on ${port}`);
});
