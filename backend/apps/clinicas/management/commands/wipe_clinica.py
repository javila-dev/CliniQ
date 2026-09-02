"""
Vacía por completo una clínica: borra en cascada todos sus datos operativos
(pacientes, citas, cotizaciones, cartera, cobros, historias, consentimientos,
colaboradores, sedes, catálogo, inventario, proveedores, caja, roles dinámicos,
logs…) y deja únicamente el registro de la ``Clinica`` y **un** usuario admin
que el operador elige.

No toca catálogos globales compartidos entre clínicas (planes, diagramas
corporales, grupos de zonas, permisos) ni a otros usuarios superadmin.

Uso:
    python manage.py wipe_clinica                     # 100% interactivo
    python manage.py wipe_clinica --clinica <id|nombre>
    python manage.py wipe_clinica --clinica <id> --admin <email> --dry-run
    python manage.py wipe_clinica --clinica <id> --admin <email> --yes

Notas:
    - Es una operación destructiva e irreversible. Corre dentro de una
      transacción: si algo falla, no se borra nada.
    - No elimina archivos de media (fotos, PDFs, firmas) del storage; solo
      las filas de la base de datos.
"""
from __future__ import annotations

from django.apps import apps
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models.deletion import ProtectedError, RestrictedError

# ── Alcance por modelo ────────────────────────────────────────────────
# Para cada modelo "de inquilino", cómo filtrar sus filas a una clínica.
# El borrado es iterativo (punto fijo), así que este orden es solo una
# pista de "hojas primero" para converger rápido, no una garantía.
TENANT_SCOPES: dict[str, str] = {
    # --- Historia clínica y datos clínicos del paciente ---
    "historia_clinica.OrdenMedicaAuditoria": "orden__historia__clinica_id",
    "historia_clinica.OrdenMedica": "historia__clinica_id",
    "historia_clinica.ResultadoExamen": "historia__clinica_id",
    "historia_clinica.AnotacionZona": "nota__historia__clinica_id",
    "historia_clinica.FotoClinica": "nota__historia__clinica_id",
    "historia_clinica.NotaClinica": "historia__clinica_id",
    "obesidad.AntecedentesObesidad": "historia__clinica_id",
    "obesidad.MedicionAntropometrica": "paciente__clinica_id",
    "obesidad.ResultadoLaboratorio": "paciente__clinica_id",
    "obesidad.TratamientoFarmacologico": "paciente__clinica_id",
    "obesidad.ObjetivoObesidad": "paciente__clinica_id",
    "historia_clinica.ConsentimientoInformado": "clinica_id",
    "historia_clinica.HistoriaClinica": "clinica_id",
    "historia_clinica.PlantillaOrden": "clinica_id",
    # --- Protocolos / tratamientos del paciente ---
    "protocolos.CheckinOTP": "sesion__tratamiento__paciente__clinica_id",
    "protocolos.SesionProcedimiento": "tratamiento__paciente__clinica_id",
    "protocolos.TratamientoPaciente": "paciente__clinica_id",
    "protocolos.ConsentimientoPaciente": "paciente__clinica_id",
    # --- Consentimientos ---
    "consentimientos.Consentimiento": "paciente__clinica_id",
    "consentimientos.PlantillaConsentimiento": "clinica_id",
    "consentimientos.PlantillaAsistencia": "clinica_id",
    # --- Cartera ---
    "cartera.CuotaCarteraLog": "cuota__cartera__paciente__clinica_id",
    "cartera.CuotaCartera": "cartera__paciente__clinica_id",
    "cartera.Cartera": "paciente__clinica_id",
    # --- Cobros ---
    "cobros.PagoRecibido": "cobro__sede__clinica_id",
    "cobros.ItemCobro": "cobro__sede__clinica_id",
    "cobros.Cobro": "sede__clinica_id",
    # --- Cotizaciones ---
    "cotizaciones.FormaPagoCotizacion": "cotizacion__clinica_id",
    "cotizaciones.ItemCotizacion": "cotizacion__clinica_id",
    "cotizaciones.CotizacionEnvio": "cotizacion__clinica_id",
    "cotizaciones.Cotizacion": "clinica_id",
    # --- Agenda ---
    "agenda.CitaCheckinOTP": "cita__sede__clinica_id",
    "agenda.ConfirmacionToken": "cita__sede__clinica_id",
    "agenda.RegistroConfirmacion": "cita__sede__clinica_id",
    "agenda.Cita": "sede__clinica_id",
    "agenda.BloqueoAgenda": "clinica_id",
    # --- Pacientes ---
    "pacientes.CheckIn": "paciente__clinica_id",
    "pacientes.AntecedentePaciente": "paciente__clinica_id",
    "pacientes.Paciente": "clinica_id",
    "pacientes.ConfiguracionFacial": "clinica_id",
    # --- Inventario / proveedores / caja ---
    "proveedores.ItemOrdenCompra": "orden__sede__clinica_id",
    "proveedores.OrdenCompra": "sede__clinica_id",
    "proveedores.Proveedor": "clinica_id",
    "inventario.MovimientoInventario": "insumo__clinica_id",
    "inventario.Insumo": "clinica_id",
    "inventario.CategoriaInsumo": "clinica_id",
    "caja.GastoCaja": "sede__clinica_id",
    "caja.SesionCaja": "caja__sede__clinica_id",
    "caja.Caja": "sede__clinica_id",
    "caja.CategoriaGasto": "clinica_id",
    # --- Catálogo de la clínica ---
    "clinicas.CampanaItem": "campana__clinica_id",
    "clinicas.Campana": "clinica_id",
    "clinicas.TipoSesionProcedimiento": "tipo_sesion__tratamiento__clinica_id",
    "clinicas.TipoSesion": "tratamiento__clinica_id",
    "clinicas.TratamientoProcedimiento": "tratamiento__clinica_id",
    "clinicas.TratamientoCatalogo": "clinica_id",
    "clinicas.PasoProtocolo": "servicio__clinica_id",
    "clinicas.ServicioConsentimiento": "servicio__clinica_id",
    "clinicas.ServicioDiagrama": "servicio__clinica_id",
    "clinicas.ServicioGrupoZonas": "servicio__clinica_id",
    "clinicas.Servicio": "clinica_id",
    # --- Colaboradores ---
    "colaboradores.HorarioColaborador": "colaborador__user__clinica_id",
    "colaboradores.Colaborador": "user__clinica_id",
    # --- Configuración / notificaciones / logs ---
    "configuracion.DocumensoConsentimientoTemplate": "clinica_id",
    "configuracion.ConfiguracionWizard": "clinica_id",
    "configuracion.ConfiguracionRegistroPublico": "clinica_id",
    "configuracion.ConfiguracionHistoria": "clinica_id",
    "configuracion.ConfiguracionCartera": "clinica_id",
    "configuracion.ConfiguracionSignosVitales": "clinica_id",
    "notificaciones.NotificacionFallida": "clinica_id",
    "core.LogAccion": "clinica_id",
    # --- RBAC dinámico ---
    "users.RolAuditoria": "rol__clinica_id",
    "users.RolPermiso": "rol__clinica_id",
    "users.Rol": "clinica_id",
    "users.PasswordResetToken": "user__clinica_id",
    # --- Sedes (al final: casi todo cuelga de aquí vía PROTECT) ---
    "clinicas.Sede": "clinica_id",
}

