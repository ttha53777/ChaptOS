# Ask the Chapter — product film

A 16.6s motion graphic for the Ask Chapt feature. `ask-the-chapter.webm` is the
deliverable (1920×1080, 17.9s including a black head, silent, 2.0 MB).

## Files

| file | what |
|---|---|
| `Ask the Chapter Film.html` | the film. Self-contained — fonts inlined as base64, no network. Double-click to play; scrubber at the bottom to seek. |
| `ask-the-chapter.webm` | the export |
| `render-webm.mjs` | HTML → WebM recorder |
| `frames.mjs` | poster stills at arbitrary times: `node frames.mjs "2.1,10.95"` |
| `verify-webm.mjs` | plays the *exported file* back and samples frames |
| `frames/` | poster stills (lossless PNG, 1920×1080) |

## Everything on screen is real

Nothing here is invented UI. Sources:

- **tokens, type, layout** — `app/components/chat-spotlight.css`, `_design/Ask Chapt Spotlight v3.html`
- **the approval flow** — `app/components/chat/WritCard.tsx`: `Approve` / `Discard`,
  the `Requires <permission>` line, the settled stamp (`time · actor`)
- **data** — the Spotlight canon: Iota Chapter · Spring '26, viewer is Marcus (VP),
  34 members, 28 paid, 6 owe $1,150
- **doodle accents** — paths lifted from `_design/ChaptOS Landing Doodle Mock v5.html`

**Brand split, deliberate:** the product UI keeps its zero-gradient warm-editorial
discipline (one violet, Fraunces/Geist). The *environment* around the device —
backdrop wash, bokeh, doodle marks — carries the marketing warmth. Both are real
facets of the brand; mixing them would have broken the UI's own rules.

## Motion

The launcher pill and the spotlight card are **the same element** (`#morph`) for
the whole film. Border-radius is a constant 20px at both ends (the pill's 40px
height gives it a 20px radius by definition), so the silhouette never pops. Card
height is interpolated per beat — the card breathing *is* the transition.

| t | beat |
|---|---|
| 0.00 | fade from black · dashboard · floating launcher |
| 1.85 | **morph** pill → spotlight |
| 3.25 | types "How are we doing on dues?" → send |
| 5.45 | reasoning ledger · 3 tool calls, rail grows node→node, findings post to the margin |
| 9.35 | **morph** ledger collapses to a trace line → verdict + result rows |
| 11.95 | **morph** follow-up chip → proposal card → Approve → ratified stamp |
| 14.65 | **morph** widget → ChaptOS lockup |

`render(t)` is pure — no `setTimeout`, no CSS keyframes driving narrative, so
`window.__seek(t)` is exact at any time.

## Re-rendering

```bash
node render-webm.mjs     # → ask-the-chapter.webm
node verify-webm.mjs     # duration + sampled frames from the exported file
```

The recorder holds a painted **black** frame 0 (`window.__hold`) until fonts
settle, then calls `__start()`. Playwright's recordVideo writes from context
creation and there's no ffmpeg here to trim that head — so the head is black and
the film opens on a fade-from-black, making the join invisible. That accounts for
the ~1.3s difference between the 16.6s animation and the 17.9s file.

`window.__recording` forces loop off, so the tail holds the final frame.

## If you install ffmpeg later

`brew install ffmpeg` unlocks the rest of the pipeline:

```bash
ffmpeg -i ask-the-chapter.webm -ss 1.32 -c:v libx264 -pix_fmt yuv420p \
       -profile:v high -crf 18 ask-the-chapter.mp4      # trims the head too
```

Then `.claude/skills/huashu-design/scripts/convert-formats.sh` gives a 60fps
variant and a palette-optimised GIF, and `add-music.sh` + `assets/sfx/` add audio.

## Removing the watermark

Delete the `#wmk` style block and the `<div id="wmk">` node, plus the
`wmk.style.opacity` line in `render()`.
