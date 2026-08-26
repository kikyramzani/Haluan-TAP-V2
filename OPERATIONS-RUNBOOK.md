# TAP Operations Runbook

This runbook is the launch and incident procedure for TAP by Haluan. It complements `PRODUCTION-READINESS.md`; it does not replace organizational approval for privacy, retention, or paid acquisition.

## Ownership

Assign these roles before opening paid traffic. Record the actual names and escalation contacts in the team's private operations channel, not in this public repository.

| Role | Responsibility |
| --- | --- |
| Product owner | Go/no-go decision, creator communication, campaign correctness |
| Operations owner | Membership review, sample queue, partner escalation |
| Technical owner | Vercel, Redis, OAuth, private feed, incidents and rollback |
| Privacy owner | Access/deletion requests, retention review, breach coordination |

No single operator should approve their own admin access and close the related audit review.

## Launch gate

Paid acquisition is allowed only when every item below is evidenced:

1. `https://haluan-tap.vercel.app/api/health` returns HTTP `200` and `status: ready`. Pindahkan gate ke `tap.haluandigital.agency` hanya setelah DNS aktif dan domain tersebut lulus smoke yang sama.
2. `npm run smoke:production -- https://haluan-tap.vercel.app` passes all checks.
3. The latest GitHub `Quality Gate` on `main` is green.
4. Redis is private and the public catalog response contains no affiliate URLs, internal notes, creator PII, or partner credentials.
5. The private link feed rejects requests without its bearer credential.
6. At least one verified creator completes login, deal redirect, attribution, sample submission, admin approval, shipment, receipt, and content submission in production.
7. Operations has named owners, working escalation contacts, and a creator-support response target.
8. Campaign rate, validity, eligibility, sample quota, image rights, and source timestamp have been reviewed.

If any item fails, keep acquisition paused. Do not bypass `/api/health` or weaken a server gate to make a launch check green.

## Routine operations

### Daily

- Review pending creators and open sample requests in `/admin`.
- Investigate unusual click spikes by campaign or creator.
- Check health status and the latest Vercel deployment.
- Confirm that campaign expiry and sample availability match partner instructions.

### Weekly

- Export or review append-only audit events and attribution totals.
- Remove expired campaigns from both feeds.
- Test one creator login and one gated redirect.
- Review admin allowlist membership and remove access no longer required.
- Re-run the production smoke test against both the Vercel alias and custom domain.
- Confirm the daily pending-account cleanup cron is healthy; it may only delete unverified records carrying `emailVerificationStartedAt`.

### Monthly

- Review datastore usage, costs, backup/export capability, and rate-limit patterns.
- Review outstanding privacy requests and operational records eligible for deletion.
- Rotate feed credentials when staff or vendor access changes.
- Reconfirm Google OAuth consent-screen and domain configuration.

## Incident severity

| Severity | Examples | Immediate action |
| --- | --- | --- |
| SEV-1 | Operational feed or personal data publicly exposed; admin bypass; account takeover. A public individual campaign link is intended behaviour and is not an incident | Pause acquisition, disable affected endpoint/feed, preserve logs, notify technical and privacy owners immediately |
| SEV-2 | Login, sample requests, redirects, or admin workflow unavailable for most users | Pause affected campaigns, rollback or disable the failing integration, publish an internal status update |
| SEV-3 | Stale rate, missing image, isolated creator failure, minor visual regression | Correct data/UI, record the cause, include it in the next operational review |

Never delete logs or audit records while an incident is being investigated.

## Response sequence

1. **Detect:** capture timestamp, URL, request ID, deployment SHA, screenshots, and affected account/campaign IDs.
2. **Contain:** pause ads and the smallest affected feature or feed. Revoke credentials if exposure is possible.
3. **Assess:** determine data scope, first occurrence, affected creators, partner impact, and whether privacy notification is required.
4. **Recover:** roll back to the last known-good Vercel deployment or deploy a reviewed fix.
5. **Verify:** run `npm run smoke:production`, test the affected end-to-end flow, and confirm health is ready.
6. **Close:** document root cause, timeline, evidence, corrective action, and an owner/date for prevention work.

## Rollback

