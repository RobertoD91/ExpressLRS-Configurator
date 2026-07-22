# macOS code signing and notarization

macOS builds are signed with a **Developer ID Application** certificate and
notarized with an **App Store Connect API key**. Both are supplied through
repository secrets, and everything is **gated on those secrets**: when they are
absent the build still succeeds and produces an *unsigned* app — exactly like
before — and the user right-clicks → Open on first launch.

Signing and notarization are performed by electron-builder through its built-in
`notarytool` support (and, in the standalone signing test harness, by
`scripts/macos-sign-test.sh`).

## Required repository secrets

All five are **team-level** — none is tied to a specific bundle ID, so a single
set signs and notarizes every app of your Apple Developer team.

| Secret | Content |
| --- | --- |
| `MACOS_CERT_P12_BASE64` | Developer ID Application certificate (`.p12`), base64 |
| `MACOS_CERT_PASSWORD` | password chosen when the `.p12` was exported |
| `APP_STORE_CONNECT_KEY_ID` | App Store Connect API key ID (10 characters) |
| `APP_STORE_CONNECT_ISSUER_ID` | App Store Connect API issuer ID (UUID) |
| `APP_STORE_CONNECT_API_KEY_BASE64` | App Store Connect API key (`.p8`), base64 |

Configure **all five together**: notarization needs a signed app, and signing
without notarization still trips Gatekeeper, so a partial set fails.

If you already manage a Developer ID certificate and an App Store Connect API
key for another project, **reuse them verbatim** — they are team-level, not
per-app.

## Getting the material

**Developer ID Application certificate** (one time; only the team's Account
Holder can create it):

- Xcode → Settings → Accounts → *Manage Certificates…* → **+** → *Developer ID
  Application*; or upload a CSR at
  [developer.apple.com → Certificates](https://developer.apple.com/account/resources/certificates/add).
- In **Keychain Access → My Certificates**, confirm the private key is nested
  under the certificate (without it the `.p12` is useless), then right-click →
  **Export** as a `.p12` with a password.

**App Store Connect API key** (one time):

- [App Store Connect → Users and Access → Integrations → Team Keys](https://appstoreconnect.apple.com/access/integrations/api)
  → **+**, role **App Manager** (sufficient for notarization).
- Download `AuthKey_XXXXXXXXXX.p8` — **it can be downloaded only once**. The
  **Key ID** is on the key's row; the **Issuer ID** is at the top of the page.

## Test the certificate password before uploading

```bash
# prompts for the password; prints "password OK" and exits 0 when it is correct
openssl pkcs12 -in developer_id.p12 -nokeys -noout && echo "password OK"

# bonus: confirm it really is a Developer ID Application cert (prints the subject)
openssl pkcs12 -in developer_id.p12 -nokeys -clcerts | openssl x509 -noout -subject
```

Add `-legacy` if OpenSSL 3 rejects an older macOS-exported `.p12`.

## Upload the secrets with `gh`

> ⚠️ This repository is **public**. Never paste real key IDs, issuer IDs or
> passwords into committed files — only into the secrets. The placeholders
> below stay placeholders in the repo.

```bash
REPO=<owner>/<repo>

# Developer ID certificate (signing)
gh secret set MACOS_CERT_P12_BASE64 --repo "$REPO" --body "$(base64 -i developer_id.p12)"
gh secret set MACOS_CERT_PASSWORD   --repo "$REPO" --body '<p12 export password>'

# App Store Connect API key (notarization)
gh secret set APP_STORE_CONNECT_KEY_ID         --repo "$REPO" --body '<KEY_ID>'
gh secret set APP_STORE_CONNECT_ISSUER_ID      --repo "$REPO" --body '<ISSUER_ID>'
gh secret set APP_STORE_CONNECT_API_KEY_BASE64 --repo "$REPO" --body "$(base64 -i AuthKey_XXXXXXXXXX.p8)"
```

Verify the names (not the values) with `gh secret list --repo "$REPO"`. Any
line breaks `base64` inserts are harmless — the workflows decode with
`base64 --decode`, which ignores whitespace.

## How the secrets are consumed

- **`.github/workflows/macos-signing-test.yml`** reads the five secrets
  directly and runs `scripts/macos-sign-test.sh` on a cached, unsigned arm64
  build, so the signing + notarization step can be iterated in about a minute
  without rebuilding. Temporary — removed once signing is proven.
- **`.github/workflows/publish.yml`** feeds the same secrets to
  electron-builder, mapped to the environment variables it expects:
  `CSC_LINK` ← `MACOS_CERT_P12_BASE64`, `CSC_KEY_PASSWORD` ←
  `MACOS_CERT_PASSWORD`; for notarization the `.p8` is written to disk and
  exposed as `APPLE_API_KEY` (its path), with `APPLE_API_KEY_ID` ←
  `APP_STORE_CONNECT_KEY_ID` and `APPLE_API_ISSUER` ←
  `APP_STORE_CONNECT_ISSUER_ID`. The build log shows `skipped macOS
  notarization` without credentials and `notarization successful` with them.

## Security notes

- Secrets are **write-only**: GitHub never reveals their values again and
  redacts them from logs.
- They are injected only into the steps that reference them, and GitHub does
  **not** pass secrets to workflow runs triggered by pull requests from forks.
- Private keys and certificates must **never** be committed — `.gitignore`
  blocks `*.p12` and `*.p8`.
- **Renewal**: the Developer ID Application certificate is valid 5 years; the
  App Store Connect API key does not expire until revoked. If either leaks,
  revoke it (developer.apple.com / App Store Connect), recreate it, and update
  the secrets.

## Which Apple certificate — and what is *not* needed

| Type | Needed? | Why |
| --- | --- | --- |
| **Developer ID Application** | **yes** | signs apps shipped *outside* the Mac App Store (our DMGs); valid 5 years |
| Developer ID Installer | no | signs `.pkg` installers, we ship DMGs |
| Apple Distribution + provisioning profiles | no | App Store / TestFlight only; a notarized Developer ID DMG uses no provisioning profile |
| Apple Development | no | local development builds only |
