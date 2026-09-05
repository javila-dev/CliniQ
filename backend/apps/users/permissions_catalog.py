PERMISSION_CATALOG = [
    ("agenda.aprobar_bloqueo", "agenda", "aprobar_bloqueo", "Aprobar o rechazar bloqueos de agenda pendientes", False),
    ("agenda.bloqueos.gestionar", "agenda", "bloqueos.gestionar", "Gestionar bloqueos de agenda", False),
    ("agenda.bloqueos.ver", "agenda", "bloqueos.ver", "Ver bloqueos de agenda", True),
    ("agenda.crear_bloqueo", "agenda", "crear_bloqueo", "Crear bloqueos de agenda", True),
    ("agenda.citas.cambiar_estado", "agenda", "citas.cambiar_estado", "Cambiar estado de citas", True),
    ("agenda.citas.confirmar_manual", "agenda", "citas.confirmar_manual", "Confirmar citas manualmente", False),
    ("agenda.citas.crear", "agenda", "citas.crear", "Crear citas", True),
    ("agenda.citas.editar", "agenda", "citas.editar", "Editar citas", True),
    ("agenda.citas.eliminar", "agenda", "citas.eliminar", "Eliminar citas", False),
    ("agenda.citas.ver", "agenda", "citas.ver", "Ver agenda y citas", True),
    ("caja.cajas.gestionar", "caja", "cajas.gestionar", "Configurar cajas por sede", False),
    ("caja.categorias.gestionar", "caja", "categorias.gestionar", "Gestionar categorias de gasto", False),
    ("caja.categorias.ver", "caja", "categorias.ver", "Ver categorias de gasto", True),
    ("caja.cierre.realizar", "caja", "cierre.realizar", "Realizar cierres de caja", False),
    ("caja.cierre.ver", "caja", "cierre.ver", "Ver cierres de caja", True),
    ("caja.gastos.aprobar", "caja", "gastos.aprobar", "Aprobar o rechazar gastos", False),
    ("caja.gastos.editar", "caja", "gastos.editar", "Editar gastos de caja", False),
    ("caja.gastos.registrar", "caja", "gastos.registrar", "Registrar gastos de caja", True),
    ("caja.gastos.ver", "caja", "gastos.ver", "Ver gastos de caja", True),
    ("clinicas.editar", "clinicas", "editar", "Editar datos de la clinica", False),
    ("clinicas.ver", "clinicas", "ver", "Ver datos de la clinica", True),
    ("campanas.gestionar", "campanas", "gestionar", "Gestionar campañas de precios especiales", False),
    ("core.ver_log_acciones", "core", "ver_log_acciones", "Ver log de acciones del sistema", False),
    ("cobros.anular", "cobros", "anular", "Anular cobros", False),
    ("cobros.cambiar_precio", "cobros", "cambiar_precio", "Cambiar precio de items al crear cobros de cita directa", False),
    ("cobros.crear", "cobros", "crear", "Crear cobros", True),
    ("cobros.editar_items", "cobros", "editar_items", "Editar items de cobros", True),
    ("cobros.registrar_pago", "cobros", "registrar_pago", "Registrar pagos", True),
    ("cobros.ver", "cobros", "ver", "Ver cobros", True),
    ("cartera.aprobar_excepcion", "cartera", "aprobar_excepcion", "Aprobar excepcion de deuda para agendar cita", False),
    ("cartera.modificar_plazo", "cartera", "modificar_plazo", "Modificar fecha de vencimiento y monto de cuotas pendientes", False),
    ("cartera.registrar_pago", "cartera", "registrar_pago", "Registrar pagos en cartera", True),
    ("cartera.ver", "cartera", "ver", "Ver cartera", True),
    ("cotizaciones.cambiar_precio", "cotizaciones", "cambiar_precio", "Cambiar precio de items con precio bloqueado", False),
    ("cotizaciones.gestionar", "cotizaciones", "gestionar", "Gestionar cotizaciones", True),
    ("cotizaciones.ver", "cotizaciones", "ver", "Ver cotizaciones", True),
    ("colaboradores.gestionar", "colaboradores", "gestionar", "Gestionar colaboradores", False),
    ("colaboradores.horarios.gestionar", "colaboradores", "horarios.gestionar", "Gestionar horarios", False),
    ("colaboradores.horarios.ver", "colaboradores", "horarios.ver", "Ver horarios", True),
    ("colaboradores.ver", "colaboradores", "ver", "Ver colaboradores", True),
    ("consentimientos.generar", "consentimientos", "generar", "Generar consentimientos", True),
    ("consentimientos.plantillas.gestionar", "consentimientos", "plantillas.gestionar", "Gestionar plantillas", False),
    ("consentimientos.plantillas.ver", "consentimientos", "plantillas.ver", "Ver plantillas", True),
    ("consentimientos.revocar", "consentimientos", "revocar", "Revocar consentimientos", False),
    ("consentimientos.ver", "consentimientos", "ver", "Ver consentimientos", True),
    ("historia.consentimientos.gestionar", "historia", "consentimientos.gestionar", "Gestionar consentimientos informados", True),
    ("historia.fotos.eliminar", "historia", "fotos.eliminar", "Eliminar fotos clinicas", False),
    ("historia.fotos.subir", "historia", "fotos.subir", "Subir fotos clinicas", True),
    ("historia.notas.crear", "historia", "notas.crear", "Crear notas clinicas", True),
    ("historia.ver", "historia", "ver", "Ver historia clinica", True),
    ("inventario.ajustar_stock", "inventario", "ajustar_stock", "Ajustar stock", False),
    ("inventario.categorias.gestionar", "inventario", "categorias.gestionar", "Gestionar categorias de insumos", False),
    ("inventario.insumos.gestionar", "inventario", "insumos.gestionar", "Gestionar insumos", False),
    ("inventario.kardex.ver", "inventario", "kardex.ver", "Ver kardex", True),
    ("inventario.ver", "inventario", "ver", "Ver inventario", True),
    ("migracion.gestionar", "migracion", "gestionar", "Usar el asistente de puesta en marcha (cargar datos previos)", False),
    ("notificaciones.email.enviar", "notificaciones", "email.enviar", "Enviar emails administrativos", True),
    ("notificaciones.email.ver_config", "notificaciones", "email.ver_config", "Ver configuracion de email", True),
    ("pacientes.antecedentes.editar", "pacientes", "antecedentes.editar", "Editar antecedentes", True),
    ("pacientes.antecedentes.ver", "pacientes", "antecedentes.ver", "Ver antecedentes", True),
    ("pacientes.crear", "pacientes", "crear", "Crear pacientes", True),
    ("pacientes.datos_sensibles.ver", "pacientes", "datos_sensibles.ver", "Ver datos sensibles del paciente sin enmascarar (documento, telefono, email, direccion, fecha de nacimiento)", False),
    ("pacientes.editar", "pacientes", "editar", "Editar pacientes", True),
    ("pacientes.eliminar", "pacientes", "eliminar", "Eliminar pacientes", False),
    ("pacientes.ver", "pacientes", "ver", "Ver pacientes", True),
    ("proveedores.gestionar", "proveedores", "gestionar", "Gestionar proveedores", False),
    ("proveedores.ordenes.gestionar", "proveedores", "ordenes.gestionar", "Gestionar ordenes de compra", False),
    ("proveedores.ordenes.recibir", "proveedores", "ordenes.recibir", "Recibir ordenes de compra", False),
    ("proveedores.ordenes.ver", "proveedores", "ordenes.ver", "Ver ordenes de compra", True),
    ("proveedores.ver", "proveedores", "ver", "Ver proveedores", True),
    ("reportes.ver_financieros", "reportes", "ver_financieros", "Ver reportes financieros", True),
    ("reportes.ver_operativos", "reportes", "ver_operativos", "Ver reportes operativos", True),
    ("roles.asignar_permisos", "roles", "asignar_permisos", "Asignar permisos a roles", False),
    ("roles.crear", "roles", "crear", "Crear roles", False),
    ("roles.editar", "roles", "editar", "Editar roles", False),
    ("roles.eliminar", "roles", "eliminar", "Eliminar roles", False),
    ("roles.ver", "roles", "ver", "Ver roles", False),
    ("sedes.eliminar", "sedes", "eliminar", "Eliminar sedes", False),
    ("sedes.gestionar", "sedes", "gestionar", "Gestionar sedes", False),
    ("sedes.ver", "sedes", "ver", "Ver sedes", True),
    ("servicios.gestionar", "servicios", "gestionar", "Gestionar servicios", False),
    ("servicios.ver", "servicios", "ver", "Ver servicios", True),
    ("usuarios.crear", "usuarios", "crear", "Crear usuarios", False),
    ("usuarios.editar", "usuarios", "editar", "Editar usuarios", False),
    ("usuarios.eliminar", "usuarios", "eliminar", "Eliminar usuarios", False),
    ("usuarios.ver", "usuarios", "ver", "Ver usuarios", False),
]

