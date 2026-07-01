# WHEL Recorder - Changelog

## [1.0.2] - Performance & Reliability Update
### Fixed
- **Emulator & Game Audio Slowdown**: Fixed a major bug where recording an emulator or game that temporarily lagged/dropped frames would permanently slow down, pitch-drop, and delay the recorded audio. Added Hardware Rate Locking and Delay Locked Loop (DLL) drift correction to maintain perfect audio sync at a target 80ms latency.
- **Window Reload Audio Failure**: Fixed an issue where reloading the application window would leave native audio loopbacks running in the background, breaking audio completely on subsequent attempts.
- **Canvas Aspect Ratio Distortion**: Re-wrote "Fit to Screen" and "Stretch to Canvas" mathematics to use native canvas coordinate space, eliminating stretching and letterboxing distortion caused by viewport resizing.
- **Audio Pops & Clicks**: Optimized the internal PCM AudioWorklet processor by completely removing run-time memory allocations and garbage collection overhead, replacing it with a zero-allocation circular Float32 ring buffer.
- **File Stream Handles Leak**: Resolved an issue where starting consecutive recordings would overwrite file streams without closing the previous ones.
- **System Tray Native Crash**: Added a safety check to gracefully skip system tray creation if the tray icon image is missing, preventing a fatal crash.
- **Process Priority & Config Corruption**: Fixed process priority API calls for wider Node.js compatibility and added a self-healing mechanism that safely writes defaults to disk if `config.json` becomes corrupted.

## [1.0.1] - Initial Release Preparation
### Added
- **Global Hotkeys**: Custom global shortcut registration for Start/Stop Recording (default: F9), Pause/Resume (default: Shift+F9), Save Replay (default: F8), and Start/Stop Replay Buffer (default: Shift+F8).
- **Process Audio Loopback**: Advanced WASAPI integration allowing you to isolate and record only the audio of a specific application/game without capturing Discord or system sounds.
- **Replay Buffer Engine**: Constantly records footage to RAM. Hitting the hotkey instantly saves the last X seconds to your hard drive. Features strict RAM and Time limits to prevent memory exhaustion.
- **Microphone Filters**: Studio-grade live audio processing options directly in the Settings UI (Noise Suppression, Echo Cancellation, Auto Gain Control, and a custom Noise Gate).
- **Gallery & Trimmer**: A built-in Gallery UI with an integrated video player, allowing you to instantly play back, seek, and trim clips down to millisecond precision without needing external software.
- **Auto-Versioning**: Build scripts configured to automatically increment patch versions on every build.

### Fixed
- Stabilized `getUserMedia` WASAPI bug on Windows to prevent +20dB digital gain distortion.
- Replaced the Replay Buffer and Standard Recording pipeline with a dedicated chunk-streaming IPC to prevent Chromium Out-Of-Memory (Exit Code 1) crashes during large file saves.
- Fixed a metadata extraction race condition where the gallery timeline would freeze on cached videos.
- Fixed video chunk IPC limits to ensure multi-gigabyte files can be recorded continuously.

### Changed
- All microphone inputs now strictly operate in raw Float32 mode by default unless filters are explicitly enabled by the user.
- System Tray functionality: the application now seamlessly minimizes to the system tray, persisting recordings in the background.
