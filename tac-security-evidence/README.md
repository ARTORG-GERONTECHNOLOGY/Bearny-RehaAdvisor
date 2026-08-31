# TAC Security — CASA AL1 Evidence Files

Generated: 2026-08-05
Application: RehaAdvisor (https://reha-advisor.ch)
Assessment platform: TAC Security ESOF

---

## File index — all 48 requirements

| S.No | Req ID | File | Comment to paste |
|------|--------|------|------------------|
| 1 | 1.1.1 | [1.1.1-brute-force-authentication.md](1.1.1-brute-force-authentication.md) | `nginx rate-limits login to 5 req/min per IP; account locked after 5 failed attempts within 1 hour` |
| 2 | 1.1.2 | [1.1.2-securely-random-codes-expire.md](1.1.2-securely-random-codes-expire.md) | `6-digit OTP generated with secrets.choice (CSPRNG), expires after 5 minutes, single-use` |
| 3 | 1.1.3 | [1.1.3-passwords-resistant-offline-attacks.md](1.1.3-passwords-resistant-offline-attacks.md) | `PBKDF2-SHA256 with 870,000 iterations (confirmed on prod). Min 8 chars + complexity enforced.` |
| 4 | 1.2.1 | [1.2.1-no-default-credentials.md](1.2.1-no-default-credentials.md) | `All credentials from environment variables only. No hardcoded or default credentials in codebase.` |
| 5 | 1.3.1 | [1.3.1-oob-verifier-expires.md](1.3.1-oob-verifier-expires.md) | `Email verification code expires after 5 minutes. Expired codes rejected and deleted.` |
| 6 | 1.3.2 | [1.3.2-oob-verifier-single-use.md](1.3.2-oob-verifier-single-use.md) | `Code deleted immediately on successful verification. Previous codes deleted when new code issued.` |
| 7 | 1.3.3 | [1.3.3-oob-verifier-securely-random.md](1.3.3-oob-verifier-securely-random.md) | `secrets.choice(string.digits) x6 — cryptographically secure OS RNG` |
| 8 | 1.3.4 | [1.3.4-oob-verifier-brute-force.md](1.3.4-oob-verifier-brute-force.md) | `Max 10 verification attempts per 30-minute window per user. Returns HTTP 429 when exceeded.` |
| 9 | 2.1.1 | [2.1.1-no-tokens-in-url.md](2.1.1-no-tokens-in-url.md) | `JWT tokens in HttpOnly cookies only (Secure, SameSite=Strict). Never in URL query strings.` |
| 10 | 2.2.1 | [2.2.1-logout-invalidates-tokens.md](2.2.1-logout-invalidates-tokens.md) | `Logout revokes both access + refresh JTIs in Redis denylist. Cookies cleared. simplejwt blacklist also enabled.` |
| 11 | 2.2.2 | [2.2.2-terminate-sessions-on-password-change.md](2.2.2-terminate-sessions-on-password-change.md) | `invalidate_user_tokens() called on password change and reset — sets Redis valid-from epoch, invalidates all existing JWTs` |
| 12 | 2.2.3 | [2.2.3-stateless-tokens-expire-24h.md](2.2.3-stateless-tokens-expire-24h.md) | `Access token: 5 min. Refresh token: 1 day. Confirmed on production (SIMPLE_JWT settings).` |
| 13 | 2.3.1 | [2.3.1-cookie-secure-attribute.md](2.3.1-cookie-secure-attribute.md) | `Secure=True on all auth cookies. Derived from DEBUG=False in prod settings.` |
| 14 | 2.3.2 | [2.3.2-cookie-httponly-attribute.md](2.3.2-cookie-httponly-attribute.md) | `HttpOnly=True unconditionally on all auth cookies. Prevents JS access.` |
| 15 | 2.3.3 | [2.3.3-session-tokens-not-static-keys.md](2.3.3-session-tokens-not-static-keys.md) | `Short-lived JWTs only (5 min access / 1 day refresh). No static API keys used for sessions.` |
| 16 | 2.3.4 | [2.3.4-stateless-tokens-signed-protected.md](2.3.4-stateless-tokens-signed-protected.md) | `HS256 explicit; no algorithm negotiation. JTI denylist for replay. valid_from epoch for password-change invalidation.` |
| 17 | 2.4.1 | [2.4.1-reauth-before-sensitive-transactions.md](2.4.1-reauth-before-sensitive-transactions.md) | `Password change requires current password (old_password). JWT alone is not sufficient.` |
| 18 | 3.1.1 | [3.1.1-least-privilege-access-control.md](3.1.1-least-privilege-access-control.md) | `JWTAuthMiddleware enforces auth on all /api/ routes. IsAdmin permission class on admin endpoints. Clinic ownership check on patient data.` |
| 19 | 3.1.2 | [3.1.2-access-control-attributes-not-user-manipulable.md](3.1.2-access-control-attributes-not-user-manipulable.md) | `Role from JWT (server-signed). Clinic membership from DB record, not request params.` |
| 20 | 3.1.3 | [3.1.3-access-controls-fail-securely.md](3.1.3-access-controls-fail-securely.md) | `Any token error → 401. IsAdmin returns False on DB error. Deny-by-default posture.` |
| 21 | 3.1.4 | [3.1.4-idor-protection.md](3.1.4-idor-protection.md) | `Clinic ownership IDOR guard on all patient endpoints. Arbitrary patient ObjectId returns 403.` |
| 22 | 3.1.5 | [3.1.5-anti-csrf.md](3.1.5-anti-csrf.md) | `SameSite=Strict cookies + Bearer header = CSRF-safe. CSP connect-src 'self'. frame-ancestors 'none'.` |
| 23 | 3.1.6 | [3.1.6-directory-browsing-disabled.md](3.1.6-directory-browsing-disabled.md) | `No autoindex directive in any nginx config. Static files served with try_files only.` |
| 24 | 3.2.1 | [3.2.1-oauth-authorization-code-flow.md](3.2.1-oauth-authorization-code-flow.md) | `Both Fitbit and Google Health use Authorization Code Flow. grant_type=authorization_code server-side token exchange.` |
| 25 | 3.2.2 | [3.2.2-oauth-state-redirect-uri-validation.md](3.2.2-oauth-state-redirect-uri-validation.md) | `secrets.token_urlsafe(32) nonce in state param, validated in Redis on callback. redirect_uri hardcoded server-side.` |
| 26 | 3.2.3 | [3.2.3-admin-mfa-restricted.md](3.2.3-admin-mfa-restricted.md) | `/api/admin/ restricted to 127.0.0.1 only (SSH tunnel). Admin accounts require 2FA to receive JWT.` |
| 27 | 4.1.1 | [4.1.1-tls-enforced-secure-ciphers.md](4.1.1-tls-enforced-secure-ciphers.md) | `TLSv1.2 + TLSv1.3 only. ECDHE + AEAD ciphers. HTTP→HTTPS redirect. HSTS max-age=31536000.` |
| 28 | 4.1.2 | [4.1.2-trusted-tls-certificates.md](4.1.2-trusted-tls-certificates.md) | `Let's Encrypt certificates (publicly trusted CA). Auto-renewed via Celery task.` |
| 29 | 4.1.3 | [4.1.3-no-weak-cryptography.md](4.1.3-no-weak-cryptography.md) | `All TLS ciphers are AEAD + ECDHE. Token encryption: Fernet (AES-128-CBC+HMAC). No RC4/3DES/NULL.` |
| 30 | 4.1.4 | [4.1.4-crypto-fail-securely-no-padding-oracle.md](4.1.4-crypto-fail-securely-no-padding-oracle.md) | `Fernet verifies HMAC before decrypting — no Padding Oracle possible. No CBC TLS ciphers.` |
| 31 | 5.1.1 | [5.1.1-http-parameter-pollution.md](5.1.1-http-parameter-pollution.md) | `Django QueryDict + json.loads() — deterministic duplicate handling, not exploitable.` |
| 32 | 5.1.2 | [5.1.2-url-redirects-allowlisted.md](5.1.2-url-redirects-allowlisted.md) | `All redirects use settings.FRONTEND_URL (server env var). No user-supplied redirect target accepted.` |
| 33 | 5.1.3 | [5.1.3-no-eval-dynamic-code.md](5.1.3-no-eval-dynamic-code.md) | `No eval()/exec() in backend or frontend. React JSX escapes all output. dangerouslySetInnerHTML limited to chart color CSS only.` |
| 34 | 5.1.4 | [5.1.4-template-injection-protection.md](5.1.4-template-injection-protection.md) | `React SPA — no server-side HTML template rendering of user input. Email templates use f-strings, not template engines.` |
| 35 | 5.1.5 | [5.1.5-ssrf-prevention.md](5.1.5-ssrf-prevention.md) | `All outbound URLs hardcoded or from server env vars. No user-supplied URL reaches requests.get/post.` |
| 36 | 5.1.6 | [5.1.6-xpath-xml-injection.md](5.1.6-xpath-xml-injection.md) | `No XML parsing of user input. All data is JSON. MongoDB + Django ORM only.` |
| 37 | 5.1.7 | [5.1.7-xss-protection.md](5.1.7-xss-protection.md) | `React JSX escapes by default. CSP header. X-Content-Type-Options: nosniff. No user input in dangerouslySetInnerHTML.` |
| 38 | 5.1.8 | [5.1.8-database-injection.md](5.1.8-database-injection.md) | `MongoEngine ORM throughout. ObjectId() validates ID format. No raw() queries. No $where.` |
| 39 | 5.1.9 | [5.1.9-os-command-injection.md](5.1.9-os-command-injection.md) | `subprocess.run() uses list form only. shell=True not used. No request data reaches shell commands.` |
| 40 | 5.1.10 | [5.1.10-file-inclusion-protection.md](5.1.10-file-inclusion-protection.md) | `No dynamic imports or user-supplied file paths. Uploaded files stored by UUID, never executed.` |
| 41 | 5.2.1 | [5.2.1-malicious-file-uploads.md](5.2.1-malicious-file-uploads.md) | `Extension allowlist (mp4/mp3/wav/pdf/jpg/png only). Files stored in object storage, never executed.` |
| 42 | 6.1.1 | [6.1.1-no-known-vulnerable-components.md](6.1.1-no-known-vulnerable-components.md) | `Django 5.1.1, cryptography 43.0.0, simplejwt 5.3.1. No known critical CVEs at assessment date.` |
| 43 | 6.2.1 | [6.2.1-debug-mode-disabled.md](6.2.1-debug-mode-disabled.md) | `DEBUG=False hardcoded in prod.py. Confirmed on production container.` |
| 44 | 6.3.1 | [6.3.1-origin-header-not-used-for-auth.md](6.3.1-origin-header-not-used-for-auth.md) | `Origin header never inspected for auth decisions. All auth based on JWT validation only.` |
| 45 | 6.4.1 | [6.4.1-no-subdomain-takeover.md](6.4.1-no-subdomain-takeover.md) | `Direct A records to VPS. No dangling CNAMEs to external services. All proxy_pass to internal Docker network.` |
| 46 | 6.5.1 | [6.5.1-no-credential-logging.md](6.5.1-no-credential-logging.md) | `Passwords never logged. JWT tokens not logged. OAuth tokens encrypted at rest. Error logs contain no valid token values.` |
| 47 | 6.6.1 | [6.6.1-browser-storage-cleared-on-logout.md](6.6.1-browser-storage-cleared-on-logout.md) | `sessionStorage.clear() + localStorage.clear() on logout. Always runs even if server API call fails.` |
| 48 | 6.7.1 | [6.7.1-secure-server-side-secrets-storage.md](6.7.1-secure-server-side-secrets-storage.md) | `All secrets in env vars (.env.prod, gitignored). OAuth tokens encrypted in MongoDB (Fernet). 72 tokens confirmed encrypted on prod.` |

---

## How to upload

For each row in the ESOF Evidence page:
1. Paste the **Comment** from the table above into the "Enter comment" field
2. Click the upload icon and attach the corresponding `.md` file

The `.md` files can be converted to PDF if the portal requires that format
(any markdown viewer → Print → Save as PDF).
