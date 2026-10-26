import Image from 'next/image'
import Link from 'next/link'
import { INICIO_SITIO, urlApp } from '@/lib/dominios'
import { sans, mono } from '../landing/fonts'
import '../landing/landing.css'
import { EMPRESA } from '../empresa'

export { EMPRESA }

export const VIGENCIA = '24 de octubre de 2026'

export type Seccion = { id: string; titulo: string; contenido: React.ReactNode }

/** Marco común de las páginas legales del sitio público: blanco, índice lateral y secciones numeradas. */
export function PaginaLegal({
  titulo,
  resumen,
  secciones,
  otra,
}: {
  titulo: string
  resumen: React.ReactNode
  secciones: Seccion[]
  otra: { href: string; texto: string }
}) {
  return (
    <div className={`${sans.variable} ${mono.variable} lv3 lv3-light min-h-screen`}>
      <header className="border-b border-[var(--lv3-line)]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-6">
          <Link href={INICIO_SITIO} aria-label="Ir al inicio de CliniQ">
            <Image src="/brand/cliniq-logo-horizontal.svg" alt="CliniQ" width={116} height={36} className="h-auto w-[96px]" />
          </Link>
          <nav className="flex items-center gap-5 text-sm text-[var(--lv3-muted)]">
            <Link href={otra.href} className="hidden transition-colors hover:text-[var(--lv3-text)] sm:inline">{otra.texto}</Link>
            <Link href={urlApp('/login')} className="transition-colors hover:text-[var(--lv3-text)]">Iniciar sesión</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-24 pt-14 sm:px-6 sm:pt-20">
        <p className="text-sm text-[var(--lv3-lit)] font-medium">Última actualización · {VIGENCIA}</p>
        <h1 className="lv3-display mt-4 max-w-3xl text-[clamp(2.2rem,4.2vw,3.4rem)] leading-[1.05] tracking-[-0.025em] [text-wrap:balance]">{titulo}</h1>
        <div className="mt-6 max-w-2xl text-base leading-7 text-[var(--lv3-muted)]">{resumen}</div>

        <div className="mt-14 grid gap-12 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-16">
          <nav aria-label="Contenido" className="lg:sticky lg:top-8 lg:self-start">
            <p className="text-xs font-medium text-[var(--lv3-faint)]">Contenido</p>
            <ol className="mt-3 space-y-2 border-l border-[var(--lv3-line)] text-sm">
              {secciones.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="-ml-px flex gap-2 border-l border-transparent pl-4 text-[var(--lv3-muted)] transition-colors hover:border-[#d9226f] hover:text-[var(--lv3-text)]">
                    <span className="lv3-mono text-xs leading-5 text-[var(--lv3-faint)]">{String(i + 1).padStart(2, '0')}</span>
                    {s.titulo}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="max-w-3xl">
            {secciones.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-8 border-t border-[var(--lv3-line)] py-9 first:border-t-0 first:pt-0">
                <h2 className="lv3-display flex items-baseline gap-3 text-2xl leading-tight tracking-[-0.015em]">
                  <span className="lv3-mono text-sm text-[var(--lv3-lit)]">{String(i + 1).padStart(2, '0')}</span>
                  {s.titulo}
                </h2>
                <div className="legal-texto mt-4 space-y-4 text-[15px] leading-7 text-[var(--lv3-muted)]">{s.contenido}</div>
              </section>
            ))}
          </article>
        </div>
      </main>

      <footer className="lv3-dark">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-xs text-[var(--lv3-faint)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            © {new Date().getFullYear()} {EMPRESA.razonSocial} · NIT {EMPRESA.nit}
          </p>
          <div className="flex gap-5">
            <Link href="/terminos" className="transition-colors hover:text-white">Términos y condiciones</Link>
            <Link href="/privacidad" className="transition-colors hover:text-white">Tratamiento de datos</Link>
            <a href={`mailto:${EMPRESA.correo}`} className="transition-colors hover:text-white">{EMPRESA.correo}</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
