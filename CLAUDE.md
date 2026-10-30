# CliniQ

## Política de pruebas

La suite completa del backend tiene más de 1000 pruebas y tarda más de 10 minutos.
No se corre en cada cambio: se corre lo que el cambio puede romper, y la suite
completa una vez antes de que el código llegue a `main`. No hay CI y un push a
`main` despliega directo a producción, así que esa corrida es la única compuerta.

### Qué correr en cada momento

| Momento | Qué se corre |
|---|---|
| Mientras se desarrolla | Las pruebas del archivo o módulo tocado y las nuevas. |
| Al cerrar una feature, antes del commit | Las apps tocadas y las que dependen de ellas (tabla de abajo). |
| Antes de fusionar a `main` o desplegar | La suite completa, una vez, sobre el código ya fusionado. |
| El cambio toca el núcleo (ver abajo) | La suite completa, aunque el cambio sea pequeño. |
| Solo frontend | `tsc --noEmit` (y las pruebas e2e del flujo, si existen). Sin suite del backend. |
| Solo documentación o contenido de ayuda | Nada, o las pruebas de `ayuda` si cambió `apps/ayuda/contenido`. |

Si una prueba falla en una corrida parcial, se arregla y se repite esa misma
corrida parcial; no hace falta volver a correr todo.

### El núcleo: cambios que piden la suite completa

Casi todas las apps importan estas piezas, así que un cambio en ellas puede
romper cualquier flujo:

- `apps/users` (permisos, `permissions_catalog.py`, autenticación, roles)
- `apps/core` (modelos base, logging, storage, `clinica_scope`)
- `apps/clinicas` y `apps/agenda` (modelos de clínica, sede, servicio y cita)
- `config/` (settings, urls, middleware)
- Una migración que cambie un modelo de esas apps

`apps/core/tests/` guarda las regresiones transversales (flujo crítico,
verificación por pasos): son parte de la suite completa y conviene correrlas
también cuando se toca uno de esos flujos.

### Qué apps dependen de cuál

Al cambiar una app, correr sus pruebas y las de las apps que la importan
(sacado de los imports del código, sin contar el núcleo, que lo importan casi todas):

| Si cambia… | Correr también |
|---|---|
| `historia_clinica` | agenda, configuracion, consentimientos, cotizaciones, inventario, obesidad, pacientes, protocolos |
| `cotizaciones` | agenda, cartera, consentimientos, historia_clinica, inventario, migracion, reportes, seguimiento |
| `protocolos` | agenda, cotizaciones, historia_clinica, inventario, migracion, pacientes, seguimiento |
| `pacientes` | agenda, configuracion, consentimientos, cotizaciones, historia_clinica, migracion, notificaciones, seguimiento, suscripciones |
| `cobros` | agenda, caja, cartera, cotizaciones, inventario, migracion, reportes, suscripciones |
| `cartera` | agenda, cobros, consentimientos, cotizaciones, historia_clinica, migracion, reportes |
| `consentimientos` | agenda, cartera, cotizaciones, historia_clinica, migracion |
| `notificaciones` | agenda, consentimientos, cotizaciones, historia_clinica, protocolos, reportes, seguimiento, suscripciones |
| `inventario` | cobros, cotizaciones, historia_clinica, proveedores, reportes |
| `suscripciones` | agenda, clinicas, notificaciones, users |
| `seguimiento` | agenda, cotizaciones, notificaciones |
| `colaboradores` | agenda, clinicas, users |
| `configuracion` | clinicas, cotizaciones, historia_clinica, pacientes |
| `obesidad` | agenda, historia_clinica, migracion |
| `caja` | reportes |
| `proveedores` | inventario |
| `migracion` | agenda |
| `reportes`, `ayuda`, `comisiones` | solo las suyas |

Si se agregan imports nuevos entre apps, actualizar esta tabla.

### Cómo correrlas más rápido

- `--keepdb` reutiliza la base de prueba y no reaplica todas las migraciones en
  cada corrida. Sin él, buena parte del tiempo se va en crear la base.
  Si se agregó una migración, la primera corrida la aplica igual.
- `--parallel auto` reparte las pruebas en varias bases clonadas.
- Otra sesión puede estar corriendo pruebas a la vez sobre la misma base de
  prueba (`test_<POSTGRES_DB>`). Para una corrida aislada, usar un settings que
  cambie `DATABASES["default"]["TEST"]["NAME"]`.

```bash
docker exec cliniq_backend python manage.py test apps.historia_clinica apps.agenda --keepdb --parallel auto
```

Las 7 pruebas de `apps.users.tests.test_google_login` fallan en local porque la
imagen no trae el paquete `google`; no cuentan como regresión.
