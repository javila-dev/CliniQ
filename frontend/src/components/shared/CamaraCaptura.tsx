'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Camera, RotateCcw, Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  onCaptura: (file: File) => void
  onCancelar?: () => void
  labelCapturar?: string
}

// Fracción del área del viewfinder que ocupa el óvalo (debe coincidir con el SVG)
const OVAL_W = 0.65   // w-[65%]
const OVAL_H = 0.85   // h-[85%]
// Dentro del SVG viewBox 200×240, el óvalo tiene cx=100 cy=110 rx=72 ry=90
const OVAL_CX = 100 / 200   // 0.5  — centro horizontal dentro del SVG
const OVAL_CY = 110 / 240   // ~0.458
const OVAL_RX = 72  / 200   // radio horizontal relativo al SVG
const OVAL_RY = 90  / 240   // radio vertical relativo al SVG

type FaceStatus = 'none' | 'ok' | 'off'  // none = sin detector, ok = centrada, off = fuera

const CAMARA_LS_KEY = 'cliniq:camara-facial-preferida'

export function CamaraCaptura({ onCaptura, onCancelar, labelCapturar = 'Capturar foto' }: Props) {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const detectRef   = useRef<HTMLCanvasElement | null>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const rafRef      = useRef<number | null>(null)
  const detectorRef = useRef<{ detect: (src: HTMLVideoElement) => Promise<{ boundingBox: DOMRectReadOnly }[]> } | null>(null)

  const [estado, setEstado]           = useState<'iniciando' | 'activa' | 'preview' | 'error'>('iniciando')
  const [preview, setPreview]         = useState<string | null>(null)
  const [capturedFile, setCapturedFile] = useState<File | null>(null)
  const [errorMsg, setErrorMsg]       = useState<string | null>(null)
  const [faceStatus, setFaceStatus]   = useState<FaceStatus>('none')
  const [camaras, setCamaras]         = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId]       = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    try { return window.localStorage.getItem(CAMARA_LS_KEY) } catch { return null }
  })

  const listarCamaras = useCallback(async () => {
    try {
      const dispositivos = await navigator.mediaDevices.enumerateDevices()
      setCamaras(dispositivos.filter(d => d.kind === 'videoinput'))
    } catch {
      // enumerateDevices no disponible en este navegador
    }
  }, [])

  // Inicializar FaceDetector nativo del navegador (Chrome/Edge)
  useEffect(() => {
    if (typeof window !== 'undefined' && 'FaceDetector' in window) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        detectorRef.current = new (window as any).FaceDetector({ maxDetectedFaces: 1, fastMode: true })
      } catch {
        // no disponible en este navegador
      }
    }
    // Canvas auxiliar para detección
    detectRef.current = document.createElement('canvas')
    detectRef.current.width  = 320
    detectRef.current.height = 180
  }, [])

  const checkFace = useCallback(async () => {
    const video    = videoRef.current
    const detector = detectorRef.current
    const canvas   = detectRef.current
    if (!video || !detector || !canvas || video.readyState < 2) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Dibujar frame actual en el canvas de detección (escala reducida = más rápido)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    try {
      const faces = await detector.detect(canvas)
      if (faces.length === 0) {
        setFaceStatus('off')
        return
      }

      // Bounding box normalizada al canvas de detección
      const { x, y, width, height } = faces[0].boundingBox
      const cx = (x + width  / 2) / canvas.width
      const cy = (y + height / 2) / canvas.height

      // Convertir coordenadas del video al espacio del SVG overlay
      // El overlay ocupa OVAL_W × OVAL_H del viewfinder, centrado
      const marginX = (1 - OVAL_W) / 2
      const marginY = (1 - OVAL_H) / 2
      // Centro del óvalo en coordenadas normalizadas del viewfinder
      const ovalCx = marginX + OVAL_W * OVAL_CX
      const ovalCy = marginY + OVAL_H * OVAL_CY
      // Radios en coordenadas normalizadas
      const rx = OVAL_W * OVAL_RX
      const ry = OVAL_H * OVAL_RY

      // Test elipse: (cx-ox)²/rx² + (cy-oy)²/ry² ≤ 1
      const dx = (cx - ovalCx) / rx
      const dy = (cy - ovalCy) / ry
      const inside = dx * dx + dy * dy <= 1.0

      setFaceStatus(inside ? 'ok' : 'off')
    } catch {
      // FaceDetector puede fallar en frames específicos, ignorar
    }
  }, [])

  // Loop de detección cada 400ms mientras la cámara está activa
  useEffect(() => {
    if (estado !== 'activa' || !detectorRef.current) return

    let active = true
    let timeout: ReturnType<typeof setTimeout>

    async function loop() {
      if (!active) return
      await checkFace()
      timeout = setTimeout(loop, 400)
    }
    loop()

    return () => {
      active = false
      clearTimeout(timeout)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [estado, checkFace])

  useEffect(() => {
    iniciarCamara()
    return () => detenerCamara()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reaccionar a cámaras conectadas/desconectadas mientras el visor está abierto
  useEffect(() => {
    const md = navigator.mediaDevices
    if (!md?.addEventListener) return
    const handler = () => listarCamaras()
    md.addEventListener('devicechange', handler)
    return () => md.removeEventListener('devicechange', handler)
  }, [listarCamaras])

  async function iniciarCamara(preferidoId?: string | null) {
    setEstado('iniciando')
    setErrorMsg(null)
    setFaceStatus('none')

    // Un `preferidoId` explícito (incluido null) manda; si no, se usa el guardado
    const idObjetivo = preferidoId !== undefined ? preferidoId : deviceId
    const base = { width: { ideal: 1280 }, height: { ideal: 720 } }
    const constraints: MediaStreamConstraints = {
      video: idObjetivo
        ? { ...base, deviceId: { exact: idObjetivo } }
        : { ...base, facingMode: 'user' },
    }
    const fallback: MediaStreamConstraints = { video: { ...base, facingMode: 'user' } }

    try {
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints)
      } catch (err) {
        // La cámara guardada puede haberse desconectado: reintentar con la frontal
        if (!idObjetivo) throw err
        stream = await navigator.mediaDevices.getUserMedia(fallback)
      }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      // Reflejar la cámara que realmente quedó activa (por si hubo fallback)
      const activo = stream.getVideoTracks()[0]?.getSettings().deviceId
      if (activo) setDeviceId(activo)
      setEstado('activa')
      listarCamaras()
    } catch {
      setErrorMsg('No se pudo acceder a la cámara. Verifica que el navegador tenga permiso.')
      setEstado('error')
    }
  }

  function cambiarCamara(nuevoId: string) {
    if (!nuevoId || nuevoId === deviceId) return
    try { window.localStorage.setItem(CAMARA_LS_KEY, nuevoId) } catch { /* almacenamiento no disponible */ }
    setDeviceId(nuevoId)
    detenerCamara()
    iniciarCamara(nuevoId)
  }

  function detenerCamara() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  function capturar() {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    // Recorte cuadrado centrado en el frame del video
    const vw = video.videoWidth
    const vh = video.videoHeight
    const size = Math.min(vw, vh)
    const sx = (vw - size) / 2
    const sy = (vh - size) / 2

    canvas.width  = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Espejo horizontal (scaleX(-1)) sobre el recorte cuadrado
    ctx.save()
    ctx.translate(size, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size)
    ctx.restore()

    canvas.toBlob((blob) => {
      if (!blob) return
      const file = new File([blob], `foto_${Date.now()}.jpg`, { type: 'image/jpeg' })
      setCapturedFile(file)
      setPreview(canvas.toDataURL('image/jpeg'))
      detenerCamara()
      setEstado('preview')
    }, 'image/jpeg', 0.92)
  }

  function reintentar() {
    setPreview(null)
    setCapturedFile(null)
    setFaceStatus('none')
    setEstado('iniciando')
    iniciarCamara()
  }

  function confirmar() {
    if (capturedFile) onCaptura(capturedFile)
  }

  // Colores del óvalo según estado de detección
  const ovalStroke =
    faceStatus === 'ok'  ? 'rgba(74,222,128,0.95)'  :   // verde
    faceStatus === 'off' ? 'rgba(251,191,36,0.85)'  :   // amarillo — cara fuera
                           'rgba(255,255,255,0.75)'      // blanco — sin detector

  const ovalDash   = faceStatus === 'ok' ? '0' : '8 5'
  const textColor  =
    faceStatus === 'ok'  ? 'rgba(74,222,128,0.90)'  :
    faceStatus === 'off' ? 'rgba(251,191,36,0.85)'  :
                           'rgba(255,255,255,0.70)'

  const guideText  =
    faceStatus === 'ok'  ? '✓ Listo para capturar'        :
    faceStatus === 'off' ? 'Centra tu rostro en el óvalo' :
                           'Centra tu rostro aquí'

  return (
    <div className="space-y-3">
      {/* Viewfinder */}
      <div className="relative rounded-lg overflow-hidden bg-black aspect-square w-full max-w-sm mx-auto">
        {/* Video en vivo — espejado */}
        <video
          ref={videoRef}
          muted
          playsInline
          className="w-full h-full object-cover"
          style={{ display: estado === 'activa' ? 'block' : 'none', transform: 'scaleX(-1)' }}
        />

        {/* Preview de la foto capturada */}
        {estado === 'preview' && preview && (
          <img src={preview} alt="Foto capturada" className="w-full h-full object-cover" />
        )}

        {/* Iniciando */}
        {estado === 'iniciando' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-xs">Iniciando cámara…</p>
          </div>
        )}

        {/* Error */}
        {estado === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
            <AlertTriangle className="h-6 w-6 text-amber-400" />
            <p className="text-xs text-amber-200">{errorMsg}</p>
            <button onClick={reintentar} className="text-xs text-white underline mt-1">Reintentar</button>
          </div>
        )}

        {/* Silueta guía de cara — solo mientras la cámara está activa */}
        {estado === 'activa' && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <svg
              viewBox="0 0 200 240"
              className="w-[65%] h-[85%]"
              xmlns="http://www.w3.org/2000/svg"
              style={{ transition: 'all 0.3s ease' }}
            >
              <defs>
                <mask id="face-mask">
                  <rect width="200" height="240" fill="white" />
                  <ellipse cx="100" cy="110" rx="72" ry="90" fill="black" />
                </mask>
                {/* Glow verde cuando está ok */}
                <filter id="glow">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              {/* Fondo oscuro recortado */}
              <rect width="200" height="240" fill="rgba(0,0,0,0.35)" mask="url(#face-mask)" />

              {/* Borde del óvalo — cambia de color */}
              <ellipse
                cx="100" cy="110" rx="72" ry="90"
                fill={faceStatus === 'ok' ? 'rgba(74,222,128,0.08)' : 'none'}
                stroke={ovalStroke}
                strokeWidth={faceStatus === 'ok' ? '3' : '2.5'}
                strokeDasharray={ovalDash}
                filter={faceStatus === 'ok' ? 'url(#glow)' : undefined}
                style={{ transition: 'stroke 0.3s ease, fill 0.3s ease' }}
              />

              {/* Texto guía */}
              <text
                x="100" y="222"
                textAnchor="middle"
                fill={textColor}
                fontSize="10"
                fontFamily="sans-serif"
                style={{ transition: 'fill 0.3s ease' }}
              >
                {guideText}
              </text>
            </svg>
          </div>
        )}

        {/* Canvas oculto para captura */}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Selector de cámara — solo si el dispositivo tiene más de una */}
      {estado === 'activa' && camaras.length > 1 && (
        <div className="mx-auto flex w-full max-w-sm items-center gap-2">
          <Camera className="h-4 w-4 shrink-0 text-muted-foreground" />
          <select
            value={deviceId ?? ''}
            onChange={(e) => cambiarCamara(e.target.value)}
            aria-label="Seleccionar cámara"
            className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
          >
            {camaras.map((cam, idx) => (
              <option key={cam.deviceId || idx} value={cam.deviceId}>
                {cam.label || `Cámara ${idx + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Acciones */}
      {estado === 'activa' && (
        <div className="flex gap-2">
          {onCancelar && (
            <Button variant="outline" className="flex-1" onClick={() => { detenerCamara(); onCancelar() }}>
              Cancelar
            </Button>
          )}
          <Button className="flex-1 gap-2" onClick={capturar}>
            <Camera className="h-4 w-4" />
            {labelCapturar}
          </Button>
        </div>
      )}

      {estado === 'preview' && (
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 gap-1.5" onClick={reintentar}>
            <RotateCcw className="h-3.5 w-3.5" />
            Retomar
          </Button>
          <Button className="flex-1" onClick={confirmar}>
            Usar esta foto
          </Button>
        </div>
      )}
    </div>
  )
}
