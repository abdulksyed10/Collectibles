const base = require('./app.json').expo;

// Store identities belong to the publisher. Keeping them in build-time config
// avoids accidentally committing a guessed identifier before the first upload.
module.exports = () => {
  const androidPackage = process.env.APP_ANDROID_PACKAGE;
  const iosBundleIdentifier = process.env.APP_IOS_BUNDLE_IDENTIFIER;
  const owner = process.env.EXPO_OWNER;
  const projectId = process.env.EAS_PROJECT_ID;
  return {
    ...base,
    ...(owner ? { owner } : {}),
    ...(projectId ? { extra: { ...(base.extra ?? {}), eas: { projectId } } } : {}),
    android: { ...base.android, ...(androidPackage ? { package: androidPackage } : {}) },
    ios: { ...base.ios, ...(iosBundleIdentifier ? { bundleIdentifier: iosBundleIdentifier } : {}) },
  };
};