# Modelos propios que este comando deliberadamente NO borra.
GLOBAL_MODELS: set[str] = {
    "clinicas.Clinica",            # el cascarón que queremos conservar
    "clinicas.Plan",
    "clinicas.RegistroPendiente",
    "clinicas.DiagramaCorporal",   # catálogo global de diagramas corporales
    "clinicas.GrupoZonas",
    "clinicas.GrupoZonasDiagrama",
    "users.Permiso",               # catálogo global de permisos
    "users.User",                  # se maneja aparte (se conserva 1 admin)
}

# Apps propias (las que viven en backend/apps/). Modelos de estas apps que no
# estén ni en TENANT_SCOPES ni en GLOBAL_MODELS hacen fallar el comando, para
# no dejar datos huérfanos silenciosamente cuando el esquema crezca.
OWN_APP_LABELS = {
    "agenda", "caja", "cartera", "clinicas", "cobros", "colaboradores",
    "comisiones", "configuracion", "consentimientos", "core", "cotizaciones",
    "historia_clinica", "inventario", "notificaciones", "obesidad", "pacientes",
    "protocolos", "proveedores", "reportes", "users",
}

MAX_PASADAS = 40


def _pedir(texto: str) -> str:
    """input() que falla limpio si no hay terminal (uso no interactivo)."""
    try:
        return input(texto).strip()
    except EOFError:
        raise CommandError(
            "No hay entrada interactiva disponible. Pasa --clinica y --admin "
            "explícitos para correr sin terminal."
        )


