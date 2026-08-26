import { getCurrentUser, publicUser } from "../../../../lib/auth";
import { datastoreReady } from "../../../../lib/redis";

export async function GET() {
  if (!datastoreReady()) return Response.json({ user: null, ready: false });
  try {
    const user = await getCurrentUser();
    return Response.json({ user: user ? publicUser(user) : null, ready: true }, { headers: { "cache-control": "private, no-store" } });
  } catch { return Response.json({ user: null, ready: false }, { status: 503 }); }
}