1. Identify the last green GitHub commit and its successful Vercel deployment.
2. Promote that immutable deployment through Vercel; do not rewrite Git history.
3. If the incident is data-related, disable or rotate the private feed credential before restoring traffic.
4. Run the smoke test against the promoted deployment and custom domain.
5. Resume traffic only after the product and technical owners approve recovery evidence.

Application rollback does not roll back Redis records. Data repair must be append-only where possible and must preserve the original audit evidence.

## Data retention and privacy requests

The public privacy notice promises access, correction, export, and deletion handling. Until the organization approves a fixed retention schedule:

- Keep only data required for an active account, campaign operation, dispute, finance, security, or legal obligation.
- Restrict shipping addresses to staff processing sample delivery.
- Verify identity before exporting, correcting, or deleting creator data.
- Record every privacy request, approver, action, and completion timestamp in a private case log.
- Prefer anonymization for analytics after operational identifiers are no longer needed.
- Do not silently delete audit evidence related to an open dispute, payment, security incident, or legal hold.

The privacy owner must approve concrete retention periods before paid acquisition. Those periods must then be reflected consistently in the privacy notice, datastore jobs, and internal SOP.

## Admin offboarding

Admin access is decided by `ADMIN_EMAILS` on every admin request, not by the role stored at signup. Three rules, and they are not symmetrical — the difference matters when you read an audit:

- **Granting** admin to an account that does not have it requires the allowlist, an email index that names that account, *and* proven ownership of the address through a one-time email code or Google sign-in. A refusal is written as `admin.grant_blocked` with its reason.
- **Keeping** admin requires the allowlist **and** holding that address's email index — the same index a login resolves against. What it does *not* require is proven ownership: an account that already holds the role keeps it whether or not its address was ever proven, which is the legacy exception below. An account whose address is held by another record loses admin on its next admin request, with `admin.revoked` recording `email_index_mismatch`.
- **Removing** an address revokes unconditionally, proof or no proof.

So `unprovenAdmins` above zero is not a contradiction of this section: it is the legacy exception, visible and deliberate, with the deadline recorded below.

1. Remove the address from `ADMIN_EMAILS` in Vercel and redeploy (or wait for the next deployment to pick up the value).
2. The next admin request from that account is refused, the stored role is written back to `creator`, and **every session that account holds is deleted** — the person is signed out entirely, not just out of `/admin`.
3. Confirm in **Admin → Audit Log**: an `admin.revoked` event records the actor `system:allowlist`, the previous role, and that sessions were revoked. Keep that event as offboarding evidence.

The same mechanism promotes: adding an address grants admin on its next request and writes `admin.granted` — provided the account holds the email index and has proven the address.

### Auditing who holds admin

`npm run audit:admins -- --mask` reads the deployed datastore directly and answers eight questions the allowlist cannot. It requires `KV_REST_API_READ_ONLY_TOKEN`, never falls back to the application's read-write token variable, and sends only `SCAN`, `ZREVRANGE`, `MGET`, `GET`, and `TTL`. It cannot vouch for the token's datastore scope, so confirm that setting is read-only before running it against production.

- **`unprovenAdmins`** — accounts holding admin whose address was never proven. They keep access while they stay allowlisted **and continue to hold the email index** (see above); the count exists so the exception is never invisible.
- **Open admin slots** — an allowlisted address nobody holds. On any deployment that still grants admin on a credentials signup, the first person to register it becomes admin with no inbox check in the way. An allowlist entry nobody has registered is not a placeholder; it is an unlocked door.
- **Broken claims** — an allowlisted address whose index points at a record that is gone, or at one whose own email says something else. These are reported separately because they still block a signup: the fix is repairing the claim, not registering the address.
- **Admins whose address is held by someone else** (`adminIndexMismatches`) — the case where the allowlist looks satisfied but the index names another account.
- **Duplicate records for an allowlisted address** — two records carrying one address is how the mismatch above arises.
- **Claims that can still expire** — a registration claim with a TTL re-opens the slot the moment it lapses. Every claim on an allowlisted address should read `-1`.
- **Admin roles with no allowlist backing** — a stored role the allowlist no longer names. Revoked on the next admin request once the reconciling code is deployed, which is a deploy consequence worth knowing *before* you promote.
- **Records outside `tap:v1:users`** — a record that fell out of the membership index still authenticates and still carries its role. Listing users would not show it, so the audit reads the record keys directly as well.

