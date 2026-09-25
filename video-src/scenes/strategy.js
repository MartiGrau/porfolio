// AI Strategy & Leadership — scattered ideas and open questions are pulled
// into one clear roadmap that a team executes toward business value.
;(() => {
  const { W, H, TAU, clamp, lerp, ramp, ease, env, rgba, PALETTE: C, MONO } = K
  const T = 8
  const AM = C.amber
  const YE = "#facc15"
  const V = C.violet

  const P0 = [190, 630]
  const P1 = [560, 650]
  const P2 = [700, 270]
  const P3 = [1090, 235]
  let path = []
  let particles = []
  const MILESTONES = [
    { u: 0.07, label: "Discover", icon: "search", q: "Q1" },
    { u: 0.38, label: "Pilot", icon: "bolt", q: "Q2" },
    { u: 0.66, label: "Scale", icon: "rocket", q: "Q3" },
    { u: 0.97, label: "Impact", icon: "target", q: "Q4" },
  ]
  const CHIPS = ["use cases?", "data", "costs", "risks", "LLMs", "teams"]
  const TEAM = [
    { label: "Data", col: C.cyan },
    { label: "Eng", col: V },
    { label: "Product", col: C.pink },
  ]

  const converge = (t) => ease.inOutCubic(ramp(t, 1.5, 2.75)) * (1 - ease.inOutCubic(ramp(t, 6.7, 7.7)))
  const pathDraw = (t) => ease.inOutCubic(ramp(t, 2.2, 3.4))

  function setup() {
    path = K.sampleBez(P0, P1, P2, P3, 120)
    const r = K.rng(31)
    particles = Array.from({ length: 170 }, (_, i) => ({
      base: [120 + r() * (W - 240), 150 + r() * (H - 270)],
      a1: 40 + r() * 90,
      a2: 30 + r() * 80,
      f1: 1 + Math.floor(r() * 2),
      f2: 1 + Math.floor(r() * 3),
      p1: r() * TAU,
      p2: r() * TAU,
      u: r(),
      off: (r() - 0.5) * 34,
      size: 2 + r() * 3,
      warm: r() < 0.55,
      i,
    }))
  }

  const chaosPos = (p, t) => {
    const ph = (t / T) * TAU
    return [p.base[0] + Math.sin(ph * p.f1 + p.p1) * p.a1, p.base[1] + Math.cos(ph * p.f2 + p.p2) * p.a2]
  }
  const normalAt = (u) => {
    const a = K.along(path, clamp(u - 0.005))
    const b = K.along(path, clamp(u + 0.005))
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    return [-(b[1] - a[1]) / d, (b[0] - a[0]) / d]
  }
  const flowPos = (p, t) => {
    const u = (p.u + Math.max(0, t - 2.75) * 0.085) % 1
    const q = K.along(path, u)
    const n = normalAt(u)
    const off = p.off * (0.35 + 0.65 * Math.sin(u * Math.PI))
    return [q[0] + n[0] * off, q[1] + n[1] * off]
  }

  function drawParticles(ctx, t, fg) {
    const k = converge(t)
    const chaosLinks = 1 - k
    const pos = particles.map((p) => {
      const a = chaosPos(p, t)
      const b = flowPos(p, t)
      // stagger so they don't all move at once
      const kk = clamp(k * 1.3 - (p.i % 10) * 0.03)
      return [lerp(a[0], b[0], ease.inOutCubic(kk)), lerp(a[1], b[1], ease.inOutCubic(kk))]
    })
    // tangled connections while in chaos
    if (chaosLinks > 0.02) {
      ctx.save()
      ctx.lineWidth = 1.2
      for (let i = 0; i < pos.length; i += 2) {
        for (let j = i + 1; j < pos.length; j += 3) {
          const dx = pos[i][0] - pos[j][0]
          const dy = pos[i][1] - pos[j][1]
          const d2 = dx * dx + dy * dy
          if (d2 > 110 * 110) continue
          ctx.strokeStyle = `rgba(250,204,21,${(1 - Math.sqrt(d2) / 110) * 0.22 * chaosLinks * fg})`
          ctx.beginPath()
          ctx.moveTo(pos[i][0], pos[i][1])
          ctx.lineTo(pos[j][0], pos[j][1])
          ctx.stroke()
        }
      }
      ctx.restore()
    }
    ctx.save()
    ctx.globalCompositeOperation = "lighter"
    particles.forEach((p, i) => {
      const [x, y] = pos[i]
      const col = p.warm ? AM : k > 0.5 ? YE : "#a8a4c8"
      K.glowCircle(ctx, x, y, p.size * 4, col, 0.55 * fg)
      ctx.fillStyle = rgba(col, 0.9 * fg)
      ctx.beginPath()
      ctx.arc(x, y, p.size * 0.7, 0, TAU)
      ctx.fill()
    })
    ctx.restore()
  }

  function drawPath(ctx, t, fg) {
    const d = pathDraw(t)
    const out = 1 - ease.inCubic(ramp(t, 6.7, 7.4))
    if (d <= 0 || out <= 0) return
    // value area under the curve
    const area = ease.inOutCubic(ramp(t, 3.3, 5.2)) * out
    if (area > 0) {
      ctx.save()
      const n = Math.floor(path.length * area)
      const g = ctx.createLinearGradient(0, 230, 0, 700)
      g.addColorStop(0, rgba(AM, 0.28 * fg))
      g.addColorStop(1, rgba(AM, 0))
      ctx.beginPath()
      ctx.moveTo(path[0][0], 700)
      for (let i = 0; i < Math.max(2, n); i++) ctx.lineTo(path[i][0], path[i][1])
      ctx.lineTo(path[Math.max(1, n - 1)][0], 700)
      ctx.closePath()
      ctx.fillStyle = g
      ctx.fill()
      ctx.restore()
    }
    ctx.save()
    ctx.globalAlpha = fg * out
    ctx.lineCap = "round"
    ctx.strokeStyle = rgba(AM, 0.35)
    ctx.lineWidth = 14
    K.partialPath(ctx, path, d)
    ctx.stroke()
    ctx.shadowColor = AM
    ctx.shadowBlur = 24
    ctx.strokeStyle = YE
    ctx.lineWidth = 4
    const head = K.partialPath(ctx, path, d)
    ctx.stroke()
    ctx.restore()
    // arrow head at the end
    if (d >= 1) {
      const e = path[path.length - 1]
      const p = path[path.length - 4]
      const ang = Math.atan2(e[1] - p[1], e[0] - p[0])
      ctx.save()
      ctx.globalAlpha = fg * out
      ctx.translate(e[0] + Math.cos(ang) * 30, e[1] + Math.sin(ang) * 30)
      ctx.rotate(ang)
      ctx.fillStyle = YE
      ctx.shadowColor = AM
      ctx.shadowBlur = 20
      ctx.beginPath()
      ctx.moveTo(16, 0)
      ctx.lineTo(-10, -13)
      ctx.lineTo(-10, 13)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    } else if (head) {
      ctx.save()
      ctx.globalCompositeOperation = "lighter"
      K.glowCircle(ctx, head[0], head[1], 50, YE, fg)
      ctx.restore()
    }
  }

  function drawMilestones(ctx, t, fg) {
    const out = 1 - ease.inCubic(ramp(t, 6.65, 7.3))
    MILESTONES.forEach((m, i) => {
      const s = 2.5 + i * 0.3
      const a = ease.outBack(ramp(t, s, s + 0.45))
      if (a <= 0 || out <= 0) return
      const [x, y] = K.along(path, m.u)
      const active = env(t, s, s + 0.2, s + 0.25, s + 1.2)
      ctx.save()
      ctx.globalAlpha = fg * out
      ctx.translate(x, y)
      ctx.scale(a, a)
      if (active > 0) {
        ctx.globalCompositeOperation = "lighter"
        K.glowCircle(ctx, 0, 0, 110, AM, 0.6 * active)
        ctx.globalCompositeOperation = "source-over"
        ctx.strokeStyle = rgba(YE, (1 - ramp(t, s + 0.1, s + 1)) * 0.8)
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(0, 0, 40 + ramp(t, s + 0.1, s + 1) * 50, 0, TAU)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(0, 0, 40, 0, TAU)
      ctx.fillStyle = "#1c1508"
      ctx.fill()
      ctx.lineWidth = 4
      ctx.strokeStyle = YE
      ctx.shadowColor = AM
      ctx.shadowBlur = 20
      ctx.stroke()
      ctx.shadowBlur = 0
      K.icon(ctx, m.icon, 0, 0, 40, "#fef3c7", 4)
      ctx.restore()

      // label above (or below for the first)
      const la = ramp(t, s + 0.15, s + 0.5) * out
      if (la > 0) {
        const below = i === 0
        const ly = below ? y + 76 : y - 84
        ctx.save()
        ctx.globalAlpha = fg * la
        ctx.translate(0, (1 - la) * (below ? -12 : 12))
        K.text(ctx, m.q, x, ly - 20, { size: 20, weight: 600, font: MONO, color: "#fcd34d", align: "center" })
        K.text(ctx, m.label, x, ly + 12, { size: 32, weight: 700, color: "#fffbeb", align: "center" })
        ctx.restore()
      }
    })
  }

  function drawChips(ctx, t, fg) {
    const r = K.rng(2)
    CHIPS.forEach((c, i) => {
      const bx = 180 + r() * 880
      const by = 170 + r() * 420
      const ph = r() * TAU
      const appear = ease.outBack(ramp(t, 0.1 + i * 0.1, 0.5 + i * 0.1))
      const leave = ease.inCubic(ramp(t, 1.4 + i * 0.05, 2.2 + i * 0.05))
      const vis = appear * (1 - leave)
      if (vis <= 0.01) return
      const p = (t / T) * TAU
      let x = bx + Math.sin(p * 2 + ph) * 40
      let y = by + Math.cos(p * 1 + ph) * 30
      // fly into a milestone as they vanish
      if (i < MILESTONES.length) {
        const m = K.along(path, MILESTONES[i].u)
        x = lerp(x, m[0], leave)
        y = lerp(y, m[1], leave)
      }
      ctx.save()
      ctx.globalAlpha = fg * clamp(vis)
      ctx.translate(x, y)
      ctx.rotate(Math.sin(p + ph) * 0.08 * (1 - leave))
      ctx.scale(clamp(appear) * (1 - leave * 0.6), clamp(appear) * (1 - leave * 0.6))
      ctx.font = `600 26px ${K.FONT}`
      const w = ctx.measureText(c).width + 40
      K.pill(ctx, -w / 2, -24, w, 48, { fill: "rgba(40,32,12,0.85)", stroke: "rgba(250,204,21,0.45)" })
      K.text(ctx, c, 0, 1, { size: 26, weight: 600, color: "#fef3c7", align: "center" })
      ctx.restore()
    })
  }

  function drawTeam(ctx, t, fg) {
    const out = 1 - ease.inCubic(ramp(t, 6.6, 7.2))
    const start = K.along(path, MILESTONES[0].u)
    TEAM.forEach((m, i) => {
      const s = 3.3 + i * 0.12
      const a = ease.outBack(ramp(t, s, s + 0.4))
      if (a <= 0 || out <= 0) return
      const x = 150 + i * 120
      const y = 420
      // link into the first milestone
      ctx.save()
      ctx.globalAlpha = fg * out * clamp(a)
      ctx.strokeStyle = rgba(m.col, 0.55)
      ctx.lineWidth = 2.5
      ctx.setLineDash([6, 10])
      ctx.lineDashOffset = -t * 50
      ctx.beginPath()
      ctx.moveTo(x, y + 36)
      ctx.quadraticCurveTo(x, start[1] - 60, start[0], start[1] - 42)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.translate(x, y)
      ctx.scale(a, a)
      ctx.beginPath()
      ctx.arc(0, 0, 34, 0, TAU)
      ctx.fillStyle = "#15131f"
      ctx.fill()
      ctx.strokeStyle = m.col
      ctx.lineWidth = 3.5
      ctx.stroke()
      K.icon(ctx, "user", 0, 2, 34, "#fff", 3.5)
      ctx.restore()
      K.text(ctx, m.label, x, y - 56, { size: 22, weight: 600, font: MONO, color: rgba(m.col, 1), align: "center", alpha: fg * out * clamp(a) })
    })
  }

  function drawValue(ctx, t, fg) {
    const a = ease.outBack(ramp(t, 4.6, 5.05))
    const out = 1 - ease.inCubic(ramp(t, 6.6, 7.1))
    if (a <= 0 || out <= 0) return
    const x = 900
    const y = 470
    ctx.save()
    ctx.globalAlpha = fg * out * clamp(a)
    ctx.translate(x, y)
    ctx.scale(clamp(a) * 0.15 + 0.85, clamp(a) * 0.15 + 0.85)
    K.pill(ctx, 0, -60, 300, 120, { r: 24, fill: "rgba(40,30,8,0.92)", stroke: rgba(YE, 0.8), glow: rgba(AM, 0.6) })
    K.text(ctx, "business value", 26, -26, { size: 22, weight: 500, font: MONO, color: "#fcd34d" })
    const v = Math.round(lerp(1, 3, ease.outExpo(ramp(K.hold(t), 4.75, 5.8))) * 10) / 10
    K.text(ctx, `${v.toFixed(1)}×`, 26, 22, { size: 54, weight: 800, color: "#fffbeb" })
    K.icon(ctx, "chart", 240, 18, 56, YE, 5)
    ctx.restore()
  }

  SCENES.strategy = {
    duration: T,
    setup,
    draw(ctx, t) {
      K.background(ctx, t, T, AM, V)
      const fg = 1
      drawPath(ctx, t, fg)
      drawParticles(ctx, t, fg)
      drawTeam(ctx, t, fg)
      drawMilestones(ctx, t, fg)
      drawChips(ctx, t, fg)
      drawValue(ctx, t, fg)
      K.frameHud(ctx, "AI STRATEGY", AM, t, T)
    },
  }
})()
