---
name: CliniQ Landing
description: Negro-ciruela marketing world for CliniQ's public landing, a clinic day told live with magenta as the only light.
colors:
  plum-black: "#07040a"
  plum-sheet: "#0b0710"
  plum-surface: "#120b18"
  plum-surface-2: "#1a1022"
  plum-frame: "#0d0811"
  hairline: "rgba(255, 255, 255, 0.09)"
  paper-white: "#f7f2f5"
  paper-muted: "rgba(247, 242, 245, 0.66)"
  paper-faint: "rgba(247, 242, 245, 0.58)"
  magenta: "#d9226f"
  magenta-lit: "#ff6aa9"
  magenta-deep: "#b01a5b"
  status-ok: "#34d399"
  status-warn: "#fbbf24"
typography:
  display:
    fontFamily: "Hedvig Letters Serif, Georgia, serif"
    fontSize: "clamp(2.6rem, 4.5vw, 4.2rem)"
    fontWeight: 400
    lineHeight: 1.03
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Hedvig Letters Serif, Georgia, serif"
    fontSize: "clamp(1.9rem, 3.1vw, 2.85rem)"
    fontWeight: 400
    lineHeight: 1.06
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Hedvig Letters Serif, Georgia, serif"
    fontSize: "clamp(1.5rem, 2.2vw, 2rem)"
    fontWeight: 400
    lineHeight: 1.12
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.75
  body-small:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.867
  label:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0.14em"
  data:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    fontFeature: "tnum"
rounded:
  cta-cut: "0.9rem 0.9rem 0.9rem 0.25rem"
  cta-cut-compact: "0.7rem 0.7rem 0.7rem 0.2rem"
  md: "12px"
  lg: "16px"
  xl: "24px"
  sheet: "2.75rem"
  full: "9999px"
spacing:
  gutter: "20px"
  gutter-sm: "24px"
  section: "64px"
  section-lg: "128px"
  container: "1280px"
components:
  button-primary:
    backgroundColor: "{colors.magenta}"
    textColor: "#ffffff"
    typography: "{typography.body-small}"
    rounded: "{rounded.cta-cut}"
    padding: "0 20px"
    height: "48px"
  button-primary-compact:
    backgroundColor: "{colors.magenta}"
    textColor: "#ffffff"
    rounded: "{rounded.cta-cut-compact}"
    padding: "0 14px"
    height: "36px"
  ventana:
    backgroundColor: "{colors.plum-frame}"
    rounded: "{rounded.lg}"
  theater-panel:
    backgroundColor: "{colors.plum-surface}"
    rounded: "{rounded.lg}"
  bento-tile:
    backgroundColor: "{colors.plum-sheet}"
    padding: "36px"
  plan-cell:
    backgroundColor: "{colors.plum-surface}"
    rounded: "{rounded.lg}"
    padding: "28px"
  status-pill:
    rounded: "{rounded.full}"
    height: "24px"
    padding: "0 10px"
  chip-zone:
    rounded: "{rounded.full}"
    padding: "6px 12px"
---

# Design System: CliniQ Landing

This file documents the public marketing landing (route `/landing`) only. The authenticated app (shadcn/ui) is a separate system and is not covered here.

## Overview

**Creative North Star: "The Clinic Day, Live"**

The landing is one clinic day playing out on a plum-black stage: a reminder arrives, an appointment turns confirmed, a signature draws itself, an installment is paid, a second branch appears. It is not a feature list. Everything is subordinate to that continuity: a serif voice that speaks plainly, hairline structure that stays out of the way, and a single magenta light that marks where the day is happening.

The world is dark all the way down (`plum-black`), with a rounded top sheet (`plum-sheet`) that rises after the hero and carries every later section. Structure is drawn in 1px lines, never in boxes with fills and shadows. Product is shown as real text and real screenshots framed in the Ventana, always labeled as example data. The mood is calm, precise and slightly cinematic; the reference set was Resend and ManyChat (dark, mono-for-data, serif-led headings, product-in-motion).