ALL_PERMISSION_KEYS = {item[0] for item in PERMISSION_CATALOG}


# ---------------------------------------------------------------------------
# Capa semantica: "capacidades"
#
# Cada capacidad es una frase en lenguaje de clinica que el usuario marca al
# construir un rol. Internamente expande a 1..N claves tecnicas del catalogo
# de arriba. Es la fuente de verdad del selector amigable de roles; el front
# la consume via GET /usuarios/capacidades/.
#
# `profesional: True` marca capacidades que implican atencion clinica: si el
# rol tiene al menos una, se le pone Rol.es_profesional = True (habilita
# agendarse en citas y firmar historia).
# ---------------------------------------------------------------------------

CAPABILITY_CATALOG = [
    {
        "area": "agenda",
        "titulo": "Agenda y citas",
        "capacidades": [
            {
                "clave": "agenda.ver",
                "titulo": "Ver la agenda",
                "descripcion": "Consultar el calendario de citas de la clinica.",
                "permisos": ["agenda.citas.ver"],
            },
            {
                "clave": "agenda.gestionar_citas",
                "titulo": "Agendar y reprogramar citas",
                "descripcion": "Crear citas, moverlas de horario y cambiar su estado.",
                "permisos": [
                    "agenda.citas.crear",
                    "agenda.citas.editar",
                    "agenda.citas.cambiar_estado",
                    "agenda.citas.confirmar_manual",
                ],
            },
            {
                "clave": "agenda.eliminar_citas",
                "titulo": "Eliminar citas",
                "descripcion": "Borrar citas de la agenda de forma permanente.",
                "permisos": ["agenda.citas.eliminar"],
            },
            {
                "clave": "agenda.gestionar_bloqueos",
                "titulo": "Gestionar bloqueos de agenda",
                "descripcion": "Ver y crear bloqueos de horario (vacaciones, ausencias, mantenimiento).",
                "permisos": [
                    "agenda.bloqueos.ver",
                    "agenda.crear_bloqueo",
                    "agenda.bloqueos.gestionar",
                ],
            },
            {
                "clave": "agenda.aprobar_bloqueos",
                "titulo": "Aprobar bloqueos de agenda",
                "descripcion": "Aprobar o rechazar los bloqueos que solicita el equipo.",
                "permisos": ["agenda.aprobar_bloqueo"],
            },
        ],
    },
    {
        "area": "pacientes",
        "titulo": "Pacientes e historia",
        "capacidades": [
            {
                "clave": "pacientes.ver",
                "titulo": "Ver pacientes",
                "descripcion": "Consultar el listado y la ficha de pacientes.",
                "permisos": ["pacientes.ver"],
            },
            {
                "clave": "pacientes.gestionar",
                "titulo": "Registrar y editar pacientes",
                "descripcion": "Crear pacientes nuevos y actualizar sus datos.",
                "permisos": ["pacientes.crear", "pacientes.editar"],
            },
            {
                "clave": "pacientes.eliminar",
                "titulo": "Eliminar pacientes",
                "descripcion": "Borrar pacientes de la base de datos.",
                "permisos": ["pacientes.eliminar"],
            },
            {
                "clave": "pacientes.datos_sensibles",
                "titulo": "Ver datos de contacto completos",
                "descripcion": "Ver documento, telefono, email, direccion y fecha de nacimiento sin enmascarar.",
                "permisos": ["pacientes.datos_sensibles.ver"],
            },
            {
                "clave": "pacientes.historia",
                "titulo": "Ver historia clinica y antecedentes",
                "descripcion": "Leer evoluciones, antecedentes y consentimientos del paciente.",
                "permisos": [
                    "historia.ver",
                    "pacientes.antecedentes.ver",
                    "consentimientos.ver",
                    "consentimientos.plantillas.ver",
                ],
            },
        ],
    },
    {
        "area": "atencion_clinica",
        "titulo": "Atencion clinica",
        "capacidades": [
            {
                "clave": "clinica.escribir_historia",
                "titulo": "Realizar atenciones y escribir en la historia",
                "descripcion": "Registrar notas de evolucion y editar antecedentes durante la atencion.",
                "permisos": ["historia.notas.crear", "pacientes.antecedentes.editar"],
                "profesional": True,
            },
            {
                "clave": "clinica.fotos",
                "titulo": "Subir fotos clinicas",
                "descripcion": "Adjuntar fotografias a la historia del paciente.",
                "permisos": ["historia.fotos.subir"],
                "profesional": True,
            },
            {
                "clave": "clinica.eliminar_fotos",
                "titulo": "Eliminar fotos clinicas",
                "descripcion": "Borrar fotografias de la historia del paciente.",
                "permisos": ["historia.fotos.eliminar"],
                "profesional": True,
            },
            {
                "clave": "clinica.consentimientos_atencion",
                "titulo": "Gestionar consentimientos durante la atencion",
                "descripcion": "Adjuntar y marcar consentimientos informados en la atencion.",
                "permisos": ["historia.consentimientos.gestionar"],
                "profesional": True,
            },
        ],
    },
    {
        "area": "consentimientos",
        "titulo": "Consentimientos",
        "capacidades": [
            {
                "clave": "consentimientos.generar",
                "titulo": "Generar consentimientos",
                "descripcion": "Emitir consentimientos a partir de las plantillas de la clinica.",
                "permisos": ["consentimientos.generar"],
            },
            {
                "clave": "consentimientos.plantillas",
                "titulo": "Gestionar plantillas de consentimiento",
                "descripcion": "Crear y editar las plantillas de consentimiento.",
                "permisos": ["consentimientos.plantillas.gestionar"],
            },
            {
                "clave": "consentimientos.revocar",
                "titulo": "Revocar consentimientos",
                "descripcion": "Anular consentimientos ya firmados.",
                "permisos": ["consentimientos.revocar"],
            },
        ],
    },
    {
        "area": "cobros",
        "titulo": "Cobros y facturacion",
        "capacidades": [
            {
                "clave": "cobros.ver",
                "titulo": "Ver cobros",
                "descripcion": "Consultar cobros y su estado de pago.",
                "permisos": ["cobros.ver"],
            },
            {
                "clave": "cobros.cobrar",
                "titulo": "Cobrar y registrar pagos",
                "descripcion": "Crear cobros, editar sus items y registrar los pagos recibidos.",
                "permisos": ["cobros.crear", "cobros.editar_items", "cobros.registrar_pago"],
            },
            {
                "clave": "cobros.anular",
                "titulo": "Anular cobros",
                "descripcion": "Dejar sin efecto cobros ya emitidos.",
                "permisos": ["cobros.anular"],
            },
            {
                "clave": "cobros.cambiar_precio",
                "titulo": "Cambiar precios al cobrar",
                "descripcion": "Modificar el precio de los items al armar un cobro de cita directa.",
                "permisos": ["cobros.cambiar_precio"],
            },
        ],
    },
    {
        "area": "cotizaciones",
        "titulo": "Cotizaciones y ventas",
        "capacidades": [
            {
                "clave": "cotizaciones.ver",
                "titulo": "Ver cotizaciones",
                "descripcion": "Consultar las cotizaciones emitidas.",
                "permisos": ["cotizaciones.ver"],
            },
            {
                "clave": "cotizaciones.gestionar",
                "titulo": "Crear y gestionar cotizaciones",
                "descripcion": "Armar cotizaciones nuevas y editarlas.",
                "permisos": ["cotizaciones.gestionar"],
            },
            {
                "clave": "cotizaciones.cambiar_precio",
                "titulo": "Cambiar precios bloqueados en cotizaciones",
                "descripcion": "Modificar items cuyo precio esta bloqueado.",
                "permisos": ["cotizaciones.cambiar_precio"],
            },
            {
                "clave": "ventas.campanas",
                "titulo": "Gestionar campanas de precios",
                "descripcion": "Crear y administrar campanas de precios especiales.",
                "permisos": ["campanas.gestionar"],
            },
        ],
    },
    {
        "area": "cartera",
        "titulo": "Cartera y cobranzas",
        "capacidades": [
            {
                "clave": "cartera.ver",
                "titulo": "Ver cartera",
                "descripcion": "Consultar deudas, cuotas y estado de mora de los pacientes.",
                "permisos": ["cartera.ver"],
            },
            {
                "clave": "cartera.registrar_pago",
                "titulo": "Registrar pagos de cartera",
                "descripcion": "Imputar pagos a las cuotas pendientes.",
                "permisos": ["cartera.registrar_pago"],
            },
            {
                "clave": "cartera.aprobar_excepcion",
                "titulo": "Aprobar excepciones de mora",
                "descripcion": "Autorizar que un paciente con deuda vencida pueda agendar cita.",
                "permisos": ["cartera.aprobar_excepcion"],
            },
            {
                "clave": "cartera.modificar_plazo",
                "titulo": "Modificar plazos y montos de cuotas",
                "descripcion": "Cambiar la fecha de vencimiento y el monto de cuotas pendientes.",
                "permisos": ["cartera.modificar_plazo"],
            },
        ],
    },
    {
        "area": "caja",
        "titulo": "Caja y gastos",
        "capacidades": [
            {
                "clave": "caja.ver_gastos",
                "titulo": "Ver gastos y categorias",
                "descripcion": "Consultar los gastos de caja y sus categorias.",
                "permisos": ["caja.gastos.ver", "caja.categorias.ver"],
            },
            {
                "clave": "caja.registrar_gastos",
                "titulo": "Registrar gastos",
                "descripcion": "Cargar gastos y egresos de caja.",
                "permisos": ["caja.gastos.registrar"],
            },
            {
                "clave": "caja.editar_gastos",
                "titulo": "Editar gastos",
                "descripcion": "Modificar gastos de caja ya registrados.",
                "permisos": ["caja.gastos.editar"],
            },
            {
                "clave": "caja.aprobar_gastos",
                "titulo": "Aprobar gastos",
                "descripcion": "Aprobar o rechazar los gastos cargados por el equipo.",
                "permisos": ["caja.gastos.aprobar"],
            },
            {
                "clave": "caja.categorias",
                "titulo": "Gestionar categorias de gasto",
                "descripcion": "Crear y editar las categorias de gasto.",
                "permisos": ["caja.categorias.gestionar"],
            },
            {
                "clave": "caja.ver_cierres",
                "titulo": "Ver cierres de caja",
                "descripcion": "Consultar los cierres de caja realizados.",
                "permisos": ["caja.cierre.ver"],
            },
            {
                "clave": "caja.realizar_cierres",
                "titulo": "Realizar cierres de caja",
                "descripcion": "Ejecutar el arqueo y cierre de caja.",
                "permisos": ["caja.cierre.realizar"],
            },
            {
                "clave": "caja.configurar",
                "titulo": "Configurar cajas por sede",
                "descripcion": "Definir las cajas disponibles en cada sede.",
                "permisos": ["caja.cajas.gestionar"],
            },
        ],
    },
    {
        "area": "inventario",
        "titulo": "Inventario",
        "capacidades": [
            {
                "clave": "inventario.ver",
                "titulo": "Ver inventario y kardex",
                "descripcion": "Consultar existencias y movimientos de insumos.",
                "permisos": ["inventario.ver", "inventario.kardex.ver"],
            },
            {
                "clave": "inventario.gestionar",
                "titulo": "Gestionar insumos y stock",
                "descripcion": "Crear insumos y ajustar existencias.",
                "permisos": ["inventario.insumos.gestionar", "inventario.ajustar_stock"],
            },
            {
                "clave": "inventario.categorias",
                "titulo": "Gestionar categorias de insumos",
                "descripcion": "Crear y editar las categorias de insumos.",
                "permisos": ["inventario.categorias.gestionar"],
            },
        ],
    },
    {
        "area": "proveedores",
        "titulo": "Proveedores y compras",
        "capacidades": [
            {
                "clave": "proveedores.ver",
                "titulo": "Ver proveedores y ordenes",
                "descripcion": "Consultar proveedores y ordenes de compra.",
                "permisos": ["proveedores.ver", "proveedores.ordenes.ver"],
            },
            {
                "clave": "proveedores.gestionar",
                "titulo": "Gestionar proveedores",
                "descripcion": "Crear y editar proveedores.",
                "permisos": ["proveedores.gestionar"],
            },
            {
                "clave": "proveedores.ordenes_gestionar",
                "titulo": "Gestionar ordenes de compra",
                "descripcion": "Crear y editar ordenes de compra.",
                "permisos": ["proveedores.ordenes.gestionar"],
            },
            {
                "clave": "proveedores.ordenes_recibir",
                "titulo": "Recibir ordenes de compra",
                "descripcion": "Registrar la recepcion de mercaderia contra una orden.",
                "permisos": ["proveedores.ordenes.recibir"],
            },
        ],
    },
    {
        "area": "reportes",
        "titulo": "Reportes",
        "capacidades": [
            {
                "clave": "reportes.operativos",
                "titulo": "Ver reportes operativos",
                "descripcion": "Ocupacion de agenda, produccion, indicadores de operacion.",
                "permisos": ["reportes.ver_operativos"],
            },
            {
                "clave": "reportes.financieros",
                "titulo": "Ver reportes financieros y P&L",
                "descripcion": "Ingresos, egresos y estado de resultados consolidado.",
                "permisos": ["reportes.ver_financieros"],
            },
        ],
    },
    {
        "area": "servicios",
        "titulo": "Servicios y catalogo",
        "capacidades": [
            {
                "clave": "servicios.ver",
                "titulo": "Ver servicios",
                "descripcion": "Consultar el catalogo de servicios y sus precios.",
                "permisos": ["servicios.ver"],
            },
            {
                "clave": "servicios.gestionar",
                "titulo": "Gestionar servicios y precios",
                "descripcion": "Crear y editar servicios, protocolos y precios.",
                "permisos": ["servicios.gestionar"],
            },
        ],
    },
    {
        "area": "sedes",
        "titulo": "Sedes",
        "capacidades": [
            {
                "clave": "sedes.ver",
                "titulo": "Ver sedes",
                "descripcion": "Consultar las sedes de la clinica.",
                "permisos": ["sedes.ver"],
            },
            {
                "clave": "sedes.gestionar",
                "titulo": "Gestionar sedes",
                "descripcion": "Crear y editar sedes.",
                "permisos": ["sedes.gestionar"],
            },
            {
                "clave": "sedes.eliminar",
                "titulo": "Eliminar sedes",
                "descripcion": "Borrar sedes de la clinica.",
                "permisos": ["sedes.eliminar"],
            },
        ],
    },
    {
        "area": "equipo",
        "titulo": "Equipo y roles",
        "capacidades": [
            {
                "clave": "equipo.ver_colaboradores",
                "titulo": "Ver colaboradores y horarios",
                "descripcion": "Consultar el equipo y sus horarios de atencion.",
                "permisos": ["colaboradores.ver", "colaboradores.horarios.ver"],
            },
            {
                "clave": "equipo.gestionar_colaboradores",
                "titulo": "Gestionar colaboradores",
                "descripcion": "Crear y editar colaboradores.",
                "permisos": ["colaboradores.gestionar"],
            },
            {
                "clave": "equipo.gestionar_horarios",
                "titulo": "Gestionar horarios",
                "descripcion": "Definir los horarios de atencion del equipo.",
                "permisos": ["colaboradores.horarios.gestionar"],
            },
            {
                "clave": "equipo.ver_usuarios",
                "titulo": "Ver usuarios",
                "descripcion": "Consultar los usuarios con acceso al sistema.",
                "permisos": ["usuarios.ver"],
            },
            {
                "clave": "equipo.gestionar_usuarios",
                "titulo": "Crear y editar usuarios",
                "descripcion": "Dar de alta usuarios y editar sus datos y rol.",
                "permisos": ["usuarios.crear", "usuarios.editar"],
            },
            {
                "clave": "equipo.eliminar_usuarios",
                "titulo": "Eliminar usuarios",
                "descripcion": "Quitar el acceso de un usuario al sistema.",
                "permisos": ["usuarios.eliminar"],
            },
            {
                "clave": "equipo.gestionar_roles",
                "titulo": "Gestionar roles y permisos",
                "descripcion": "Crear roles, editarlos y asignarles permisos.",
                "permisos": [
                    "roles.ver",
                    "roles.crear",
                    "roles.editar",
                    "roles.eliminar",
                    "roles.asignar_permisos",
                ],
            },
        ],
    },
    {
        "area": "configuracion",
        "titulo": "Configuracion de la clinica",
        "capacidades": [
            {
                "clave": "config.ver_clinica",
                "titulo": "Ver datos de la clinica",
                "descripcion": "Consultar la configuracion general de la clinica.",
                "permisos": ["clinicas.ver"],
            },
            {
                "clave": "config.editar_clinica",
                "titulo": "Editar datos de la clinica",
                "descripcion": "Modificar la configuracion general de la clinica.",
                "permisos": ["clinicas.editar"],
            },
            {
                "clave": "config.log_auditoria",
                "titulo": "Ver log de auditoria",
                "descripcion": "Consultar el registro de acciones del sistema.",
                "permisos": ["core.ver_log_acciones"],
            },
            {
                "clave": "config.puesta_en_marcha",
                "titulo": "Usar el asistente de puesta en marcha",
                "descripcion": "Cargar datos previos (pacientes, cartera, historia) en la migracion inicial.",
                "permisos": ["migracion.gestionar"],
            },
            {
                "clave": "config.emails",
                "titulo": "Enviar emails administrativos",
                "descripcion": "Enviar correos administrativos y ver su configuracion.",
                "permisos": ["notificaciones.email.enviar", "notificaciones.email.ver_config"],
            },
        ],
    },
]

