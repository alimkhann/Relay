# tunnel.skin for Galaxy S25 Ultra

Android operator client for your personal [tunnel.skin](https://tunnel.skin) endpoints:

- **Desktop** → `https://desktop.tunnel.skin/` (noVNC / websockify)
- **Terminal** → `https://term.tunnel.skin/` (ttyd + Basic Auth)

Built for the S25 Ultra panel (1440×3120, 19.5:9, 120Hz, One UI 7 / Android 15).

## Features

- Edge-to-edge immersive desktop with keep-screen-on
- Sensor landscape lock for desktop / split
- **Split Ultra** mode: desktop + terminal side-by-side on the ultrawide display
- Terminal extra-keys bar (Esc, Ctrl, Alt, arrows, Home/End, …)
- Encrypted storage for ttyd credentials (`EncryptedSharedPreferences`)
- Deep links for `desktop.tunnel.skin` and `term.tunnel.skin`
- No VNC token hardcoded — loads the desktop root URL and follows redirect

## Build

```bash
export ANDROID_HOME=$HOME/Android/Sdk
cd mobile/tunnel-skin-android
./gradlew :app:assembleDebug
```

APK output:

`app/build/outputs/apk/debug/app-debug.apk`

Install on the phone:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## First run

1. Open **Settings**
2. Confirm Desktop / Terminal URLs
3. Enter ttyd Basic Auth user + password
4. Launch **Desktop**, **Terminal**, or **Split Ultra**

## Notes

This folder is intentionally outside the Relay `pnpm` workspace (`apps/*`). It is a standalone Gradle project and does not affect Relay CI scripts beyond being present in the monorepo tree.
