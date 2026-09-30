# Settings Revamp Mock

Standalone interactive prototype for a complete Figurints settings redesign.

## Open

Double-click `index.html`, or serve the folder locally:

```sh
python3 -m http.server 8782 --bind 127.0.0.1 --directory "_design/Settings Revamp Mock"
```

Then open <http://127.0.0.1:8782/>.

## What to test

- Navigate all 17 settings destinations from the persistent left navigation.
- Press `Command/Ctrl + K` and search for actions such as “permissions”, “attendance”, “invoice”, or “delete”.
- Edit a field or toggle to see the shared unsaved-changes tray.
- Attempt to navigate away with unsaved changes.
- Resize to mobile width and use the settings drawer.

## Scope

This is a UX mock only. It uses sample organization data and does not call the production backend. No production files were changed.
