// MLOps & Cloud — code is containerized, deployed, and the service auto-scales
// as traffic surges, keeping latency flat.
;(() => {
  const { W, H, TAU, clamp, lerp, ramp, ease, env, rgba, PALETTE: C, MONO } = K
  const T = 8
  const OR = C.orange
  const AM = C.amber
  const CY = C.cyan

  const O = [560, 462]
  const S = 74
  const iso = (x, y, z = 0) => [O[0] + (x - y) * 0.866 * S, O[1] + (x + y) * 0.5 * S - z * S]

  const SLOTS = [
    [0, -0.65],
    [0, 0.65],
    [1.3, -0.65],
    [-1.3, 0.65],
    [1.3, 0.65],
    [-1.3, -0.65],
  ]
  const UP = [1.65, 3.0, 3.45, 3.9, 4.3, 4.7]
  const DOWN = [7.25, 6.75, 6.55, 6.35, 6.15, 5.95]
  const GATE = [-3.1, 1.9]
  let particles = []

  const rate = (t) => {
    if (t < 1.8 || t > 7.1) return 0
    const surge = env(t, 2.6, 4.4, 5.3, 6.6, ease.inOutCubic, ease.inOutCubic)
    return 5 + 55 * surge
  }
  const replicas = (t) => SLOTS.filter((_, i) => t >= UP[i] && t < DOWN[i]).length

  function setup() {
    particles = []
    const r = K.rng(21)
    let rr = 0
    for (let t = 1.8; t < 7.1; t += 1 / 240) {
      if (r() < rate(t) / 240) {
        const active = SLOTS.map((_, i) => i).filter((i) => t + 0.5 >= UP[i] + 0.25 && t + 0.5 < DOWN[i])
        if (!active.length) continue
        const slot = active[rr++ % active.length]
        particles.push({ t0: t, slot, lane: (r() - 0.5) * 50, hue: r() })
      }
    }
  }

  function face(ctx, pts, fill, stroke) {
    ctx.beginPath()
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()
    if (stroke) {
      ctx.strokeStyle = stroke
      ctx.stroke()
    }
  }

  // Server cube centered at (x,y) with footprint s and height h
  function cube(ctx, x, y, z, s, h, t, hit, idx) {
    const a = s / 2
    const P = (dx, dy, dz) => iso(x + dx, y + dy, z + dz)
    ctx.save()
    ctx.lineWidth = 1.5
    ctx.lineJoin = "round"
    const edge = rgba(K.mixColor(OR, "#fff", hit * 0.6), 0.9)
    face(ctx, [P(-a, a, 0), P(a, a, 0), P(a, a, h), P(-a, a, h)], rgba(K.mixColor("#7c2d12", OR, 0.25 + hit * 0.3), 1), edge)
    face(ctx, [P(a, -a, 0), P(a, a, 0), P(a, a, h), P(a, -a, h)], rgba(K.mixColor("#431407", "#9a3412", 0.4 + hit * 0.3), 1), edge)
    face(ctx, [P(-a, -a, h), P(a, -a, h), P(a, a, h), P(-a, a, h)], rgba(K.mixColor("#fb923c", "#fed7aa", hit * 0.7), 1), edge)
    // rack slots with LEDs on the left face
    for (let k = 0; k < 3; k++) {
      const zz = h * (0.25 + k * 0.25)
      const p0 = P(-a * 0.8, a, zz)
      const p1 = P(a * 0.35, a, zz)
      ctx.strokeStyle = "rgba(255,237,213,0.35)"
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(p0[0], p0[1])
      ctx.lineTo(p1[0], p1[1])
      ctx.stroke()
      const led = P(a * 0.62, a, zz)
      const on = 0.5 + 0.5 * Math.sin((t / T) * TAU * (6 + k * 2) + idx * 1.7 + k)
      ctx.fillStyle = on > 0.5 || hit > 0.3 ? "#86efac" : "rgba(134,239,172,0.3)"
      ctx.beginPath()
      ctx.arc(led[0], led[1], 3.5, 0, TAU)
      ctx.fill()
    }
    // logo mark on top: a little stacked-box glyph
    const c = P(0, 0, h)
    ctx.strokeStyle = "rgba(67,20,7,0.7)"
    ctx.lineWidth = 3
    ctx.beginPath()
    const q = s * 0.22
    const A = iso(x - q, y - q, z + h)
    const B = iso(x + q, y - q, z + h)
    const Cc = iso(x + q, y + q, z + h)
    const D = iso(x - q, y + q, z + h)
    ctx.moveTo(A[0], A[1])
    ctx.lineTo(B[0], B[1])
    ctx.lineTo(Cc[0], Cc[1])
    ctx.lineTo(D[0], D[1])
    ctx.closePath()
    ctx.stroke()
    void c
    ctx.restore()
  }

  function platform(ctx, t) {
    const X0 = -3.2
    const X1 = 3.2
    const Y0 = -2.2
    const Y1 = 2.2
    const th = 0.28
    ctx.save()
    // glow under
    ctx.globalCompositeOperation = "lighter"
    const c = iso(0, 0, 0)
    ctx.save()
    ctx.translate(c[0], c[1] + 20)
    ctx.scale(1, 0.55)
    K.glowCircle(ctx, 0, 0, 460, OR, 0.22)
    ctx.restore()
    ctx.globalCompositeOperation = "source-over"
    face(ctx, [iso(X0, Y1, 0), iso(X1, Y1, 0), iso(X1, Y1, -th), iso(X0, Y1, -th)], "#1a1330")
    face(ctx, [iso(X1, Y0, 0), iso(X1, Y1, 0), iso(X1, Y1, -th), iso(X1, Y0, -th)], "#110c22")
    face(ctx, [iso(X0, Y0, 0), iso(X1, Y0, 0), iso(X1, Y1, 0), iso(X0, Y1, 0)], "#161130")
    // grid
    ctx.strokeStyle = "rgba(251,146,60,0.13)"
    ctx.lineWidth = 1.5
    for (let x = X0; x <= X1 + 1e-6; x += 0.8) {
      const a = iso(x, Y0)
      const b = iso(x, Y1)
      ctx.beginPath()
      ctx.moveTo(a[0], a[1])
      ctx.lineTo(b[0], b[1])
      ctx.stroke()
    }
    for (let y = Y0; y <= Y1 + 1e-6; y += 0.8) {
      const a = iso(X0, y)
      const b = iso(X1, y)
      ctx.beginPath()
      ctx.moveTo(a[0], a[1])
      ctx.lineTo(b[0], b[1])
      ctx.stroke()
    }
    // edge light
    ctx.strokeStyle = rgba(OR, 0.6)
    ctx.lineWidth = 2
    ctx.shadowColor = OR
    ctx.shadowBlur = 16
    ctx.beginPath()
    ;[iso(X0, Y0), iso(X1, Y0), iso(X1, Y1), iso(X0, Y1)].forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
    ctx.closePath()
    ctx.stroke()
    ctx.restore()
    void t
  }

  function gateway(ctx, t, fg) {
    const [gx, gy] = GATE
    const on = ramp(t, 1.5, 1.9) * (1 - ramp(t, 7.3, 7.8))
    if (on <= 0) return
    const c = iso(gx, gy, 0.02)
    ctx.save()
    ctx.globalAlpha = on * fg
    ctx.translate(c[0], c[1])
    ctx.scale(1, 0.58)
    ctx.rotate((t / T) * TAU)
    ctx.strokeStyle = CY
    ctx.lineWidth = 4
    ctx.shadowColor = CY
    ctx.shadowBlur = 20
    ctx.setLineDash([22, 12])
    ctx.beginPath()
    ctx.arc(0, 0, 44, 0, TAU)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.arc(0, 0, 24, 0, TAU)
    ctx.fillStyle = rgba(CY, 0.35)
    ctx.fill()
    ctx.restore()
    K.text(ctx, "load balancer", c[0], c[1] + 52, { size: 22, weight: 500, font: MONO, color: "#a5f3fc", align: "center", alpha: on * fg * 0.9 })
  }

  function particlePath(p) {
    const g = iso(GATE[0], GATE[1], 0.25)
    const [sx, sy] = SLOTS[p.slot]
    const e = iso(sx, sy, 0.95)
    const s0 = [-40, g[1] - 40 + p.lane]
    return { s0, g, e }
  }

  function drawParticles(ctx, t, fg, hits) {
    ctx.save()
    ctx.globalCompositeOperation = "lighter"
    for (const p of particles) {
      const age = t - p.t0
      if (age < 0 || age > 0.95) continue
      const { s0, g, e } = particlePath(p)
      let pos
      let trailFrom
      if (age < 0.4) {
        const k = ease.linear(age / 0.4)
        pos = [lerp(s0[0], g[0], k), lerp(s0[1], g[1], k)]
        trailFrom = [lerp(s0[0], g[0], Math.max(0, k - 0.18)), lerp(s0[1], g[1], Math.max(0, k - 0.18))]
      } else {
        const k = ease.inOutQuad((age - 0.4) / 0.55)
        const c = [(g[0] + e[0]) / 2, Math.min(g[1], e[1]) - 90]
        pos = K.qbez(g, c, e, k)
        trailFrom = K.qbez(g, c, e, Math.max(0, k - 0.12))
      }
      const col = p.hue < 0.5 ? CY : "#fdba74"
      ctx.strokeStyle = rgba(col, 0.5 * fg)
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(trailFrom[0], trailFrom[1])
      ctx.lineTo(pos[0], pos[1])
      ctx.stroke()
      K.glowCircle(ctx, pos[0], pos[1], 16, col, 0.9 * fg)
      if (age > 0.85) hits[p.slot] = Math.max(hits[p.slot], 1 - (age - 0.85) / 0.1)
    }
    ctx.restore()
  }

  function drawCubes(ctx, t, fg, hits) {
    const order = SLOTS.map((s, i) => i).sort((a, b) => SLOTS[a][0] + SLOTS[a][1] - (SLOTS[b][0] + SLOTS[b][1]))
    for (const i of order) {
      const up = ramp(t, UP[i], UP[i] + 0.45)
      const down = ramp(t, DOWN[i], DOWN[i] + 0.35)
      if (up <= 0 || down >= 1) continue
      const [x, y] = SLOTS[i]
      const hgt = 0.95 * (i === 0 ? 1 : ease.outBack(up)) * (1 - ease.inCubic(down))
      const drop = i === 0 ? (1 - ease.outCubic(up)) * 0 : 0
      // landing ripple
      const rip = ramp(t, UP[i] + (i === 0 ? 0.05 : 0), UP[i] + 0.8)
      if (rip > 0 && rip < 1) {
        const c = iso(x, y, 0)
        ctx.save()
        ctx.translate(c[0], c[1])
        ctx.scale(1, 0.58)
        ctx.strokeStyle = rgba(OR, (1 - rip) * 0.9 * fg)
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(0, 0, 40 + rip * 90, 0, TAU)
        ctx.stroke()
        ctx.restore()
      }
      if (hgt <= 0.01) continue
      ctx.save()
      ctx.globalAlpha = fg
      const hit = clamp(hits[i] || 0) + (i === 0 ? 0 : env(t, UP[i], UP[i] + 0.1, UP[i] + 0.1, UP[i] + 0.6))
      cube(ctx, x, y, drop, 0.95, hgt, t, clamp(hit), i)
      ctx.restore()
    }
  }

  // Intro: code card → container → lands on slot 0
  function drawBuild(ctx, t, fg) {
    const card = env(t, 0.08, 0.45, 0.8, 1.05)
    const cx = 250
    const cy = 250
    if (card > 0) {
      ctx.save()
      ctx.globalAlpha = card * fg
      const sc = lerp(0.85, 1, card)
      ctx.translate(cx, cy)
      ctx.scale(sc, sc)
      K.pill(ctx, -130, -85, 260, 170, { r: 18, fill: "rgba(28,20,40,0.95)", stroke: rgba(OR, 0.6), glow: rgba(OR, 0.35) })
      const cols = ["#fdba74", "#a5f3fc", "#e9d5ff", "#fdba74", "#a5f3fc"]
      const lens = [150, 110, 170, 90, 130]
      for (let i = 0; i < 5; i++) {
        const k = ramp(t, 0.2 + i * 0.07, 0.45 + i * 0.07)
        ctx.fillStyle = rgba(cols[i], 0.75)
        K.roundRect(ctx, -100 + (i % 2) * 20, -58 + i * 26, lens[i] * k, 10, 5)
        ctx.fill()
      }
      ctx.restore()
      K.icon(ctx, "code", cx - 96, cy - 104, 30, rgba("#fdba74", card * fg), 3)
    }
    // container cube flies to slot 0
    const f = ramp(t, 0.8, 1.65)
    if (f > 0 && f < 1) {
      const end = iso(SLOTS[0][0], SLOTS[0][1], 0)
      const k = ease.inOutCubic(f)
      const p = K.qbez([cx, cy + 40], [cx + 120, 40], end, k)
      const scl = lerp(1.25, 1, k)
      ctx.save()
      ctx.globalAlpha = fg
      ctx.translate(p[0] - end[0], p[1] - end[1])
      ctx.translate(end[0], end[1])
      ctx.scale(scl, scl)
      ctx.rotate(Math.sin(k * Math.PI) * 0.25)
      ctx.translate(-end[0], -end[1])
      cube(ctx, SLOTS[0][0], SLOTS[0][1], 0, 0.95, 0.95, t, 0.4, 0)
      ctx.restore()
    }
    const chip = env(t, 0.75, 0.95, 1.45, 1.75)
    if (chip > 0) {
      ctx.save()
      ctx.globalAlpha = chip * fg
      K.pill(ctx, cx - 120, cy + 110, 240, 48, { fill: "rgba(40,20,10,0.9)", stroke: rgba(OR, 0.8) })
      K.checkmark(ctx, cx - 92, cy + 134, 26, "#86efac", ramp(t, 0.85, 1.05), 4)
      K.text(ctx, "docker build", cx + 12, cy + 135, { size: 22, weight: 600, font: MONO, color: "#ffedd5", align: "center" })
      ctx.restore()
    }
  }

  function drawMetrics(ctx, t, fg) {
    const a = ease.outCubic(ramp(t, 1.7, 2.2)) * (1 - ease.inCubic(ramp(t, 7.2, 7.7)))
    if (a <= 0) return
    const x = 952
    const y = 120
    const w = 290
    ctx.save()
    ctx.globalAlpha = a * fg
    ctx.translate((1 - a) * 40, 0)
    K.pill(ctx, x, y, w, 420, { r: 22, fill: "rgba(20,14,34,0.88)", stroke: "rgba(255,255,255,0.12)" })
    const rows = [
      { label: "requests / s", value: (() => {
        const v = rate(K.hold(t)) * 82
        return v >= 1000 ? (v / 1000).toFixed(1) + "k" : String(Math.round(v))
      })(), col: "#fff" },
      { label: "replicas", value: String(replicas(K.hold(t))), col: "#fdba74" },
      { label: "p95 latency", value: `${Math.round(41 + 3 * Math.sin(Math.floor(K.hold(t) * 4) * 1.7))} ms`, col: "#86efac" },
    ]
    rows.forEach((r, i) => {
      const yy = y + 50 + i * 104
      K.text(ctx, r.label, x + 26, yy, { size: 20, weight: 500, font: MONO, color: "#9c98b8" })
      K.text(ctx, r.value, x + 26, yy + 44, { size: 46, weight: 700, color: r.col })
    })
    // replica pips
    for (let i = 0; i < 6; i++) {
      const on = i < replicas(K.hold(t))
      ctx.fillStyle = on ? OR : "rgba(255,255,255,0.12)"
      K.roundRect(ctx, x + 150 + i * 20, y + 50 + 104 + 30, 14, 26, 4)
      ctx.fill()
    }
    // sparkline of traffic
    const gx = x + 26
    const gy = y + 390
    const gw = w - 52
    const gh = 62
    ctx.strokeStyle = "rgba(255,255,255,0.1)"
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(gx, gy)
    ctx.lineTo(gx + gw, gy)
    ctx.stroke()
    const pts = []
    const t0 = 1.7
    const t1 = 7.2
    for (let k = 0; k <= 80; k++) {
      const tt = lerp(t0, t1, k / 80)
      if (tt > t) break
      pts.push([gx + (gw * k) / 80, gy - (rate(tt) / 60) * gh - 3])
    }
    if (pts.length > 1) {
      const grad = ctx.createLinearGradient(0, gy - gh, 0, gy)
      grad.addColorStop(0, rgba(OR, 0.45))
      grad.addColorStop(1, rgba(OR, 0))
      ctx.beginPath()
      ctx.moveTo(pts[0][0], gy)
      pts.forEach((p) => ctx.lineTo(p[0], p[1]))
      ctx.lineTo(pts[pts.length - 1][0], gy)
      ctx.closePath()
      ctx.fillStyle = grad
      ctx.fill()
      ctx.beginPath()
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
      ctx.strokeStyle = OR
      ctx.lineWidth = 3
      ctx.stroke()
      const hd = pts[pts.length - 1]
      K.glowCircle(ctx, hd[0], hd[1], 16, OR, 0.9)
    }
    ctx.restore()

    // auto-scaling banner
    const b = env(t, 3.0, 3.25, 4.9, 5.2)
    if (b > 0) {
      ctx.save()
      ctx.globalAlpha = b * fg
      const bx = 430
      const by = 118
      K.pill(ctx, bx, by, 300, 52, { fill: "rgba(60,26,6,0.9)", stroke: rgba(OR, 0.9), glow: rgba(OR, 0.6) })
      K.icon(ctx, "bolt", bx + 34, by + 26, 30, "#fed7aa", 3.2)
      K.text(ctx, "auto-scaling", bx + 60, by + 27, { size: 26, weight: 600, color: "#ffedd5" })
      K.text(ctx, "↑", bx + 268, by + 26, { size: 30, weight: 700, color: OR, align: "center" })
      ctx.restore()
    }
  }

  SCENES.mlops = {
    duration: T,
    setup,
    draw(ctx, t) {
      K.background(ctx, t, T, OR, AM)
      const fg = 1
      platform(ctx, t)
      gateway(ctx, t, fg)
      const hits = {}
      // particles behind the cubes first, then cubes, so dots dive into their tops
      drawParticles(ctx, t, fg, hits)
      drawCubes(ctx, t, fg, hits)
      drawBuild(ctx, t, fg)
      drawMetrics(ctx, t, fg)
      K.frameHud(ctx, "MLOPS", OR, t, T)
    },
  }
})()
