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
   with a password.
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

Notarization can alternatively authenticate with an App Store Connect API
key instead of the app-specific password: electron-builder supports the
`APPLE_API_KEY` (path to the `.p8` file), `APPLE_API_KEY_ID` and
`APPLE_API_ISSUER` environment variables. The publish workflow currently
wires the app-specific password variant, switching would require a small
workflow change to write the key file to disk first. Note that individual
API keys do not work with notarytool, use a team key.
