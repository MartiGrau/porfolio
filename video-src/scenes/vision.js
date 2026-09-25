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
  const PROMPT = "cozy dining room, warm light, virtual staging"
  const STEPS = 50

  let levels = [] // blurred versions of the final image (Float32 RGB)
  const RADII = [0, 3, 8, 18, 36, 70]
  let noise = null
  let out = null
  let outCtx = null
  let outData = null
  let lines = [] // line art of the room, used as the conditioning sketch
  let lamps = []

  // One-point perspective room. Room units are pixels at the front plane:
  // x in [-462, 462], y from floor (0) to ceiling (520), z from front (0) to back wall (1).
  const VPX = FW / 2
  const VPY = 208
  const P = (x, y, z) => {
    const s = 1 / (1 + 1.174 * z)
    return [VPX + x * s, VPY + (312 - y) * s]
  }

  function buildImage() {
    const cv = document.createElement("canvas")
    cv.width = FW
    cv.height = FH
    const g = cv.getContext("2d")
    const r = K.rng(5)
    lines = []
    const quad = (pts, fill) => {
      g.beginPath()
      pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])))
      g.closePath()
      g.fillStyle = fill
      g.fill()
    }
    const lin = (a, b, c) => {
      const gr = g.createLinearGradient(a[0], a[1], b[0], b[1])
      c.forEach(([o, col]) => gr.addColorStop(o, col))
      return gr
    }
    const box = (x0, x1, y0, y1, z0, z1, top, front, side) => {
      // visible faces from a viewer at x=0: top (if below eye), front (z0), inner side
      const eye = 312
      if (y1 < eye) quad([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], top)
      if (x0 > 0) quad([P(x0, y0, z0), P(x0, y1, z0), P(x0, y1, z1), P(x0, y0, z1)], side)
      if (x1 < 0) quad([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], side)
      quad([P(x0, y0, z0), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0)], front)
    }
    const W0 = -462
    const W1 = 462
    const CEIL = 520

    // Ceiling, walls, floor
    quad([P(W0, CEIL, 0), P(W1, CEIL, 0), P(W1, CEIL, 1), P(W0, CEIL, 1)], lin([0, 0], [0, 112], [[0, "#d8ccbd"], [1, "#efe5d8"]]))
    quad([P(W0, 0, 1), P(W1, 0, 1), P(W1, CEIL, 1), P(W0, CEIL, 1)], lin([250, 0], [674, 0], [[0, "#e4d6c4"], [1, "#f1e6d6"]]))
    quad([P(W0, 0, 0), P(W0, 0, 1), P(W0, CEIL, 1), P(W0, CEIL, 0)], lin([0, 0], [250, 0], [[0, "#9c8872"], [1, "#cdbba4"]]))
    quad([P(W1, 0, 0), P(W1, 0, 1), P(W1, CEIL, 1), P(W1, CEIL, 0)], lin([924, 0], [674, 0], [[0, "#b8a38a"], [1, "#e6d7c2"]]))
    quad([P(W0, 0, 0), P(W1, 0, 0), P(W1, 0, 1), P(W0, 0, 1)], lin([0, 520], [0, 352], [[0, "#6b4428"], [1, "#a8774d"]]))
    // floor planks
    g.strokeStyle = "rgba(60,34,18,0.35)"
    g.lineWidth = 1.2
    for (let x = W0; x <= W1; x += 66) {
      const a = P(x, 0, 0)
      const b = P(x, 0, 1)
      g.beginPath()
      g.moveTo(a[0], a[1])
      g.lineTo(b[0], b[1])
      g.stroke()
      for (let k = 0; k < 4; k++) {
        const z = r()
        const c0 = P(x, 0, z)
        const c1 = P(x + 66, 0, z)
        g.beginPath()
        g.moveTo(c0[0], c0[1])
        g.lineTo(c1[0], c1[1])
        g.stroke()
      }
    }
    // skirting shadow at the base of the back wall
    quad([P(W0, 0, 1), P(W1, 0, 1), P(W1, 16, 1), P(W0, 16, 1)], "#f6efe6")
    quad([P(W0, 0, 0.99), P(W1, 0, 0.99), P(W1, 0, 0.9), P(W0, 0, 0.9)], "rgba(40,20,10,0.18)")

    // Window on the right wall with a golden-hour sky
    const wz0 = 0.14
    const wz1 = 0.72
    const wy0 = 120
    const wy1 = 450
    quad([P(W1, wy0 - 14, wz0 - 0.02), P(W1, wy0 - 14, wz1 + 0.02), P(W1, wy1 + 14, wz1 + 0.02), P(W1, wy1 + 14, wz0 - 0.02)], "#f5eee4")
    quad([P(W1, wy0, wz0), P(W1, wy0, wz1), P(W1, wy1, wz1), P(W1, wy1, wz0)], lin([0, P(W1, wy1, wz0)[1]], [0, P(W1, wy0, wz0)[1]], [[0, "#fb923c"], [0.45, "#f9a8d4"], [1, "#a78bfa"]]))
    // trees/skyline outside
    g.save()
    g.beginPath()
    ;[P(W1, wy0, wz0), P(W1, wy0, wz1), P(W1, wy1, wz1), P(W1, wy1, wz0)].forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])))
    g.closePath()
    g.clip()
    for (let i = 0; i < 14; i++) {
      const z = wz0 + (i / 13) * (wz1 - wz0)
      const c = P(W1, wy0 + 40 + r() * 60, z)
      g.fillStyle = "rgba(110,45,90,0.3)"
      g.beginPath()
      g.ellipse(c[0], c[1], 18 + r() * 14, 28 + r() * 30, 0, 0, TAU)
      g.fill()
    }
    g.restore()
    // mullions
    g.strokeStyle = "#f5eee4"
    g.lineWidth = 7
    for (const z of [(wz0 + wz1) / 2]) {
      const a = P(W1, wy0, z)
      const b = P(W1, wy1, z)
      g.beginPath()
      g.moveTo(a[0], a[1])
      g.lineTo(b[0], b[1])
      g.stroke()
    }
    const m0 = P(W1, 300, wz0)
    const m1 = P(W1, 300, wz1)
    g.lineWidth = 5
    g.beginPath()
    g.moveTo(m0[0], m0[1])
    g.lineTo(m1[0], m1[1])
    g.stroke()
    lines.push([P(W1, wy0, wz0), P(W1, wy0, wz1), P(W1, wy1, wz1), P(W1, wy1, wz0), P(W1, wy0, wz0)])
    lines.push([P(W1, wy0, (wz0 + wz1) / 2), P(W1, wy1, (wz0 + wz1) / 2)])

    // Sunlight patches on the floor
    g.save()
    g.globalCompositeOperation = "lighter"
    for (const [za, zb] of [[wz0, (wz0 + wz1) / 2 - 0.02], [(wz0 + wz1) / 2 + 0.02, wz1]]) {
      quad([P(W1, 0, za), P(W1, 0, zb), P(40, 0, zb - 0.16), P(40, 0, za - 0.16)], "rgba(255,170,90,0.2)")
    }
    g.restore()

    // Art on the back wall
    const art = [P(-150, 250, 1), P(150, 250, 1), P(150, 420, 1), P(-150, 420, 1)]
    quad([P(-160, 240, 1), P(160, 240, 1), P(160, 430, 1), P(-160, 430, 1)], "#3b2a1e")
    quad(art, "#f3ece2")
    g.save()
    g.beginPath()
    art.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])))
    g.closePath()
    g.clip()
    const [ax, ay] = P(0, 335, 1)
    g.fillStyle = "#ec4899"
    g.beginPath()
    g.arc(ax - 22, ay + 4, 26, 0, TAU)
    g.fill()
    g.fillStyle = "#8b5cf6"
    g.fillRect(ax - 4, ay - 30, 44, 44)
    g.fillStyle = "#f59e0b"
    g.beginPath()
    g.arc(ax + 40, ay + 22, 14, 0, TAU)
    g.fill()
    g.restore()
    lines.push([...art, art[0]])

    // Room edges for the sketch
    lines.push([P(W0, 0, 1), P(W1, 0, 1), P(W1, CEIL, 1), P(W0, CEIL, 1), P(W0, 0, 1)])
    lines.push([P(W0, 0, 0), P(W0, 0, 1)])
    lines.push([P(W1, 0, 0), P(W1, 0, 1)])
    lines.push([P(W0, CEIL, 0), P(W0, CEIL, 1)])
    lines.push([P(W1, CEIL, 0), P(W1, CEIL, 1)])

    // Plant in the back-left corner
    const pot = P(-390, 0, 0.82)
    const potTop = P(-390, 70, 0.82)
    quad([[pot[0] - 22, pot[1]], [pot[0] + 22, pot[1]], [potTop[0] + 28, potTop[1]], [potTop[0] - 28, potTop[1]]], "#e7ddd0")
    for (let i = 0; i < 22; i++) {
      const a = -Math.PI / 2 + (r() - 0.5) * 2.4
      const len = 50 + r() * 70
      const lx = potTop[0] + Math.cos(a) * len * 0.8
      const ly = potTop[1] + Math.sin(a) * len
      g.fillStyle = ["#2f5d3a", "#3f7a4a", "#26492f"][i % 3]
      g.beginPath()
      g.ellipse(lx, ly, 9, 24, a + Math.PI / 2, 0, TAU)
      g.fill()
    }
    lines.push([[pot[0] - 22, pot[1]], [pot[0] + 22, pot[1]], [potTop[0] + 28, potTop[1]], [potTop[0] - 28, potTop[1]], [pot[0] - 22, pot[1]]])

    // Rug
    const rug = [P(-270, 1, 0.2), P(270, 1, 0.2), P(270, 1, 0.8), P(-270, 1, 0.8)]
    quad(rug, "#d9c9b2")
    quad([P(-240, 1, 0.24), P(240, 1, 0.24), P(240, 1, 0.76), P(-240, 1, 0.76)], "#cbb89d")
    lines.push([...rug, rug[0]])
    // soft shadow under the table
    const sh = P(0, 0, 0.5)
    const shg = g.createRadialGradient(sh[0], sh[1], 10, sh[0], sh[1], 230)
    shg.addColorStop(0, "rgba(40,22,10,0.45)")
    shg.addColorStop(1, "rgba(40,22,10,0)")
    g.save()
    g.translate(sh[0], sh[1])
    g.scale(1, 0.3)
    g.translate(-sh[0], -sh[1])
    g.fillStyle = shg
    g.beginPath()
    g.arc(sh[0], sh[1], 230, 0, TAU)
    g.fill()
    g.restore()

    // Chairs: back row behind the table
    const chair = (x, z, facing) => {
      const wd = 36
      const col = "#2d2622"
      const seatY = 100
      const legs = [[x - wd, z - 0.03], [x + wd, z - 0.03], [x - wd, z + 0.03], [x + wd, z + 0.03]]
      g.strokeStyle = col
      g.lineWidth = 4
      for (const [lx, lz] of legs) {
        const a = P(lx, 0, lz)
        const b = P(lx, seatY, lz)
        g.beginPath()
        g.moveTo(a[0], a[1])
        g.lineTo(b[0], b[1])
        g.stroke()
      }
      box(x - wd - 4, x + wd + 4, seatY, seatY + 10, z - 0.04, z + 0.04, "#b98b5e", "#8a6040", "#6e4b31")
      const bz = facing > 0 ? z + 0.04 : z - 0.04
      const back = [P(x - wd, seatY + 10, bz), P(x + wd, seatY + 10, bz), P(x + wd, seatY + 115, bz), P(x - wd, seatY + 115, bz)]
      quad(back, facing > 0 ? "#a67a52" : "#5a3d28")
      g.strokeStyle = "rgba(40,24,14,0.5)"
      g.lineWidth = 2
      g.beginPath()
      back.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])))
      g.closePath()
      g.stroke()
      lines.push([...back, back[0]])
    }
    chair(-110, 0.68, 1)
    chair(110, 0.68, 1)

    // Table
    const TY = 150
    const tz0 = 0.32
    const tz1 = 0.62
    const tx = 225
    g.strokeStyle = "#3a2518"
    for (const [lx, lz] of [[-tx + 14, tz0 + 0.02], [tx - 14, tz0 + 0.02], [-tx + 14, tz1 - 0.02], [tx - 14, tz1 - 0.02]]) {
      const a = P(lx, 0, lz)
      const b = P(lx, TY, lz)
      g.lineWidth = 9 / (1 + lz)
      g.beginPath()
      g.moveTo(a[0], a[1])
      g.lineTo(b[0], b[1])
      g.stroke()
      lines.push([a, b])
    }
    box(-tx, tx, TY, TY + 14, tz0, tz1, lin([0, P(0, TY + 14, tz1)[1]], [0, P(0, TY + 14, tz0)[1]], [[0, "#7a4b2c"], [1, "#9b6440"]]), "#4a2d1a", "#3a2416")
    const top = [P(-tx, TY + 14, tz0), P(tx, TY + 14, tz0), P(tx, TY + 14, tz1), P(-tx, TY + 14, tz1)]
    lines.push([...top, top[0]])
    // warm highlight on the tabletop
    g.save()
    g.globalCompositeOperation = "lighter"
    const hlp = P(0, TY + 14, 0.5)
    const hg = g.createRadialGradient(hlp[0], hlp[1], 0, hlp[0], hlp[1], 170)
    hg.addColorStop(0, "rgba(255,190,120,0.35)")
    hg.addColorStop(1, "rgba(255,190,120,0)")
    g.fillStyle = hg
    g.beginPath()
    top.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])))
    g.closePath()
    g.fill()
    g.restore()
    // vase with flowers + plates
    for (const px of [-120, 120]) {
      const c = P(px, TY + 15, 0.44)
      g.fillStyle = "#f7f2ea"
      g.beginPath()
      g.ellipse(c[0], c[1], 26, 7, 0, 0, TAU)
      g.fill()
    }
    const v = P(0, TY + 15, 0.52)
    g.fillStyle = "#e9e1d6"
    g.beginPath()
    g.ellipse(v[0], v[1] - 14, 10, 16, 0, 0, TAU)
    g.fill()
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i - 4) * 0.28
      const fx = v[0] + Math.cos(a) * 30
      const fy = v[1] - 30 + Math.sin(a) * 26
      g.strokeStyle = "#3f6b45"
      g.lineWidth = 2
      g.beginPath()
      g.moveTo(v[0], v[1] - 26)
      g.lineTo(fx, fy)
      g.stroke()
      g.fillStyle = i % 2 ? "#f472b6" : "#fbbf24"
      g.beginPath()
      g.arc(fx, fy, 5, 0, TAU)
      g.fill()
    }

    // Front chairs (backs toward the viewer)
    chair(-120, 0.24, -1)
    chair(120, 0.24, -1)

    // Pendant lamps
    lamps = []
    for (const lx of [-85, 85]) {
      const top = P(lx, CEIL, 0.5)
      const bot = P(lx, 330, 0.5)
      g.strokeStyle = "#2b2420"
      g.lineWidth = 2
      g.beginPath()
      g.moveTo(top[0], top[1])
      g.lineTo(bot[0], bot[1])
      g.stroke()
      const s = 1 / (1 + 1.174 * 0.5)
      const w0 = 12 * s
      const w1 = 46 * s
      const h = 44 * s
      quad([[bot[0] - w0, bot[1]], [bot[0] + w0, bot[1]], [bot[0] + w1, bot[1] + h], [bot[0] - w1, bot[1] + h]], "#1f1a17")
      g.fillStyle = "#fde68a"
      g.beginPath()
      g.ellipse(bot[0], bot[1] + h, w1, 5, 0, 0, TAU)
      g.fill()
      lamps.push([bot[0], bot[1] + h])
      lines.push([top, bot])
      lines.push([[bot[0] - w0, bot[1]], [bot[0] + w0, bot[1]], [bot[0] + w1, bot[1] + h], [bot[0] - w1, bot[1] + h], [bot[0] - w0, bot[1]]])
    }
    g.save()
    g.globalCompositeOperation = "lighter"
    for (const [x, y] of lamps) {
      const lg = g.createRadialGradient(x, y, 0, x, y, 260)
      lg.addColorStop(0, "rgba(255,200,120,0.3)")
      lg.addColorStop(0.4, "rgba(255,160,80,0.15)")
      lg.addColorStop(1, "rgba(255,160,80,0)")
      g.fillStyle = lg
      g.fillRect(0, 0, FW, FH)
    }
    g.restore()

    // warm grade + vignette
    g.fillStyle = "rgba(255,140,60,0.06)"
    g.fillRect(0, 0, FW, FH)
    const vg = g.createRadialGradient(FW / 2, FH / 2, FH * 0.3, FW / 2, FH / 2, FW * 0.7)
    vg.addColorStop(0, "rgba(0,0,0,0)")
    vg.addColorStop(1, "rgba(20,8,0,0.5)")
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
    lines.forEach((pts, i) => {
      const s0 = (i / lines.length) * 0.4
      K.partialPath(ctx, pts, ease.inOutCubic(ramp(k, s0, s0 + 0.6)))
      ctx.stroke()
    })
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
        // once the image is clean: lamps breathe and dust drifts in the window light
        const live = env(t, 4.6, 5.2, 6.8, 7.3) * fgOut
        if (live > 0) {
          ctx.globalCompositeOperation = "lighter"
          lamps.forEach(([x, y], i) => {
            const b = 0.5 + 0.5 * Math.sin((t / T) * TAU * 3 + i * 2)
            K.glowCircle(ctx, FX + x, FY + y + 10, 120, "#ffc878", (0.18 + 0.12 * b) * live)
          })
          const r = K.rng(3)
          for (let i = 0; i < 40; i++) {
            const bx = 560 + r() * 330
            const by = 120 + r() * 330
            const ph = r() * TAU
            const x = bx + Math.sin((t / T) * TAU + ph) * 18
            const y = by - ((t / T) * 60 + r() * 60) % 60
            const a = live * (0.35 + 0.35 * Math.sin((t / T) * TAU * 4 + ph))
            ctx.fillStyle = `rgba(255,228,190,${a})`
            ctx.beginPath()
            ctx.arc(FX + x, FY + y, 1.6 + r() * 1.4, 0, TAU)
            ctx.fill()
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
