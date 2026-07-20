# macOS code signing and notarization

The `Publish` workflow signs and notarizes the macOS DMGs (x64, arm64 and
universal) **only when the required repository secrets are configured**. When
they are missing the workflow still succeeds and produces unsigned builds,
exactly like before — users then need to right click → Open the app on first
launch.

Signing is performed by electron-builder with the certificate provided via
`CSC_LINK`, and notarization uses Apple's `notarytool` through
electron-builder's built-in support, which is enabled automatically when the
`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` environment
variables are present.

## Which Apple certificates to request

Apple issues several certificate types, only one is needed here:

| Certificate type | Needed? | Purpose |
| --- | --- | --- |
| **Developer ID Application** | **Yes** | Signing apps distributed *outside* the Mac App Store (our DMGs). Valid 5 years. |
| Developer ID Installer | No | Only signs `.pkg` installers, we ship DMGs |
| Apple Distribution / Mac App Distribution | No | Mac App Store submissions only |
| Apple Development | No | Local development builds only |

Note that only the **Account Holder** of the Apple Developer team can create
Developer ID certificates (an Admin is not enough).

## Prerequisites

1. An [Apple Developer Program](https://developer.apple.com/programs/)
   membership.
2. A **Developer ID Application** certificate. Create it in
   [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/certificates/list)
   (or via Xcode → Settings → Accounts → Manage Certificates), install it in
   your login keychain, then export it from Keychain Access as a `.p12` file
   with a password. See below for creating it from the command line instead.
3. An **app-specific password** for your Apple ID, generated at
   [account.apple.com](https://account.apple.com/account/manage) → App-Specific
   Passwords. This is *not* your Apple ID password.
4. Your **Team ID**, the 10 character identifier shown in the
   [membership details](https://developer.apple.com/account#MembershipDetailsCard)
   of your developer account.

## Required secrets

| Secret | Content |
| --- | --- |
| `CSC_LINK` | The Developer ID Application certificate, `.p12` encoded as base64 |
| `CSC_KEY_PASSWORD` | The password chosen when exporting the `.p12` |
| `APPLE_ID` | The Apple ID (email) of the developer account |
| `APPLE_APP_SPECIFIC_PASSWORD` | The app-specific password generated for notarization |
| `APPLE_TEAM_ID` | The 10 character Apple Developer Team ID |

Configure **all five** secrets together: signing without notarization produces
apps that Gatekeeper still warns about, and notarization requires a signed
app, so a partial configuration will fail the publish build.

## Uploading the secrets with the `gh` CLI

From a clone of the repository (or pass `--repo <owner>/<repo>` explicitly):

```bash
# the certificate has to be uploaded base64 encoded
gh secret set CSC_LINK --body "$(base64 -i DeveloperIdApplication.p12)"
gh secret set CSC_KEY_PASSWORD --body 'the-p12-export-password'

gh secret set APPLE_ID --body 'you@example.com'
gh secret set APPLE_APP_SPECIFIC_PASSWORD --body 'abcd-efgh-ijkl-mnop'
gh secret set APPLE_TEAM_ID --body 'ABCDE12345'
```

Verify with:

```bash
gh secret list
```

The next run of the `Publish` workflow will pick them up automatically; the
build log shows a `skipped macOS notarization` warning when the credentials
are absent and `notarization successful` when they are used.

## Can the certificate request be automated?

Partially. What always stays manual (one time each):

- enrolling in the Apple Developer Program and accepting its agreements;
- the Account Holder uploading the CSR on the developer portal (two clicks,
  the script below prepares everything else);
- creating an **App Store Connect API key** in
  [Users and Access → Integrations](https://appstoreconnect.apple.com/access/integrations/api)
  — only needed for the optional API variant of the script or for API based
  notarization;
- generating the app-specific password used for notarization.

### The script

`scripts/create-developer-id-certificate.sh` drives the whole flow (only
needs `openssl`, plus `curl`/`jq` for the API variant). The reliable path is
the **developer portal flow** — Apple reserves Developer ID certificates for
the Account Holder and, as of mid 2026, rejects the API creation in practice
even for Admin team keys the Account Holder generated
(`403 This operation can only be performed by the Account Holder`, see
[fastlane#27149](https://github.com/fastlane/fastlane/issues/27149);
individual keys [cannot use the provisioning endpoints at all](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api)):

```bash
# 1. generate private key + CSR (no API key needed)
./scripts/create-developer-id-certificate.sh --csr-only

# 2. as the Account Holder, upload the CSR on
#    https://developer.apple.com/account/resources/certificates/add
#    (Developer ID Application) and download the .cer

# 3. package the certificate and upload the CI secrets
./scripts/create-developer-id-certificate.sh \
  --import-cer developerID_application.cer --upload-secrets
```

The script verifies that the certificate matches the private key, exports
`DeveloperIdApplication.p12` (0600) and, with `--upload-secrets`, sets the
`CSC_LINK`/`CSC_KEY_PASSWORD` repository secrets through `gh`. Every
configuration value is a command line option, `--help` lists them. Re-run
the same flow to renew the certificate when it expires after 5 years.

The API variant (`--key-file` + `--issuer-id`, token generation handled
internally) stays available in case Apple opens up API creation again;
`--check` validates the credentials without creating anything.

For **notarization** the requirements are looser: the app-specific password
or a team key with App Manager access is enough (individual keys do not work
with notarytool).

[fastlane](https://docs.fastlane.tools/actions/match/) (`match` with
`type: "developer_id"`) is an alternative with certificate storage and
rotation included, worth it if you manage more than one certificate.

Notarization can alternatively authenticate with the same App Store Connect
API key instead of the app-specific password: electron-builder supports the
`APPLE_API_KEY` (path to the `.p8` file), `APPLE_API_KEY_ID` and
`APPLE_API_ISSUER` environment variables. The publish workflow currently
wires the app-specific password variant, switching would require a small
workflow change to write the key file to disk first.
