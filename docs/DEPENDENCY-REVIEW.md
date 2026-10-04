# Dependency review

Reviewed: 2026-10-04

## SDK compatibility

`expo` is pinned to the Expo SDK 57 patch release `~57.0.26`. `npx expo install --check` reports that the installed Expo-managed dependencies are compatible. This avoids the previous CI compatibility failure without using `expo.install.exclude`.

## npm audit result

`npm audit --json` reports 24 transitive advisories: 17 high and 7 moderate, with no critical advisory. The affected paths are all within Expo/React Native tooling:

| Advisory chain | Where it runs | Current mitigation |
| --- | --- | --- |
| `braces` via `micromatch` and Metro | Metro file discovery during local/CI bundling | Do not process attacker-controlled glob patterns in scripts; monitor Expo/Metro releases. |
| `node-forge` via Expo CLI and Expo code-signing certificates | Expo CLI/build tooling | No safe SDK 57 override is available. Keep build access restricted and use EAS-managed signing credentials. |
| `uuid` via `xcode` and Expo config plugins | Native project configuration tooling | No app runtime path; monitor Expo config-plugin updates. |
| Metro, Expo CLI/config and React Native wrappers | Development, CI, and bundle creation | Keep Expo SDK on its current compatible patch and rerun this review before each native release. |

The audit tool proposes `npm audit fix --force`, which would replace the Expo 57 / React Native 0.86 stack with Expo 44 / React Native 0.72. That is an incompatible downgrade and must not be used. No lockfile override or major dependency replacement was applied because it would not have compatibility evidence.

## Release follow-up

Run `npx expo install --check`, `npx expo-doctor`, and `npm audit --json` before each beta submission. Revisit this record when Expo publishes an SDK 57-compatible update that resolves these transitive chains.
