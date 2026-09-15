"""Crea la clínica ficticia que se usa para las capturas del centro de ayuda.

Uso::

    python manage.py seed_demo_ayuda

Monta una clínica completa y **totalmente ficticia** («Clínica Aurora») con su
sede, su equipo, su catálogo, pacientes, citas de hoy y una cotización aceptada
con cartera. Sobre esa clínica se toman las capturas de pantalla que ilustran los
artículos, para que ninguna imagen del centro de ayuda muestre datos reales de
una clínica cliente.

Es idempotente: correrlo dos veces no duplica nada.

Solo para entornos de desarrollo: se niega a correr con ``DEBUG = False`` salvo
que se pase ``--force``.
"""

from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

CLINICA_NIT = "901555000-1"
DOMINIO = "demo.cliniq.co"
PASSWORD_DEFECTO = "AuroraDemo2026*"

USUARIOS = [
    # (email local, nombre, apellido, rol, es_profesional)
    ("aurora.admin", "Valentina", "Ruiz", "admin", False),
    ("aurora.recepcion", "Daniela", "Peña", "recepcion", False),
    ("aurora.profesional", "Andrés", "Molina", "profesional", True),
]

PROCEDIMIENTOS = [
    # (nombre, duracion_min, precio, descripcion)
    ("Valoración médica estética", 30, "0", "Primera consulta de valoración y plan de tratamiento."),
    ("Limpieza facial profunda", 45, "180000", "Higiene facial con extracción y mascarilla."),
    ("Sesión de láser facial", 40, "320000", "Sesión de láser para textura y manchas."),
    ("Aplicación de toxina botulínica", 30, "850000", "Aplicación en tercio superior del rostro."),
]

TRATAMIENTO = {
    "nombre": "Rejuvenecimiento facial 6 meses",
    "descripcion": "Plan de seis sesiones de láser facial con dos controles de seguimiento.",
    "precio_estimado": "2400000",
    "tipos_sesion": [
        # (nombre, cantidad, duracion_min, es_compromiso, procedimiento)
        ("Sesión de láser", 6, 40, True, "Sesión de láser facial"),
        ("Control de seguimiento", 2, 20, False, "Valoración médica estética"),
    ],
}

PACIENTES = [
    # (documento, nombres, apellidos, sexo, nacimiento, telefono)
    ("1020345678", "Mariana", "Salgado Ríos", "F", date(1991, 4, 18), "3011234567"),
    ("1015987432", "Camilo", "Ortega Peña", "M", date(1987, 11, 3), "3019876543"),
    ("1032667890", "Lucía", "Fernández Toro", "F", date(1995, 7, 22), "3005551212"),
    ("1018443221", "Sebastián", "Rojas Mejía", "M", date(1983, 2, 9), "3024448899"),
    ("1027119005", "Antonia", "Vélez Cárdenas", "F", date(1999, 9, 30), "3157773344"),
]


