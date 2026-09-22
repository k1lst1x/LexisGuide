import { useEffect, useRef } from 'react'

/*
 * Living watercolor background: the landscape image is drawn through a
 * fragment shader that bends foliage in the wind. Sky pixels (low
 * saturation, cream) stay still, leaves and grass sway with layered gusts.
 * Falls back to the static image when WebGL or motion is unavailable.
 */

const VERTEX = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

const FRAGMENT = `
precision mediump float;
uniform sampler2D u_img;
uniform float u_time;
uniform vec2 u_scale;   // cover-fit scale of the image inside the canvas
uniform vec2 u_offset;  // cover-fit offset
uniform vec2 u_mouse;   // pointer in uv space, for a soft local breeze
varying vec2 v_uv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float foliage(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float sat = (mx - mn) / (mx + 0.0001);
  float green = smoothstep(0.0, 0.12, c.g - max(c.r, c.b) * 0.92);
  float dark = 1.0 - smoothstep(0.82, 0.97, mx);
  return clamp(smoothstep(0.12, 0.42, sat) * max(green, 0.35) * dark, 0.0, 1.0);
}

void main() {
  vec2 uv = v_uv * u_scale + u_offset;
  vec3 base = texture2D(u_img, uv).rgb;

  // Sample the neighbourhood so edges of the canopy bend together.
  float m = foliage(base);
  m = max(m, foliage(texture2D(u_img, uv + vec2(0.006, 0.0)).rgb) * 0.8);
  m = max(m, foliage(texture2D(u_img, uv - vec2(0.006, 0.0)).rgb) * 0.8);
  m = max(m, foliage(texture2D(u_img, uv + vec2(0.0, 0.008)).rgb) * 0.7);

  float t = u_time * 0.5; // unhurried, like a summer afternoon
  // Slow rolling gusts travelling across the scene from left to right.
  float gust = 0.55 + 0.45 * sin(t * 0.35 - uv.x * 2.2) * (0.6 + 0.4 * noise(vec2(t * 0.15, 3.0)));
  float n1 = noise(uv * vec2(7.0, 5.0) + vec2(t * 0.55, t * 0.2));
  float n2 = noise(uv * vec2(22.0, 16.0) + vec2(t * 0.7, -t * 0.25));

  // Tops of trees move more than trunks and ground.
  float height = mix(1.0, 0.35, smoothstep(0.35, 0.95, uv.y));
  float sway = sin(t * 1.1 + uv.y * 9.0 + n1 * 5.0) * 0.0058 * gust;
  float flutter = (n2 - 0.5) * 0.0032;

  vec2 d = uv - u_mouse;
  float breeze = exp(-dot(d, d) * 28.0) * 0.004 * sin(t * 1.6 + uv.y * 30.0);

  vec2 off = vec2(sway + flutter + breeze, (n1 - 0.5) * 0.0016 * gust) * m * height;
  vec3 col = texture2D(u_img, uv + off).rgb;

  // Dappled light passing over leaves.
  float light = (noise(uv * 6.0 + vec2(t * 0.25, 0.0)) - 0.5) * 0.06 * m;
  col += light;

  gl_FragColor = vec4(col, 1.0);
}`

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

export function WindScene({ src, className, focusY = 1 }: { src: string; className?: string; focusY?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fallbackRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
    const gl = (() => {
      if (reduceMotion) return null
      try { return canvas.getContext('webgl', { premultipliedAlpha: false, antialias: false }) } catch { return null }
    })()
    if (!gl) return

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT)
    const program = gl.createProgram()
    if (!vs || !fs || !program) return
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(program, 'a_pos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const uTime = gl.getUniformLocation(program, 'u_time')
    const uScale = gl.getUniformLocation(program, 'u_scale')
    const uOffset = gl.getUniformLocation(program, 'u_offset')
    const uMouse = gl.getUniformLocation(program, 'u_mouse')

    let raf = 0
    let running = true
    let visible = true
    let imgW = 1
    let imgH = 1
    const mouse = { x: -1, y: -1 }
    const start = performance.now()

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      gl.viewport(0, 0, canvas.width, canvas.height)
      // object-fit: cover, anchored horizontally centred and vertically at focusY.
      const canvasRatio = w / Math.max(h, 1)
      const imgRatio = imgW / imgH
      let sx = 1
      let sy = 1
      if (canvasRatio > imgRatio) sy = imgRatio / canvasRatio
      else sx = canvasRatio / imgRatio
      gl.uniform2f(uScale, sx, sy)
      gl.uniform2f(uOffset, (1 - sx) / 2, (1 - sy) * focusY)
    }

    const frame = (now: number) => {
      if (!running) return
      if (visible) {
        gl.uniform1f(uTime, (now - start) / 1000)
        gl.uniform2f(uMouse, mouse.x, mouse.y)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      }
      raf = requestAnimationFrame(frame)
    }

    const image = new Image()
    image.onload = () => {
      imgW = image.naturalWidth
      imgH = image.naturalHeight
      const texture = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image)
      resize()
      gl.uniform1f(uTime, 0)
      gl.uniform2f(uMouse, -1, -1)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      canvas.classList.add('is-live')
      fallbackRef.current?.classList.add('is-hidden')
      raf = requestAnimationFrame(frame)
    }
    image.src = src

    const onMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouse.x = (event.clientX - rect.left) / rect.width
      mouse.y = (event.clientY - rect.top) / rect.height
    }
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting })
    observer.observe(canvas)
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onMove, { passive: true })

    return () => {
      running = false
      cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
    }
  }, [src, focusY])

  return (
    <div className={`lp-wind ${className ?? ''}`} aria-hidden="true">
      <img ref={fallbackRef} src={src} alt="" className="lp-wind-fallback" style={{ objectPosition: `50% ${focusY * 100}%` }} />
      <canvas ref={canvasRef} className="lp-wind-canvas" />
    </div>
  )
}

/* Pollen / seed particles drifting across the meadow. */
export function Pollen({ count = 26 }: { count?: number }) {
  const seeds = Array.from({ length: count }, (_, i) => {
    const r = (n: number) => ((Math.sin((i + 1) * n) * 10000) % 1 + 1) % 1
    return {
      left: `${r(12.9) * 100}%`,
      top: `${40 + r(78.2) * 55}%`,
      size: 2 + r(3.1) * 3,
      delay: `${-r(9.7) * 18}s`,
      duration: `${26 + r(5.3) * 20}s`,
    }
  })
  return (
    <div className="lp-pollen" aria-hidden="true">
      {seeds.map((s, i) => (
        <span key={i} style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: s.delay, animationDuration: s.duration }} />
      ))}
    </div>
  )
}

/* A few small birds gliding across the sky. */
export function Birds() {
  return (
    <div className="lp-birds" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <svg key={i} className={`lp-bird lp-bird-${i}`} viewBox="0 0 24 10" width="18" height="8">
          <path d="M1 6 Q6 1 12 6 Q18 1 23 6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      ))}
    </div>
  )
}
