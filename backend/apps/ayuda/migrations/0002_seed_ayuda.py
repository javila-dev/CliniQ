from django.db import migrations
from django.utils import timezone
from django.utils.text import slugify


CATEGORIAS = [
    ("Primeros pasos", "Configura tu clínica y aprende lo esencial para empezar.", "rocket", 0),
    ("Agenda", "Citas, disponibilidad, confirmaciones y estados.", "calendar-days", 1),
    ("Pacientes", "Fichas, historia clínica, fotos y datos sensibles.", "users", 2),
    ("Cotizaciones", "Arma, envía y da seguimiento a cotizaciones de tratamientos.", "clipboard-list", 3),
    ("Cartera y cobros", "Pagos, cuotas, mora y acuerdos de pago.", "wallet", 4),
    ("Configuración", "Usuarios, roles, sedes, catálogo y personalización.", "settings-2", 5),
]

# (categoria_nombre, titulo, resumen, area, destacado, contenido_md)
ARTICULOS = [
    (
        "Primeros pasos",
        "¿Qué es CliniQ y cómo se organiza?",
        "Un recorrido rápido por los módulos principales y cómo se conectan entre sí.",
        "general",
        True,
        "CliniQ integra en un solo lugar la operación de tu clínica estética:\n\n"
        "- **Agenda**: citas, disponibilidad por profesional y sede, confirmaciones.\n"
        "- **Pacientes**: ficha completa, historia clínica y fotos de evolución.\n"
        "- **Cotizaciones**: propuestas de tratamiento que se convierten en programas.\n"
        "- **Cartera y cobros**: pagos, cuotas, mora y acuerdos de pago.\n"
        "- **Consentimientos**: firma digital de documentos.\n\n"
        "Cada módulo alimenta al siguiente: una cotización aprobada genera las citas del "
        "programa, y cada atención registra el cobro correspondiente en cartera.",
    ),
    (
        "Primeros pasos",
        "Crear usuarios y asignar roles",
        "Cómo dar de alta a tu equipo y controlar qué puede ver y hacer cada persona.",
        "configuracion",
        False,
        "Desde **Configuración → Usuarios** puedes invitar a los miembros de tu equipo.\n\n"
        "1. Presiona **Nuevo usuario** e ingresa nombre y correo.\n"
        "2. Elige un **rol**: define el conjunto de permisos de esa persona.\n"
        "3. El usuario recibe un correo para definir su contraseña.\n\n"
        "Los roles se editan en **Configuración → Roles**. Puedes partir de un rol del "
        "sistema y ajustar permisos puntuales.",
    ),
    (
        "Agenda",
        "Agendar una cita",
        "Pasos para crear una cita y elegir profesional, sede y tipo de sesión.",
        "agenda",
        True,
        "En **Agenda**, presiona sobre un espacio libre o usa **Nueva cita**.\n\n"
        "- Selecciona el **paciente** (o créalo en el momento).\n"
        "- Elige **profesional**, **sede** y **tipo de sesión**.\n"
        "- Ajusta fecha y hora; la duración se toma del tipo de sesión y puede editarse.\n\n"
        "La cita queda en estado **Programada**. Desde su detalle puedes confirmarla, "
        "reprogramarla o registrar la asistencia.",
    ),
    (
        "Agenda",
        "Estados de una cita",
        "Qué significa cada estado y cómo avanza una cita desde que se agenda hasta que se cobra.",
        "agenda",
        False,
        "Una cita recorre estos estados:\n\n"
        "- **Programada**: creada, sin confirmar.\n"
        "- **Confirmada**: el paciente confirmó asistencia.\n"
        "- **En sala / En atención**: el paciente llegó y/o está siendo atendido.\n"
        "- **Atendida**: la sesión terminó; se puede registrar la nota clínica y el cobro.\n"
        "- **No asistió** / **Cancelada**: no se realizó.\n\n"
        "Solo las citas atendidas generan cargo en cartera.",
    ),
    (
        "Pacientes",
        "Registrar un paciente nuevo",
        "Datos mínimos para crear una ficha y dónde se completan los antecedentes.",
        "pacientes",
        False,
        "Desde **Pacientes → Nuevo paciente** completa los datos de identificación y "
        "contacto. Solo nombre, documento y teléfono son obligatorios.\n\n"
        "Una vez creada la ficha puedes agregar antecedentes, alergias, fotos y la "
        "historia clínica desde las pestañas del paciente.",
    ),
    (
        "Pacientes",
        "Datos sensibles: quién puede verlos",
        "Cómo funciona el permiso que enmascara documento, teléfono, correo y dirección.",
        "pacientes",
        False,
        "El permiso **Ver datos sensibles del paciente** controla si un usuario ve o no "
        "los campos de identificación y contacto (documento, teléfono, correo, dirección "
        "y fecha de nacimiento).\n\n"
        "Si un rol no tiene ese permiso, esos campos aparecen enmascarados en la ficha, "
        "los listados y los detalles, pero la persona sigue pudiendo trabajar con el "
        "paciente con normalidad.",
    ),
    (
        "Cotizaciones",
        "Crear y enviar una cotización",
        "De la selección de tratamientos al envío al paciente y su aprobación.",
        "cotizaciones",
        True,
        "En **Cotizaciones → Nueva** eliges el paciente y agregas ítems del catálogo "
        "(tratamientos, sesiones sueltas o productos).\n\n"
        "- Ajusta cantidades y, si tienes permiso, precios.\n"
        "- Guarda como **borrador** para seguir editando, o **envía** al paciente.\n"
        "- Al aprobarse, la cotización puede generar las citas del programa y su plan de pago.",
    ),
    (
        "Cartera y cobros",
        "Registrar un pago",
        "Cómo aplicar un pago a la deuda de un paciente y qué métodos admite.",
        "cartera",
        False,
        "Desde la **cartera del paciente** presiona **Registrar pago**.\n\n"
        "- Ingresa el **monto** y el **método** (efectivo, transferencia, tarjeta, etc.).\n"
        "- El pago se aplica a las cuotas o cargos pendientes, del más antiguo al más nuevo.\n"
        "- Queda registrado en los ingresos del día.",
    ),
    (
        "Cartera y cobros",
        "Acuerdos de pago",
        "Qué es un acuerdo de pago, cuándo se vuelve vigente y cómo afecta la mora.",
        "cartera",
        False,
        "Un **acuerdo de pago** renegocia el plan de cuotas de un paciente: nuevas fechas "
        "y montos.\n\n"
        "El acuerdo solo se vuelve **vigente** cuando se firma el acta correspondiente. "
        "Mientras no esté firmado, sigue rigiendo el plan anterior y la mora se calcula "
        "sobre ese plan.",
    ),
]


