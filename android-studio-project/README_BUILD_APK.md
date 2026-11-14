# Smart Digital Blackboard — Android Studio Build Guide

This folder contains the complete native Kotlin Android Studio project targeting Android 8.0+ (API 26+) in portrait 9:16 orientation with 100% offline storage, hardware-accelerated custom drawing canvas, native `PdfRenderer` PDF import, and `PdfDocument` PDF export.

## Build a Signed Release APK

1. Open this `android-studio-project` directory in **Android Studio** (Jellyfish / Koala or newer).
2. Let Gradle sync dependencies (no internet needed once cached).
3. Generate a signing keystore (or use Android Studio's **Build -> Generate Signed Bundle / APK** wizard):
   ```bash
   keytool -genkey -v -keystore release-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias blackboard
   ```
4. Copy `keystore.properties.example` to `keystore.properties` and fill in your passwords.
5. Build the signed APK:
   ```bash
   ./gradlew assembleRelease
   ```
   Output APK: `app/build/outputs/apk/release/app-release.apk`