Run it before adding an address, after any deploy that touches the admin model, and as the first step of any incident involving admin access. Exit code is non-zero when any count is above zero, and `2` when the datastore URL or read-only token is missing.

**Closing an open slot has a cost worth knowing.** `/api/health` treats a non-empty `ADMIN_EMAILS` as a critical dependency, so emptying it entirely makes health report `configuration_required` with **503** — which will look like an outage to anything watching it. Prefer *replacing* the unused address with one that a real, consistently indexed admin account owns, in a single config-only change on the currently deployed SHA. If ownership of that account is not certain, remove the address anyway and accept the 503: an open admin door is worse than a red health check that you understand.

### Granting a new admin

1. The person creates the account, then completes a password reset or signs in with Google. That is what turns `verificationSource` into `code`/`google` without exposing an unused allowlist slot.
2. Sign out and sign back in with that email, then confirm `/api/auth/me` resolves the same account. Login uses the email index, so this checks the identity path before any privilege is added.
3. Add the address to `ADMIN_EMAILS` and redeploy.
4. Their next admin request is granted and writes `admin.granted`.
5. Run `npm run audit:admins -- --mask`; all eight dimensions must be zero, including `openSlots`, `brokenClaims`, `adminIndexMismatches`, and `impermanentClaims`.

Accounts that were already admin before this requirement keep their access as long as they stay allowlisted **and their email index still names their account**, but appear as a warning in the admin workspace with their current verification source, and are counted by `npm run audit:admins` as `unprovenAdmins`. Clearing that count means having each of them prove the address — a password reset or a Google sign-in — not editing the allowlist.

**Written deadline for the legacy exception.** The board approved keeping these accounts, not keeping them indefinitely.

| Item | Commitment |
|---|---|
| Owner | Technical owner named in *Ownership* above |
| Trigger | The hour `RESEND_API_KEY` and `EMAIL_FROM` go live in production |
| Deadline | **24 hours after that trigger**, every legacy admin has run a password reset |
| Evidence | `admin.granted` events with `verificationSource: code`, and the admin workspace warning gone |
| If missed | Remove the remaining addresses from `ADMIN_EMAILS`; access is revoked on their next request and can be restored once they verify |
| Hard gate | `unprovenAdmins` must read zero before paid acquisition |

Record the trigger timestamp in the launch log the moment the keys are added, so the 24-hour clock is auditable rather than remembered.

## Record mutation and phone claims

Every writer of a user record — Google upsert, email verification, password reset, admin reconciliation, membership, profile, and pending deletion — takes the same short lock and re-reads the record inside it. Sample requests use the same primitive. Persisted changes go through the lock's `commit`, which re-checks ownership and extends the lease in one atomic step, so a writer whose lease already moved on aborts instead of overwriting its successor.

**Conflict contract.** Not every conflict looks the same to the caller:

| Caller | Response | What to do |
|---|---|---|
| Interactive mutation (profile, membership, sample status, code confirmation) | **409** | Safe to retry as-is. A one-time code is *not* spent by a 409 |
| System job (cleanup cron, phone reconciler) | no HTTP status | Retries internally, then reports `phoneClaimsContended` in the heartbeat |
| Membership change on a record that is gone | **404** | The account no longer exists. Only a missing record gets this |
| Membership change while the datastore cannot answer | **500** or **503** | An outage, not a missing creator. Check the datastore before touching the account |
| Record does not exist | **404** | Not a conflict; do not retry |
| Uniqueness collision (WhatsApp number already claimed) | **409** with its own message | Retrying will not help; the number belongs to another account |
| Verification whose email or number is now held by another account | **409** naming which one | Retrying will not help either. Support has to free the claim — see below |
| Multi-key move that could not finish (phone) | **500** | The change did not complete. The intent survives and the reconciler settles it; retry after checking the profile |
| One-time code replayed after its commit landed | **200** with `signedIn: false` | An acknowledgment, not a login. The change already took effect; the person signs in normally |
| One-time code replayed with a different purpose or payload | **400** | Not the request that committed. Nothing happened, and nothing will |
| Housekeeping after a landed commit that could not finish | **200** | The commit stands. The steps left over are recorded and retried by the cron |

A conflict is a normal outcome under concurrency, not an incident. A `phoneClaimsContended` count that keeps rising is the signal worth investigating.

