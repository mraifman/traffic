---
name: iOS Xcode build patches
description: Podfile post_install patches required for Xcode 16+ / iOS 26 compatibility
---

## fmt consteval (Xcode 16+ / Clang 16+)

**Rule:** Always add this to the Podfile `post_install` block for any React Native / Expo project. The `fmt` library bundled with Folly uses `consteval` (C++20) which newer Clang rejects in certain contexts.

```ruby
installer.pods_project.targets.each do |target|
  if target.name == 'fmt'
    target.build_configurations.each do |config|
      config.build_settings['OTHER_CPLUSPLUSFLAGS'] =
        '$(inherited) -DFMT_USE_CONSTEVAL=0'
    end
  end
end
```

**Why:** Only surfaces during a native Xcode archive/build — invisible on Replit where no native compilation occurs. Xcode 16 is now standard so this will hit every new project.

**How to apply:** Add inside the existing `post_install do |installer| ... end` block, after `react_native_post_install(...)`.

## New Architecture + iOS 26 beta (Hermes crash)

**Rule:** Do not enable `newArchEnabled: true` for projects that include `react-native-reanimated` v4 + `react-native-keyboard-controller` unless verified working on the target iOS version.

**Why:** On iOS 26 beta, New Architecture crashes inside `RCTI18nUtil → NSUserDefaults` during Fabric surface init, and simultaneously crashes the Hermes JS thread during `initializeRuntime`. Reanimated 4 mandates New Architecture, so the solution is to remove Reanimated if it isn't needed.

**How to apply:** If the app doesn't use Reanimated animations directly, remove `react-native-reanimated`, `react-native-worklets`, `react-native-keyboard-controller` from package.json and set `newArchEnabled: false` in both `app.json` and `ios/Podfile.properties.json`.
