// Fine-tuning & R&D — domain data flows into a model, an experiment sweep
// runs in parallel, the best run wins and accuracy jumps.
;(() => {
  const { W, H, TAU, clamp, lerp, ramp, ease, env, rgba, PALETTE: C, MONO } = K
  const T = 8
  const EM = C.emerald
  const CY = C.cyan
  const V = C.violet

  const LAYERS = [4, 6, 6, 3]
  const NET = { x0: 120, x1: 545, y0: 190, y1: 670 }
  let nodes = []
  let edges = []
  let runs = []
  const N = K.makeNoise(4)
  const TRAIN = [1.25, 5.0]
  const EPOCHS = 20

  function setup() {
    const r = K.rng(12)
    nodes = LAYERS.map((n, li) =>
      Array.from({ length: n }, (_, i) => [
        lerp(NET.x0, NET.x1, li / (LAYERS.length - 1)),
        lerp(NET.y0, NET.y1, (i + 0.5) / n) + (n < 6 ? 0 : 0),
      ])
    )
    edges = []
    for (let li = 0; li < LAYERS.length - 1; li++) {
      for (let a = 0; a < LAYERS[li]; a++) {
        for (let b = 0; b < LAYERS[li + 1]; b++) {
          edges.push({ li, a, b, w0: r() * 0.35, w1: Math.pow(r(), 1.6), ph: r() })
        }
      }
    }
    runs = [
      { a: 0.62, b: 0.3, c: 0.35, up: 0.0, col: "#6b6790", lbl: "lr 1e-3" },
      { a: 0.45, b: 0.45, c: 0.3, up: 0.35, col: "#6b6790", lbl: "lr 5e-4" },
      { a: 0.38, b: 0.55, c: 0.25, up: 0, col: "#7c7aa0", lbl: "lora r8" },
      { a: 0.12, b: 0.8, c: 0.22, up: 0, col: EM, lbl: "best", best: true },
    ].map((run, i) => ({ ...run, seed: i * 17.3 }))
  }

  const trainK = (t) => ramp(t, TRAIN[0], TRAIN[1])
  const lossAt = (run, x) => {
    const base = run.a + run.b * Math.exp(-x / run.c)
    const bump = run.up * Math.pow(Math.max(0, x - 0.55), 2) * 2
    const nz = (N.n2(x * 18 + run.seed, run.seed) - 0.5) * 0.06 * (1 - x * 0.5)
    return clamp(base + bump + nz, 0, 1.05)
  }

  function drawNet(ctx, t, fg) {
    const tk = ease.inOutQuad(trainK(t))
    const edgeIn = ramp(t, 0.3, 1.0)
    // edges
    for (const e of edges) {
      const p = nodes[e.li][e.a]
      const q = nodes[e.li + 1][e.b]
      const w = lerp(e.w0, e.w1, tk)
      const col = K.mixColor("#4b4870", EM, clamp(tk * 1.2) * (0.3 + 0.7 * e.w1))
      ctx.strokeStyle = rgba(col, (0.15 + 0.6 * w) * edgeIn * fg)
      ctx.lineWidth = 1 + w * 3.5
      ctx.beginPath()
      ctx.moveTo(p[0], p[1])
      ctx.lineTo(q[0], q[1])
      ctx.stroke()
    }
    // forward-pass pulses (periodic)
    const active = env(t, TRAIN[0], TRAIN[0] + 0.3, TRAIN[1] + 0.8, TRAIN[1] + 1.3)
    if (active > 0) {
      ctx.save()
      ctx.globalCompositeOperation = "lighter"
      for (const e of edges) {
        if (e.w1 < 0.45) continue
        const p = nodes[e.li][e.a]
        const q = nodes[e.li + 1][e.b]
        const cyc = ((t / T) * 8 + e.ph - e.li * 0.33) % 1
        const k = (cyc + 1) % 1
        const x = lerp(p[0], q[0], k)
        const y = lerp(p[1], q[1], k)
        K.glowCircle(ctx, x, y, 12, EM, 0.8 * active * fg * e.w1)
      }
      ctx.restore()
    }
    // nodes
    nodes.forEach((layer, li) =>
      layer.forEach(([x, y], i) => {
        const a = ease.outBack(ramp(t, 0.1 + li * 0.1 + i * 0.03, 0.45 + li * 0.1 + i * 0.03))
        if (a <= 0) return
        const glow = active * (0.5 + 0.5 * Math.sin((t / T) * TAU * 8 - li * 2 + i))
        ctx.save()
        ctx.globalAlpha = fg
        ctx.translate(x, y)
        ctx.scale(a, a)
        if (glow > 0) {
          ctx.globalCompositeOperation = "lighter"
          K.glowCircle(ctx, 0, 0, 44, EM, 0.5 * glow)
          ctx.globalCompositeOperation = "source-over"
        }
        ctx.beginPath()
        ctx.arc(0, 0, 19, 0, TAU)
        ctx.fillStyle = "#101a1c"
        ctx.fill()
        ctx.lineWidth = 3
        ctx.strokeStyle = rgba(K.mixColor("#8b89a6", EM, tk), 1)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(0, 0, 6, 0, TAU)
        ctx.fillStyle = rgba(K.mixColor("#8b89a6", "#d1fae5", tk), 1)
        ctx.fill()
        ctx.restore()
      })
    )
    K.text(ctx, "model", (NET.x0 + NET.x1) / 2, NET.y1 + 48, { size: 22, weight: 500, font: MONO, color: "#9c98b8", align: "center", alpha: fg * ramp(t, 0.5, 0.9) })

    // domain data stream into the input layer
    const flow = env(t, 0.9, 1.3, TRAIN[1] - 0.2, TRAIN[1] + 0.3)
    if (flow > 0) {
      const r = K.rng(8)
      for (let i = 0; i < 16; i++) {
        const lane = i % LAYERS[0]
        const ph = r()
        const k = ((t * 0.9 + ph) % 1 + 1) % 1
        const target = nodes[0][lane]
        const x = lerp(30, target[0] - 30, ease.inQuad(k))
        const y = target[1] + (1 - k) * (r() - 0.5) * 80
        const a = flow * fg * Math.sin(k * Math.PI)
        ctx.save()
        ctx.globalAlpha = a
        ctx.fillStyle = i % 3 ? "#6ee7b7" : "#a5f3fc"
        ctx.shadowColor = EM
        ctx.shadowBlur = 12
        K.roundRect(ctx, x - 9, y - 11, 18, 22, 3)
        ctx.fill()
        ctx.restore()
      }
      K.text(ctx, "domain data", 40, NET.y0 - 40, { size: 22, weight: 500, font: MONO, color: "#6ee7b7", alpha: flow * fg })
    }
  }

  function drawChart(ctx, t, fg) {
    const a = ease.outCubic(ramp(t, 0.55, 1.1))
    if (a <= 0) return
    const x = 640
    const y = 110
    const w = 600
    const h = 420
    ctx.save()
    ctx.globalAlpha = a * fg
    ctx.translate((1 - a) * 50, 0)
    K.pill(ctx, x, y, w, h, { r: 22, fill: "rgba(12,22,24,0.88)", stroke: "rgba(255,255,255,0.1)" })
    K.text(ctx, "loss", x + 28, y + 38, { size: 22, weight: 500, font: MONO, color: "#9c98b8" })
    const ep = Math.max(1, Math.round(trainK(K.hold(t)) * EPOCHS))
    K.text(ctx, `epoch ${String(ep).padStart(2, "0")}/${EPOCHS}`, x + w - 28, y + 38, { size: 22, weight: 600, font: MONO, color: "#d1fae5", align: "right" })
    const px = x + 40
    const py = y + 70
    const pw = w - 80
    const ph = h - 110
    ctx.strokeStyle = "rgba(255,255,255,0.07)"
    ctx.lineWidth = 1.5
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath()
      ctx.moveTo(px, py + (ph * i) / 4)
      ctx.lineTo(px + pw, py + (ph * i) / 4)
      ctx.stroke()
    }
    const tk = trainK(t)
    const best = ramp(t, TRAIN[1] - 0.1, TRAIN[1] + 0.3)
    runs.forEach((run) => {
      const pts = []
      const n = 120
      for (let i = 0; i <= n * tk; i++) {
        const xx = i / n
        pts.push([px + xx * pw, py + ph * (1 - lossAt(run, xx) / 1.05)])
      }
      if (pts.length < 2) return
      ctx.save()
      ctx.lineJoin = "round"
      ctx.lineCap = "round"
      if (run.best) {
        const grad = ctx.createLinearGradient(0, py, 0, py + ph)
        grad.addColorStop(0, rgba(EM, 0.28))
        grad.addColorStop(1, rgba(EM, 0))
        ctx.beginPath()
        ctx.moveTo(pts[0][0], py + ph)
        pts.forEach((p) => ctx.lineTo(p[0], p[1]))
        ctx.lineTo(pts[pts.length - 1][0], py + ph)
        ctx.closePath()
        ctx.fillStyle = grad
        ctx.fill()
        ctx.shadowColor = EM
        ctx.shadowBlur = 18
      }
      ctx.beginPath()
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
      ctx.strokeStyle = run.best ? EM : rgba(run.col, 0.9 - 0.45 * best)
      ctx.lineWidth = run.best ? 5 : 3
      ctx.stroke()
      ctx.restore()
      const hd = pts[pts.length - 1]
      if (run.best) {
        ctx.save()
        ctx.globalCompositeOperation = "lighter"
        K.glowCircle(ctx, hd[0], hd[1], 30, EM, 1)
        ctx.restore()
        ctx.fillStyle = "#fff"
        ctx.beginPath()
        ctx.arc(hd[0], hd[1], 6, 0, TAU)
        ctx.fill()
      } else {
        ctx.fillStyle = rgba(run.col, 1)
        ctx.beginPath()
        ctx.arc(hd[0], hd[1], 4.5, 0, TAU)
        ctx.fill()
      }
    })
    // best run tag
    if (best > 0) {
      const run = runs[3]
      const hx = px + pw
      const hy = py + ph * (1 - lossAt(run, 1) / 1.05)
      const b = ease.outBack(best)
      ctx.save()
      ctx.translate(hx - 90, hy - 62)
      ctx.scale(b, b)
      K.pill(ctx, -82, -22, 164, 44, { fill: "rgba(6,48,36,0.95)", stroke: rgba(EM, 0.9), glow: rgba(EM, 0.6) })
      K.text(ctx, "★ best run", 0, 1, { size: 22, weight: 700, color: "#d1fae5", align: "center" })
      ctx.restore()
    }
    ctx.restore()
  }

  function drawBars(ctx, t, fg) {
    const a = ease.outCubic(ramp(t, 4.9, 5.3))
    if (a <= 0) return
    const x = 640
    const y = 560
    const w = 600
    ctx.save()
    ctx.globalAlpha = a * fg
    ctx.translate(0, (1 - a) * 30)
    K.pill(ctx, x, y, w, 186, { r: 22, fill: "rgba(12,22,24,0.88)", stroke: rgba(EM, 0.35) })
    const rows = [
      { label: "base model", v: 61, col: "#6b6790", s: 5.05 },
      { label: "fine-tuned", v: 94, col: EM, s: 5.3 },
    ]
    rows.forEach((r, i) => {
      const yy = y + 52 + i * 78
      const k = ease.outExpo(ramp(t, r.s, r.s + 0.9))
      K.text(ctx, r.label, x + 28, yy, { size: 24, weight: 600, color: i ? "#ecfdf5" : "#b9b6d6" })
      const bx = x + 200
      const bw = 290
      ctx.fillStyle = "rgba(255,255,255,0.07)"
      K.roundRect(ctx, bx, yy - 14, bw, 28, 14)
      ctx.fill()
      ctx.save()
      if (i) {
        ctx.shadowColor = EM
        ctx.shadowBlur = 22
      }
      ctx.fillStyle = r.col
      K.roundRect(ctx, bx, yy - 14, Math.max(28, bw * (r.v / 100) * k), 28, 14)
      ctx.fill()
      ctx.restore()
      K.text(ctx, `${Math.round(r.v * ease.outExpo(ramp(K.hold(t), r.s, r.s + 0.9)))}%`, x + w - 26, yy + 1, { size: i ? 38 : 30, weight: 800, color: i ? "#6ee7b7" : "#b9b6d6", align: "right" })
    })
    ctx.restore()
  }

  SCENES.finetune = {
    duration: T,
    setup,
    draw(ctx, t) {
      K.background(ctx, t, T, EM, CY)
      const fg = 1 - ease.inOutCubic(ramp(t, 7.2, 7.85))
      drawNet(ctx, t, fg)
      drawChart(ctx, t, fg)
      drawBars(ctx, t, fg)
      K.frameHud(ctx, "FINE-TUNING", EM, t, T)
      void V
    },
  }
})()
