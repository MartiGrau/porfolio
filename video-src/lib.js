// Shared motion-graphics toolkit for the capability videos.
// Every scene is a pure function of time `t`, so frames are deterministic
// and the renderer can step through them one by one.
;(() => {
  const W = 1280
  const H = 800
  const FPS = 30
  const TAU = Math.PI * 2

  // ---------- math ----------
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
  const lerp = (a, b, k) => a + (b - a) * k
  const ramp = (t, a, b) => clamp((t - a) / (b - a))
  const mix = (p, q, k) => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)]

  const ease = {
    linear: (x) => x,
    inQuad: (x) => x * x,
    outQuad: (x) => 1 - (1 - x) * (1 - x),
    inOutQuad: (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
    outCubic: (x) => 1 - Math.pow(1 - x, 3),
    inCubic: (x) => x * x * x,
    inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    outQuart: (x) => 1 - Math.pow(1 - x, 4),
    outExpo: (x) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x)),
    inExpo: (x) => (x === 0 ? 0 : Math.pow(2, 10 * x - 10)),
    inOutExpo: (x) =>
      x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2,
    outBack: (x) => {
      const c1 = 1.70158
      const c3 = c1 + 1
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
    },
    outElastic: (x) =>
      x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
  }

  // In/out envelope: 0 before a, rises until b, holds, falls from c to d.
  const env = (t, a, b, c, d, e = ease.outCubic, e2 = ease.inCubic) => {
    if (t < a || t > d) return 0
    if (t < b) return e(ramp(t, a, b))
    if (t <= c) return 1
    return 1 - e2(ramp(t, c, d))
  }

  function rng(seed) {
    let s = seed >>> 0
    return () => {
      s = (s + 0x6d2b79f5) >>> 0
      let r = Math.imul(s ^ (s >>> 15), 1 | s)
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296
    }
  }

  // Value noise (smooth, cheap) in 2D
  function makeNoise(seed = 1) {
    const r = rng(seed)
    const perm = new Uint8Array(512)
    const vals = new Float32Array(256)
    for (let i = 0; i < 256; i++) {
      perm[i] = i
      vals[i] = r()
    }
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1))
      ;[perm[i], perm[j]] = [perm[j], perm[i]]
    }
    for (let i = 0; i < 256; i++) perm[i + 256] = perm[i]
    const sm = (x) => x * x * (3 - 2 * x)
    const n2 = (x, y) => {
      const xi = Math.floor(x)
      const yi = Math.floor(y)
      const xf = x - xi
      const yf = y - yi
      const X = xi & 255
      const Y = yi & 255
      const a = vals[perm[perm[X] + Y]]
      const b = vals[perm[perm[X + 1] + Y]]
      const c = vals[perm[perm[X] + Y + 1]]
      const d = vals[perm[perm[X + 1] + Y + 1]]
      const u = sm(xf)
      const v = sm(yf)
      return lerp(lerp(a, b, u), lerp(c, d, u), v)
    }
    const fbm = (x, y, oct = 5) => {
      let s = 0
      let amp = 0.5
      let f = 1
      for (let i = 0; i < oct; i++) {
        s += amp * n2(x * f, y * f)
        f *= 2
        amp *= 0.5
      }
      return s
    }
    return { n2, fbm }
  }

  // Cubic bezier point
  const bez = (p0, p1, p2, p3, k) => {
    const u = 1 - k
    return [
      u * u * u * p0[0] + 3 * u * u * k * p1[0] + 3 * u * k * k * p2[0] + k * k * k * p3[0],
      u * u * u * p0[1] + 3 * u * u * k * p1[1] + 3 * u * k * k * p2[1] + k * k * k * p3[1],
    ]
  }
  const qbez = (p0, p1, p2, k) => {
    const u = 1 - k
    return [u * u * p0[0] + 2 * u * k * p1[0] + k * k * p2[0], u * u * p0[1] + 2 * u * k * p1[1] + k * k * p2[1]]
  }

  // ---------- color ----------
  const hex = (h) => {
    const n = parseInt(h.slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const rgba = (h, a = 1) => {
    const [r, g, b] = Array.isArray(h) ? h : hex(h)
    return `rgba(${r | 0},${g | 0},${b | 0},${a})`
  }
  const mixColor = (a, b, k) => {
    const A = Array.isArray(a) ? a : hex(a)
    const B = Array.isArray(b) ? b : hex(b)
    return [lerp(A[0], B[0], k), lerp(A[1], B[1], k), lerp(A[2], B[2], k)]
  }

  const PALETTE = {
    bg: "#07060f",
    ink: "#f5f3ff",
    dim: "#8b89a6",
    violet: "#8b5cf6",
    cyan: "#06b6d4",
    pink: "#ec4899",
    orange: "#f97316",
    emerald: "#10b981",
    amber: "#f59e0b",
  }

  const FONT = '"Onest", system-ui, sans-serif'
  const MONO = '"DejaVu Sans Mono", ui-monospace, monospace'

  // ---------- drawing ----------
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }

  function glowCircle(ctx, x, y, r, color, alpha = 1) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, rgba(color, alpha))
    g.addColorStop(0.35, rgba(color, alpha * 0.35))
    g.addColorStop(1, rgba(color, 0))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, TAU)
    ctx.fill()
  }

  // Stable background shared by every scene. Periodic in `t` so loops are seamless.
  function background(ctx, t, T, accent, accent2 = PALETTE.violet) {
    ctx.fillStyle = PALETTE.bg
    ctx.fillRect(0, 0, W, H)
    const p = (t / T) * TAU
    ctx.save()
    ctx.globalCompositeOperation = "lighter"
    glowCircle(ctx, W * 0.5 + Math.cos(p) * 120, H * 0.45 + Math.sin(p) * 50, 720, accent, 0.16)
    glowCircle(ctx, W * 0.15 + Math.sin(p) * 60, H * 0.95 + Math.cos(p) * 30, 520, accent2, 0.1)
    glowCircle(ctx, W * 0.92 + Math.cos(p + 1) * 50, H * 0.05, 460, accent2, 0.08)
    ctx.restore()

    // Dot grid, fading toward the edges
    const step = 40
    for (let y = step / 2; y < H; y += step) {
      for (let x = step / 2; x < W; x += step) {
        const dx = (x - W / 2) / (W / 2)
        const dy = (y - H / 2) / (H / 2)
        const d = Math.sqrt(dx * dx + dy * dy)
        const a = 0.13 * (1 - clamp(d / 1.25))
        if (a <= 0.005) continue
        ctx.fillStyle = `rgba(200,200,255,${a})`
        ctx.fillRect(x - 1, y - 1, 2, 2)
      }
    }
    vignette(ctx)
  }

  function vignette(ctx) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95)
    g.addColorStop(0, "rgba(7,6,15,0)")
    g.addColorStop(1, "rgba(7,6,15,0.75)")
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }

  // Thin corner brackets + small label: the "studio frame"
  function frameHud(ctx, label, accent, t, T) {
    ctx.save()
    ctx.strokeStyle = "rgba(255,255,255,0.22)"
    ctx.lineWidth = 2
    const m = 28
    const l = 30
    const corners = [
      [m, m, 1, 1],
      [W - m, m, -1, 1],
      [m, H - m, 1, -1],
      [W - m, H - m, -1, -1],
    ]
    for (const [x, y, sx, sy] of corners) {
      ctx.beginPath()
      ctx.moveTo(x, y + sy * l)
      ctx.lineTo(x, y)
      ctx.lineTo(x + sx * l, y)
      ctx.stroke()
    }
    ctx.font = `600 22px ${MONO}`
    ctx.textBaseline = "middle"
    ctx.fillStyle = accent
    ctx.beginPath()
    ctx.arc(m + 18, m + 40, 6, 0, TAU)
    ctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin((t / T) * TAU * 4))
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = "rgba(255,255,255,0.7)"
    ctx.fillText(label, m + 36, m + 41)
    ctx.restore()
  }

  function text(ctx, str, x, y, { size = 40, weight = 600, color = PALETTE.ink, align = "left", font = FONT, alpha = 1, baseline = "middle", spacing = 0 } = {}) {
    ctx.save()
    ctx.globalAlpha *= alpha
    ctx.font = `${weight} ${size}px ${font}`
    ctx.fillStyle = color
    ctx.textAlign = align
    ctx.textBaseline = baseline
    if (spacing) ctx.letterSpacing = `${spacing}px`
    ctx.fillText(str, x, y)
    ctx.restore()
  }

  // Typewriter helper: returns the visible slice of `str` at progress k (0..1)
  // Text/counters should not be motion-blurred: evaluate them at the frame's center time
  let frameT = null
  const hold = (t) => (frameT == null ? t : frameT)
  const setFrameTime = (t) => (frameT = t)

  const typed = (str, k) => str.slice(0, Math.round(str.length * clamp(k)))

  // Pill / chip with optional glow
  function pill(ctx, x, y, w, h, { fill = "rgba(255,255,255,0.06)", stroke = "rgba(255,255,255,0.16)", glow = null, r = h / 2, lw = 2 } = {}) {
    ctx.save()
    if (glow) {
      ctx.shadowColor = glow
      ctx.shadowBlur = 40
    }
    roundRect(ctx, x, y, w, h, r)
    ctx.fillStyle = fill
    ctx.fill()
    ctx.shadowBlur = 0
    if (stroke) {
      ctx.lineWidth = lw
      ctx.strokeStyle = stroke
      ctx.stroke()
    }
    ctx.restore()
  }

  // ---------- icons (stroke-based, centered at x,y, size s) ----------
  function icon(ctx, name, x, y, s, color, lw = s * 0.09) {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(s / 100, s / 100)
    ctx.lineWidth = (lw * 100) / s
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    const P = new Path2D()
    switch (name) {
      case "search":
        P.arc(-8, -8, 26, 0, TAU)
        P.moveTo(11, 11)
        P.lineTo(34, 34)
        break
      case "database":
        P.ellipse(0, -28, 32, 11, 0, 0, TAU)
        P.moveTo(-32, -28)
        P.lineTo(-32, 28)
        P.ellipse(0, 28, 32, 11, 0, Math.PI, 0, true)
        P.lineTo(32, -28)
        P.moveTo(-32, 0)
        P.ellipse(0, 0, 32, 11, 0, Math.PI, 0, true)
        break
      case "card":
        P.roundRect(-38, -26, 76, 52, 8)
        P.moveTo(-38, -10)
        P.lineTo(38, -10)
        P.moveTo(-24, 12)
        P.lineTo(-6, 12)
        break
      case "mail":
        P.roundRect(-38, -26, 76, 52, 8)
        P.moveTo(-34, -20)
        P.lineTo(0, 6)
        P.lineTo(34, -20)
        break
      case "calendar":
        P.roundRect(-34, -28, 68, 62, 8)
        P.moveTo(-34, -10)
        P.lineTo(34, -10)
        P.moveTo(-16, -38)
        P.lineTo(-16, -20)
        P.moveTo(16, -38)
        P.lineTo(16, -20)
        break
      case "check":
        P.moveTo(-26, 2)
        P.lineTo(-8, 20)
        P.lineTo(28, -18)
        break
      case "doc":
        P.moveTo(-26, -36)
        P.lineTo(12, -36)
        P.lineTo(28, -20)
        P.lineTo(28, 36)
        P.lineTo(-26, 36)
        P.closePath()
        P.moveTo(-14, -8)
        P.lineTo(16, -8)
        P.moveTo(-14, 8)
        P.lineTo(16, 8)
        P.moveTo(-14, 22)
        P.lineTo(6, 22)
        break
      case "user":
        P.arc(0, -14, 16, 0, TAU)
        P.moveTo(-30, 34)
        P.bezierCurveTo(-30, 8, 30, 8, 30, 34)
        break
      case "code":
        P.moveTo(-18, -22)
        P.lineTo(-38, 0)
        P.lineTo(-18, 22)
        P.moveTo(18, -22)
        P.lineTo(38, 0)
        P.lineTo(18, 22)
        P.moveTo(8, -30)
        P.lineTo(-8, 30)
        break
      case "rocket":
        P.moveTo(0, -40)
        P.bezierCurveTo(20, -24, 20, 4, 12, 20)
        P.lineTo(-12, 20)
        P.bezierCurveTo(-20, 4, -20, -24, 0, -40)
        P.moveTo(-12, 8)
        P.lineTo(-26, 26)
        P.lineTo(-12, 22)
        P.moveTo(12, 8)
        P.lineTo(26, 26)
        P.lineTo(12, 22)
        P.moveTo(0, 28)
        P.lineTo(0, 40)
        P.arc(0, -12, 6, 0, TAU)
        break
      case "target":
        P.arc(0, 0, 36, 0, TAU)
        P.moveTo(22, 0)
        P.arc(0, 0, 22, 0, TAU)
        P.moveTo(8, 0)
        P.arc(0, 0, 8, 0, TAU)
        break
      case "bolt":
        P.moveTo(6, -40)
        P.lineTo(-22, 6)
        P.lineTo(0, 6)
        P.lineTo(-6, 40)
        P.lineTo(22, -6)
        P.lineTo(0, -6)
        P.closePath()
        break
      case "chart":
        P.moveTo(-36, 34)
        P.lineTo(36, 34)
        P.moveTo(-26, 20)
        P.lineTo(-6, -2)
        P.lineTo(8, 10)
        P.lineTo(30, -24)
        break
      case "gear": {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU
          P.moveTo(Math.cos(a) * 26, Math.sin(a) * 26)
          P.lineTo(Math.cos(a) * 38, Math.sin(a) * 38)
        }
        P.moveTo(26, 0)
        P.arc(0, 0, 26, 0, TAU)
        P.moveTo(10, 0)
        P.arc(0, 0, 10, 0, TAU)
        break
      }
    }
    ctx.stroke(P)
    ctx.restore()
  }

  // Animated checkmark: k from 0..1 draws the stroke
  function checkmark(ctx, x, y, s, color, k, lw = 6) {
    if (k <= 0) return
    const pts = [
      [-0.3, 0.02],
      [-0.08, 0.24],
      [0.34, -0.22],
    ]
    const L1 = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1])
    const L2 = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1])
    const L = (L1 + L2) * clamp(k)
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = lw
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.beginPath()
    ctx.moveTo(x + pts[0][0] * s, y + pts[0][1] * s)
    if (L <= L1) {
      const k1 = L / L1
      ctx.lineTo(x + lerp(pts[0][0], pts[1][0], k1) * s, y + lerp(pts[0][1], pts[1][1], k1) * s)
    } else {
      ctx.lineTo(x + pts[1][0] * s, y + pts[1][1] * s)
      const k2 = (L - L1) / L2
      ctx.lineTo(x + lerp(pts[1][0], pts[2][0], k2) * s, y + lerp(pts[1][1], pts[2][1], k2) * s)
    }
    ctx.stroke()
    ctx.restore()
  }

  // Draw a polyline partially (k 0..1 of its length)
  function partialPath(ctx, pts, k) {
    if (k <= 0 || pts.length < 2) return null
    let total = 0
    const seg = []
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
      seg.push(d)
      total += d
    }
    let left = total * clamp(k)
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    let head = pts[0]
    for (let i = 1; i < pts.length; i++) {
      if (left >= seg[i - 1]) {
        ctx.lineTo(pts[i][0], pts[i][1])
        left -= seg[i - 1]
        head = pts[i]
      } else {
        const f = left / seg[i - 1]
        head = [lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)]
        ctx.lineTo(head[0], head[1])
        break
      }
    }
    return head
  }

  // Sample a point along a polyline at fraction k
  function along(pts, k) {
    let total = 0
    const seg = []
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
      seg.push(d)
      total += d
    }
    let left = total * clamp(k)
    for (let i = 1; i < pts.length; i++) {
      if (left <= seg[i - 1]) {
        const f = seg[i - 1] ? left / seg[i - 1] : 0
        return [lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)]
      }
      left -= seg[i - 1]
    }
    return pts[pts.length - 1]
  }

  const sampleBez = (p0, p1, p2, p3, n = 48) => Array.from({ length: n + 1 }, (_, i) => bez(p0, p1, p2, p3, i / n))

  window.K = {
    W, H, FPS, TAU, clamp, lerp, ramp, mix, ease, env, rng, makeNoise, bez, qbez, hex, rgba, mixColor,
    PALETTE, FONT, MONO, roundRect, glowCircle, background, vignette, frameHud, text, typed, pill, icon,
    checkmark, partialPath, along, sampleBez, hold, setFrameTime,
  }
  window.SCENES = {}
})()