Moving a WhatsApp number touches two keys, so it is a saga rather than a single write:

1. An intent (`phone-intent:{userId}`) records the old and new number before anything changes.
2. The new number is claimed, the record is written, the old claim is released.
3. The intent is cleared.

Password resets and access revocations also stamp `sessionsInvalidBefore` on the record. Older sessions stop authenticating the moment that record lands, so nothing has to be deleted before the commit for the change to be safe; sweeping the session keys afterwards is housekeeping.

A move that cannot finish reports failure rather than success: if the old claim cannot be released, the request returns 500 and the intent is deliberately left in place. An intent is only cleared once the release provably happened, because it is the sole record that a move was half-done.

If a process dies mid-move, the record stays the source of truth and the intent is settled later — on the account's next profile write, and nightly by the cleanup cron. The sweep skips intents younger than five minutes so it never races a move still in flight. The intent is kept for seven days precisely so it outlives several sweeps; an intent that expired before anyone read it would leave behind the orphan it was written to describe. The cron reports `phoneClaimsRepaired` alongside `removed`; a number that keeps climbing means writes are dying midway and deserves investigation.

To check for divergence manually, read `tap:v1:phone-intents`: it should normally be empty.

## One-time codes: commit, acknowledgment, refusal

A verification or reset code has three terminal outcomes, and operators reading logs should treat them as different events. They are what happens **after** the ownership precondition passes — a verification whose email or number is held by another account is refused with 409 before any of them can be reached.

| Outcome | HTTP | Session minted | Meaning |
|---|---|---|---|
| Committed | 200, `signedIn: true` | yes | This request spent the code and wrote the record |
| Acknowledged | 200, `signedIn: false` | **no** | The same request already landed — same code, same purpose, same payload. The caller is told so and nothing more |
| Refused | 400 | no | Wrong code, expired code, or a replay with a different purpose or payload |

The distinction is load-bearing. An earlier design returned the account record on every replay and let the endpoint sign it in, which turned a spent code into a way to mint sessions repeatedly for as long as the receipt lived — bounded only by the attempt limits, and those sit in fixed hourly buckets a thirty-minute receipt can outlive. A receipt now proves one thing: *this exact request already landed*. It is never a credential.

**Housekeeping after a commit.** Once the code is spent and the record written, what remains — clearing the challenge, releasing the send pointer, dropping the pending-index entry, bumping the cache revision, sweeping superseded sessions, applying an admin grant — decides nothing about whether the change took effect. None of it may turn a successful commit into a 500: that error is what sends the person back with the same code and makes them look like an attacker to the next check. Anything that fails is written to `challenge-settlement:{userId}`, queued on `tap:v1:challenge-settlements`, and audited as `challenge.settlement_pending`.

The cleanup cron retries those steps and reports `settlementsSettled` and `settlementsPending` in its heartbeat. Session sweeps on retry only remove sessions the record already refuses to authenticate, so a retry hours later never signs out someone who logged in after the reset.

**When `settlementsPending` stays above zero:** read `tap:v1:challenge-settlement:{userId}` for the step names. `send-pointer` means the address waits out the five-minute resend window before it can request another code. `admin-role` means an allowlisted operator is not admin yet; their next admin request applies it, so it repairs itself as soon as they use it. `revision` means the admin creator list may serve a stale filter until the next write. None of these are incidents on their own; a count that keeps climbing is.

## Contested email and WhatsApp claims

