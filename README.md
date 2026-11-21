[![Make GTA 6 Cover Art](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/c/gta6-cover-art-01)
[![Rank](https://make.fun/badge/gta6-cover-art-01/besan11/gta6-cover-art-01/rank.svg)](https://make.fun/c/gta6-cover-art-01)
[![Reward](https://make.fun/badge/gta6-cover-art-01/besan11/gta6-cover-art-01/reward.svg)](https://make.fun/c/gta6-cover-art-01)

# Vice Cover Studio — smart-focus multi-panel covers in 3 sizes

Vice Cover Studio turns any photo and a caption into a poster-style cover for the fictional city of Neon Bay: three slanted photo panels over a hand-drawn sunset sky, a chrome title, a STARRING pill, a five-star review strip, a circular seal and a billing block. It runs entirely offline in a desktop browser — vanilla JavaScript, no libraries, no network — and exports a PNG in 1080×1080, 1080×1350 or 1920×1080.

The one idea that makes it different: **smart-focus crop**. For every photo the app measures the luminance-weighted centroid of the picture (downscaled to about 48×48, on your own machine) and centres each panel's crop on the brightest, busiest point of that photo — not on the blind centre. Drag a panel to reposition it and scroll to zoom; the focus shift and your drag share the same slack from the cover fit, so a photo can never slide out of its panel and expose sky. One renderer draws both the live preview and the export, so the PNG is exactly the frame you saw.

## How it works

1. Add your photos (or try the two bundled samples, Boulevard and Pier).
2. Pick a layout — Hero + duo, Triptych, or Duo strip — and a grade — Sunset, Neon, Vice night, or Mono — with a strength slider.
3. Edit the title, tagline, starring name, review quote and source.
4. Click a panel to select it, drag to move its photo, scroll to zoom. Each panel can hold a different photo, or one photo can fill all of them.
5. Choose a size and hit **Export PNG**.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Hand the entry in (writes `dossier.json` and self-checks the result):

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Notes

- Original design; Neon Bay is fictional. No Rockstar Games logo, artwork, character or font is used, and only system fonts are loaded.
- Photos are read on your machine and never uploaded. The two sample photos were made with an image model and are free to use.
- See `NOTES.md` for the engineering decisions, the two bugs the first build taught us, and what is still rough.
- Built for the [GTA 6 Cover Art bounty](https://make.fun/bounty/gta6-cover-art-01) on make.fun.

Referral code: `jpgk45b3`
