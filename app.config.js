// Store identities belong to the publisher. Keeping them in build-time config
// avoids accidentally committing a guessed identifier before the first upload.
module.exports = ({ config }) => {
  const androidPackage = process.env.APP_ANDROID_PACKAGE;
  const iosBundleIdentifier = process.env.APP_IOS_BUNDLE_IDENTIFIER;
  const owner = process.env.EXPO_OWNER;
  const projectId = process.env.EAS_PROJECT_ID;
  return {
    ...config,
    ...(owner ? { owner } : {}),
    ...(projectId ? { extra: { ...(config.extra ?? {}), eas: { projectId } } } : {}),
    android: { ...config.android, ...(androidPackage ? { package: androidPackage } : {}) },
    ios: { ...config.ios, ...(iosBundleIdentifier ? { bundleIdentifier: iosBundleIdentifier } : {}) },
  };
};
