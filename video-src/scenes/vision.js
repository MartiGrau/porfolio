// Generative Vision — a sketch conditions a diffusion model: pure noise is
// denoised step by step into an image that follows the sketch's layout.
;(() => {
  const { W, H, TAU, clamp, lerp, ramp, ease, env, rgba, PALETTE: C, MONO } = K
  const T = 8
  const PK = C.pink
  const V = C.violet

  const FW = 924
  const FH = 520
  const FX = Math.round((W - FW) / 2)
  const FY = 96
  const HORIZON = 352
  const PROMPT = "neon sunset over the mountains, cinematic"
  const STEPS = 50

  let levels = [] // blurred versions of the final image (Float32 RGB)
  const RADII = [0, 3, 8, 18, 36, 70]
  let noise = null
  let out = null
  let outCtx = null
  let outData = null
  let ridges = []
  let sun = null

  function buildImage() {
    const cv = document.createElement("canvas")
    cv.width = FW
    cv.height = FH
    const g = cv.getContext("2d")
    const N = K.makeNoise(11)
    const r = K.rng(5)

    // Sky
    const sky = g.createLinearGradient(0, 0, 0, HORIZON)
    sky.addColorStop(0, "#12072e")
    sky.addColorStop(0.38, "#4c1d95")
    sky.addColorStop(0.7, "#db2777")
    sky.addColorStop(1, "#fb923c")
    g.fillStyle = sky
    g.fillRect(0, 0, FW, HORIZON)
    for (let i = 0; i < 260; i++) {
      const y = r() * HORIZON * 0.6
      g.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.6 * (1 - y / 200)})`
      g.fillRect(r() * FW, y, r() < 0.1 ? 2.5 : 1.5, r() < 0.1 ? 2.5 : 1.5)
    }
    // Glow + sun
    sun = { x: FW * 0.5, y: HORIZON - 18, r: 150 }
    const halo = g.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, 420)
    halo.addColorStop(0, "rgba(253,186,116,0.75)")
    halo.addColorStop(0.35, "rgba(236,72,153,0.35)")
    halo.addColorStop(1, "rgba(236,72,153,0)")
    g.fillStyle = halo
    g.fillRect(0, 0, FW, HORIZON)
    g.save()
    g.beginPath()
    g.arc(sun.x, sun.y, sun.r, 0, TAU)
    g.clip()
    const sg = g.createLinearGradient(0, sun.y - sun.r, 0, sun.y + sun.r)
    sg.addColorStop(0, "#fef08a")
    sg.addColorStop(0.5, "#fb923c")
    sg.addColorStop(1, "#ec4899")
    g.fillStyle = sg
    g.fillRect(sun.x - sun.r, sun.y - sun.r, sun.r * 2, sun.r * 2)
    // synthwave slices
    for (let k = 0; k < 6; k++) {
      const yy = sun.y - 78 + k * 13
      g.clearRect(sun.x - sun.r, yy, sun.r * 2, 2 + k * 1.2)
    }
    g.restore()
    // redraw sky behind the slices
    g.save()
    g.globalCompositeOperation = "destination-over"
    g.fillStyle = sky
    g.fillRect(0, 0, FW, HORIZON)
    g.restore()

    // Mountains: far to near
    const layers = [
      { base: 318, amp: 190, sc: 0.004, seed: 0, top: "#a855f7", bot: "#db2777", fog: 0.6 },
      { base: 334, amp: 150, sc: 0.0065, seed: 40, top: "#4c1d95", bot: "#9d174d", fog: 0.35 },
      { base: 350, amp: 95, sc: 0.01, seed: 90, top: "#0f0a2e", bot: "#1e1147", fog: 0 },
    ]
    ridges = []
    layers.forEach((L, li) => {
      const pts = []
      for (let x = -4; x <= FW + 4; x += 4) {
        const n = N.fbm(x * L.sc + L.seed, L.seed * 0.37, 5)
        const peak = Math.pow(n, 1.5) * 1.9
        const side = clamp(Math.abs(x - sun.x) / (sun.r * (2.1 - li * 0.35)))
        const wgt = 0.12 + 0.88 * side * side * (3 - 2 * side)
        pts.push([x, L.base - peak * L.amp * wgt])
      }
      ridges.push(pts)
      g.beginPath()
      g.moveTo(-4, HORIZON)
      pts.forEach((p) => g.lineTo(p[0], p[1]))
      g.lineTo(FW + 4, HORIZON)
      g.closePath()
      const mg = g.createLinearGradient(0, L.base - L.amp, 0, HORIZON)
      mg.addColorStop(0, L.top)
      mg.addColorStop(1, L.bot)
      g.fillStyle = mg
      g.fill()
      // rim light
      g.strokeStyle = li === 2 ? "rgba(251,146,60,0.55)" : "rgba(253,186,116,0.25)"
      g.lineWidth = li === 2 ? 2 : 1.5
      g.beginPath()
      pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1] + 1) : g.moveTo(p[0], p[1] + 1)))
      g.stroke()
      if (L.fog) {
        const fog = g.createLinearGradient(0, HORIZON - 90, 0, HORIZON)
        fog.addColorStop(0, "rgba(251,146,160,0)")
        fog.addColorStop(1, `rgba(251,146,160,${L.fog * 0.5})`)
        g.fillStyle = fog
        g.fillRect(0, HORIZON - 90, FW, 90)
      }
    })

    // Lake: mirrored, rippled reflection
    const src = g.getImageData(0, 0, FW, HORIZON).data
    const lake = g.createImageData(FW, FH - HORIZON)
    const d = lake.data
    for (let y = 0; y < FH - HORIZON; y++) {
      const depth = y / (FH - HORIZON)
      const off = Math.round(Math.sin(y * 0.33) * (1 + depth * 4) + Math.sin(y * 0.09) * 2 * depth)
      const sy = clamp(HORIZON - 1 - Math.round(y * 1.05), 0, HORIZON - 1)
      for (let x = 0; x < FW; x++) {
        const sx = clamp(x + off, 0, FW - 1)
        const si = (sy * FW + sx) * 4
        const di = (y * FW + x) * 4
        const dark = lerp(0.62, 0.22, depth)
        d[di] = src[si] * dark
        d[di + 1] = src[si + 1] * dark
        d[di + 2] = src[si + 2] * dark * 1.08 + 10
        d[di + 3] = 255
      }
    }
    g.putImageData(lake, 0, HORIZON)
    // horizon line glow
    const hl = g.createLinearGradient(0, HORIZON - 3, 0, HORIZON + 5)
    hl.addColorStop(0, "rgba(253,186,116,0)")
    hl.addColorStop(0.5, "rgba(253,186,116,0.7)")
    hl.addColorStop(1, "rgba(253,186,116,0)")
    g.fillStyle = hl
    g.fillRect(0, HORIZON - 3, FW, 8)
    // sun glints on the water
    for (let i = 0; i < 45; i++) {
      const y = HORIZON + 8 + r() * (FH - HORIZON - 20)
      const spread = 40 + (y - HORIZON) * 0.9
      const x = sun.x + (r() - 0.5) * spread * 2
      g.fillStyle = `rgba(254,215,170,${0.15 + r() * 0.35})`
      g.fillRect(x, y, 8 + r() * 30, 1.5)
    }
    // subtle vignette baked in
    const vg = g.createRadialGradient(FW / 2, FH / 2, FH * 0.3, FW / 2, FH / 2, FW * 0.7)
    vg.addColorStop(0, "rgba(0,0,0,0)")
    vg.addColorStop(1, "rgba(0,0,0,0.45)")
    g.fillStyle = vg
    g.fillRect(0, 0, FW, FH)
    return cv
  }

  function setup() {
    const img = buildImage()
    const pad = 140
    const tmp = document.createElement("canvas")
    tmp.width = FW + pad * 2
    tmp.height = FH + pad * 2
    const tg = tmp.getContext("2d")
    levels = RADII.map((rad) => {
      tg.filter = "none"
      tg.clearRect(0, 0, tmp.width, tmp.height)
      // edge-extend so the blur doesn't darken the borders
      tg.drawImage(img, 0, 0, 1, FH, 0, pad, pad, FH)
      tg.drawImage(img, FW - 1, 0, 1, FH, pad + FW, pad, pad, FH)
      tg.drawImage(img, 0, 0, FW, 1, pad, 0, FW, pad)
      tg.drawImage(img, 0, FH - 1, FW, 1, pad, pad + FH, FW, pad)
      tg.drawImage(img, pad, pad)
      const c2 = document.createElement("canvas")
      c2.width = FW
      c2.height = FH
      const g2 = c2.getContext("2d")
      g2.filter = rad ? `blur(${rad}px)` : "none"
      g2.drawImage(tmp, -pad, -pad)
      const data = g2.getImageData(0, 0, FW, FH).data
      const f = new Float32Array(FW * FH * 3)
      for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
        f[j] = data[i]
        f[j + 1] = data[i + 1]
        f[j + 2] = data[i + 2]
      }
      return f
    })

    // Fixed latent-looking noise: 2x2 blocks of colored gaussian noise
    const r = K.rng(99)
    const gauss = () => {
      let u = 0
      for (let i = 0; i < 4; i++) u += r()
      return (u - 2) * 1.2
    }
    noise = new Float32Array(FW * FH * 3)
    const bw = FW / 2
    const bh = FH / 2
    const blocks = new Float32Array(bw * bh * 3)
    for (let i = 0; i < blocks.length; i++) blocks[i] = gauss()
    for (let y = 0; y < FH; y++) {
      for (let x = 0; x < FW; x++) {
        const b = ((y >> 1) * bw + (x >> 1)) * 3
        const j = (y * FW + x) * 3
        noise[j] = blocks[b]
        noise[j + 1] = blocks[b + 1]
        noise[j + 2] = blocks[b + 2]
      }
    }
    out = document.createElement("canvas")
    out.width = FW
    out.height = FH
    outCtx = out.getContext("2d")
    outData = outCtx.createImageData(FW, FH)
  }

  // p: 0 = pure noise, 1 = clean image. vis: overall opacity of the image area.
  function composite(p, vis) {
    const a = Math.pow(clamp(p), 1.35)
    const nAmt = Math.sqrt(1 - a * a) * 70
    const lv = (1 - clamp(p)) * (RADII.length - 1)
    const i0 = Math.floor(lv)
    const i1 = Math.min(RADII.length - 1, i0 + 1)
    const f = lv - i0
    const A = levels[i0]
    const B = levels[i1]
    const d = outData.data
    const base = 1 - a
    // noise floats around a neutral dark-violet mean, like a decoded latent
    const m0 = 70 * base
    const m1 = 52 * base
    const m2 = 110 * base
    for (let j = 0, i = 0; j < A.length; j += 3, i += 4) {
      const r = (A[j] + (B[j] - A[j]) * f) * a + m0 + noise[j] * nAmt
      const g = (A[j + 1] + (B[j + 1] - A[j + 1]) * f) * a + m1 + noise[j + 1] * nAmt
      const b = (A[j + 2] + (B[j + 2] - A[j + 2]) * f) * a + m2 + noise[j + 2] * nAmt
      // fade toward the empty-frame color so the loop is seamless
      d[i] = 12 + (r - 12) * vis
      d[i + 1] = 10 + (g - 10) * vis
      d[i + 2] = 26 + (b - 26) * vis
      d[i + 3] = 255
    }
    outCtx.putImageData(outData, 0, 0)
  }

  function sketch(ctx, k, alpha, clipX = null) {
    if (k <= 0 || alpha <= 0) return
    ctx.save()
    ctx.beginPath()
    ctx.rect(FX, FY, clipX == null ? FW : clipX - FX, FH)
    ctx.clip()
    ctx.translate(FX, FY)
    ctx.globalAlpha = alpha
    ctx.strokeStyle = "#fdf2f8"
    ctx.lineWidth = 3
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.shadowColor = PK
    ctx.shadowBlur = 12
    const parts = [
      ...ridges.map((pts, i) => ({ pts, s: 0.05 + i * 0.12 })),
      { pts: [[0, HORIZON], [FW, HORIZON]], s: 0 },
      { pts: Array.from({ length: 65 }, (_, i) => { const a = Math.PI + 0.12 + (i / 64) * (Math.PI - 0.24); return [sun.x + Math.cos(a) * sun.r, sun.y + Math.sin(a) * sun.r] }), s: 0.25 },
    ]
    for (const part of parts) {
      K.partialPath(ctx, part.pts, ease.inOutCubic(ramp(k, part.s, part.s + 0.6)))
      ctx.stroke()
    }
    // reflection hints
    ctx.lineWidth = 2
    for (let i = 0; i < 5; i++) {
      const y = HORIZON + 30 + i * 30
      const w = 60 + i * 38
      K.partialPath(ctx, [[sun.x - w, y], [sun.x + w, y]], ramp(k, 0.55 + i * 0.06, 0.9 + i * 0.02))
      ctx.stroke()
    }
    ctx.restore()
  }

  function chip(ctx, x, y, label, color, alpha = 1, align = "left") {
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.font = `600 22px ${MONO}`
    const w = ctx.measureText(label).width + 36
    const x0 = align === "right" ? x - w : x
    K.pill(ctx, x0, y, w, 42, { fill: "rgba(10,8,22,0.8)", stroke: rgba(color, 0.7), r: 12 })
    K.text(ctx, label, x0 + 18, y + 22, { size: 22, weight: 600, font: MONO, color: "#fdf2f8" })
    ctx.restore()
  }

  SCENES.vision = {
    duration: T,
    setup,
    draw(ctx, t) {
      K.background(ctx, t, T, PK, V)
      const fgOut = 1 - ease.inOutCubic(ramp(t, 7.15, 7.8))

      // frame
      const fin = ease.outCubic(ramp(t, 0, 0.5))
      ctx.save()
      ctx.shadowColor = rgba(PK, 0.35)
      ctx.shadowBlur = 60
      K.roundRect(ctx, FX, FY, FW, FH, 22)
      ctx.fillStyle = "#0c0a1a"
      ctx.fill()
      ctx.restore()

      // diffusion progress
      const noiseIn = ramp(t, 1.25, 1.85)
      const p = ease.inOutQuad(ramp(t, 1.9, 5.0)) - 0.55 * ease.inCubic(ramp(t, 6.9, 7.5))
      const vis = Math.min(ease.outCubic(noiseIn), fgOut)
      if (vis > 0) {
        composite(p, vis)
        ctx.save()
        K.roundRect(ctx, FX, FY, FW, FH, 22)
        ctx.clip()
        ctx.drawImage(out, FX, FY)
        // animated shimmer on the lake once the image is clean
        const live = env(t, 4.6, 5.2, 6.8, 7.3) * fgOut
        if (live > 0) {
          ctx.globalCompositeOperation = "lighter"
          const r = K.rng(3)
          for (let i = 0; i < 26; i++) {
            const y = HORIZON + 14 + r() * 150
            const spread = 30 + (y - HORIZON) * 0.8
            const ph = r() * TAU
            const x = sun.x + Math.sin((t / T) * TAU * 4 + ph) * spread * 0.6 + (r() - 0.5) * spread
            const a = 0.5 * live * (0.5 + 0.5 * Math.sin((t / T) * TAU * 6 + ph))
            ctx.fillStyle = `rgba(254,215,170,${a})`
            ctx.fillRect(FX + x, FY + y, 14 + r() * 30, 2)
          }
        }
        ctx.restore()
      }

      // sketch: drawn first, then acts as a guide, then fades as the image resolves
      const sk = ramp(t, 0.25, 1.5)
      const guide = (1 - ease.inOutCubic(ramp(t, 2.6, 4.4))) * (1 - 0.35 * noiseIn)
      sketch(ctx, sk, guide * fgOut)

      // comparison wipe: sketch | generated
      const wipe = env(t, 5.25, 5.85, 6.3, 6.85, ease.inOutCubic, ease.inOutCubic)
      if (wipe > 0) {
        const dx = FX + FW * 0.5 * wipe
        ctx.save()
        K.roundRect(ctx, FX, FY, FW, FH, 22)
        ctx.clip()
        ctx.fillStyle = "rgba(12,10,26,0.94)"
        ctx.fillRect(FX, FY, dx - FX, FH)
        ctx.restore()
        sketch(ctx, 1, 1, dx)
        ctx.save()
        ctx.fillStyle = "#fff"
        ctx.shadowColor = PK
        ctx.shadowBlur = 20
        ctx.fillRect(dx - 2, FY, 4, FH)
        ctx.beginPath()
        ctx.arc(dx, FY + FH / 2, 22, 0, TAU)
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.fillStyle = PK
        ctx.beginPath()
        ctx.moveTo(dx - 12, FY + FH / 2)
        ctx.lineTo(dx - 4, FY + FH / 2 - 8)
        ctx.lineTo(dx - 4, FY + FH / 2 + 8)
        ctx.moveTo(dx + 12, FY + FH / 2)
        ctx.lineTo(dx + 4, FY + FH / 2 - 8)
        ctx.lineTo(dx + 4, FY + FH / 2 + 8)
        ctx.fill()
        ctx.restore()
        chip(ctx, FX + 22, FY + 22, "sketch", "#fdf2f8", ramp(wipe, 0.6, 1))
        chip(ctx, FX + FW - 22, FY + 22, "generated", PK, ramp(wipe, 0.6, 1), "right")
      }

      // frame border
      ctx.save()
      K.roundRect(ctx, FX, FY, FW, FH, 22)
      ctx.strokeStyle = rgba(PK, 0.25 + 0.3 * fin)
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.restore()

      // step counter + progress bar
      const sc = env(t, 1.6, 1.9, 5.1, 5.35)
      if (sc > 0) {
        const step = Math.max(1, Math.round(clamp(ramp(K.hold(t), 1.9, 5.0)) * STEPS))
        const done = step === STEPS
        chip(ctx, FX + FW - 22, FY + 22, done ? `step ${STEPS}/${STEPS} ✓` : `denoising · step ${String(step).padStart(2, "0")}/${STEPS}`, PK, sc, "right")
        ctx.save()
        ctx.globalAlpha = sc
        ctx.fillStyle = "rgba(255,255,255,0.12)"
        ctx.fillRect(FX + 22, FY + FH - 26, FW - 44, 5)
        ctx.fillStyle = PK
        ctx.shadowColor = PK
        ctx.shadowBlur = 16
        ctx.fillRect(FX + 22, FY + FH - 26, (FW - 44) * clamp(ramp(t, 1.9, 5.0)), 5)
        ctx.restore()
      }

      // prompt
      const pa = ease.outBack(ramp(t, 0.05, 0.5))
      if (pa > 0) {
        const w = 820
        const h = 74
        const x = W / 2 - w / 2
        const y = FY + FH + 34
        ctx.save()
        ctx.globalAlpha = clamp(pa) * fgOut
        ctx.translate(0, (1 - clamp(pa)) * 20)
        K.pill(ctx, x, y, w, h, { fill: "rgba(40,12,36,0.92)", stroke: rgba(PK, 0.6), glow: rgba(PK, 0.45) })
        // sparkle
        const sx = x + 42
        const sy = y + h / 2
        ctx.fillStyle = "#fbcfe8"
        ctx.beginPath()
        for (let i = 0; i < 8; i++) {
          const rr = i % 2 ? 5 : 17
          const an = (i / 8) * TAU - Math.PI / 2
          ctx.lineTo(sx + Math.cos(an) * rr, sy + Math.sin(an) * rr)
        }
        ctx.closePath()
        ctx.fill()
        const str = K.typed(PROMPT, ramp(K.hold(t), 0.25, 1.35))
        K.text(ctx, str, x + 76, y + h / 2 + 1, { size: 32, weight: 500, color: "#fdf2f8" })
        if (t < 1.5 && Math.floor(K.hold(t) * 4) % 2 === 0) {
          ctx.font = `500 32px ${K.FONT}`
          ctx.fillStyle = PK
          ctx.fillRect(x + 80 + ctx.measureText(str).width, y + 19, 3, 36)
        }
        ctx.restore()
      }

      K.frameHud(ctx, "GEN VISION", PK, t, T)
    },
  }
})()
