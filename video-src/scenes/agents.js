// LLMs & AI Agents — a request arrives, the agent reasons, then calls real
// tools one by one (function calling) and reports back.
;(() => {
  const { W, H, TAU, clamp, lerp, ramp, ease, env, rgba, PALETTE: C, FONT, MONO, qbez } = K
  const T = 8
  const V = C.violet
  const CY = C.cyan
  const OK = C.emerald

  const core = [470, 428]
  const tools = [
    { p: [215, 285], icon: "database", label: "Orders DB", fn: "lookup_order(4821)" },
    { p: [725, 285], icon: "card", label: "Payments", fn: "issue_refund($59)" },
    { p: [725, 570], icon: "mail", label: "Email", fn: "send_email(client)" },
    { p: [215, 570], icon: "calendar", label: "Calendar", fn: null },
  ]
  const CALLS = [0, 1, 2]
  const callStart = (i) => 2.35 + i * 1.02
  const PROMPT = "Refund order #4821 and email the customer"
  const DONE = "Refund issued · customer notified"

  function drawCore(ctx, t, fg) {
    const [x, y] = core
    const think = env(t, 1.85, 2.3, 5.6, 6.4)
    const flash = env(t, 1.85, 1.95, 1.95, 2.6)
    const boost = TAU * ease.inOutCubic(ramp(t, 1.8, 7.3))
    const base = (t / T) * TAU * 2 + boost
    const r = 64 + 6 * Math.sin((t / T) * TAU * 4) + 14 * flash

    ctx.save()
    ctx.globalCompositeOperation = "lighter"
    K.glowCircle(ctx, x, y, 260 + 60 * think, V, 0.28 + 0.2 * think)
    K.glowCircle(ctx, x, y, 140, CY, 0.18 + 0.25 * think + 0.4 * flash)
    ctx.restore()

    // Orbit rings with satellites
    const rings = [
      { rx: 150, ry: 46, rot: -0.45, n: 3, sp: 1, col: V },
      { rx: 132, ry: 58, rot: 0.6, n: 2, sp: -1, col: CY },
      { rx: 175, ry: 34, rot: 0.08, n: 4, sp: 2, col: "#c4b5fd" },
    ]
    for (const ring of rings) {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(ring.rot)
      ctx.strokeStyle = rgba(ring.col, 0.22 + 0.25 * think)
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.ellipse(0, 0, ring.rx, ring.ry, 0, 0, TAU)
      ctx.stroke()
      for (let k = 0; k < ring.n; k++) {
        const a = base * ring.sp + (k / ring.n) * TAU
        const px = Math.cos(a) * ring.rx
        const py = Math.sin(a) * ring.ry
        ctx.globalCompositeOperation = "lighter"
        K.glowCircle(ctx, px, py, 22, ring.col, 0.7)
        ctx.fillStyle = "#fff"
        ctx.beginPath()
        ctx.arc(px, py, 4, 0, TAU)
        ctx.fill()
        ctx.globalCompositeOperation = "source-over"
      }
      ctx.restore()
    }

    // Orb
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r)
    g.addColorStop(0, "#ffffff")
    g.addColorStop(0.25, "#ddd6fe")
    g.addColorStop(0.6, V)
    g.addColorStop(1, "#3b1d8f")
    ctx.save()
    ctx.shadowColor = V
    ctx.shadowBlur = 60
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, TAU)
    ctx.fill()
    ctx.restore()

    // Inner neural sparkle: rotating hexagon lattice
    ctx.save()
    ctx.beginPath()
    ctx.arc(x, y, r - 4, 0, TAU)
    ctx.clip()
    ctx.strokeStyle = `rgba(255,255,255,${0.25 + 0.35 * think})`
    ctx.lineWidth = 1.6
    for (let i = 0; i < 6; i++) {
      const a = base * 0.5 + (i / 6) * TAU
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, 3, 0, TAU)
      ctx.fillStyle = "#fff"
      ctx.fill()
    }
    ctx.restore()

    // "reasoning…" label
    const lab = env(t, 1.9, 2.2, 2.4, 2.7)
    if (lab > 0) {
      const dots = ".".repeat(1 + (Math.floor(K.hold(t) * 6) % 3))
      K.text(ctx, "thinking" + dots, x, y + 118, { size: 26, weight: 500, font: MONO, color: "#c4b5fd", align: "center", alpha: lab * fg })
    }
  }

  function toolAnchor(i, from, pad) {
    const [tx, ty] = tools[i].p
    const dx = from[0] - tx
    const dy = from[1] - ty
    const d = Math.hypot(dx, dy)
    return [tx + (dx / d) * pad, ty + (dy / d) * pad]
  }

  function beamCurve(i) {
    const a = toolAnchor(i, tools[i].p, 0)
    const [cx, cy] = core
    const [tx, ty] = tools[i].p
    const d = Math.hypot(tx - cx, ty - cy)
    const s = [cx + ((tx - cx) / d) * 82, cy + ((ty - cy) / d) * 82]
    const e = [tx - ((tx - cx) / d) * 66, ty - ((ty - cy) / d) * 66]
    const mx = (s[0] + e[0]) / 2
    const my = (s[1] + e[1]) / 2
    const nx = -(e[1] - s[1]) / d
    const ny = (e[0] - s[0]) / d
    const c = [mx + nx * 50, my + ny * 50]
    void a
    return [s, c, e]
  }

  function drawBeams(ctx, t, fg) {
    CALLS.forEach((i, n) => {
      const s0 = callStart(n)
      const draw = ease.outCubic(ramp(t, s0, s0 + 0.35))
      if (draw <= 0) return
      const [p0, p1, p2] = beamCurve(i)
      const pts = Array.from({ length: 41 }, (_, k) => qbez(p0, p1, p2, (k / 40) * draw))
      const live = env(t, s0, s0 + 0.2, s0 + 0.95, s0 + 1.4)
      ctx.save()
      ctx.globalAlpha = fg
      ctx.lineCap = "round"
      ctx.strokeStyle = rgba(V, 0.35 + 0.5 * live)
      ctx.lineWidth = 3
      ctx.shadowColor = V
      ctx.shadowBlur = 20 * live
      ctx.beginPath()
      pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
      ctx.stroke()
      // dashed flow overlay
      ctx.setLineDash([6, 16])
      ctx.lineDashOffset = -t * 90
      ctx.strokeStyle = rgba("#ffffff", 0.5 * live)
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.restore()

      // Outbound packet then return packet
      const out = ramp(t, s0 + 0.08, s0 + 0.45)
      const back = ramp(t, s0 + 0.72, s0 + 1.02)
      ctx.save()
      ctx.globalAlpha = fg
      ctx.globalCompositeOperation = "lighter"
      if (out > 0 && out < 1) {
        const p = qbez(p0, p1, p2, ease.inOutCubic(out))
        K.glowCircle(ctx, p[0], p[1], 34, CY, 0.9)
        ctx.fillStyle = "#fff"
        ctx.beginPath()
        ctx.arc(p[0], p[1], 6, 0, TAU)
        ctx.fill()
      }
      if (back > 0 && back < 1) {
        const p = qbez(p0, p1, p2, 1 - ease.inOutCubic(back))
        K.glowCircle(ctx, p[0], p[1], 34, OK, 0.9)
        ctx.fillStyle = "#fff"
        ctx.beginPath()
        ctx.arc(p[0], p[1], 6, 0, TAU)
        ctx.fill()
      }
      ctx.restore()
    })
  }

  function drawTools(ctx, t, fg) {
    tools.forEach((tool, i) => {
      const appear = ease.outBack(ramp(t, 0.7 + i * 0.12, 1.25 + i * 0.12))
      if (appear <= 0) return
      const n = CALLS.indexOf(i)
      const s0 = n >= 0 ? callStart(n) : 99
      const active = n >= 0 ? env(t, s0 + 0.38, s0 + 0.5, s0 + 0.75, s0 + 1.3) : 0
      const done = n >= 0 ? ramp(t, s0 + 0.72, s0 + 0.95) : 0
      const unused = n < 0 ? ramp(t, 2.4, 3) : 0
      const [x, y] = tool.p
      const R = 58
      ctx.save()
      ctx.globalAlpha = fg * clamp(appear) * (1 - 0.55 * unused)
      ctx.translate(x, y)
      ctx.scale(appear, appear)
      if (active > 0) {
        ctx.save()
        ctx.globalCompositeOperation = "lighter"
        K.glowCircle(ctx, 0, 0, 150, done > 0.5 ? OK : CY, 0.45 * active)
        ctx.restore()
        // expanding ping ring
        const pr = ramp(t, s0 + 0.4, s0 + 1.0)
        ctx.strokeStyle = rgba(CY, (1 - pr) * 0.8)
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(0, 0, R + pr * 50, 0, TAU)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(0, 0, R, 0, TAU)
      ctx.fillStyle = "rgba(20,18,40,0.92)"
      ctx.fill()
      const strokeCol = done > 0 ? K.mixColor(CY, OK, done) : K.mixColor("#6b6790", CY, active)
      ctx.strokeStyle = rgba(strokeCol, 0.9)
      ctx.lineWidth = 3
      ctx.stroke()
      K.icon(ctx, tool.icon, 0, 0, 52, done > 0 ? rgba(K.mixColor("#e9e7ff", OK, done), 1) : "#e9e7ff", 5)

      // badge check
      if (done > 0) {
        const b = ease.outBack(done)
        ctx.save()
        ctx.translate(R * 0.72, -R * 0.72)
        ctx.scale(b, b)
        ctx.beginPath()
        ctx.arc(0, 0, 20, 0, TAU)
        ctx.fillStyle = OK
        ctx.shadowColor = OK
        ctx.shadowBlur = 20
        ctx.fill()
        ctx.shadowBlur = 0
        K.checkmark(ctx, 0, 0, 30, "#fff", ramp(t, s0 + 0.8, s0 + 1.0), 4.5)
        ctx.restore()
      }
      ctx.restore()
      K.text(ctx, tool.label, x, y + R + 32, { size: 26, weight: 500, color: "#b9b6d6", align: "center", alpha: fg * Math.pow(clamp(appear), 3) * (1 - 0.55 * unused) })
    })
  }

  function drawTrace(ctx, t, fg) {
    const x = 870
    const y0 = 285
    const head = ramp(t, 2.2, 2.6)
    if (head <= 0) return
    K.text(ctx, "tool calls", x, y0 - 58, { size: 22, weight: 500, font: MONO, color: "#8b89a6", alpha: head * fg })
    CALLS.forEach((i, n) => {
      const s0 = callStart(n)
      const k = ease.outCubic(ramp(t, s0, s0 + 0.35))
      if (k <= 0) return
      const y = y0 + n * 96
      const done = ramp(t, s0 + 0.78, s0 + 0.95)
      ctx.save()
      ctx.globalAlpha = fg * k
      ctx.translate((1 - k) * 60, 0)
      K.pill(ctx, x, y - 34, 360, 68, {
        r: 16,
        fill: "rgba(24,21,48,0.9)",
        stroke: rgba(K.mixColor(V, OK, done), 0.35 + 0.4 * (1 - done) * env(t, s0, s0 + 0.2, s0 + 0.7, s0 + 0.9) + 0.25 * done),
      })
      K.text(ctx, tools[i].fn, x + 24, y + 1, { size: 24, weight: 500, font: MONO, color: "#e9e7ff" })
      const sx = x + 324
      if (done <= 0) {
        ctx.strokeStyle = CY
        ctx.lineWidth = 4
        ctx.lineCap = "round"
        ctx.beginPath()
        const a = t * 9
        ctx.arc(sx, y, 13, a, a + 4.2)
        ctx.stroke()
      } else {
        ctx.fillStyle = rgba(OK, 0.2 * done)
        ctx.beginPath()
        ctx.arc(sx, y, 18, 0, TAU)
        ctx.fill()
        K.checkmark(ctx, sx, y, 30, OK, done, 4.5)
      }
      ctx.restore()
    })
  }

  function drawPrompt(ctx, t, fg) {
    const a = ease.outBack(ramp(t, 0.1, 0.55))
    if (a <= 0) return
    const leave = ease.inCubic(ramp(t, 1.4, 1.8))
    const w = 860
    const h = 76
    const x = W / 2 - w / 2
    const y = 92
    ctx.save()
    ctx.globalAlpha = fg * clamp(a) * (1 - 0.45 * leave)
    ctx.translate(W / 2, y + h / 2)
    ctx.scale(lerp(0.9, 1, clamp(a)), lerp(0.9, 1, clamp(a)))
    ctx.translate(-W / 2, -(y + h / 2))
    K.pill(ctx, x, y, w, h, { fill: "rgba(28,24,56,0.92)", stroke: rgba(V, 0.55), glow: rgba(V, 0.6) })
    ctx.beginPath()
    ctx.arc(x + 40, y + h / 2, 20, 0, TAU)
    ctx.fillStyle = rgba(V, 0.25)
    ctx.fill()
    K.icon(ctx, "user", x + 40, y + h / 2 + 1, 28, "#ddd6fe", 3)
    const str = K.typed(PROMPT, ease.linear(ramp(K.hold(t), 0.35, 1.35)))
    K.text(ctx, str, x + 78, y + h / 2 + 1, { size: 34, weight: 500, color: "#f5f3ff" })
    if (t < 1.5 && Math.floor(K.hold(t) * 4) % 2 === 0) {
      ctx.font = `500 34px ${FONT}`
      const tw = ctx.measureText(str).width
      ctx.fillStyle = "#c4b5fd"
      ctx.fillRect(x + 82 + tw, y + 20, 3, 38)
    }
    ctx.restore()

    // Packet from prompt into the core
    const fly = ramp(t, 1.4, 1.9)
    if (fly > 0 && fly < 1) {
      const p = qbez([W / 2, y + h], [W / 2 - 40, 280], [core[0], core[1] - 70], ease.inCubic(fly))
      ctx.save()
      ctx.globalCompositeOperation = "lighter"
      K.glowCircle(ctx, p[0], p[1], 60, V, 1)
      ctx.fillStyle = "#fff"
      ctx.beginPath()
      ctx.arc(p[0], p[1], 9, 0, TAU)
      ctx.fill()
      ctx.restore()
    }
  }

  function drawDone(ctx, t, fg) {
    const a = ease.outBack(ramp(t, 5.55, 6.0))
    if (a <= 0) return
    const w = 700
    const h = 78
    const x = W / 2 - w / 2
    const y = 700
    ctx.save()
    ctx.globalAlpha = fg * clamp(a)
    ctx.translate(0, (1 - clamp(a)) * 30)
    K.pill(ctx, x, y, w, h, { fill: "rgba(16,40,36,0.92)", stroke: rgba(OK, 0.7), glow: rgba(OK, 0.55) })
    ctx.beginPath()
    ctx.arc(x + 40, y + h / 2, 22, 0, TAU)
    ctx.fillStyle = OK
    ctx.fill()
    K.checkmark(ctx, x + 40, y + h / 2, 32, "#fff", ramp(t, 5.7, 5.95), 5)
    K.text(ctx, K.typed(DONE, ramp(K.hold(t), 5.75, 6.35)), x + 80, y + h / 2 + 1, { size: 32, weight: 600, color: "#ecfdf5" })
    ctx.restore()
  }

  SCENES.agents = {
    duration: T,
    draw(ctx, t) {
      K.background(ctx, t, T, V, CY)
      const fg = 1 - ease.inOutCubic(ramp(t, 7.2, 7.85))
      drawBeams(ctx, t, fg)
      drawTools(ctx, t, fg)
      drawCore(ctx, t, fg)
      drawTrace(ctx, t, fg)
      drawPrompt(ctx, t, fg)
      drawDone(ctx, t, fg)
      K.frameHud(ctx, "AI AGENT", V, t, T)
    },
  }
})()
