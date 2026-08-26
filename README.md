# GeeksforGeeks Traversal Lab

GeeksforGeeks Traversal Lab is a Chrome Manifest V3 side-panel extension for user-controlled, labeled synthetic editor simulation. It traverses an ordered range from the public GeeksforGeeks practice catalog, inserts a non-solution local code sequence inside the detected solution function, holds the page for the configured dwell time, removes only its generated range, verifies the cleanup, and then navigates.

Version 1.1 reconnects to live page sessions after normal Manifest V3 service-worker suspension instead of reloading the current question. Side-panel settings persist across panel closure, and each question receives two or three distinct collision-safe traversal phases. Cleanup also recognizes and removes exact structural remnants created by older Traversal Lab generators before allowing navigation.

It never clicks or invokes Run, Compile, Test, or Submit. It does not solve the active problem and does not bypass login, CAPTCHA, verification, premium access, rate limits, or other restrictions.

## Install as an unpacked extension

1. Use Chrome 114 or newer.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** in the upper-right corner.
4. Click **Load unpacked**.
5. Select the repository root, the directory that directly contains `manifest.json`:

   `/Users/sumitkumar/Documents/GitHub/GFG_automation`

6. Pin the extension if desired. Click its toolbar action to open the side panel.

After changing extension files, click **Reload** on the extension card in `chrome://extensions`. Reload any open GeeksforGeeks tab so that Chrome injects the updated content scripts.

If upgrading from version 1.0 while a duplicate block is visible, reload the extension and the GFG tab, then use **Remove generated block** on the current run. Version 1.1 deletes the currently journaled range and any strongly identified older generated blocks, verifies the resulting editor source, and only then advances. If it cannot prove the ranges belong to Traversal Lab, it pauses and preserves the editor.

## Operation

1. Enter **Last completed position** and **End position**. The first is exclusive and the second is inclusive. A range of 100 to 150 processes resolved catalog positions 101 through 150.
2. Configure dwell time, speed behavior, optional pointer overlay, and fallback language.
3. Choose **Page editor language** to make the extension select C++, Java, Python, or JavaScript on the actual GFG editor before typing. Choose **Keep current** for detection-only behavior. The fallback applies when a supported editor does not expose a language identifier.
4. If editor interaction is enabled, check the explicit confirmation box. A run cannot start without it.
5. Click **Start**. The extension resolves and caches enough of the ordered public `/explore` catalog to cover the requested end position.
6. Use **Pause**, **Resume**, **Retry current**, **Skip current**, **Remove generated block**, or **Stop** as needed.
7. Click **Export labeled telemetry** to download completed records as JSONL. Every record has `label: "synthetic"`.

Skipping a problem still requires verified cleanup. **Stop** intentionally preserves current editor content and the recovery journal while terminating the run. It does not navigate.

## Safety and editing model

The extension supports Monaco, legacy CodeMirror, Ace, and a visible plain textarea fallback. The textarea fallback excludes textareas inside known Monaco, Ace, and CodeMirror containers. If the editor cannot be identified confidently, the run pauses without editing.

The editor planner masks comments and strings before brace-aware detection in C++, Java, JavaScript, and TypeScript. Python detection follows indentation and inserts after an initial function docstring. The planner never replaces the complete source, never clears the model, and refuses to insert if it cannot locate a solution function safely.

Generated snippets contain only local, language-correct scaffolding unrelated to the problem statement. Natural identifiers are collision checked against the existing source. The extension adds no visible tracking comments. It tracks generated text, source context, insertion position, recovery anchors, and timestamps in `chrome.storage.local`.

The visual pointer cannot move the operating-system pointer. It stays clamped inside the visible editor rectangle and emits `mousemove` and `pointermove` DOM events. Those events are synthetic, so `event.isTrusted === false`.

## Cleanup and recovery

Before every navigation, the extension:

1. Stops typing and pointer scheduling.
2. Waits for the in-flight editor write chain.
3. Reads the tracked range and confirms its exact contents.
4. Deletes only that range and returns the caret to the original insertion position.
5. Reads the editor again and compares it with the exact expected post-cleanup source.
6. Clears the recovery journal, stores telemetry, and only then permits navigation.