A registration holds its email and number until that registration is resolved. The claims have **no expiry of their own**: they are released when the record is verified (they become the verified account's permanent claims) or when the record is deleted. A claim with its own lifetime left a window where the record still existed and the address was free, and the next signup could take it — after which the email index no longer told you whose account it was.

Verification still claims an index only when it is free or already held by that same account. Anything else is refused with **409** naming the email or the number, and the refusal happens before the first write: the code is not spent, no receipt exists, and the other account keeps what it holds.

**A verification code is never targeted by email address.** It activates one specific account, so `verify/request` requires proof of *which* account: a continuation token issued when the account was created, or one issued when a password check on that account succeeded. A request carrying only an address is refused and audited as `verify.principal_unproven`. Without that rule, whoever happened to hold the email index became the target — an inbox owner could activate a stranger's account while the password that stranger chose kept working.

**Recovery when somebody has lost their code and their token.** Use the reset flow, which works from the address alone. That is safe for the opposite reason: a reset replaces the password, stamps `sessionsInvalidBefore`, revokes older sessions, and settles the claims — all in one commit. Email possession therefore never activates an account while leaving another party's credential in place. Support should point people at "Lupa kata sandi?", not at a re-sent verification code.

**An abandoned registration does not hold an address forever.** The next person who tries to sign up with it releases the claim, provided the holder is a pending record already past its one-hour window — the same condition the nightly sweep uses. The sweep (daily, 02:17 UTC) is the backstop, not the only path.

**Finding contested accounts.** Every claim refusal is audited as `challenge.claim_conflict`, deduplicated per account, claim, and stage for an hour. `before.stage` says where it happened: `commit` means somebody entered a valid code and was turned away. `after.heldBy` names the account holding the claim, in the admin trail only.

**What support does:** read the audit event, or `tap:v1:email:{email}` / `tap:v1:phone:{number}` directly, then decide whose claim it is.

- **The holder is a stale pending account.** Delete it through the cleanup path and the address frees immediately; do not wait for the daily sweep.
- **The holder is a real verified account.** The claim is not ours to move. The person needs a different address or number.

**Concurrent confirmations of the same code.** Two confirmations arriving together never produce "wrong code". One commits and is signed in; the other is acknowledged. If the record is momentarily busy, the second gets **409**, which is a retry instruction and not an outcome: retrying yields the acknowledgment. Either way the sequence ends with exactly one session, which is what `ZCARD user:{id}:sessions` should show.

## Credential handling

- Keep Redis, OAuth, and private-feed credentials only in Vercel encrypted environment variables or an approved secret manager.
- Keep `CRON_SECRET`, `RESEND_API_KEY`, and `EMAIL_FROM` in Vercel as well. `AUTH_EMAIL_MODE` must never be configured in production; both the `test` and `local` transports refuse to run when `VERCEL_ENV=production`.
- Never put raw affiliate links, tokens, creator exports, or `.env` files in GitHub issues, commits, screenshots, or chat.
- Use a TAP-specific Google OAuth client and TAP-specific Redis resource.
- Rotate credentials immediately after suspected exposure and after privileged vendor/staff access ends.

## Evidence to retain

- Local release-gate log, its `.sha256` sidecar, and the external PR/release location anchoring that hash.
- GitHub Quality Gate URL and commit SHA.
- Vercel deployment URL and promotion timestamp.
- Production smoke-test output.
- Closed-beta end-to-end test record.
- Feed privacy review and credential rejection evidence.
- Named go/no-go approvers and decision timestamp.

## Account migration and email activation

Before enabling email verification in an environment with existing users:

1. Run `node --env-file=.env.production.local scripts/backfill-email-verified.mjs` and review the exact dry-run targets.
2. Run the same command with `--apply` only after the target count is approved.
3. Run the dry-run again; `Legacy users requiring backfill` must be zero.
4. Add verified `RESEND_API_KEY` and `EMAIL_FROM`, deploy, then test registration, login verification, and password reset with a non-admin account.
5. Confirm `/api/cron/cleanup-users` rejects anonymous requests and the scheduled job remains active.
6. Open **Admin → Audit Log** and confirm the cleanup heartbeat is recent and reads *berhasil*. The heartbeat records both success and failure with a timestamp and error class, and turns red once it is older than 26 hours. "Belum pernah tercatat" means `CRON_SECRET` is absent or wrong — the endpoint answers 401 either way, so the heartbeat is the only external signal that the job runs.

The backfill intentionally excludes accounts carrying `emailVerificationStartedAt`; those accounts must finish verification or be removed by the expiry cleanup.

### Reading the verification column

Every account records how it earned `emailVerifiedAt`, shown in **Admin → Database Kreator**:

| Label | Meaning |
|---|---|
| Kode | Entered a one-time code from email. |
| Google | Email guaranteed by Google sign-in. |
| Migrasi | Legacy account marked by the backfill script. |
| Sebelum verifikasi | Created while the email provider was off; has never proven the address. |
| Menunggu | Registration has not finished verification yet. |

Accounts labelled **Sebelum verifikasi** or **Migrasi** were never challenged. Treat them as unproven when auditing membership, and require a password reset (which issues a real code) before granting elevated trust.
