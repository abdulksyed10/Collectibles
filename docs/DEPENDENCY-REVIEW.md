# Dependency review

Reviewed: 2026-10-10

## SDK compatibility

`expo` is pinned to the Expo SDK 57 patch release `~57.0.27`. Run `npm ci` before release validation so the installed packages match the lockfile, then run `npx expo install --check`. Do not use `expo.install.exclude` to silence compatibility failures.

## npm audit result

Before the targeted override, `npm audit --omit=dev --json` reported 25 affected dependency entries: 1 critical, 16 high, and 8 moderate. npm counts parent packages as well as the underlying advisories. The confirmed critical advisory was `shell-quote` through React Native development tooling; a root override now pins it to the fixed `1.11.0` release. The refreshed audit reports 24 entries: 16 high and 8 moderate, with no critical finding. The remaining findings trace to `braces`, `node-forge`, and `uuid` in Expo/React Native build tooling.

| Advisory chain | Where it runs | Current mitigation |
| --- | --- | --- |
| `shell-quote` via React Native devtools | Development tooling | Root `overrides` pins `shell-quote` to 1.11.0. Re-run the audit after every dependency update. |
| `braces` via `micromatch` and Metro | Metro file discovery during local/CI bundling | Do not process attacker-controlled glob patterns in scripts; monitor Expo/Metro releases. |
| `node-forge` via Expo CLI and Expo code-signing certificates | Expo CLI/build tooling | No safe SDK 57 override is available. Keep build access restricted and use EAS-managed signing credentials. |
| `uuid` via `xcode` and Expo config plugins | Native project configuration tooling | No app runtime path; monitor Expo config-plugin updates. |
| Metro, Expo CLI/config and React Native wrappers | Development, CI, and bundle creation | Keep Expo SDK on its current compatible patch and rerun this review before each native release. |

The audit tool proposes `npm audit fix --force`, which would replace the Expo 57 / React Native 0.86 stack with Expo 44 / React Native 0.72. That is an incompatible downgrade and must not be used. No broad lockfile override or major dependency replacement was applied without compatibility evidence.

## Release follow-up

Run `npx expo install --check`, `npx expo-doctor`, and `npm audit --json` before each beta submission. Revisit this record when Expo publishes an SDK 57-compatible update that resolves these transitive chains.