def cargar_seed(apps, schema_editor):
    CategoriaAyuda = apps.get_model("ayuda", "CategoriaAyuda")
    ArticuloAyuda = apps.get_model("ayuda", "ArticuloAyuda")

    cat_por_nombre = {}
    for nombre, descripcion, icono, orden in CATEGORIAS:
        cat, _ = CategoriaAyuda.objects.get_or_create(
            slug=slugify(nombre),
            defaults={"nombre": nombre, "descripcion": descripcion, "icono": icono, "orden": orden},
        )
        cat_por_nombre[nombre] = cat

    ahora = timezone.now()
    for i, (cat_nombre, titulo, resumen, area, destacado, contenido) in enumerate(ARTICULOS):
        slug = slugify(titulo)
        if ArticuloAyuda.objects.filter(slug=slug).exists():
            continue
        ArticuloAyuda.objects.create(
            categoria=cat_por_nombre[cat_nombre],
            titulo=titulo,
            slug=slug,
            resumen=resumen,
            contenido=contenido,
            area=area,
            destacado=destacado,
            estado="publicado",
            publicado_at=ahora,
            orden=i,
        )


def borrar_seed(apps, schema_editor):
    CategoriaAyuda = apps.get_model("ayuda", "CategoriaAyuda")
    ArticuloAyuda = apps.get_model("ayuda", "ArticuloAyuda")
    ArticuloAyuda.objects.filter(slug__in=[slugify(a[1]) for a in ARTICULOS]).delete()
    CategoriaAyuda.objects.filter(slug__in=[slugify(c[0]) for c in CATEGORIAS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("ayuda", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(cargar_seed, borrar_seed),
    ]