Rejected by the direction: the hero with a static screenshot, and the grid of icon cards. Both are absent from the build.

The system is derived from the shipped code; the Creative North Star and color names are the documenter's reading of the direction contract, not a user-authored brief.

**Key Characteristics:**
- One dark surface family (plum-black, four steps), one accent family (magenta plus its lit tint), semantic status colors only inside status pills and ticks.
- Serif display in one weight (400), sans body, mono strictly for data.
- 1px hairlines at 7 to 10% white as the only structural device.
- Headings carry emphasis by coloring a key phrase `magenta-lit`, never by a label above them.
- Motion is authored in three places only: hero load-in, the 14-second theater loop, the recorrido step activation.

## Colors

A near-black plum field lit by one magenta; everything else is a tint of white on plum.

### Primary
- **Signal Magenta** (`magenta`, #d9226f): the fill of the primary CTA, the tint behind confirmation bubbles and active zone chips (at 14 to 22% alpha), the hero and closing glows. It is the only chromatic accent.
- **Lit Rose** (`magenta-lit`, #ff6aa9): the accent as it appears on dark text and lines: key phrases inside headings, active timeline node, progress pips, signature stroke, focus ring, low-stock values, the hairline highlight at the top of the sheet.
- **Deep Rose** (`magenta-deep`, #b01a5b): the arrow glyph inside the white circle of the CTA. Nothing else.

### Neutral
- **Plum Black** (`plum-black`, #07040a): page and body background, the hero, the scrolled header at 75% alpha.
- **Plum Sheet** (`plum-sheet`, #0b0710): the rounded sheet that holds every section after the hero, bento tiles, footer.
- **Plum Surface** (`plum-surface`, #120b18): theater panels, plan cells, audit and stock tables, FAQ error/empty cards. One step lighter than the sheet.
- **Plum Surface 2** (`plum-surface-2`, #1a1022): incoming chat bubble and other inner layers on a surface.
- **Plum Frame** (`plum-frame`, #0d0811): the Ventana body behind screenshots.
- **Hairline** (`hairline`, white at 9%): the token line; in practice borders are white at 7% (section dividers), 10% (cards, row separators at 6 to 8%), 12 to 15% (chips, inputs).
- **Paper White** (`paper-white`, #f7f2f5): headings and primary text; a warm off-white, never pure white except on the CTA and selection.
- **Paper Muted** (`paper-muted`, 66% of Paper White): body copy on plum.
- **Paper Faint** (`paper-faint`, 58% of Paper White): meta text, captions, footer. This is the floor for readable text on plum.

### Status (semantic only)
- **Status OK** (`status-ok`, #34d399): confirmed, completed, paid, signed, identity verified, operation active. Used as a pill tint (13% fill, emerald-300 text) or a 6px dot.
- **Status Warn** (`status-warn`, #fbbf24): pending and due-today only, as a pill (13% fill, amber-200 text).

### Named Rules
**The One Light Rule.** Magenta is the only accent. No violet, no second hue as decoration. Green and amber exist only to say a status, always inside a pill, dot or tick.

**The Glow Boundary Rule.** Magenta glow (blurred blob, radial pool, magenta-tinted shadow) lives only in the hero and the closing section. Under screenshots, tables and any other panel, shadows are black.

**The 58 Rule.** Copy on plum is never below 58% white. Muted (66%) is body, faint (58%) is the floor. The one transitional exception is the inactive Recorrido steps on desktop, dimmed to 60% opacity while another step is active.

## Typography

**Display Font:** Hedvig Letters Serif (Georgia fallback), self-hosted, single weight 400
**Body Font:** Geist (ui-sans-serif, system-ui fallback), variable 300 to 700
**Label/Mono Font:** Geist Mono (ui-monospace fallback), 400 to 600, tabular numerals

**Character:** A humane editorial serif speaks; a neutral grotesque explains; a monospace states facts. The serif carries the emotion, the mono carries the proof.

### Hierarchy
- **Display** (400, clamp(2.6rem, 4.5vw, 4.2rem), 1.03, tracking -0.025em): the hero h1 only, balanced wrap, with its second sentence colored `magenta-lit`.
- **Closing** (400, clamp(2.2rem, 5vw, 4.4rem), 1.04, -0.025em): the closing section headline, centered.
- **Headline** (400, clamp(1.9rem, 3.1vw, 2.85rem), 1.06, -0.02em): every section h2 (a variant at clamp(1.9rem, 3.2vw, 2.8rem) / 1.08 heads the FAQ).
- **Title** (400, clamp(1.55rem, 2.5vw, 2.25rem), 1.12, -0.015em): recorrido step titles. Bento tile titles use clamp(1.5rem, 2.2vw, 2rem).
- **Subtitle** (400, 1.5rem / 24px, tight): pain-list and plan-name h3s. Plan prices use 2.25rem in the display face.
- **Body** (400, 16px at base and 18px from sm, 1.75 to 2): section lead paragraphs, capped at max-w-md to max-w-xl (about 28 to 36rem). Secondary body is 15px / 1.867.
- **Small** (400 to 500, 13px / 1.25 to 12px): panel rows, table cells, meta.
- **Label** (Geist Mono 400, 10px, uppercase, tracking 0.14em): the "Ejemplo ilustrativo · datos ficticios" and "Datos de ejemplo" captions only.
- **Data** (Geist Mono, 11 to 20px, tabular numerals): times (09:00, 18:02), amounts ($180.000), counts, stock values, OTP digits, "Cuota 3 de 6".

### Named Rules
**The Mono Is Data Rule.** Geist Mono appears only where the text is a time, an amount, a count or a caption of example data. Never as texture or decoration. Plan prices in the pricing section are the exception: they are set in the display serif as headline numerals.

**The Emphasis-Inside Rule.** A heading gets emphasis by coloring a key phrase in `magenta-lit` inside the heading. There is no eyebrow, kicker, overline or label above a heading, and no section numbers. Numbers appear only as real chronology (08:00, 11:30, 18:00).

**The Balanced Serif Rule.** Every display and headline uses balanced wrapping and negative tracking; the serif has a slight word-spacing (0.03em).

## Layout

One centered container at 1280px (`max-w-7xl`) with 20px gutters, 24px from the small breakpoint. Sections are separated by a 1px hairline and 64px vertical padding, 128px from the small breakpoint (closing section: 96px, 160px). The first viewport is a two-column grid: headline column flexible on the left, a fixed 560px theater column on the right; under the large breakpoint the theater stacks below. Later sections favor an asymmetric 0.8fr / 1.2fr split with a 96px gap (heading and lead left, evidence right); the heading column may be sticky.

The hero is followed by a rounded top sheet (2rem radius, 2.75rem from large) with a top border and a 2/3-width magenta-lit hairline highlight fading to transparent at both ends; every remaining section, the FAQ and the closing sit inside it.

The recorrido is a two-column layout: a timeline rail of three steps (each at least 62vh on large screens) beside a sticky screenshot panel that swaps the Ventana as the active step changes. Under large, each step carries its own Ventana inline. The bento is a 3-column grid with 1px gaps over a white-10% background, so the gaps read as hairlines; tiles span 2 or 1 columns. Plans are a 1, 2 or 4-column grid of equal cells with 16px gaps.

The header is fixed, 64px high, transparent over the hero, and turns into a plum-black bar at 75% opacity with a 24px backdrop blur and a hairline border once scrollY exceeds 8.

### Responsive
Nav links show from the large breakpoint; "Iniciar sesión" from 420px; the compact CTA is always visible. The recorrido panel is hidden under large and replaced by inline Ventanas.

## Elevation & Depth

Depth is tonal and linear, not shadow-based. The stack is plum-black (hero), plum-sheet (sections), plum-surface (panels), plum-surface-2 (inner layers), separated by 1px hairlines. Shadows are deliberately rare and always black under content: a large soft drop under the Ventana and the stock table (`0 40px 100px -40px rgba(0,0,0,0.9)` and `-50px`).

The hero and closing are the only lit places. The hero holds a blurred magenta blob (16% alpha, 140px blur, 38rem), a radial magenta pool behind the theater (30% alpha), and a magenta-tinted shadow under each theater panel (`0 30px 70px -35px rgba(217,34,111,0.55)`). The closing has a bottom-anchored radial magenta pool (60% falling to transparent). A fine noise grain (7% overlay) sits over both to break flat gradients.

### Shadow Vocabulary
- **Screenshot drop** (`box-shadow: 0 40px 100px -40px rgba(0,0,0,0.9)`): under the Ventana.
- **Table drop** (`box-shadow: 0 40px 100px -50px rgba(0,0,0,0.9)`): under the multisede stock table.
- **Hero panel glow** (`box-shadow: 0 30px 70px -35px rgba(217,34,111,0.55)`): theater panels only.
- **CTA hover shadow** (`box-shadow: 0 18px 35px -18px rgb(190 24 93 / 70%)`, from `.landing-cta:hover` in globals.css): appears on hover only, with a 2px lift. The CTA has no shadow at rest.

### Named Rules
**The Black Under Content Rule.** Anything that is not the hero theater or the CTA casts a black shadow or none.

**The Hairline Depth Rule.** Separation is a 1px line at 6 to 10% white plus one tonal step; if a shadow is the only thing separating two surfaces, it is wrong.

## Shapes

Generous rounding on containers, one deliberate asymmetry on the action. Panels, Ventana, plan cells and tables use 16px; the bento container uses 24px; inner wells (dashboard preview, OTP box, audit list) use 12px; chips, pills and the FAQ toggle are fully round; the sheet has a 2rem to 2.75rem top radius. The primary CTA is a rounded rectangle with a single sharp-ish bottom-left corner (0.25rem against 0.9rem): the cut corner, carried over from the previous system. Lines are 1px throughout; timeline nodes are 10px circles with a 5px low-alpha halo when active. Chat bubbles are 16px with a 6px corner on the speaker's side.

## Components

### Buttons
- **Shape:** cut corner (0.9rem 0.9rem 0.9rem 0.25rem; compact 0.7rem 0.7rem 0.7rem 0.2rem).
- **Primary:** Signal Magenta fill, white 15px semibold text, 48px high, 20px horizontal padding, followed by a white 28px circle holding a Deep Rose arrow. Compact (header): 36px high, 14px padding, 14px text, bare arrow, no circle, no glow at rest.
- **Hover / Focus:** lifts 2px, glow shifts to deep rose, a white 18% sheen sweeps left to right over 600ms, arrow nudges 4px. Focus is the global 2px `magenta-lit` outline with 3px offset.
- **Secondary text link:** 14px semibold Paper Muted with a chevron that nudges on hover; turns white.
- **Outline (fallback only):** 44px full-round, 1px white 15% border, hover fills white 6%.
- **Plan link:** not a button: a full-width row with a hairline above, label left and arrow right.

### Chips and pills
- **Status pill:** 24px, full round, 11px medium, 13% tinted fill with a lighter tint of the same hue as text (ok: emerald, warn: amber). Swaps in place (cross-fade) when a status changes.
- **Zone chip:** full round, 12px text. Active: 50% Lit Rose border, 16% magenta fill, white text. Inactive: white 12% border, muted text.

### Cards / Containers
- **Ventana:** the mandatory frame for every product screenshot. 16px radius, Plum Frame body, 1px white 10% border, black drop. A 1px-separated header row holds two mono captions in 10px uppercase: the context on the left (white 60%) and "Datos de ejemplo" on the right (white 60%). No window dots, no traffic lights. The image below is full-bleed.
- **Theater panel:** 16px radius, Plum Surface, white 10% border, a head row (13px medium title left, mono 11px meta right) over a hairline, then rows or content.
- **Bento tile:** Plum Sheet fill on a hairline grid, 28px padding (36px from small), serif title then 15px muted text then a demonstration well below.
- **Plan cell:** Plum Surface, 16px radius, 28px padding, serif name, muted description, serif price with "/mes" in small faint text, list with 4px emerald dots, hairline plan link at the bottom. All plans look identical; none is highlighted.

### Navigation
Fixed 64px header, logo left, four anchor links at 14px Paper Muted turning white on hover, then "Iniciar sesión" text link and the compact CTA. Transparent at rest, translucent blurred plum at scroll. The four anchor links appear from 900px up; below that only the logo, "Iniciar sesión" (from 420px) and the CTA remain. A "Saltar al contenido" skip link is the first tab stop and only shows on focus.

### Signature: the Product Theater
Four panels in a 2-column grid: agenda (full width), WhatsApp and consent (half), payment agreement (full width). A 14-second loop plays: a typing indicator, the reminder bubble, the reply "Sí, confirmo", the appointment pill Pendiente to Confirmada with a 14% magenta row flash, the signature path drawing itself in Lit Rose, "Firmado electrónicamente" appearing, and the third of six installment pips lighting as "Vence hoy" becomes "Pagada". Under `prefers-reduced-motion` every element shows its final state. A caption "Ejemplo ilustrativo · datos ficticios" sits beneath. The OTP tile in the bento uses the same pattern on a 9-second loop.

### Signature: the Recorrido rail
A vertical 1px line with a 10px node per step; the time (08:00, 11:30, 18:00) in mono to the left, the moment label under it. The active step turns its node Lit Rose with a halo and its time white; inactive steps sit at 60% opacity on large screens. The transitions are 500ms; the panel swap is 700ms.

## Do's and Don'ts

### Do:
- **Do** use `plum-black` for the hero and `plum-sheet` for everything under it; use `plum-surface` for any panel that must sit above the sheet.
- **Do** color one key phrase per heading `magenta-lit` to carry emphasis.
- **Do** frame every product screenshot in the Ventana with the "Datos de ejemplo" caption. The one exception is the masked dashboard peek inside the first bento tile, which is a cropped image with its own "Ejemplo ilustrativo · datos ficticios" line beneath it.
- **Do** label every synthetic UI (theater, bento visuals, stock table, audit log) "Ejemplo ilustrativo · datos ficticios" and fill it with real text and plausible data, never placeholder bars.
- **Do** set times, amounts and counts in Geist Mono with tabular numerals.
- **Do** build separation from 1px hairlines at 6 to 10% white.
- **Do** keep body copy at 58% white or higher on plum.
- **Do** keep authored motion to the hero load-in, the theater loop and the recorrido step activation, and give reduced-motion users the final state.
- **Do** render plans, prices and feature flags from the API and show every plan identically.
- **Do** keep the header fixed, transparent over the hero, blurred plum after 8px of scroll.

### Don't:
- **Don't** place an eyebrow, kicker or overline above a heading, and don't number sections; only real chronology (08:00, 11:30, 18:00) may be numeric.
- **Don't** introduce a second accent hue (violet or otherwise) or magenta pools under any panel outside the hero and closing.
- **Don't** put a magenta or colored shadow under screenshots or tables; use black.
- **Don't** fade sections up on scroll.
- **Don't** highlight or badge a plan unless the API provides the flag.
- **Don't** use a grid of icon cards or a static hero screenshot.
- **Don't** use mono as decoration or sans for the display voice.
- **Don't** show real patient data; all demo content is the fictitious clinic in the screenshots.

## Not canonized

The old alternating light/dark "Clinic at Night" system, the Ventana window dots, warm-paper sections and legacy `data-reveal` scroll fade-ups (still in `globals.css` but unused by this page) are superseded and not part of this system.