class Command(BaseCommand):
    help = "Crea la clínica ficticia «Clínica Aurora» para las capturas del centro de ayuda."

    def add_arguments(self, parser):
        parser.add_argument("--password", default=PASSWORD_DEFECTO, help="Contraseña de los usuarios demo.")
        parser.add_argument("--force", action="store_true", help="Permite correrlo con DEBUG = False.")

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.DEBUG and not options["force"]:
            raise CommandError(
                "Este comando crea datos ficticios y solo debe usarse en desarrollo. "
                "Usa --force si sabes lo que haces."
            )

        password = options["password"]
        clinica = self._clinica()
        sede = self._sede(clinica)
        usuarios = self._usuarios(clinica, password)
        procedimientos = self._procedimientos(clinica)
        tratamiento = self._tratamiento(clinica, procedimientos)
        pacientes = self._pacientes(clinica)
        self._citas(sede, usuarios["profesional"], pacientes, procedimientos)
        self._cotizacion(clinica, sede, usuarios["admin"], pacientes[0], tratamiento)

        self.stdout.write(self.style.SUCCESS(f"Clínica demo lista: {clinica.nombre} ({clinica.id})"))
        for clave, user in usuarios.items():
            self.stdout.write(f"  {clave:12} {user.email}  /  {password}")

    # ── Clínica, sede y equipo ────────────────────────────────────────────

    def _clinica(self):
        from apps.clinicas.models import Clinica, Plan
        from apps.users.rbac import ensure_default_roles_for_clinica

        plan = Plan.objects.filter(activo=True).order_by("-max_usuarios").first()
        clinica, _ = Clinica.objects.update_or_create(
            nit=CLINICA_NIT,
            defaults={
                "nombre": "Clínica Aurora",
                "email": f"hola@{DOMINIO}",
                "telefono": "6015550100",
                "plan": plan,
                "trial_expires_at": None,
                # Que el asistente de atención muestre el paso de llegada en las capturas.
                "whatsapp_override": True,
                "facial_verificacion_override": False,
                "onboarding_completado": True,
            },
        )
        ensure_default_roles_for_clinica(clinica)
        return clinica

    def _sede(self, clinica):
        from apps.clinicas.models import Sede

        horario = {
            dia: {"abierto": True, "apertura": "08:00", "cierre": "18:00"}
            for dia in ("lunes", "martes", "miercoles", "jueves", "viernes")
        }
        horario["sabado"] = {"abierto": True, "apertura": "09:00", "cierre": "13:00"}
        horario["domingo"] = {"abierto": False}

        sede, _ = Sede.objects.update_or_create(
            clinica=clinica,
            nombre="Sede Chapinero",
            defaults={
                "ciudad": "Bogotá",
                "direccion": "Calle 72 # 10-34, consultorio 402",
                "telefono": "6015550101",
                "horario": horario,
            },
        )
        return sede

    def _usuarios(self, clinica, password):
        from apps.users.models import Rol, User

        roles = {r.slug: r for r in Rol.objects.filter(clinica=clinica)}
        creados = {}
        for local, nombre, apellido, rol, es_profesional in USUARIOS:
            email = f"{local}@{DOMINIO}"
            user, _ = User.objects.update_or_create(
                email=email,
                defaults={
                    "first_name": nombre,
                    "last_name": apellido,
                    "rol": rol,
                    "es_profesional": es_profesional,
                    "clinica": clinica,
                    "rol_dinamico": roles.get(rol),
                    "telefono": "3000000000",
                    "is_active": True,
                },
            )
            user.set_password(password)
            user.save()
            creados[rol] = user
        return creados

    # ── Catálogo ──────────────────────────────────────────────────────────

    def _procedimientos(self, clinica):
        from apps.clinicas.models import Servicio

        creados = {}
        for nombre, duracion, precio, descripcion in PROCEDIMIENTOS:
            servicio, _ = Servicio.objects.update_or_create(
                clinica=clinica,
                nombre=nombre,
                defaults={
                    "descripcion": descripcion,
                    "duracion_min": duracion,
                    "precio": Decimal(precio),
                    "precio_base": Decimal(precio) if precio != "0" else None,
                    "descuento_maximo_pct": Decimal("10"),
                },
            )
            creados[nombre] = servicio
        return creados

    def _tratamiento(self, clinica, procedimientos):
        from apps.clinicas.models import TipoSesion, TipoSesionProcedimiento, TratamientoCatalogo

        tratamiento, _ = TratamientoCatalogo.objects.update_or_create(
            clinica=clinica,
            nombre=TRATAMIENTO["nombre"],
            defaults={
                "descripcion": TRATAMIENTO["descripcion"],
                "precio_estimado": Decimal(TRATAMIENTO["precio_estimado"]),
                "descuento_maximo_pct": Decimal("10"),
            },
        )
        for orden, (nombre, cantidad, duracion, compromiso, proc) in enumerate(TRATAMIENTO["tipos_sesion"], start=1):
            tipo, _ = TipoSesion.objects.update_or_create(
                tratamiento=tratamiento,
                nombre=nombre,
                defaults={
                    "cantidad": cantidad,
                    "orden": orden,
                    "es_compromiso": compromiso,
                    "duracion_min": duracion,
                },
            )
            TipoSesionProcedimiento.objects.update_or_create(
                tipo_sesion=tipo,
                procedimiento=procedimientos[proc],
                defaults={"orden": 1},
            )
        return tratamiento

    # ── Pacientes, citas y cartera ────────────────────────────────────────

    def _pacientes(self, clinica):
        from apps.pacientes.models import Paciente

        creados = []
        for documento, nombres, apellidos, sexo, nacimiento, telefono in PACIENTES:
            paciente, _ = Paciente.objects.update_or_create(
                clinica=clinica,
                numero_documento=documento,
                defaults={
                    "tipo_documento": "CC",
                    "nombres": nombres,
                    "apellidos": apellidos,
                    "sexo": sexo,
                    "fecha_nacimiento": nacimiento,
                    "telefono": telefono,
                    "email": f"{nombres.lower()}.{documento[-4:]}@{DOMINIO}",
                    "ciudad": "Bogotá",
                    "direccion": "Carrera 15 # 80-20",
                    "autoriza_datos": True,
                    "fecha_autorizacion": timezone.now(),
                },
            )
            creados.append(paciente)
        return creados

    def _citas(self, sede, profesional, pacientes, procedimientos):
        """Agenda del día: una cita por estado, para que la cola de atención
        muestre el recorrido completo en una sola captura."""
        from apps.agenda.models import Cita

        hoy = timezone.localdate()
        tz = timezone.get_current_timezone()

        agenda = [
            # (paciente, procedimiento, hora, estado)
            (pacientes[0], "Sesión de láser facial", time(9, 0), Cita.Estado.EN_ESPERA),
            (pacientes[1], "Limpieza facial profunda", time(9, 45), Cita.Estado.CONFIRMADA),
            (pacientes[2], "Valoración médica estética", time(10, 30), Cita.Estado.CONFIRMADA),
            (pacientes[3], "Aplicación de toxina botulínica", time(11, 15), Cita.Estado.PENDIENTE),
            (pacientes[4], "Limpieza facial profunda", time(15, 0), Cita.Estado.PENDIENTE),
        ]

        for paciente, nombre_proc, hora, estado in agenda:
            servicio = procedimientos[nombre_proc]
            inicio = timezone.make_aware(datetime.combine(hoy, hora), tz)
            Cita.objects.update_or_create(
                paciente=paciente,
                sede=sede,
                fecha_inicio=inicio,
                defaults={
                    "servicio": servicio,
                    "servicio_nombre": servicio.nombre,
                    "duracion_min": servicio.duracion_min,
                    "profesional": profesional,
                    "fecha_fin": inicio + timedelta(minutes=servicio.duracion_min),
                    "estado": estado,
                    "estado_confirmacion": (
                        Cita.EstadoConfirmacion.CONFIRMADO
                        if estado != Cita.Estado.PENDIENTE
                        else Cita.EstadoConfirmacion.SIN_ENVIAR
                    ),
                    "canal_confirmacion": Cita.CanalConfirmacion.WHATSAPP,
                    "canal_origen": Cita.CanalOrigen.PRESENCIAL,
                },
            )

    def _cotizacion(self, clinica, sede, admin, paciente, tratamiento):
        """Cotización aceptada del tratamiento: deja cartera con tres cuotas,
        una ya vencida, para las capturas de cartera y de registrar pago."""
        from apps.cotizaciones.models import Cotizacion, FormaPagoCotizacion, ItemCotizacion
        from apps.cotizaciones.services import aceptar_cotizacion

        cotizacion = Cotizacion.objects.filter(paciente=paciente, clinica=clinica).first()
        if cotizacion is None:
            cotizacion = Cotizacion.objects.create(
                clinica=clinica,
                paciente=paciente,
                profesional=admin,
                sede=sede,
                validez_dias=30,
                notas="Plan acordado en la valoración inicial.",
            )

        total = Decimal(TRATAMIENTO["precio_estimado"])
        ItemCotizacion.objects.update_or_create(
            cotizacion=cotizacion,
            descripcion=tratamiento.nombre,
            defaults={
                "tipo": ItemCotizacion.Tipo.TRATAMIENTO,
                "tratamiento": tratamiento,
                "num_citas": 1,
                "valor_unitario": total,
                "precio_bloqueado": True,
                "periodicidad": "Cada 3 semanas",
                "duracion_estimada": "6 meses",
            },
        )

        hoy = timezone.localdate()
        cuotas = [
            ("Cuota inicial", FormaPagoCotizacion.Tipo.EFECTIVO, total / 3, hoy - timedelta(days=12)),
            ("Segunda cuota", FormaPagoCotizacion.Tipo.CUOTAS, total / 3, hoy + timedelta(days=18)),
            ("Tercera cuota", FormaPagoCotizacion.Tipo.CUOTAS, total / 3, hoy + timedelta(days=48)),
        ]
        for descripcion, tipo, valor, fecha in cuotas:
            FormaPagoCotizacion.objects.update_or_create(
                cotizacion=cotizacion,
                descripcion=descripcion,
                defaults={"tipo": tipo, "valor": valor.quantize(Decimal("0.01")), "fecha": fecha},
            )

        aceptar_cotizacion(cotizacion, actor=admin)
        return cotizacion
