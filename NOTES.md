# Vice Cover Studio — engineering notes

## What it is

A static web app (`app/`, vanilla JS, no libraries, no network) that turns
photos + a caption into a multi-panel poster cover for the fictional city of
Neon Bay, exported as a PNG in 1080×1080, 1080×1350 or 1920×1080. The
single differentiator is the **smart-focus crop**: each panel centres its
crop on the luminance-weighted centroid of its photo (measured on a ~48×48
downscale, on the user's machine), instead of on the blind centre. The
preview and the export share one renderer (`drawCover` in
`app/src/studio.js`), so the exported PNG is exactly the preview frame.

## Structure

- `app/index.html` — the workbench: photo tray, layout/grade/size pickers,
  caption fields, panel slots, export button, live preview canvas.
- `app/style.css` — dark neon editor theme, system fonts only.
- `app/src/studio.js` — everything else: grades, panel geometry, sky/sun/
  skyline/palm drawing, smart-focus, photo placement, title band, UI wiring,
  deep links (`?photo=&caption=&layout=&grade=&size=`).
- `app/samples/boulevard.jpg`, `app/samples/pier.jpg` — kit samples, made
  with an image model, free to use.
- `main.ts` — entry program: wipes the output dir, copies `app/` and
  `screenshots/`, writes `dossier.json` via the vendored library, then
  self-checks (screenshot count/size, app file count/size, dossier parses
  and fits its cap). It throws instead of passing silently.
- `shots.json` — the four screenshot recipes (query + viewport each).

## Two bugs the first build taught us (fixed from the start here)

1. **Title-band sizing must be driven by the band height, not the width.**
   Width-driven sizing stacked the title onto the starring pill and the
   seal on the 1920×1080 cover. Every size in the title band now derives
   from `bandH` (title ≈ 0.44 × bandH, shrinking only to fit the width
   left of the seal), and the review strip shrinks its font until its
   line fits the band.
2. **Focus shift and drag must share one slack.** The first build let the
   two add up past the cover-fit slack, so a photo could slide out of its
   panel and expose sky. Here the combined shift is clamped to
   ±slack/2, where slack is the cover-fit overflow at the current zoom.

## Honest limits

- Smart-focus is a luminance + edge heuristic, not a face or subject
  detector: on a flat, evenly lit photo the centroid sits near the centre
  and the crop behaves like a plain centre crop. The drag/zoom controls
  are the escape hatch, and they are one click away.
- The skyline, sun and palms are drawn procedurally from a fixed seed, so
  every cover shares the same Neon Bay backdrop; only the photos, layout,
  grade and caption change. That is deliberate (one recognisable poster
  system), but it caps variety.
- The circular seal text is drawn letter by letter along an arc; at the
  smallest export size the letters are chunky rather than fine.
- `roundRect` is used for the starring pill; it needs a modern Chromium.
  The grader and the finalist review both use desktop Chrome, so this is
  acceptable, but an older browser would throw on export.

## Verification done locally

- `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts` — dossier formed,
  self-check passed.
- Run twice, compared the two output trees byte for byte — identical.
- Screenshots are real renders from headless Chromium (Playwright) served
  by `node serve.ts`: the editor with a photo loaded, and three exported
  PNGs (1920×1080, 1080×1350 Triptych/Neon, 1080×1080), each scaled to
  fit the 1280px / 256 KiB limits. No screenshot is composited or borrowed.
- No `http` reference anywhere under `app/` (checked by grep).
