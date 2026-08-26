import { getAdminUser, listUsers, provenEmailOwnership } from "../../../../lib/auth";
import { listAuditEvents } from "../../../../lib/audit";
import { readCronRun } from "../../../../lib/cron-status";

export async function GET(request:Request){
  if(!(await getAdminUser()))return Response.json({error:"Akses ditolak."},{status:403});
  const requested=Number(new URL(request.url).searchParams.get("limit")||100);
  const [events,cleanup,admins]=await Promise.all([listAuditEvents(Number.isFinite(requested)?requested:100),readCronRun("cleanup-users"),listUsers({role:"admin",limit:50})]);
  const unprovenAdmins=admins.items.filter(user=>!provenEmailOwnership(user)).map(user=>({id:user.id,email:user.email,verificationSource:user.verificationSource??null}));
  return Response.json({events,cron:{cleanupUsers:cleanup},unprovenAdmins},{headers:{"cache-control":"private, no-store"}});
}
