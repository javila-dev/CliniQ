// Ilustraciones de línea del landing. Todo es SVG: sin peso de imágenes, y las
// animaciones (landing.css) se apagan con prefers-reduced-motion.

const LUZ = '#ff6aa9'
const MAGENTA = '#d9226f'

/** La Q del logo en contorno, con un tramo de luz que la recorre. Va detrás del CTA final. */
export function QAnimada({ className = '' }: { className?: string }) {
  const arco = 'M169 165A80 80 0 1 1 190 108'
  const check = 'M160 182l24 24 47-44'
  return (
    <svg viewBox="0 0 256 256" fill="none" aria-hidden className={className}>
      <g stroke={LUZ} strokeLinecap="round" strokeLinejoin="round">
        <path d={arco} strokeWidth="16" opacity="0.1" />
        <path d={check} strokeWidth="16" opacity="0.1" />
        <path className="lv3-recorre" d={arco} pathLength={1} strokeDasharray="0.14 0.86" strokeWidth="16" opacity="0.55" />
        <path className="lv3-recorre" d={check} pathLength={1} strokeDasharray="0.35 0.65" strokeWidth="16" opacity="0.45" style={{ animationDelay: '-3s' }} />
      </g>
      <g fill={LUZ} opacity="0.08">
        <rect x="98" y="65" width="28" height="86" rx="9" />
        <rect x="69" y="94" width="86" height="28" rx="9" />
      </g>
    </svg>
  )
}

/** Celular con un documento: la firma se dibuja y aparece el sello de firmado. */
export function CelularFirma({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 190" fill="none" aria-hidden className={className}>
      <rect x="8" y="4" width="104" height="182" rx="18" stroke="currentColor" strokeWidth="1.6" />
      <rect x="45" y="12" width="30" height="5" rx="2.5" fill="currentColor" opacity="0.25" />
      <g fill="currentColor" opacity="0.14">
        <rect x="20" y="30" width="62" height="5" rx="2.5" />
        <rect x="20" y="42" width="80" height="4" rx="2" />
        <rect x="20" y="51" width="72" height="4" rx="2" />
        <rect x="20" y="60" width="78" height="4" rx="2" />
        <rect x="20" y="69" width="50" height="4" rx="2" />
      </g>
      <path d="M20 134H100" stroke="currentColor" strokeWidth="1" opacity="0.35" />
      <g transform="translate(16 96) scale(0.72)">
        <path
          className="lv3-firma-trazo"
          pathLength={1}
          d="M6 30 C 14 6, 22 42, 32 20 S 48 6, 56 24 S 72 38, 84 14 S 100 10, 112 26"
          stroke={MAGENTA}
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      </g>
      <g className="lv3-sello">
        <circle cx="88" cy="160" r="12" fill="#059669" />
        <path d="M82 160l4 4 8-8" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  )
}

const SEDES = [
  { nombre: 'Sede principal', x: 90 },
  { nombre: 'Sede norte', x: 260 },
  { nombre: 'Sede sur', x: 430 },
]

/** El catálogo compartido fluye hacia cada sede, que conserva su propia operación. */
export function RedSedes({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 520 150" fill="none" aria-hidden className={className} style={{ fontFamily: 'var(--font-lv3-sans), sans-serif' }}>
      {SEDES.map((s) => {
        const d = `M260 42C260 70 ${s.x} 66 ${s.x} 95`
        return (
          <g key={s.nombre}>
            <path d={d} stroke="#fff" strokeOpacity="0.1" strokeWidth="1" />
            <path className="lv3-flujo" d={d} stroke={LUZ} strokeOpacity="0.75" strokeWidth="1.5" strokeDasharray="4 4" strokeLinecap="round" />
          </g>
        )
      })}
      <rect x="165" y="8" width="190" height="34" rx="17" fill={MAGENTA} fillOpacity="0.18" stroke={LUZ} strokeOpacity="0.5" />
      <text x="260" y="30" textAnchor="middle" fill="#f7f2f5" fontSize="13" fontWeight="600">Catálogo compartido</text>
      {SEDES.map((s) => (
        <g key={s.nombre}>
          <rect x={s.x - 72} y="95" width="144" height="34" rx="17" fill="#fff" fillOpacity="0.04" stroke="#fff" strokeOpacity="0.14" />
          <circle cx={s.x - 52} cy="112" r="3.5" fill="#34d399" />
          <text x={s.x + 8} y="116.5" textAnchor="middle" fill="#f7f2f5" fillOpacity="0.85" fontSize="12">{s.nombre}</text>
        </g>
      ))}
    </svg>
  )
}

export type Rol = 'recepcion' | 'profesional' | 'administracion'

/** Dibujo de línea de cada rol del recorrido; se traza cuando el paso está activo (data-activo en un ancestro). */
export function DibujoRol({ rol, className = '' }: { rol: Rol; className?: string }) {
  const p = { pathLength: 1 }
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden className={`lv3-dibujo ${className}`}>
      <g stroke={LUZ} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {rol === 'recepcion' && (
          <>
            <path {...p} d="M8 40H56" />
            <path {...p} d="M12 40V54M52 40V54" />
            <rect {...p} x="18" y="20" width="22" height="14" rx="2" />
            <path {...p} d="M29 34V40" />
            <path {...p} d="M43 39C43 34 46 31 50 31C54 31 57 34 57 39M50 31V28" />
          </>
        )}
        {rol === 'profesional' && (
          <>
            <path {...p} d="M6 42H58" />
            <path {...p} d="M10 42V54M54 42V54" />
            <path {...p} d="M6 42L14 34H30" />
            <rect {...p} x="30" y="36" width="24" height="6" rx="3" />
            <path {...p} d="M46 8V16M39 16H53L49 24H43Z" />
            <path {...p} d="M20 12L22 17L27 19L22 21L20 26L18 21L13 19L18 17Z" />
          </>
        )}
        {rol === 'administracion' && (
          <>
            <path {...p} d="M10 54H56M10 54V12" />
            <rect {...p} x="16" y="40" width="6" height="14" rx="1" />
            <rect {...p} x="26" y="32" width="6" height="22" rx="1" />
            <rect {...p} x="36" y="36" width="6" height="18" rx="1" />
            <rect {...p} x="46" y="24" width="6" height="30" rx="1" />
            <path {...p} d="M16 30L28 20L38 24L52 12M46 12H52V18" />
          </>
        )}
      </g>
    </svg>
  )
}