If the generated range was edited, cleanup stops and the run pauses. **Remove generated block** then offers an explicit forced cleanup prompt. Forced cleanup uses the stored before/after recovery anchors and refuses to act if they do not identify one range confidently. Inspect the editor after any forced cleanup. If an older journal belongs to a different problem, **Repair recovery mismatch** quarantines it and retries the current position instead of leaving the run deadlocked.

On page reload or browser/service-worker restart, the extension reads the journal, matches the problem ID and URL, locates the exact generated content with recovery anchors, removes it, verifies removal, and resumes the current problem. A mismatch pauses the run and preserves the editor. A stopped run also preserves its journal, allowing later recovery.

Paired marker comments from older versions named `GFG_TRAVERSAL_LAB_START` and `GFG_TRAVERSAL_LAB_END` receive one-time removal when no current recovery journal exists. This version never creates those comments.

## Persistent state and failures

The controller persists these explicit states: `IDLE`, `STARTING`, `RESOLVING`, `NAVIGATING`, `WAITING_FOR_EDITOR`, `RUNNING`, `PAUSED`, `CLEANING`, `RETRYING`, `COMPLETED`, `STOPPED`, and `ERROR`.

Chrome alarms and stored deadlines drive dwell and navigation timeouts. The implementation does not assume service-worker timers fire exactly. It reports unsupported pages/editors/languages, missing solution functions, editor and navigation timeouts, authentication, CAPTCHA or verification, rate limiting, premium access, range modifications, recovery mismatches, closed tabs, and restarts. Cleanup failure never silently advances.

## Catalog behavior and current limitations

The resolver uses the public `https://www.geeksforgeeks.org/explore?page=N` pages, retains their displayed order, derives stable slugs and canonical problem URLs, consumes stable IDs and access metadata when embedded JSON provides them, retries transient failures three times, and caches results for 24 hours. A displayed catalog position is an index into that cached ordering, not a permanent problem ID.

GeeksforGeeks does not publish a documented, versioned global practice-catalog API. Its `/explore` HTML and embedded metadata can change. The resolver stops with a schema-change error rather than guessing or looping. Filters or ordering changes made by GeeksforGeeks can also change position meanings after the 24-hour cache expires.

Editor access also depends on the page exposing a supported editor surface. Monaco works when the page exposes one visible model through `window.monaco` and an editor instance through the public registry or a conventional page global; legacy CodeMirror works when the `.CodeMirror` element exposes its instance. The current GFG page uses a bundled Ace build without `window.ace`, so the extension includes a conservative Ace DOM adapter that operates only when every source line is visibly represented and the full line count can be verified. Larger virtualized files that cannot be reconstructed completely pause safely. Modern CodeMirror 6 pages without an accessible instance will pause unless they provide a safe standalone textarea.

Authentication and verification pages are detected and paused. The extension will not sign in, solve verification, retry rate limits indefinitely, or access premium content.

## Telemetry

Completed JSONL records include the synthetic label, run/problem identity, URL, language, start/finish timestamps, CPS configuration and samples, actual inserted characters per elapsed interval, seed, total characters, normalized pointer coordinates, pause/resume events, cleanup result, and failure reason. Telemetry stays in `chrome.storage.local` until the user clears extension storage. Export does not transmit it to a server.

## Tests

The project has no runtime dependencies and uses Node's built-in test runner.

```sh
npm test
npm run check
```

The suite covers range semantics, validation, sampling bounds and replay, pointer clamping, catalog parsing/order/filtering/cache behavior, five-language insertion, Python docstrings, identifier collisions, outside edits, exact/refused/forced/recovery cleanup, caret placement, legacy cleanup, manifest resources and permissions, and static safety checks against full-model clearing or execution-control clicks.

## File layout

```text
manifest.json
package.json
src/
  background/   service worker, persistent controller, catalog resolver
  content/      page editor API, adapters, planner, generator, scheduler, pointer
  shared/       state/range utilities and validation
  sidepanel/    side-panel interface
test/           Node test suite
```
