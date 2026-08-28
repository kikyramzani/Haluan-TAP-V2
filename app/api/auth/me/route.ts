import { getCurrentUser, publicUser } from "../../../../lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return Response.json({ user: user ? publicUser(user) : null, ready: true }, { headers: { "cache-control": "private, no-store" } });
  } catch { return Response.json({ user: null, ready: false }, { status: 503 }); }
}
