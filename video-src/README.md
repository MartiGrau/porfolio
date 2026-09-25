# Capability videos

The looping clips in the "AI capabilities" section (`public/videos/*`) are
generated from code: every scene in `scenes/` is a pure function of time drawn
on a 1280×800 canvas, captured frame by frame in headless Chromium and encoded
with ffmpeg (H.264 `.mp4`, VP9 `.webm` fallback and a `.webp` poster).

| Scene         | Capability               |
| ------------- | ------------------------ |
| `agents.js`   | LLMs & AI Agents         |
| `rag.js`      | RAG & Knowledge          |
| `vision.js`   | Generative Vision        |
| `mlops.js`    | MLOps & Cloud            |
| `finetune.js` | Fine-tuning & R&D        |
| `strategy.js` | AI Strategy & Leadership |

Shared helpers (easing, icons, background, HUD) live in `lib.js`. Each clip is
8 s at 30 fps, loops seamlessly, and gets motion blur by averaging 4
sub-frames per frame.

## Render

Needs Node, [Playwright](https://playwright.dev) with Chromium, and ffmpeg
built with libx264, libvpx and libwebp (set `FFMPEG=/path/to/ffmpeg` if it is
not on `PATH`).

```sh
node video-src/render.mjs                    # all scenes -> public/videos
node video-src/render.mjs rag vision         # only some scenes
node video-src/render.mjs agents --stills 2,5.5 --out /tmp/stills   # preview PNGs
```
