import * as React from "react"
import { cn } from "@/lib/utils"

export interface WaveformProps extends Omit<React.ComponentProps<"div">, "onError" | "ref"> {
  data: number[]
  barWidth?: number
  barHeight?: number
  barGap?: number
  barRadius?: number
  barColor?: string
  /** Floor alpha for a silent bar — keeps quiet stretches faintly present
   *  instead of disappearing, restrained rather than colorful. */
  minOpacity?: number
  fadeEdges?: boolean
  fadeWidth?: number
  height?: string | number
  onBarClick?: (index: number, value: number) => void
}

export interface WaveformHandle {
  /** Repaint the canvas with new amplitude data, without going through React
   *  state/re-render — lets a per-frame update loop (e.g. mic RMS) drive the
   *  canvas directly instead of reconciling this component's whole subtree
   *  every tick. */
  draw: (data: number[]) => void
}

/** Base canvas bar-chart renderer — draws `data` (each 0-1) as vertical bars
 *  in a single monochrome color, fading each bar's opacity with its own
 *  amplitude so a livelier signal reads as more present, not more colorful. */
const Waveform = React.forwardRef<WaveformHandle, WaveformProps>(function Waveform(
  {
    data,
    barWidth = 4,
    barHeight = 4,
    barGap = 2,
    barRadius = 2,
    barColor,
    minOpacity = 0.18,
    fadeEdges = true,
    fadeWidth = 24,
    height = 128,
    onBarClick,
    className,
    style,
    ...props
  }: WaveformProps,
  ref,
) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const dataRef = React.useRef(data)
  const resolvedColorRef = React.useRef("")

  const draw = React.useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const values = dataRef.current
    const dpr = window.devicePixelRatio || 1
    const w = canvas.width
    const h = canvas.height
    const centerY = h / 2
    const step = (barWidth + barGap) * dpr
    const maxBarHeight = h * 0.92

    ctx.clearRect(0, 0, w, h)
    const color = barColor ?? resolvedColorRef.current

    for (let i = 0; i < values.length; i++) {
      const amp = Math.max(0, Math.min(1, values[i] ?? 0))
      const barH = Math.max(barHeight * dpr, amp * maxBarHeight)
      const x = i * step
      const y = centerY - barH / 2
      ctx.fillStyle = color
      ctx.globalAlpha = minOpacity + (1 - minOpacity) * amp
      ctx.beginPath()
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(x, y, barWidth * dpr, barH, barRadius * dpr)
      } else {
        ctx.rect(x, y, barWidth * dpr, barH)
      }
      ctx.fill()
    }
    ctx.globalAlpha = 1

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
  }, [barWidth, barHeight, barGap, barRadius, barColor, minOpacity, fadeEdges, fadeWidth])

  React.useImperativeHandle(
    ref,
    () => ({
      draw: (next: number[]) => {
        dataRef.current = next
        draw()
      },
    }),
    [draw],
  )

  React.useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = container.getBoundingClientRect()
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      // Resolve the fallback color here rather than on every draw() — a
      // resize only happens on mount/layout changes, not per animation frame.
      if (!barColor) resolvedColorRef.current = getComputedStyle(canvas).color
      draw()
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [draw, barColor])

  // Only sync the prop into the ref (and redraw) when `data` itself actually
  // changes — not on every render — so an unrelated parent re-render can't
  // clobber the latest value written by the imperative `draw()` handle above.
  React.useEffect(() => {
    dataRef.current = data
    draw()
  }, [data, draw])

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onBarClick) return
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const x = event.clientX - rect.left
    const index = Math.floor(x / (barWidth + barGap))
    if (index >= 0 && index < data.length) onBarClick(index, data[index] ?? 0)
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full", onBarClick && "cursor-pointer", className)}
      style={{ height, ...style }}
      onClick={handleClick}
      {...props}
    >
      <canvas ref={canvasRef} className="size-full" />
    </div>
  )
})

export interface MicrophoneWaveformProps
  extends Omit<WaveformProps, "data" | "onBarClick"> {
  active?: boolean
  /** Shows a gentle synthetic "thinking" wave instead of mic input — for the
   *  window after the mic has stopped but before a result comes back.
   *  Ignored while `active` is true. */
  processing?: boolean
  fftSize?: number
  smoothingTimeConstant?: number
  sensitivity?: number
  barCount?: number
  updateRate?: number
  onError?: (error: Error) => void
  onStreamReady?: (stream: MediaStream) => void
  onStreamEnd?: () => void
}

/** Real-time microphone amplitude, rendered through `Waveform`. Reads RMS
 *  loudness off the time-domain buffer (perceptually closer to "how loud is
 *  this" than frequency-bin peaks) and keeps a rolling window of samples. */