# clave de capacidad -> set de claves de permiso
CAPABILITY_PERMISSIONS = {
    cap["clave"]: set(cap["permisos"])
    for area in CAPABILITY_CATALOG
    for cap in area["capacidades"]
}

# claves de permiso que implican perfil profesional (atencion clinica)
PROFESSIONAL_PERMISSION_KEYS = {
    permiso
    for area in CAPABILITY_CATALOG
    for cap in area["capacidades"]
    if cap.get("profesional")
    for permiso in cap["permisos"]
}


def role_is_professional_from_keys(permission_keys) -> bool:
    """True si el set de permisos incluye alguna clave de atencion clinica."""
    return bool(PROFESSIONAL_PERMISSION_KEYS & set(permission_keys))

ROLE_PERMISSION_DEFAULTS = {
    "admin": ALL_PERMISSION_KEYS,
    "recepcion": {
        "agenda.citas.cambiar_estado",
        "agenda.citas.crear",
        "agenda.citas.editar",
        "agenda.citas.ver",
        "caja.categorias.ver",
        "caja.gastos.registrar",
        "caja.gastos.ver",
        "clinicas.ver",
        "cobros.crear",
        "cobros.editar_items",
        "cobros.registrar_pago",
        "cobros.ver",
        "cartera.registrar_pago",
        "cartera.ver",
        "cotizaciones.ver",
        "colaboradores.horarios.ver",
        "colaboradores.ver",
        "consentimientos.generar",
        "consentimientos.plantillas.ver",
        "consentimientos.ver",
        "historia.consentimientos.gestionar",
        "historia.ver",
        "inventario.kardex.ver",
        "inventario.ver",
        "migracion.gestionar",
        "notificaciones.email.enviar",
        "notificaciones.email.ver_config",
        "pacientes.crear",
        "pacientes.editar",
        "pacientes.ver",
        "proveedores.ordenes.ver",
        "proveedores.ver",
        "reportes.ver_financieros",
        "reportes.ver_operativos",
        "sedes.ver",
        "servicios.ver",
    },
    "profesional": {
        "agenda.citas.ver",
        "caja.categorias.ver",
        "caja.gastos.registrar",
        "caja.gastos.ver",
        "clinicas.ver",
        "cartera.ver",
        "cotizaciones.gestionar",
        "cotizaciones.ver",
        "colaboradores.horarios.ver",
        "colaboradores.ver",
        "consentimientos.generar",
        "consentimientos.plantillas.ver",
        "consentimientos.ver",
        "historia.consentimientos.gestionar",
        "historia.fotos.subir",
        "historia.notas.crear",
        "historia.ver",
        "inventario.kardex.ver",
        "inventario.ver",
        "pacientes.antecedentes.editar",
        "pacientes.antecedentes.ver",
        "pacientes.crear",
        "pacientes.editar",
        "pacientes.ver",
        "proveedores.ordenes.ver",
        "proveedores.ver",
        "reportes.ver_financieros",
        "reportes.ver_operativos",
        "sedes.ver",
        "servicios.ver",
    },
}
