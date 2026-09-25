// RAG & Knowledge — a question becomes a vector, finds its nearest chunks
// in a 3D embedding space, and the retrieved sources ground the answer.
;(() => {
  const { W, H, TAU, clamp, lerp, ramp, ease, env, rgba, PALETTE: C, MONO } = K
  const T = 8
  const CY = C.cyan
  const V = C.violet
  const OK = C.emerald

  const center = [520, 440]
  const RADIUS = 235
  const FOCAL = 900
  const QUERY = "What's our refund policy?"
  const ANSWER = "Refunds accepted within 30 days."
  const DOCS = [
    { name: "refund-policy.pdf", score: "0.94" },
    { name: "support-faq.md", score: "0.91" },
    { name: "terms-2024.docx", score: "0.87" },
  ]
  const SLOT_X = 880
  const slotY = (i) => 236 + i * 112

  let points = []
  let targets = []
  const qpos = [0.35, -0.25, 0.55]

  function setup() {
    const r = K.rng(7)
    const gauss = () => {
      let u = 0
      for (let i = 0; i < 6; i++) u += r()
      return (u - 3) / 1.2
    }
    const clusters = Array.from({ length: 7 }, () => {
      const th = r() * TAU
      const ph = Math.acos(2 * r() - 1)
      return [Math.sin(ph) * Math.cos(th) * 0.7, Math.cos(ph) * 0.7, Math.sin(ph) * Math.sin(th) * 0.7]
    })
    clusters[0] = [qpos[0] + 0.05, qpos[1] + 0.05, qpos[2] - 0.05]
    const hues = ["#7dd3fc", "#a5b4fc", "#c4b5fd", "#67e8f9", "#94a3b8", "#818cf8", "#93c5fd"]
    points = []
    for (let i = 0; i < 230; i++) {
      const c = i % 7
      const s = c === 0 ? 0.2 : 0.26
      let p = [clusters[c][0] + gauss() * s, clusters[c][1] + gauss() * s, clusters[c][2] + gauss() * s]
      const len = Math.hypot(...p)
      if (len > 1) p = p.map((v) => v / len)
      points.push({ p, col: hues[c], size: 0.7 + r() * 0.6, tw: r() * TAU })
    }
    const d = (a) => Math.hypot(a.p[0] - qpos[0], a.p[1] - qpos[1], a.p[2] - qpos[2])
    targets = points
      .map((pt, i) => ({ i, d: d(pt) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map((o) => o.i)
  }

  const rotY = (t) => (t / T) * TAU
  function project(p, t) {
    const a = rotY(t)
    const tilt = 0.38
    let x = p[0] * Math.cos(a) + p[2] * Math.sin(a)
    let z = -p[0] * Math.sin(a) + p[2] * Math.cos(a)
    let y = p[1]
    const y2 = y * Math.cos(tilt) - z * Math.sin(tilt)
    const z2 = y * Math.sin(tilt) + z * Math.cos(tilt)
    y = y2
    z = z2
    const s = FOCAL / (FOCAL + z * RADIUS)
    return { x: center[0] + x * RADIUS * s, y: center[1] + y * RADIUS * s, z, s }
  }

  function drawSphereGuides(ctx, t) {
    ctx.save()
    ctx.strokeStyle = "rgba(125,211,252,0.07)"
    ctx.lineWidth = 1.5
    for (let k = -2; k <= 2; k++) {
      const lat = (k / 3) * (Math.PI / 2)
      const pts = []
      for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * TAU
        pts.push(project([Math.cos(a) * Math.cos(lat), Math.sin(lat), Math.sin(a) * Math.cos(lat)], t))
      }
      ctx.beginPath()
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.stroke()
    }
    for (let k = 0; k < 6; k++) {
      const lon = (k / 6) * Math.PI
      const pts = []
      for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * TAU
        pts.push(project([Math.cos(a) * Math.cos(lon), Math.sin(a), Math.cos(a) * Math.sin(lon)], t))
      }
      ctx.beginPath()
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.stroke()
    }
    ctx.restore()
  }

  // Tiny document glyph
  function chunk(ctx, x, y, s, col, alpha, glow = 0) {
    const w = 13 * s
    const h = 17 * s
    ctx.globalAlpha = alpha
    if (glow > 0) {
      ctx.save()
      ctx.globalCompositeOperation = "lighter"
      K.glowCircle(ctx, x, y, 46 * s, CY, glow)
      ctx.restore()
      ctx.globalAlpha = alpha
    }
    K.roundRect(ctx, x - w / 2, y - h / 2, w, h, 2.5 * s)
    ctx.fillStyle = rgba(col, 0.9)
    ctx.fill()
    ctx.fillStyle = "rgba(7,6,15,0.55)"
    ctx.fillRect(x - w * 0.3, y - h * 0.2, w * 0.6, 1.4 * s)
    ctx.fillRect(x - w * 0.3, y + h * 0.05, w * 0.45, 1.4 * s)
    ctx.globalAlpha = 1
  }

  const flyK = (i, t) => ease.inOutCubic(ramp(t, 3.05 + i * 0.16, 3.85 + i * 0.16))
  const cardsOut = (t) => 1 - ease.inCubic(ramp(t, 7.05, 7.6))

  function drawSpace(ctx, t, fg) {
    drawSphereGuides(ctx, t)
    const q = project(qpos, t)
    const qArrive = ramp(t, 1.25, 1.95)
    const ripple = ramp(t, 1.9, 3.0)
    const pts = points.map((pt, i) => ({ ...project(pt.p, t), pt, i })).sort((a, b) => b.z - a.z)
    for (const P of pts) {
      const ti = targets.indexOf(P.i)
      const dist = Math.hypot(P.pt.p[0] - qpos[0], P.pt.p[1] - qpos[1], P.pt.p[2] - qpos[2])
      // brightening wave from the query
      const wave = ripple > 0 && ripple < 1 ? Math.exp(-Math.pow((dist - ripple * 1.6) * 5, 2)) : 0
      const depth = clamp(0.35 + 0.65 * (1 - (P.z + 1) / 2))
      let alpha = (0.3 + 0.55 * depth) * (0.7 + 0.3 * Math.sin((t / T) * TAU * 3 + P.pt.tw))
      let col = P.pt.col
      let glow = wave * 0.12
      if (ti >= 0) {
        const hl = env(t, 2.35 + ti * 0.12, 2.6 + ti * 0.12, 7.2, 7.8)
        col = K.mixColor(col, CY, hl)
        alpha = lerp(alpha, 1, hl)
        glow = Math.max(glow, hl * 0.9)
        if (flyK(ti, t) > 0 && cardsOut(t) > 0) alpha *= 0.25 // ghost left behind
      }
      chunk(ctx, P.x, P.y, P.s * P.pt.size * (ti >= 0 ? 1.4 : 1.05) * (1 + wave * 0.4), col, alpha, glow)
    }

    // Query vector
    if (qArrive > 0) {
      const from = [300, 170]
      const e = ease.inOutCubic(qArrive)
      const px = lerp(from[0], q.x, e)
      const py = lerp(from[1], q.y, e) - Math.sin(e * Math.PI) * 60
      const vis = fg * (1 - ramp(t, 7.2, 7.8))
      ctx.save()
      ctx.globalAlpha = vis
      ctx.globalCompositeOperation = "lighter"
      K.glowCircle(ctx, px, py, 70 + 20 * env(t, 1.9, 2.0, 2.0, 2.6), "#ffffff", 0.35)
      K.glowCircle(ctx, px, py, 50, CY, 0.9)
      ctx.globalCompositeOperation = "source-over"
      ctx.fillStyle = "#fff"
      ctx.beginPath()
      ctx.arc(px, py, 9, 0, TAU)
      ctx.fill()
      ctx.restore()

      // ripples
      for (let k = 0; k < 3; k++) {
        const rk = ramp(t, 1.95 + k * 0.22, 2.9 + k * 0.22)
        if (rk <= 0 || rk >= 1) continue
        ctx.strokeStyle = rgba(CY, (1 - rk) * 0.7 * fg)
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.ellipse(q.x, q.y, 20 + rk * 240, (20 + rk * 240) * 0.55, 0, 0, TAU)
        ctx.stroke()
      }

      // connections to the nearest chunks
      targets.forEach((idx, ti) => {
        const lk = env(t, 2.35 + ti * 0.12, 2.65 + ti * 0.12, 3.0 + ti * 0.16, 3.6 + ti * 0.16)
        if (lk <= 0) return
        const P = project(points[idx].p, t)
        ctx.save()
        ctx.globalAlpha = fg * lk
        ctx.strokeStyle = CY
        ctx.lineWidth = 2.5
        ctx.setLineDash([4, 8])
        ctx.lineDashOffset = -t * 60
        ctx.beginPath()
        ctx.moveTo(q.x, q.y)
        ctx.lineTo(P.x, P.y)
        ctx.stroke()
        ctx.setLineDash([])
        const lx = q.x + 70
        const ly = q.y - 70 + ti * 50
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(P.x, P.y)
        ctx.lineTo(lx, ly)
        ctx.stroke()
        K.pill(ctx, lx, ly - 18, 84, 36, { fill: "rgba(8,40,52,0.95)", stroke: rgba(CY, 0.8), r: 10 })
        K.text(ctx, DOCS[ti].score, lx + 42, ly + 1, { size: 22, weight: 600, font: MONO, color: "#cffafe", align: "center" })
        ctx.restore()
      })
    }
  }

  function drawCards(ctx, t, fg) {
    const out = cardsOut(t)
    const head = ramp(t, 3.0, 3.4) * out
    if (head > 0) {
      K.text(ctx, "retrieved context", SLOT_X, 176, { size: 22, weight: 500, font: MONO, color: "#8b89a6", alpha: head * fg })
    }
    targets.forEach((idx, i) => {
      const k = flyK(i, t)
      if (k <= 0 || out <= 0) return
      const P = project(points[idx].p, 3.05 + i * 0.16) // start where the chunk was at launch
      const w = lerp(16, 340, k)
      const h = lerp(21, 92, k)
      const x = lerp(P.x, SLOT_X + w / 2, k)
      const y = lerp(P.y, slotY(i) + h / 2, k) - Math.sin(k * Math.PI) * 50
      const dropOut = ease.inCubic(ramp(t, 7.05 + i * 0.05, 7.6))
      ctx.save()
      ctx.globalAlpha = fg * out
      ctx.translate(x + dropOut * 40, y)
      ctx.scale(w / 340, h / 92)
      const cw = 340
      const ch = 92
      ctx.shadowColor = rgba(CY, 0.7)
      ctx.shadowBlur = 30 * k
      K.roundRect(ctx, -cw / 2, -ch / 2, cw, ch, 16)
      ctx.fillStyle = rgba(K.mixColor(CY, "#0c1f2e", ease.outCubic(k)), 1)
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.strokeStyle = rgba(CY, 0.3 + 0.5 * k)
      ctx.lineWidth = 2
      ctx.stroke()
      const c = ramp(k, 0.6, 1)
      if (c > 0) {
        ctx.globalAlpha = fg * out * c
        K.pill(ctx, -cw / 2 + 16, -18, 36, 36, { fill: rgba(CY, 0.25), stroke: rgba(CY, 0.8), r: 10 })
        K.text(ctx, String(i + 1), -cw / 2 + 34, 1, { size: 22, weight: 700, color: "#cffafe", align: "center" })
        K.text(ctx, DOCS[i].name, -cw / 2 + 66, -14, { size: 24, weight: 600, color: "#ecfeff" })
        ctx.fillStyle = "rgba(165,243,252,0.28)"
        ctx.fillRect(-cw / 2 + 66, 12, 180, 6)
        ctx.fillRect(-cw / 2 + 66, 26, 120, 6)
        K.text(ctx, DOCS[i].score, cw / 2 - 20, 20, { size: 20, weight: 600, font: MONO, color: CY, align: "right" })
      }
      ctx.restore()
    })
  }

  function drawQuery(ctx, t, fg) {
    const a = ease.outBack(ramp(t, 0.1, 0.55))
    if (a <= 0) return
    const x = 90
    const y = 100
    const w = 560
    const h = 76
    const sent = ramp(t, 1.2, 1.5)
    ctx.save()
    ctx.globalAlpha = fg * clamp(a) * (1 - 0.4 * sent)
    ctx.translate(x, y + h / 2)
    ctx.scale(clamp(a) * 0.1 + 0.9, clamp(a) * 0.1 + 0.9)
    ctx.translate(-x, -(y + h / 2))
    K.pill(ctx, x, y, w, h, { fill: "rgba(10,30,44,0.92)", stroke: rgba(CY, 0.6), glow: rgba(CY, 0.5) })
    K.icon(ctx, "search", x + 42, y + h / 2, 34, "#a5f3fc", 3.4)
    const str = K.typed(QUERY, ramp(K.hold(t), 0.3, 1.1))
    K.text(ctx, str, x + 78, y + h / 2 + 1, { size: 34, weight: 500, color: "#ecfeff" })
    if (t < 1.25 && Math.floor(K.hold(t) * 4) % 2 === 0) {
      ctx.font = `500 34px ${K.FONT}`
      ctx.fillStyle = CY
      ctx.fillRect(x + 82 + ctx.measureText(str).width, y + 20, 3, 38)
    }
    ctx.restore()
  }

  function drawAnswer(ctx, t, fg) {
    const a = ease.outBack(ramp(t, 4.35, 4.8))
    if (a <= 0) return
    const out = 1 - ease.inCubic(ramp(t, 7.05, 7.6))
    const x = 600
    const y = 598
    const w = 630
    const h = 150
    // merge beams from cards into the answer
    const mb = env(t, 4.1, 4.4, 4.6, 5.2)
    if (mb > 0) {
      ctx.save()
      ctx.globalCompositeOperation = "lighter"
      for (let i = 0; i < 3; i++) {
        const from = [SLOT_X + 170, slotY(i) + 92]
        const k = ramp(t, 4.05 + i * 0.06, 4.5 + i * 0.06)
        const p = K.qbez(from, [SLOT_X + 60, 560], [x + w / 2, y], ease.inCubic(k))
        if (k > 0 && k < 1) K.glowCircle(ctx, p[0], p[1], 36, CY, 0.9 * fg)
      }
      ctx.restore()
    }
    ctx.save()
    ctx.globalAlpha = fg * clamp(a) * out
    ctx.translate(0, (1 - clamp(a)) * 30)
    K.pill(ctx, x, y, w, h, { r: 24, fill: "rgba(18,16,40,0.95)", stroke: rgba(V, 0.6), glow: rgba(V, 0.5) })
    // sparkle (LLM)
    const sx = x + 44
    const sy = y + 46
    ctx.fillStyle = "#c4b5fd"
    ctx.beginPath()
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 6 : 20
      const an = (i / 8) * TAU - Math.PI / 2
      ctx.lineTo(sx + Math.cos(an) * r, sy + Math.sin(an) * r)
    }
    ctx.closePath()
    ctx.fill()
    K.text(ctx, K.typed(ANSWER, ramp(K.hold(t), 4.7, 5.6)), x + 82, y + 47, { size: 32, weight: 600, color: "#f5f3ff" })
    // citations
    for (let i = 0; i < 2; i++) {
      const c = ease.outBack(ramp(t, 5.7 + i * 0.15, 6.0 + i * 0.15))
      if (c <= 0) continue
      ctx.save()
      ctx.translate(x + 82 + i * 70 + 28, y + 108)
      ctx.scale(c, c)
      K.pill(ctx, -28, -20, 56, 40, { fill: rgba(CY, 0.2), stroke: rgba(CY, 0.8), r: 10 })
      K.text(ctx, `[${i + 1}]`, 0, 1, { size: 22, weight: 700, font: MONO, color: "#cffafe", align: "center" })
      ctx.restore()
    }
    const g = ease.outBack(ramp(t, 6.1, 6.45))
    if (g > 0) {
      ctx.save()
      ctx.translate(x + w - 130, y + 108)
      ctx.scale(g, g)
      K.pill(ctx, -100, -22, 200, 44, { fill: rgba(OK, 0.18), stroke: rgba(OK, 0.8) })
      K.checkmark(ctx, -70, 0, 28, OK, ramp(t, 6.2, 6.45), 4)
      K.text(ctx, "grounded", 12, 1, { size: 24, weight: 600, color: "#a7f3d0", align: "center" })
      ctx.restore()
    }
    ctx.restore()
  }

  SCENES.rag = {
    duration: T,
    setup,
    draw(ctx, t) {
      K.background(ctx, t, T, CY, V)
      const fg = 1
      drawSpace(ctx, t, fg)
      drawCards(ctx, t, fg)
      drawQuery(ctx, t, 1 - ease.inCubic(ramp(t, 7.05, 7.6)))
      drawAnswer(ctx, t, fg)
      K.frameHud(ctx, "RAG", CY, t, T)
    },
  }
})()
