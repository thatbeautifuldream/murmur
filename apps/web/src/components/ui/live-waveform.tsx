import * as React from "react"
import { cn } from "@/lib/utils"

export type LiveWaveformMode = "scrolling" | "static"

export interface LiveWaveformProps extends Omit<React.ComponentProps<"div">, "onError"> {
  active?: boolean
  processing?: boolean
  barWidth?: number
  barHeight?: number
  barGap?: number
  barRadius?: number
  barColor?: string
  fadeEdges?: boolean
  fadeWidth?: number
  height?: string | number
  sensitivity?: number
  smoothingTimeConstant?: number
  fftSize?: number
  historySize?: number
  updateRate?: number
  mode?: LiveWaveformMode
  onError?: (error: Error) => void
  onStreamReady?: (stream: MediaStream) => void
  onStreamEnd?: () => void
}

function drawBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  centerY: number,
  amplitude: number,
  barWidth: number,
  barRadius: number,
) {
  const h = Math.max(barWidth, amplitude)
  const y = centerY - h / 2
  ctx.beginPath()
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, barWidth, h, barRadius)
  } else {
    ctx.rect(x, y, barWidth, h)
  }
  ctx.fill()
}

/**
 * Canvas-based real-time audio waveform. Drives itself from the mic via the
 * Web Audio API when `active`, shows a processing animation while awaiting
 * results, and idles flat otherwise.
 */
function LiveWaveform({
  active = false,
  processing = false,
  barWidth = 3,
  barHeight = 4,
  barGap = 1,
  barRadius = 1.5,
  barColor,
  fadeEdges = true,
  fadeWidth = 24,
  height = 64,
  sensitivity = 1,
  smoothingTimeConstant = 0.8,
  fftSize = 256,
  historySize = 60,
  updateRate = 30,
  mode = "static",
  onError,
  onStreamReady,
  onStreamEnd,
  className,
  style,
  ...props
}: LiveWaveformProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const audioCtxRef = React.useRef<AudioContext | null>(null)
  const analyserRef = React.useRef<AnalyserNode | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const rafRef = React.useRef<number | null>(null)
  const historyRef = React.useRef<number[]>(new Array(historySize).fill(0))
  const lastDrawRef = React.useRef(0)
  const startedAtRef = React.useRef(0)

  // Mic lifecycle — attach/detach the audio graph as `active` toggles.
  React.useEffect(() => {
    if (!active) return

    let cancelled = false

    void navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop()
          return
        }
        streamRef.current = stream
        onStreamReady?.(stream)

        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const audioCtx = new AudioCtx()
        const source = audioCtx.createMediaStreamSource(stream)
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = fftSize
        analyser.smoothingTimeConstant = smoothingTimeConstant
        source.connect(analyser)

        audioCtxRef.current = audioCtx
        analyserRef.current = analyser
      })
      .catch((error: unknown) => {
        if (!cancelled) onError?.(error instanceof Error ? error : new Error(String(error)))
      })

    return () => {
      cancelled = true
      for (const track of streamRef.current?.getTracks() ?? []) track.stop()
      streamRef.current = null
      void audioCtxRef.current?.close()
      audioCtxRef.current = null
      analyserRef.current = null
      onStreamEnd?.()
    }
  }, [active, fftSize, smoothingTimeConstant, onStreamReady, onStreamEnd, onError])

  // HiDPI canvas sizing, tracked via ResizeObserver.
  React.useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = container.getBoundingClientRect()
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
    }
    resize()

    const observer = new ResizeObserver(resize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Draw loop.
  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    startedAtRef.current = performance.now()
    const freqData = new Uint8Array(fftSize / 2)

    const draw = (now: number) => {
      rafRef.current = requestAnimationFrame(draw)
      if (now - lastDrawRef.current < updateRate) return
      lastDrawRef.current = now

      const dpr = window.devicePixelRatio || 1
      const w = canvas.width
      const h = canvas.height
      const centerY = h / 2
      const color = barColor ?? getComputedStyle(canvas).color

      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = color

      const step = (barWidth + barGap) * dpr
      const maxBarHeight = h * 0.9

      if (mode === "static") {
        const analyser = analyserRef.current
        const barCount = Math.floor(w / step / 2)
        let amplitudes: number[]

        if (active && analyser) {
          analyser.getByteFrequencyData(freqData)
          amplitudes = new Array(barCount)
            .fill(0)
            .map((_, i) => (freqData[Math.floor((i / barCount) * freqData.length)] ?? 0) / 255)
        } else if (processing) {
          const t = (now - startedAtRef.current) / 1000
          amplitudes = new Array(barCount)
            .fill(0)
            .map((_, i) => (Math.sin(t * 3 + i * 0.4) + 1) / 2)
        } else {
          amplitudes = new Array(barCount).fill(0)
        }

        for (let i = 0; i < barCount; i++) {
          const amp = Math.min(1, (amplitudes[i] ?? 0) * sensitivity)
          const barH = Math.max(barHeight * dpr, amp * maxBarHeight)
          const xRight = w / 2 + i * step
          const xLeft = w / 2 - i * step - barWidth * dpr
          drawBar(ctx, xRight, centerY, barH, barWidth * dpr, barRadius * dpr)
          drawBar(ctx, xLeft, centerY, barH, barWidth * dpr, barRadius * dpr)
        }
      } else {
        const analyser = analyserRef.current
        let sample = 0
        if (active && analyser) {
          analyser.getByteFrequencyData(freqData)
          let peak = 0
          for (const v of freqData) if (v > peak) peak = v
          // Raw frequency peaks read as near-silent at normal speech volume —
          // a perceptual curve keeps quiet speech visibly above the flatline.
          sample = Math.pow(peak / 255, 0.6)
        } else if (processing) {
          const t = (now - startedAtRef.current) / 1000
          sample = (Math.sin(t * 3) + 1) / 4 + 0.1
        }

        const history = historyRef.current
        history.push(sample)
        while (history.length > historySize) history.shift()

        const barCount = Math.min(historySize, Math.floor(w / step))
        const visible = history.slice(history.length - barCount)
        for (let i = 0; i < visible.length; i++) {
          const amp = Math.min(1, (visible[i] ?? 0) * sensitivity)
          const barH = Math.max(barHeight * dpr, amp * maxBarHeight)
          const x = w - (visible.length - i) * step
          drawBar(ctx, x, centerY, barH, barWidth * dpr, barRadius * dpr)
        }
      }

      if (fadeEdges) {
        const fw = fadeWidth * dpr
        const gradient = ctx.createLinearGradient(0, 0, w, 0)
        gradient.addColorStop(0, "transparent")
        gradient.addColorStop(Math.min(0.5, fw / w), "black")
        gradient.addColorStop(Math.max(0.5, 1 - fw / w), "black")
        gradient.addColorStop(1, "transparent")
        ctx.globalCompositeOperation = "destination-in"
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, w, h)
        ctx.globalCompositeOperation = "source-over"
      }
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [
    active,
    processing,
    mode,
    barWidth,
    barHeight,
    barGap,
    barRadius,
    barColor,
    fadeEdges,
    fadeWidth,
    sensitivity,
    fftSize,
    historySize,
    updateRate,
  ])

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full text-foreground", className)}
      style={{ height, ...style }}
      {...props}
    >
      <canvas ref={canvasRef} className="size-full" />
    </div>
  )
}

export { LiveWaveform }
