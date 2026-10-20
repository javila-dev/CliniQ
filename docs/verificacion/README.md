# Verificación transversal de CliniQ

Revisión de backend y frontend por módulos, hecha el 10/10/2026 sobre la rama `worktree-funnel-comercial`.

Busca:
- código faltante y errores previsibles;
- llamadas sin resolver, a APIs inexistentes o con parámetros mal enviados o mal leídos;
- permisos que no coinciden entre pantalla, backend y base de datos, incluidos los roles personalizados;
- estados de carga y manejo de errores.

Cada módulo tiene su propio archivo y se puede retomar por separado.

## Cómo continuar

1. Correr las verificaciones automáticas (sección de abajo) para ver si algo cambió.
2. Tomar el primer módulo de la tabla que no esté en "Corregido".
3. En su archivo:
   - corregir los hallazgos en orden de severidad;
   - marcar cada uno con ✅ y el commit;
   - correr sus **pruebas técnicas**;
   - pedir a alguien no técnico que haga sus **pruebas no técnicas**.
4. Actualizar el estado en la tabla.

El orden sigue el recorrido de un día en la clínica: entrar → configurar → registrar paciente → agendar → atender → cotizar y vender → cobrar → inventario y avisos. Así cada módulo se prueba con datos que dejó el anterior.

## Módulos

| # | Módulo | Archivo | Estado |
|---|---|---|---|
| T | Transversal (afecta a todos) | [00-transversal.md](00-transversal.md) | En corrección (paso 1 hecho) |
| M0 | Acceso, sesión, usuarios, roles y permisos | [m0-acceso-roles.md](m0-acceso-roles.md) | Revisado |
| M1 | Configuración de la clínica y catálogo | [m1-configuracion-catalogo.md](m1-configuracion-catalogo.md) | Revisado |
| M2 | Pacientes | [m2-pacientes.md](m2-pacientes.md) | Revisado |
| M3 | Agenda | [m3-agenda.md](m3-agenda.md) | Revisado |
| M4 | Atención clínica | [m4-atencion-clinica.md](m4-atencion-clinica.md) | Revisado |
| M5 | Comercial: cotizaciones, ventas, seguimiento | [m5-comercial.md](m5-comercial.md) | Revisado |
| M6 | Dinero: cobros, cartera, caja, resultados | [m6-dinero.md](m6-dinero.md) | Revisado |
| M7 | Inventario, compras, notificaciones y plataforma | [m7-inventario-plataforma.md](m7-inventario-plataforma.md) | Revisado |
| QA | Prueba simulada por perfiles (14/10/2026) | [qa-perfiles.md](qa-perfiles.md) | Revisado |
| FC | Flujo crítico cotización → agenda → atención (15/10/2026) | [revision-flujo-critico.md](revision-flujo-critico.md) | Revisado |

Los estados posibles son: Pendiente, Revisado (hallazgos listados), En corrección, Corregido y Probado por usuario.

## Severidad

| Nivel | Significa |
|---|---|
| **Crítico** | Pierde o expone datos, cobra mal, o bloquea una tarea diaria sin salida. |
| **Alto** | Una función no sirve o falla siempre para un grupo de usuarios, por ejemplo un rol personalizado. |
| **Medio** | Falla en un caso común, o falla sin explicar qué pasó. |
| **Bajo** | Confusión, texto poco claro o un caso raro. |

**Confianza:**
- *Confirmado*: se comprobó en el código o con una consulta.
- *Probable*: hay que reproducirlo antes de corregir.

## Verificaciones automáticas

Los scripts están en `backend/scripts/auditoria/` y escriben su resultado en `backend/scripts/auditoria/salida/`. Esa carpeta no se sube al repositorio.

### Llamadas del frontend contra las rutas reales del backend

Escribe `salida/rutas.txt` con:
- llamadas a rutas que no existen (404);
- métodos que el backend no acepta (405);
- rutas del backend que ninguna pantalla usa.

```bash
python backend/scripts/auditoria/extraer_llamadas_frontend.py
```

```bash
docker exec cliniq_backend python scripts/auditoria/verificar_rutas.py
```

### Permisos: catálogo, base de datos, backend y frontend

Escribe `salida/permisos.txt` con:
- claves inexistentes;
- permisos que el backend nunca revisa;
- claves que solo revisa el frontend;
- roles personalizados;
- chequeos por rol fijo.

```bash
python backend/scripts/auditoria/extraer_permisos_frontend.py
```

```bash
docker exec cliniq_backend python scripts/auditoria/verificar_permisos.py
```

### Manejo de errores y carga en el frontend

Escribe `salida/calidad_frontend.txt` con:
- guardados que fallan en silencio;
- consultas sin aviso de error;
- botones sin estado de "guardando".

Es una heurística: cada archivo de la lista se revisa a mano.

```bash
python backend/scripts/auditoria/calidad_frontend.py
```

### Campos de búsqueda, filtro y orden

Un nombre de campo equivocado no falla al arrancar: da error 500 recién cuando alguien usa el buscador. El script detecta esos campos inválidos en todas las vistas.

```bash
docker exec cliniq_backend python scripts/auditoria/verificar_campos_vistas.py
```

### Chequeos generales

```bash
docker exec cliniq_backend python manage.py check
```

```bash
docker exec cliniq_backend python manage.py makemigrations --check --dry-run
```

```bash
docker exec cliniq_frontend npx tsc --noEmit -p .
```

La suite completa se corre en serie: con `--parallel` falla el runner. Tarda unos 10 minutos.

```bash
docker exec cliniq_backend python manage.py test apps --noinput
```

Las pruebas de punta a punta (Playwright) están en `e2e/` y se corren con `npm test` dentro de esa carpeta.

## Usuarios de prueba para las pruebas no técnicas

Cada módulo pide probar con varios perfiles. Conviene tenerlos creados antes de empezar, en una clínica con **dos sedes**:

| Perfil | Cómo crearlo | Para qué |
|---|---|---|
| **Admin** | El dueño de la clínica. | Ver todo. |
| **Recepción** | Rol de sistema "Recepción", con una sola sede. | El uso diario. |
| **Profesional** | Rol de sistema "Profesional", con el check "atiende pacientes". | Atención y "solo su actividad". |
| **Rol personalizado** | Rol nuevo creado en Configuración → Roles, copiando los permisos de Recepción y con una sola sede. | Detectar chequeos por rol fijo: debe poder hacer exactamente lo mismo que Recepción. |
| **Rol mínimo** | Rol nuevo solo con "Ver agenda". | Comprobar que lo que no puede hacer no aparece o se explica. |
