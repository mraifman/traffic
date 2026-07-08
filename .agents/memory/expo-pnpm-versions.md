---
name: Expo + pnpm version pins
description: Package version pins for the traffic-analyzer-mobile Expo SDK 54 project in pnpm monorepo.
---

## Known pins (Expo SDK 54)

| Package | Correct version | What happens without pin |
|---------|----------------|--------------------------|
| `expo-image-manipulator` | `~14.0.8` | pnpm installs v57.x (future SDK) → Expo version-check warning |

## Pattern
Run `npx expo install --fix` (inside the mobile package dir) after adding any `expo-*` package without a version pin to get the SDK-correct version. In pnpm monorepo: `cd artifacts/traffic-analyzer-mobile && pnpm exec expo install --fix`.

**Why:** pnpm resolves the latest semver without the Expo SDK constraint; `expo install` (or `--fix`) pins to the correct SDK-aligned versions.
