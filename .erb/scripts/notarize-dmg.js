/**
 * electron-builder afterAllArtifactBuild hook: notarize and staple the macOS DMG.
 *
 * electron-builder already signs, notarizes and staples the .app; the DMG that
 * wraps it is only built, not notarized. Notarizing and stapling the DMG here
 * means a freshly downloaded .dmg also opens without a Gatekeeper prompt - not
 * just the app once it has been copied out of it. See docs/macos-code-signing.md.
 *
 * Runs only on macOS and only when the App Store Connect API key variables are
 * present (APPLE_API_KEY = path to the .p8 file, APPLE_API_KEY_ID,
 * APPLE_API_ISSUER). Unsigned builds are left untouched, like the rest of the
 * signing setup.
 *
 * Stapling rewrites the DMG bytes, which invalidates the sha512 in
 * latest-mac.yml. That is harmless here: the macOS app never uses the
 * electron-updater download path (src/app/updater.ts skips macOS in
 * checkForUpdates), it only links to the release page.
 */

const { execFileSync } = require('child_process');

exports.default = async function notarizeDmg({ artifactPaths }) {
  if (process.platform !== 'darwin') {
    return [];
  }

  const dmgs = (artifactPaths || []).filter((artifact) => artifact.endsWith('.dmg'));
  if (dmgs.length === 0) {
    return [];
  }

  const key = process.env.APPLE_API_KEY;
  const keyId = process.env.APPLE_API_KEY_ID;
  const issuer = process.env.APPLE_API_ISSUER;
  if (!key || !keyId || !issuer) {
    console.log('notarize-dmg: App Store Connect API key not set, leaving the DMG un-notarized');
    return [];
  }

  for (const dmg of dmgs) {
    console.log(`notarize-dmg: submitting ${dmg} to notarytool (waits for Apple)`);
    execFileSync(
      'xcrun',
      ['notarytool', 'submit', dmg, '--key', key, '--key-id', keyId, '--issuer', issuer, '--wait'],
      { stdio: 'inherit' },
    );
    console.log(`notarize-dmg: stapling ${dmg}`);
    execFileSync('xcrun', ['stapler', 'staple', dmg], { stdio: 'inherit' });
  }

  return [];
};