function MicrophoneWaveform({
  active = false,
  processing = false,
  fftSize = 1024,
  smoothingTimeConstant = 0.6,
  sensitivity = 1,
  barCount = 48,
  updateRate = 50,
  onError,
  onStreamReady,
  onStreamEnd,
  ...waveformProps
}: MicrophoneWaveformProps) {
  const [samples, setSamples] = React.useState<number[]>(() => new Array(barCount).fill(0))
  const waveformRef = React.useRef<WaveformHandle>(null)
  const samplesRef = React.useRef(samples)
  const audioCtxRef = React.useRef<AudioContext | null>(null)
  const analyserRef = React.useRef<AnalyserNode | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const rafRef = React.useRef<number | null>(null)
  const lastUpdateRef = React.useRef(0)

  // Construct the `AudioContext` up front, on idle mount, instead of on the
  // first `active` flip. Spinning up the audio pipeline for the first time is
  // real work (tens of ms), and doing it lazily meant that cost landed on the
  // exact frame the pill's first-ever expand animation was also trying to
  // run, producing a stutter unique to the very first dictation. No mic
  // permission or stream is touched here — just the empty context, reused by
  // every subsequent activation.
  React.useEffect(() => {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const audioCtx = new AudioCtx()
    audioCtxRef.current = audioCtx
    return () => {
      audioCtxRef.current = null
      void audioCtx.close()
    }
  }, [])

  // Synthetic "thinking" wave for the processing state — a slow sine ripple
  // travelling across the bars, standing in for real amplitude data while
  // there's no mic input to visualize.
  React.useEffect(() => {
    if (active || !processing) return

    let cancelled = false
    const start = performance.now()

    const tick = (now: number) => {
      if (cancelled) return
      rafRef.current = requestAnimationFrame(tick)
      if (now - lastUpdateRef.current < updateRate) return
      lastUpdateRef.current = now

      const t = (now - start) / 1000
      samplesRef.current = Array.from({ length: barCount }, (_, i) => {
        const phase = (i / barCount) * Math.PI * 2
        return 0.35 + 0.25 * Math.sin(t * 2.4 + phase * 2)
      })
      waveformRef.current?.draw(samplesRef.current)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      cancelled = true
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [active, processing, barCount, updateRate])

  React.useEffect(() => {
    if (!active) {
      if (!processing) setSamples(new Array(barCount).fill(0))
      return
    }

    let cancelled = false

    void navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(async (stream) => {
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop()
          return
        }
        streamRef.current = stream
        onStreamReady?.(stream)

        const audioCtx = audioCtxRef.current
        if (!audioCtx || cancelled) return
        if (audioCtx.state === "suspended") await audioCtx.resume()
        if (cancelled) return

        const source = audioCtx.createMediaStreamSource(stream)
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = fftSize
        analyser.smoothingTimeConstant = smoothingTimeConstant
        source.connect(analyser)

        analyserRef.current = analyser

        const timeData = new Uint8Array(analyser.fftSize)
        let primed = false
        const tick = (now: number) => {
          if (cancelled) return
          rafRef.current = requestAnimationFrame(tick)
          if (now - lastUpdateRef.current < updateRate) return
          lastUpdateRef.current = now

          analyser.getByteTimeDomainData(timeData)
          let sumSquares = 0
          for (const v of timeData) {
            const centered = (v - 128) / 128
            sumSquares += centered * centered
          }
          const rms = Math.sqrt(sumSquares / timeData.length)
          const level = Math.min(1, rms * sensitivity * 4)

          if (!primed) {
            primed = true
            samplesRef.current = new Array(barCount).fill(level)
          } else {
            samplesRef.current = [...samplesRef.current.slice(1), level]
          }
          waveformRef.current?.draw(samplesRef.current)
        }
        rafRef.current = requestAnimationFrame(tick)
      })
      .catch((error: unknown) => {
        if (!cancelled) onError?.(error instanceof Error ? error : new Error(String(error)))
      })

    return () => {
      cancelled = true
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      for (const track of streamRef.current?.getTracks() ?? []) track.stop()
      streamRef.current = null
      analyserRef.current = null
      // Suspend rather than close — the context is owned by the mount effect
      // above and reused by the next activation, so closing it here would
      // bring back the first-activation construction cost on every restart.
      void audioCtxRef.current?.suspend()
      onStreamEnd?.()
    }
  }, [active, fftSize, smoothingTimeConstant, sensitivity, updateRate, barCount, onStreamReady, onStreamEnd, onError])

  return <Waveform ref={waveformRef} data={samples} {...waveformProps} />
}

export { Waveform, MicrophoneWaveform }
