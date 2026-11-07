// Ícones de esfera da barra da vista (como o sombreamento do Blender): cada modo desenhado numa esfera.
const N = 64, R = N / 2 // tamanho do canvas (reduzido por CSS, para o contorno sair suave)
const hex = (h: number) => [h >> 16, (h >> 8) & 255, h & 255]
const lerp = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t)
const CINZA = hex(0xd0d4d8), VERDE = hex(0x3fa34d), AMARELO = hex(0xf0dc4a), LARANJA = hex(0xf08a24), VERMELHO = hex(0xd83a3a) // mesmas cores de vista.ts

// esferas de degradê; as de inclinação e normais são calculadas pixel a pixel
const DEGRADE: Record<string, [number, string][]> = {
  solido: [[0, '#f3f0ea'], [.5, '#b8b4ac'], [1, '#3f3d39']],
  matcap: [[0, '#fff8ec'], [.45, '#c9b28c'], [1, '#2a2118']],
  arestas: [[0, '#7b8088'], [1, '#2b2e33']],
}

/** Cor no ponto da esfera: sx à direita, sy para cima, sz para o observador (que olha de −y, com z para cima). */
function porPixel(modo: string, sx: number, sy: number, sz: number): number[] {
  if (modo === 'normais') return [sx, -sz, sy].map(v => (v * .5 + .5) * 255)
  if (sy < -1e-3) return VERMELHO // normal para baixo
  const ang = Math.acos(Math.min(1, sy)) * 180 / Math.PI // inclinação da normal com +Z
  return ang < 1 ? CINZA : ang <= 45 ? lerp(VERDE, AMARELO, ang / 45) : LARANJA
}

export function esfera(modo: string): HTMLCanvasElement {
  const cv = document.createElement('canvas'), x = cv.getContext('2d')!
  cv.width = cv.height = N
  if (DEGRADE[modo]) {
    const g = x.createRadialGradient(R * .65, R * .6, R * .05, R, R, R)
    for (const [t, c] of DEGRADE[modo]) g.addColorStop(t, c)
    x.fillStyle = g
    x.beginPath(); x.arc(R, R, R - 1, 0, 2 * Math.PI); x.fill()
  } else {
    const img = x.createImageData(N, N)
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const sx = (i + .5) / R - 1, sy = 1 - (j + .5) / R, r2 = sx * sx + sy * sy
      if (r2 <= 1) img.data.set([...porPixel(modo, sx, sy, Math.sqrt(1 - r2)), 255], (j * N + i) * 4)
    }
    x.putImageData(img, 0, 0)
  }
  if (modo === 'arestas') { // aramado: meridianos e paralelos
    x.save()
    x.beginPath(); x.arc(R, R, R - 1, 0, 2 * Math.PI); x.clip()
    x.strokeStyle = '#e8eaed'; x.lineWidth = 1.6
    for (const s of [0, .5, .87, 1]) { x.beginPath(); x.ellipse(R, R, (R - 1) * s, R - 1, 0, 0, 2 * Math.PI); x.stroke() }
    for (const s of [-.6, -.3, 0, .3, .6]) {
      const rx = (R - 1) * Math.sqrt(1 - s * s)
      x.beginPath(); x.ellipse(R, R - s * (R - 1), rx, rx * .28, 0, 0, 2 * Math.PI); x.stroke()
    }
    x.restore()
  }
  return cv
}
