import { randomUUID } from "node:crypto";
import { getJsonMany, key, redis, setJson } from "./redis.ts";

export type AuditEvent={id:string;actorId:string;action:string;targetId:string;before?:unknown;after?:unknown;createdAt:string};

export async function recordAudit(input:{actorId:string;action:string;targetId:string;before?:unknown;after?:unknown}){
  const event={id:randomUUID(),...input,createdAt:new Date().toISOString()};
  await Promise.all([setJson(key("audit",event.id),event),redis("ZADD",key("audits"),Date.now(),event.id)]);
  return event;
}

export async function listAuditEvents(limit=100){
  const ids=await redis<string[]>("ZREVRANGE",key("audits"),0,Math.max(0,Math.min(limit,250)-1));
  return getJsonMany<AuditEvent>((ids??[]).map(id=>key("audit",id)));
}
