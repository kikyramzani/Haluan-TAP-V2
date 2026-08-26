"use client";

import { FormEvent, useState } from "react";
import type { TapUser } from "../../lib/models";

export default function ProfileForm({ user }: { user: TapUser }) {
  const [notice,setNotice]=useState(""); const [busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setNotice("");const values=Object.fromEntries(new FormData(event.currentTarget));try{const response=await fetch("/api/profile",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(values)});const payload=await response.json();if(!response.ok)throw new Error(payload.error);setNotice("Profil berhasil disimpan.");}catch(error){setNotice(error instanceof Error?error.message:"Profil gagal disimpan.");}finally{setBusy(false)}}
  return <form className="profile-form" onSubmit={submit}>
    <div className="two-col"><label><span>Nama lengkap</span><input name="name" defaultValue={user.name} required/></label><label><span>WhatsApp</span><input name="phone" defaultValue={user.phone}/></label></div>
    <div className="two-col"><label><span>Username TikTok</span><input name="tiktokUsername" defaultValue={user.tiktokUsername} placeholder="username"/></label><label><span>Username Shopee</span><input name="shopeeUsername" defaultValue={user.shopeeUsername} placeholder="username"/></label></div>
    <label><span>Niche utama</span><select name="niche" defaultValue={user.niche ?? ""}><option value="">Pilih niche</option><option>Beauty & Health</option><option>Fashion</option><option>Tech</option><option>Home & Living</option><option>Food & FMCG</option><option>Mom & Baby</option><option>Lainnya</option></select></label>
    <div className="two-col"><label><span>Followers</span><input name="followers" type="number" min="0" defaultValue={user.followers}/></label><label><span>GMV 30 hari (Rp)</span><input name="gmv" type="number" min="0" defaultValue={user.gmv}/></label></div>
    <label><span>Nama penerima</span><input name="recipientName" defaultValue={user.recipientName}/></label><label><span>Alamat pengiriman</span><textarea name="address" rows={3} defaultValue={user.address}/></label>
    <button type="submit" disabled={busy}>{busy?"Menyimpan…":"Simpan profil"}<span>↗</span></button>{notice&&<p role="status">{notice}</p>}
  </form>;
}
