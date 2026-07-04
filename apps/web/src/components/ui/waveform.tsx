import * as React from "react"
import { cn } from "@/lib/utils"

export interface WaveformProps extends Omit<React.ComponentProps<"div">, "onError"> {
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

/** Base canvas bar-chart renderer — draws `data` (each 0-1) as vertical bars
 *  in a single monochrome color, fading each bar's opacity with its own
 *  amplitude so a livelier signal reads as more present, not more colorful. */
function Waveform({
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
}: WaveformProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)

  React.useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = container.getBoundingClientRect()
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      draw()
    }

    const draw = () => {
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      const dpr = window.devicePixelRatio || 1
      const w = canvas.width
      const h = canvas.height
      const centerY = h / 2
      const step = (barWidth + barGap) * dpr
      const maxBarHeight = h * 0.92

      ctx.clearRect(0, 0, w, h)
      const color = barColor ?? getComputedStyle(canvas).color

      for (let i = 0; i < data.length; i++) {
        const amp = Math.max(0, Math.min(1, data[i] ?? 0))
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
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [data, barWidth, barHeight, barGap, barRadius, barColor, minOpacity, fadeEdges, fadeWidth])

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
}

export interface MicrophoneWaveformProps
  extends Omit<WaveformProps, "data" | "onBarClick"> {
  active?: boolean
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
  const audioCtxRef = React.useRef<AudioContext | null>(null)
  const analyserRef = React.useRef<AnalyserNode | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const rafRef = React.useRef<number | null>(null)
  const lastUpdateRef = React.useRef(0)

  React.useEffect(() => {
    if (!active) {
      setSamples(new Array(barCount).fill(0))
      return
    }

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

        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const audioCtx = new AudioCtx()
        const source = audioCtx.createMediaStreamSource(stream)
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = fftSize
        analyser.smoothingTimeConstant = smoothingTimeConstant
        source.connect(analyser)

        audioCtxRef.current = audioCtx
        analyserRef.current = analyser

        const timeData = new Uint8Array(analyser.fftSize)
        const tick = (now: number) => {
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

          setSamples((prev) => [...prev.slice(1), level])
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
      void audioCtxRef.current?.close()
      audioCtxRef.current = null
      analyserRef.current = null
      onStreamEnd?.()
    }
  }, [active, fftSize, smoothingTimeConstant, sensitivity, updateRate, barCount, onStreamReady, onStreamEnd, onError])

  return <Waveform data={samples} {...waveformProps} />
}

export { Waveform, MicrophoneWaveform }
