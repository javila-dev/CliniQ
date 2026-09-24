# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Comprador/decisor:** el dueño o administrador de una clínica estética en Colombia, a veces con varias sedes, evaluando reemplazar WhatsApp/Excel/papel por un sistema real.

**Usuarios diarios:** recepción, profesionales (esteticistas/médicos) y el admin de la clínica, coordinando agenda, historia clínica, consentimientos, cobros e inventario dentro de cada sede.

## Product Purpose

CliniQ es un sistema de gestión para clínicas estéticas: agenda, historia clínica con fotos, consentimientos con firma legal, cartera y cobros, inventario, proveedores/compras, comisiones y reportes — todo en un mismo sistema, pensado para el día a día real de una clínica (no una agenda genérica adaptada a la fuerza). El principio rector del producto es operar sin papel: nada que hoy se firme, imprima o anote a mano debería requerirlo dentro de CliniQ.

## Positioning

Lo que un competidor tipo AgendaPro o Doctocliq no puede copiar fácilmente sin rehacer su producto:

- **Cartera con acuerdos de pago con firma legal** — tratamientos financiados en cuotas, con acta de renegociación firmada (Documenso), no una hoja de cálculo.
- **Verificación facial + check-in por OTP de WhatsApp** — confirma identidad del paciente en el mostrador sin depender de que recepción lo reconozca.
- **Control de stock por sede** — el catálogo de insumos es compartido, pero el stock físico y el costo promedio son independientes por sede; compras, consumo en atención y ajustes quedan atados a la sede real.
- **Procedimientos empaquetados en tratamientos/protocolos** — sesiones con seguimiento de progreso, no solo un servicio suelto por cita.
- **Permisos granulares con auditoría** — RBAC fino, enmascarado de datos sensibles del paciente, y log de acciones por usuario.
- **Integración nativa con WhatsApp** (vía n8n) — recordatorios, confirmaciones, envío de documentos y OTP, sin depender de un BSP de terceros cobrando por conversación.
- **Consola multi-tenant** (`/console`) — ya lista para vender y administrar varias clínicas como SaaS, con planes y addons por clínica.

## Operating Context

- Mercado objetivo: clínicas estéticas y de bienestar en Colombia (moneda COP, zona horaria America/Bogota, identidad de clínica por NIT).
- Firma electrónica de consentimientos, actas de compromiso de pago y asistencia vía Documenso.
- Automatizaciones y mensajería de WhatsApp orquestadas por n8n.
- Infraestructura: Docker + Dokploy sobre Contabo/Hostinger; backend Django 5 + DRF + PostgreSQL (pgvector); frontend Next.js 15 (App Router) + Tailwind + shadcn/ui.
- Autenticación de superadmin puede impersonar/operar dentro de cualquier clínica desde `/console`.

## Capabilities and Constraints

- Control de stock por insumo **por sede** (recién migrado): el catálogo de insumos es compartido entre sedes, el stock y costo promedio no.
- Sin pasarela de pago integrada todavía (ni para cobrar a pacientes ni para cobrar la suscripción SaaS) — brecha conocida, no resuelta.
- Sin facturación electrónica DIAN ni RIPS todavía — brecha conocida para vender a clínicas médicas reguladas, no resuelta.
- Reconocimiento facial corre contra un servicio propio auto-hospedado (no API de terceros por transacción) — sin costo marginal por verificación.
- Registro de clínica nueva es self-service (`/registro-clinica`) con confirmación por email y prueba gratuita de 14 días, sin tarjeta de crédito.
- Precios de planes viven en base de datos (modelo `Plan`), no hardcodeados — editables desde `/console/planes` sin tocar código.

## Brand Commitments

Nombre del producto: **CliniQ**.

## Evidence on Hand

Primer cliente real pagando: **Beauty Clinic**, clínica estética multisede en Colombia (3 sedes, ~30 usuarios), operando en producción. Es la referencia concreta de que el producto funciona para el caso de uso multisede real, no solo en teoría.

Sin testimonios, casos de estudio publicados, ni prensa — no fabricar ninguno de estos para la landing u otras piezas.

## Product Principles

1. **Cero papel.** Todo lo que hoy se firma, imprime o anota a mano en una clínica debería poder hacerse dentro de CliniQ.
2. **Construido para la especialidad, no adaptado a la fuerza.** Zonas de tratamiento, protocolos con sesiones, y consentimientos por procedimiento — no una agenda genérica con campos personalizados.
3. **La sede es una unidad operativa real.** Stock, compras y (cuando aplica) el consumo diario respetan que cada sede es un lugar físico distinto, no un filtro cosmético.
4. **Confianza operativa antes que crecimiento cosmético.** Permisos granulares, auditoría y verificación de identidad existen porque clínicas con rotación de personal y varias sedes lo necesitan de verdad, no como checkbox de venta.
5. **El precio y el catálogo son datos, no código.** Planes, addons y sus precios se administran desde `/console`, no se hardcodean en el frontend.

## Accessibility & Inclusion

Ningún requisito específico confirmado todavía.
