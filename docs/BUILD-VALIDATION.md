# Build validation — 2026-11-04

Verified in the development environment:

- JavaScript syntax and standalone HTML generation.
- Android debug APK built with AGP 8.9.2, Gradle 8.11.1, SDK 35, NDK 27.2.12479018 and CMake 3.22.1.
- Android lint: **No issues found**.
- Three native ABIs packaged: arm64-v8a, armeabi-v7a and x86_64.
- APK signature verified with Android apksigner (v2 development signature).
- APK 16 KB zip alignment and arm64/x86_64 ELF LOAD segment alignment verified.
- Packaged HTML/CSS/JavaScript, factory presets and three original FIR WAVs checked in the APK.
- Host C++ tests: partitioned FFT convolution agrees with direct FIR, bounded finite output, bypass, malformed WAV rejection, original IR loading, invalid parameter handling.
- Host C++ tests also pass AddressSanitizer/UndefinedBehaviorSanitizer with leak checking in a supported execution context.
- Chromium: preset banks, search, favorites, persistence, original/edited comparison, effects, Live View controls, actual audio output, audio file playback and IR loading.
- Responsive layout checked at 360, 390, 768, 1024 and 1440 pixels.
- JavaScript-to-Android command schema tested with a mocked bridge, including 24 parameters, input/output IDs, status, folder/export actions and IR selection.

Not established by these checks:

- Installation/runtime behavior or USB round-trip latency on an actual Android phone.
- Authorization to the specified Google account, provider folder support, or successful cloud upload.
- A stable production signing identity, Play Store publication or an independently completed GitHub Actions run.

The APK is an initial development build for device validation, not a claim of production readiness. Follow `ANDROID-VALIDATION.md` with the intended phone and interface.
