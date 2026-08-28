import assert from "node:assert/strict";
import test from "node:test";
import { safeReturnTo, validEmail, validPassword } from "../lib/security.ts";
import { hashPassword, verifyPassword } from "../lib/password.ts";
import { brandLogo, duplicateLogoKeys, registeredLogoPaths } from "../app/brand-assets.ts";
import { existsSync, readdirSync } from "node:fs";
import { backfillLegacyVerification, needsLegacyVerificationBackfill, strongerVerification } from "../lib/user-migration.ts";
import { authEmailEnabled, debugEmailCode, localEmailModeEnabled } from "../lib/email-mode.ts";
import { retryAfterMessage } from "../lib/rate-limit-message.ts";

test("return path menolak open redirect",()=>{
  assert.equal(safeReturnTo("https://evil.test"),"/dashboard");
  assert.equal(safeReturnTo("//evil.test"),"/dashboard");
  assert.equal(safeReturnTo("/go/advan?x=1"),"/go/advan?x=1");
});

test("migrasi hanya menandai akun legacy, bukan registrasi yang masih menunggu",()=>{
  const base={id:"u1",name:"Creator",email:"creator@example.com",phone:"6281",provider:"credentials",role:"creator",membership:"pending",createdAt:"2026-01-01T00:00:00.000Z",updatedAt:"2026-01-01T00:00:00.000Z"};
  assert.equal(needsLegacyVerificationBackfill(base),true);
  assert.equal(backfillLegacyVerification(base,"2026-08-16T00:00:00.000Z").emailVerifiedAt,"2026-08-16T00:00:00.000Z");
  assert.equal(needsLegacyVerificationBackfill({...base,emailVerificationStartedAt:"2026-08-16T00:00:00.000Z"}),false);
});

test("bukti verifikasi hanya naik, tidak pernah turun",()=>{
  assert.equal(strongerVerification(undefined,"code"),"code");
  assert.equal(strongerVerification("grandfathered","code"),"code");
  assert.equal(strongerVerification("migrated","google"),"google");
  assert.equal(strongerVerification("code","migrated"),"code");
  assert.equal(strongerVerification("google","grandfathered"),"google");
  assert.equal(strongerVerification("code","google"),"google");
});

test("pesan rate limit menyebut sisa waktu yang bisa dibaca",()=>{
  assert.equal(retryAfterMessage(30),"kurang dari satu menit");
  assert.equal(retryAfterMessage(61),"2 menit");
  assert.equal(retryAfterMessage(900),"15 menit");
});

test("backfill legacy menandai sumber verifikasi sebagai migrasi",()=>{
  const base={id:"u2",name:"Lama",email:"lama@example.com",phone:"6282",provider:"credentials",role:"creator",membership:"pending",createdAt:"2026-01-01T00:00:00.000Z",updatedAt:"2026-01-01T00:00:00.000Z"};
  const migrated=backfillLegacyVerification(base,"2026-08-17T00:00:00.000Z");
  assert.equal(migrated.verificationSource,"migrated");
  const verified={...base,emailVerifiedAt:"2026-02-01T00:00:00.000Z",verificationSource:"code"};
  assert.equal(backfillLegacyVerification(verified,"2026-08-17T00:00:00.000Z").verificationSource,"code");
});

test("mode email developer tidak pernah aktif di deployment production",()=>{
  const previous={mode:process.env.AUTH_EMAIL_MODE,endpoint:process.env.AUTH_EMAIL_LOCAL_ENDPOINT,vercel:process.env.VERCEL_ENV,node:process.env.NODE_ENV};
  process.env.AUTH_EMAIL_MODE="local";
  process.env.AUTH_EMAIL_LOCAL_ENDPOINT="http://127.0.0.1:6381/__email";
  process.env.NODE_ENV="test";
  process.env.VERCEL_ENV="production";
  assert.equal(localEmailModeEnabled(),false);
  assert.equal(authEmailEnabled(),false);
  process.env.AUTH_EMAIL_MODE="test";
  assert.equal(debugEmailCode("123456"),undefined);
  process.env.VERCEL_ENV="preview";
  process.env.AUTH_EMAIL_MODE="local";
  assert.equal(localEmailModeEnabled(),true);
  process.env.AUTH_EMAIL_LOCAL_ENDPOINT="https://mail.example.com/send";
  assert.equal(localEmailModeEnabled(),false);
  for(const [name,value] of [["AUTH_EMAIL_MODE",previous.mode],["AUTH_EMAIL_LOCAL_ENDPOINT",previous.endpoint],["VERCEL_ENV",previous.vercel],["NODE_ENV",previous.node]]){
    if(value===undefined)delete process.env[name];else process.env[name]=value;
  }
});

