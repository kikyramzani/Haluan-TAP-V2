import type { MetadataRoute } from "next";
import { siteUrl } from "../lib/site-url";
export default function robots():MetadataRoute.Robots{return{rules:{userAgent:"*",allow:["/","/deals","/deal","/daftar","/privacy","/terms"],disallow:["/admin","/dashboard","/api","/go"]},sitemap:`${siteUrl()}/sitemap.xml`}}