class Command(BaseCommand):
    help = "Vacía una clínica: borra todos sus datos y conserva solo el registro de la clínica y un usuario admin."

    def add_arguments(self, parser):
        parser.add_argument("--clinica", help="ID (UUID) o nombre exacto de la clínica a vaciar.")
        parser.add_argument("--admin", help="Email del usuario admin que se conserva.")
        parser.add_argument("--dry-run", action="store_true", help="Solo muestra qué se borraría; no borra nada.")
        parser.add_argument("--yes", action="store_true", help="No pedir la confirmación final (para scripts).")
        parser.add_argument(
            "--force", action="store_true",
            help="Confirmar el borrado aunque queden filas sin borrar tras las pasadas (hace rollback si no se usa).",
        )

    # ── entrada ──────────────────────────────────────────────────────
    def handle(self, *args, **opts):
        self._verificar_cobertura_de_modelos()

        Clinica = apps.get_model("clinicas", "Clinica")
        User = apps.get_model("users", "User")

        clinica = self._resolver_clinica(Clinica, opts.get("clinica"))
        admin = self._resolver_admin(User, clinica, opts.get("admin"))

        self.stdout.write("")
        self.stdout.write(self.style.WARNING(f"Clínica a vaciar : {clinica.nombre}  ({clinica.id})"))
        self.stdout.write(self.style.WARNING(f"Admin que se conserva : {admin.email}  (rol={admin.rol})"))
        self.stdout.write("")

        conteos = self._contar(clinica, admin)
        total = sum(conteos.values())
        self._imprimir_conteos(conteos, total)

        if total == 0:
            self.stdout.write(self.style.SUCCESS("\nLa clínica ya está vacía. Nada que hacer."))
            return

        if opts["dry_run"]:
            self.stdout.write(self.style.NOTICE("\n--dry-run: no se borró nada."))
            return

        if not opts["yes"]:
            self.stdout.write(
                self.style.ERROR(
                    "\nEsto BORRA de forma permanente los datos de arriba. Es irreversible."
                )
            )
            resp = _pedir(f'Escribe el nombre de la clínica ("{clinica.nombre}") para confirmar: ')
            if resp != clinica.nombre:
                raise CommandError("Confirmación no coincide. Abortado.")

        borrados = self._vaciar(clinica, admin, force=opts["force"])

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"Listo. Se borraron {borrados} filas."))
        self.stdout.write(
            self.style.SUCCESS(
                f'La clínica "{clinica.nombre}" quedó vacía. Usuario conservado: {admin.email}.'
            )
        )
        self.stdout.write(
            self.style.NOTICE(
                "Recuerda: los archivos de media (fotos, PDFs, firmas) no se eliminan del storage."
            )
        )

    # ── resolución interactiva ───────────────────────────────────────
    def _resolver_clinica(self, Clinica, valor):
        if valor:
            qs = Clinica.objects.filter(nombre=valor)
            clinica = qs.first()
            if clinica is None:
                try:
                    clinica = Clinica.objects.filter(id=valor).first()
                except (ValueError, TypeError):
                    clinica = None
            if clinica is None:
                raise CommandError(f'No se encontró ninguna clínica con id o nombre "{valor}".')
            return clinica

        clinicas = list(Clinica.objects.order_by("nombre"))
        if not clinicas:
            raise CommandError("No hay clínicas en la base de datos.")
        self.stdout.write("Clínicas disponibles:")
        for i, c in enumerate(clinicas, 1):
            estado = "" if c.activo else " [inactiva]"
            self.stdout.write(f"  {i:>2}. {c.nombre}  ({c.id}){estado}")
        eleccion = _pedir("Número de la clínica a vaciar: ")
        if not eleccion.isdigit() or not (1 <= int(eleccion) <= len(clinicas)):
            raise CommandError("Selección inválida.")
        return clinicas[int(eleccion) - 1]

    def _resolver_admin(self, User, clinica, valor):
        candidatos = list(
            User.objects.filter(clinica=clinica, rol__in=["admin", "superadmin"]).order_by("email")
        )
        if valor:
            admin = User.objects.filter(clinica=clinica, email__iexact=valor).first()
            if admin is None:
                raise CommandError(f'El usuario "{valor}" no existe o no pertenece a esta clínica.')
            if admin.rol not in ("admin", "superadmin"):
                self.stdout.write(
                    self.style.WARNING(f"Aviso: {admin.email} tiene rol '{admin.rol}', no es admin.")
                )
            return admin

        if not candidatos:
            raise CommandError(
                "Esta clínica no tiene ningún usuario admin. Crea uno antes de vaciarla, "
                "o pásalo explícito con --admin <email>."
            )
        self.stdout.write("\nUsuarios admin de esta clínica (se conserva uno):")
        for i, u in enumerate(candidatos, 1):
            nombre = u.get_full_name().strip() or "(sin nombre)"
            self.stdout.write(f"  {i:>2}. {u.email}  — {nombre}  (rol={u.rol})")
        eleccion = _pedir("Número del admin a conservar: ")
        if not eleccion.isdigit() or not (1 <= int(eleccion) <= len(candidatos)):
            raise CommandError("Selección inválida.")
        return candidatos[int(eleccion) - 1]

    # ── cobertura ────────────────────────────────────────────────────
    def _verificar_cobertura_de_modelos(self):
        sin_mapear = []
        for model in apps.get_models():
            label = model._meta.label
            if model._meta.app_label not in OWN_APP_LABELS:
                continue
            if model._meta.proxy or model._meta.abstract:
                continue
            if label in TENANT_SCOPES or label in GLOBAL_MODELS:
                continue
            sin_mapear.append(label)
        if sin_mapear:
            raise CommandError(
                "Hay modelos propios sin clasificar en wipe_clinica.py "
                "(agrégalos a TENANT_SCOPES o a GLOBAL_MODELS):\n  - "
                + "\n  - ".join(sorted(sin_mapear))
            )

    # ── conteo / borrado ─────────────────────────────────────────────
    def _queryset(self, label, clinica):
        model = apps.get_model(*label.split("."))
        return model.objects.filter(**{TENANT_SCOPES[label]: clinica.id})

    def _usuarios_a_borrar(self, clinica, admin):
        User = apps.get_model("users", "User")
        return (
            User.objects.filter(clinica=clinica)
            .exclude(pk=admin.pk)
            .exclude(rol="superadmin")
        )

    def _contar(self, clinica, admin):
        conteos = {}
        for label in TENANT_SCOPES:
            n = self._queryset(label, clinica).count()
            if n:
                conteos[label] = n
        n_users = self._usuarios_a_borrar(clinica, admin).count()
        if n_users:
            conteos["users.User (otros usuarios)"] = n_users
        return conteos

    def _imprimir_conteos(self, conteos, total):
        if not conteos:
            return
        self.stdout.write("Se borrará:")
        for label, n in sorted(conteos.items(), key=lambda kv: (-kv[1], kv[0])):
            self.stdout.write(f"  {n:>8,}  {label}")
        self.stdout.write(f"  {'-' * 8}")
        self.stdout.write(f"  {total:>8,}  filas en total")

    @transaction.atomic
    def _vaciar(self, clinica, admin, *, force):
        User = apps.get_model("users", "User")

        # El admin conservado apunta a un Rol dinámico de esta clínica (PROTECT).
        # Hay que soltar esa referencia antes de poder borrar los roles.
        User.objects.filter(pk=admin.pk).update(rol_dinamico=None)

        objetivos = list(TENANT_SCOPES.keys()) + ["__users__"]
        total_borrado = 0

        for _ in range(MAX_PASADAS):
            borrado_en_pasada = 0
            for label in objetivos:
                if label == "__users__":
                    qs = self._usuarios_a_borrar(clinica, admin)
                else:
                    qs = self._queryset(label, clinica)
                if not qs.exists():
                    continue
                try:
                    n, _detalle = qs.delete()
                except (ProtectedError, RestrictedError):
                    # Aún tiene hijos protegidos sin borrar; se resuelve en otra pasada.
                    continue
                borrado_en_pasada += n
            total_borrado += borrado_en_pasada
            if borrado_en_pasada == 0:
                break

        # Verificación final: nada debe quedar en pie.
        restantes = self._contar(clinica, admin)
        if restantes:
            detalle = "\n".join(f"  {n:>8,}  {label}" for label, n in sorted(restantes.items()))
            msg = (
                "No se pudieron borrar todas las filas tras "
                f"{MAX_PASADAS} pasadas:\n{detalle}"
            )
            if not force:
                raise CommandError(msg + "\n\nSe hizo rollback. Revisa el mapeo o usa --force.")
            self.stdout.write(self.style.ERROR(msg + "\n\n--force: se confirma el borrado parcial."))

        return total_borrado