test("mode test email tidak pernah aktif di production",()=>{
  const previousMode=process.env.AUTH_EMAIL_MODE;
  const previousNodeEnv=process.env.NODE_ENV;
  process.env.AUTH_EMAIL_MODE="test";
  process.env.NODE_ENV="production";
  assert.equal(authEmailEnabled(),false);
  assert.equal(debugEmailCode("123456"),undefined);
  if(previousMode===undefined)delete process.env.AUTH_EMAIL_MODE;else process.env.AUTH_EMAIL_MODE=previousMode;
  if(previousNodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousNodeEnv;
});

test("validasi kredensial minimum",()=>{
  assert.equal(validEmail("creator@example.com"),true);
  assert.equal(validEmail("creator@"),false);
  assert.equal(validPassword("komisi2026"),true);
  assert.equal(validPassword("pendek1"),false);
  assert.equal(validPassword("tanpaangkaxy"),false);
});

test("password memakai salt dan dapat diverifikasi",async()=>{
  const first=await hashPassword("password2026");
  const second=await hashPassword("password2026");
  assert.notEqual(first,second);
  assert.equal(await verifyPassword("password2026",first),true);
  assert.equal(await verifyPassword("salah-password",first),false);
});

test("setiap key logo yang terdaftar punya file dan tidak diklaim dua tabel",()=>{
  // Hand-picked lists below prove the aliases; this proves the whole registry, so
  // a key added without its file cannot ship as a broken image.
  assert.deepEqual(duplicateLogoKeys(),[]);
  for(const path of registeredLogoPaths()){
    assert.equal(existsSync(`public${path}`),true,`${path} terdaftar tetapi filenya tidak ada`);
  }
});

test("logo lokal dan alias campaign selalu menunjuk aset yang tersedia",()=>{
  assert.ok(readdirSync("public/brand-logos").length>=375);
  for(const brand of ["Avoskin new list","BOJ (Beauty of jeaoson)","BLP","LRP / La Roche Posay","P&G","Pigeon Teens 1","Swisse vitamin- Indonesia","YOU (Hebe)","Glow Better","BOSTANTEN Shoes","Cleora Beauty","Deorex New Juni 2025","ERTO'S","KIIP Lifestyle","Masami New April 2025","Modofo Official Indonesia","Ownskin Id","Tentang Anak Shop","Gain Yum","Asheeqa Hijab 03","Zuma Indonesia","Mirael","Mercon Merah Putih","Barber Daily","Cuan Kabel","Monster Audio","Semut Bersih","Seruni Living","2R & Memey Cosmetic","Bika Ambon Rica Rico","Golden Home Living","Pol Perabot"]){
    const logo=brandLogo(brand);
    assert.ok(logo?.startsWith("/brand-logos/"),`${brand} harus memakai logo lokal`);
    assert.equal(existsSync(`public${logo}`),true,`${logo} harus tersedia`);
  }
  for(const brand of ["3CE","Dazzle me","ERHA STORE","Kiehl's Indonesia","L'Oréal Professionnel","Mossèru","Rose All Day","SAFF & Co","Purbasari","Azarine","Herborist","Make Over","Makeover","Some By Mi","Somebymi","TECNO","Maybelline","Wardah","CimolBojot.AA","Elvicto Perfume","goojodoq store","LeDingDing","Purito Indonesia","Samono Indonesia"]){
    const logo=brandLogo(brand);
    assert.ok(logo?.startsWith("/brand-logos/"),`${brand} harus memakai logo lokal`);
    assert.equal(existsSync(`public${logo}`),true,`${logo} harus tersedia`);
  }
  for(const brand of ["Mistine","Laneige","Anua","Makarizo","Advan","Somethinc"]){
    const logo=brandLogo(brand);
    assert.ok(logo?.startsWith("/brand-media/"),`${brand} harus memakai aset brand lokal`);
    assert.equal(existsSync(`public${logo}`),true,`${logo} harus tersedia`);
  }
});
