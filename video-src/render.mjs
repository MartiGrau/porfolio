// Renders the capability videos frame by frame with headless Chromium and
// encodes them with ffmpeg.
//
//   node video-src/render.mjs                 # all scenes -> public/videos
//   node video-src/render.mjs agents rag      # only some scenes
//   node video-src/render.mjs agents --stills 1,3.5,6 --out /tmp/x   # preview PNGs
//
// Requires Playwright (with Chromium) and ffmpeg (FFMPEG env var or on PATH).
import { createServer } from "node:http"
import { readFile, mkdir, writeFile, stat, unlink } from "node:fs/promises"
import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, "..")

let chromium
try {
  ;({ chromium } = require("playwright"))
} catch {
  ;({ chromium } = require(path.join(process.execPath, "../../lib/node_modules/playwright")))
}

const FFMPEG = process.env.FFMPEG || "ffmpeg"
const FPS = 30
// Sub-frames averaged per frame for motion blur (180° shutter)
const MOTION_SAMPLES = 4
const ALL = ["agents", "rag", "vision", "mlops", "finetune", "strategy"]
// Moment used as the poster image (seconds)
const POSTER = { agents: 5.9, rag: 5.6, vision: 5.6, mlops: 4.9, finetune: 6.0, strategy: 5.4 }

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args.splice(i, 2)[1] : null
}
const stills = flag("--stills")
const outDir = path.resolve(flag("--out") || path.join(root, "public/videos"))
const scenes = args.length ? args : ALL

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".woff2": "font/woff2" }
const server = createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0])
  const file = path.join(root, url)
  try {
    const body = await readFile(file)
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" })
    res.end(body)
  } catch {
    res.writeHead(404)
    res.end()
  }
}).listen(0)
const port = server.address().port

const run = (argv, input) =>
  new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...argv], { stdio: [input ? "pipe" : "ignore", "inherit", "inherit"] })
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))))
    if (input) input(p.stdin)
  })

await mkdir(outDir, { recursive: true })
const browser = await chromium.launch({ args: ["--disable-gpu-vsync", "--font-render-hinting=none"] })

async function renderScene(name) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
  page.on("pageerror", (e) => console.error(`[${name}]`, e))
  page.on("console", (m) => console.log(`[${name}]`, m.text()))
  await page.goto(`http://localhost:${port}/video-src/index.html`)
  const { duration } = await page.evaluate((n) => window.initScene(n), name)
  const grab = async (t, samples = 1) => {
    const url = await page.evaluate(([tt, n, sh]) => window.renderFrame(tt, n, sh), [t, samples, 0.5 / FPS])
    return Buffer.from(url.split(",")[1], "base64")
  }

  if (stills) {
    for (const s of stills.split(",").map(Number)) {
      await writeFile(path.join(outDir, `${name}-${s.toFixed(2)}.png`), await grab(s))
    }
    await page.close()
    return
  }

  const frames = Math.round(duration * FPS)
  const master = path.join(outDir, `.${name}-master.mkv`)
  const started = Date.now()
  await run(["-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-", "-c:v", "libx264rgb", "-crf", "0", "-preset", "ultrafast", master], async (stdin) => {
    for (let f = 0; f < frames; f++) {
      const buf = await grab(f / FPS, MOTION_SAMPLES)
      if (!stdin.write(buf)) await new Promise((r) => stdin.once("drain", r))
    }
    stdin.end()
  })
  const poster = await grab(POSTER[name] ?? duration / 2)
  await page.close()
  console.log(`[${name}] ${frames} frames in ${((Date.now() - started) / 1000).toFixed(1)}s, encoding…`)

  await Promise.all([
    run(["-i", master, "-vf", "format=yuv420p", "-c:v", "libx264", "-preset", "veryslow", "-crf", "24", "-profile:v", "high", "-tune", "animation", "-movflags", "+faststart", "-an", path.join(outDir, `${name}.mp4`)]),
    run(["-i", master, "-vf", "format=yuv420p", "-c:v", "libvpx-vp9", "-crf", "36", "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "1", "-an", path.join(outDir, `${name}.webm`)]),
    run(["-f", "image2pipe", "-c:v", "png", "-i", "-", "-vf", "scale=960:600:flags=lanczos", "-c:v", "libwebp", "-quality", "80", path.join(outDir, `${name}.webp`)], (stdin) => stdin.end(poster)),
  ])
  await unlink(master)
  for (const ext of ["mp4", "webm", "webp"]) {
    const { size } = await stat(path.join(outDir, `${name}.${ext}`))
    console.log(`[${name}] ${ext}: ${(size / 1024).toFixed(0)} KB`)
  }
}

const queue = [...scenes]
const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
  while (queue.length) await renderScene(queue.shift())
})
await Promise.all(workers)
await browser.close()
server.close()
