# Mac Compile & Build Guide (Liquid Glass Chat UI)

This guide provides step-by-step instructions for setting up, compiling, and running this project on macOS with Xcode.

---

## 1. Prerequisites on macOS

Ensure you have the following installed on your Mac:

1. **macOS**: Sonoma (14.x) or Sequoia (15.x)
2. **Xcode**: Xcode 16.0 or newer (with Command Line Tools installed)
   ```bash
   xcode-select --install
   ```
3. **Node.js**: Version 20.x or 22.x LTS (Recommended: install via [nvm](https://github.com/nvm-sh/nvm) or Homebrew)
   ```bash
   node -v # should be >= 20.0.0
   ```
4. **CocoaPods**:
   ```bash
   sudo gem install cocoapods
   # or via Homebrew:
   brew install cocoapods
   ```
5. **Python 3**:
   ```bash
   python3 --version
   ```

---

## 2. Project Setup

Open Terminal, extract the project folder, and navigate inside:

```bash
cd liquid-glass-chat-ui
```

### Install NPM Dependencies:
```bash
npm install
```

---

## 3. Generate Native iOS Project (Prebuild)

Run Expo prebuild to generate the `ios/` folder:

```bash
npx expo prebuild --platform ios --clean
```

---

## 4. Install Pods & Apply Crucial Patches

Run CocoaPods installation:

```bash
npx pod-install ios
```

### Apply Swift 6 & iOS 18.5 Compatibility Patches
This repository includes a specialized patch script to handle Swift 6 Sendable checks, C++ interop in `expo-modules-jsi`, and strip iOS 26-only APIs from `expo-router` Toolbar:

```bash
python3 scripts/patch-expo-jsi.py
```

### Prebuild ExpoModulesJSI XCFramework:
```bash
PODS_ROOT="$PWD/ios/Pods" RN_ROOT="$PWD/node_modules/react-native" PLATFORM_NAME="iphonesimulator" bash node_modules/expo-modules-jsi/apple/scripts/build-xcframework.sh
```
*(If building for a physical device, replace `iphonesimulator` with `iphoneos`)*.

---

## 5. Running the App

### Option A: Via Expo CLI (Simulator)

```bash
npx expo run:ios
```
This will compile the native app, launch your default iOS Simulator, and connect to Metro bundler.

### Option B: Via Xcode Directly

1. Open the generated Xcode workspace:
   ```bash
   open ios/LiquidGlassChat.xcworkspace
   ```
2. Select your target simulator (e.g. **iPhone 16 Pro**).
3. If signing is required (for physical device):
   - Navigate to **Signing & Capabilities**.
   - Select your **Personal Team** / Apple ID.
4. Press `Cmd + R` to build and run.

---

## 6. Building a Release IPA (Unsigned / Ad-Hoc)

To build a standalone Release binary without Xcode GUI:

1. **Pre-bundle JavaScript & Assets**:
   ```bash
   mkdir -p ios/assets
   npx expo export:embed --platform ios --dev false --entry-file node_modules/expo-router/entry.js --bundle-output ios/main.jsbundle --assets-dest ios
   ```

2. **Compile with xcodebuild**:
   ```bash
   cd ios
   xcodebuild -workspace LiquidGlassChat.xcworkspace -scheme LiquidGlassChat -configuration Release -destination "generic/platform=iOS" -sdk iphoneos -derivedDataPath build CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" ONLY_ACTIVE_ARCH=NO build
   ```

3. **Package as `.ipa`**:
   ```bash
   mkdir -p Payload
   cp -R build/Build/Products/Release-iphoneos/LiquidGlassChat.app Payload/
   zip -r LiquidGlassChat.ipa Payload
   ```

---

## 7. Troubleshooting

- **Undefined symbols / Toolbar compiler errors**:
  Ensure you ran `python3 scripts/patch-expo-jsi.py` after `pod install`.
- **Node module caching issues**:
  ```bash
  rm -rf node_modules ios
  npm install
  npx expo prebuild --platform ios --clean
  python3 scripts/patch-expo-jsi.py
  ```
