# TestForge Lite for Android

A personal, offline-first Android edition of TestForge.

## Included
- Local classes
- Structured TXT/Markdown test import
- Native test-taking UI
- Automatic grading
- Correct answer checkmarks
- Wrong selected-answer strike-through
- Per-question explanations
- Local completed-test history
- Overall grade
- No account, cloud service, subscription, or API required

## Import format

```text
Title: Network Basics

1. What does CPU stand for?
A. Central Processing Unit
B. Computer Personal Unit
C. Central Program Utility
D. Core Processing User
Answer: A
Explanation: The CPU is the Central Processing Unit.

2. Which memory is temporary?
A. SSD
B. RAM
C. HDD
D. ROM
Answer: B
Explanation: RAM stores active working data temporarily.
```

Save the file as `.txt` or `.md`, copy it to the Android device, choose the destination class, then tap **Import .txt/.md Test**.

## Build

From the repository root:

```bash
gradle -p android-lite assembleDebug
```

APK output:

```text
android-lite/app/build/outputs/apk/debug/app-debug.apk
```

The GitHub Actions workflow also builds the APK and uploads it as an artifact.
