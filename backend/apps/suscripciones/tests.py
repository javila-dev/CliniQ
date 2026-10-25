from io import StringIO
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import LogAccion
from apps.core.tests.factories import ClinicaFixtureMixin, User
from apps.users.serializers import LoginSerializer

from . import services
from .models import Suscripcion

E = Suscripcion.Estado


class EstadosPorTiempoTests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()

    def test_la_prueba_termina_al_final_del_dia(self):
        s = services.crear_prueba(self.clinica, 14)
        fin = timezone.localtime(s.prueba_termina_el)
        self.assertEqual(fin.date(), timezone.localdate() + timedelta(days=14))
        self.assertEqual((fin.hour, fin.minute), (23, 59))
        self.assertEqual(services.dias_restantes_prueba(s), 14)

    def test_prueba_vencida_pasa_a_solo_lectura_y_a_los_30_dias_se_suspende(self):
        s = services.crear_prueba(self.clinica, 14)
        despues = s.prueba_termina_el + timedelta(minutes=1)
        self.assertEqual(services.estado_vigente(s, despues)[0], E.SOLO_LECTURA)
        mucho_despues = s.prueba_termina_el + timedelta(days=services.DIAS_SOLO_LECTURA, minutes=1)
        self.assertEqual(services.estado_vigente(s, mucho_despues), (E.SUSPENDIDA, s.prueba_termina_el + timedelta(days=30)))

    def test_pago_manual_vencido_da_gracia_y_luego_solo_lectura(self):
        s = services.crear_manual(self.clinica, pagado_hasta=timezone.localdate())
        manana = services.fin_del_dia(timezone.localdate()) + timedelta(hours=1)
        self.assertEqual(services.estado_vigente(s, manana)[0], E.EN_GRACIA)
        self.assertEqual(services.estado_vigente(s, manana + timedelta(days=services.DIAS_GRACIA))[0], E.SOLO_LECTURA)

    def test_pago_manual_sin_fecha_no_vence(self):
        s = services.crear_manual(self.clinica)
        self.assertEqual(services.estado_vigente(s, timezone.now() + timedelta(days=900))[0], E.ACTIVA)

    def test_cancelada_al_terminar_el_periodo(self):
        s = services.crear_manual(self.clinica, pagado_hasta=timezone.localdate())
        s.cancelar_al_terminar_periodo = True
        self.assertEqual(services.estado_vigente(s, timezone.now() + timedelta(days=2))[0], E.CANCELADA)

    def test_actualizar_estado_guarda_y_registra_una_sola_vez(self):
        s = services.crear_prueba(self.clinica, 1)
        Suscripcion.objects.filter(pk=s.pk).update(prueba_termina_el=timezone.now() - timedelta(hours=1))
        s.refresh_from_db()
        services.actualizar_estado(s)
        services.actualizar_estado(Suscripcion.objects.get(pk=s.pk))
        self.assertEqual(Suscripcion.objects.get(pk=s.pk).estado, E.SOLO_LECTURA)
        self.assertEqual(LogAccion.objects.filter(accion="suscripcion.estado").count(), 1)


class BloqueoPorEstadoTests(ClinicaFixtureMixin, TestCase):
    """Con token real (no force_authenticate): el bloqueo vive en la autenticación."""

    def setUp(self):
        self.crear_clinica_base()
        self.admin = User.objects.create_user(
            email="admin@test.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.suscripcion = services.crear_prueba(self.clinica, 14)
        self.client = APIClient()

    def _autenticar(self, user, **claims):
        token = LoginSerializer.get_token(user).access_token
        for clave, valor in claims.items():
            token[clave] = valor
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}", HTTP_X_CLINICA_ID=str(self.clinica.id))

    def _poner(self, estado):
        Suscripcion.objects.filter(pk=self.suscripcion.pk).update(
            estado=estado, estado_desde=timezone.now(), prueba_termina_el=timezone.now() + timedelta(days=1),
        )

    def _crear_procedimiento(self):
        return self.client.post(
            "/api/v1/clinicas/procedimientos/",
            {"nombre": "Limpieza", "duracion_min": 30, "precio_referencia": "100000"},
            format="json",
        )

    def test_en_prueba_puede_escribir(self):
        self._autenticar(self.admin)
        self.assertEqual(self._crear_procedimiento().status_code, 201)

    def test_solo_lectura_deja_consultar_pero_no_crear(self):
        self._poner(E.SOLO_LECTURA)
        self._autenticar(self.admin)
        self.assertEqual(self.client.get("/api/v1/clinicas/procedimientos/").status_code, 200)
        respuesta = self._crear_procedimiento()
        self.assertEqual(respuesta.status_code, 403)
        self.assertEqual(respuesta.json()["code"], "SUSCRIPCION_SOLO_LECTURA")

    def test_la_prueba_vencida_se_bloquea_aunque_nadie_haya_guardado_el_cambio(self):
        Suscripcion.objects.filter(pk=self.suscripcion.pk).update(prueba_termina_el=timezone.now() - timedelta(minutes=5))
        self._autenticar(self.admin)
        self.assertEqual(self._crear_procedimiento().json()["code"], "SUSCRIPCION_SOLO_LECTURA")

    def test_suspendida_bloquea_hasta_las_consultas_salvo_lo_libre(self):
        self._poner(E.SUSPENDIDA)
        self._autenticar(self.admin)
        respuesta = self.client.get("/api/v1/clinicas/procedimientos/")
        self.assertEqual(respuesta.status_code, 403)
        self.assertEqual(respuesta.json()["code"], "SUSCRIPCION_SUSPENDIDA")
        self.assertEqual(self.client.get("/api/v1/auth/me/").status_code, 200)
        datos = self.client.get("/api/v1/suscripcion/").json()
        self.assertEqual((datos["estado"], datos["acceso"]), ("suspendida", "ninguno"))

    def test_el_superadmin_suplantando_puede_corregir(self):
        self._poner(E.SUSPENDIDA)
        # Sin sesión de suplantación abierta el token no vale.
        from apps.users.models import SesionSuplantacion

        superadmin = User.objects.create_user(
            email="root@test.com", password="Secret123!", first_name="R", last_name="S", rol=User.Role.SUPERADMIN,
        )
        sesion = SesionSuplantacion.objects.create(
            superadmin=superadmin, usuario=self.admin, expira_en=timezone.now() + timedelta(hours=1),
        )
        self._autenticar(self.admin, suplantado_por=str(superadmin.id), suplantacion=str(sesion.id))
        self.assertEqual(self._crear_procedimiento().status_code, 201)

    def test_sin_suscripcion_no_hay_restriccion(self):
        self.suscripcion.delete()
        self._autenticar(self.admin)
        self.assertEqual(self._crear_procedimiento().status_code, 201)

    def test_suspendida_solo_deja_entrar_a_quien_administra(self):
        self._poner(E.SUSPENDIDA)
        recepcion = User.objects.create_user(
            email="recep@test.com", password="Secret123!", first_name="Rita", last_name="R",
            rol=User.Role.RECEPCION, clinica=self.clinica,
        )
        login = APIClient().post("/api/v1/auth/login/", {"email": recepcion.email, "password": "Secret123!"}, format="json")
        self.assertEqual(login.status_code, 403)
        self.assertEqual(login.json()["code"], "SUSCRIPCION_SUSPENDIDA")
        login = APIClient().post("/api/v1/auth/login/", {"email": self.admin.email, "password": "Secret123!"}, format="json")
        self.assertEqual(login.status_code, 200)


class AccionesDeConsolaTests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()
        self.superadmin = User.objects.create_user(
            email="root@test.com", password="Secret123!", first_name="R", last_name="S", rol=User.Role.SUPERADMIN,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.superadmin)
        self.url = f"/api/v1/suscripcion/admin/{self.clinica.id}/"

    def test_extender_prueba_vigente_suma_dias(self):
        s = services.crear_prueba(self.clinica, 14)
        fin = timezone.localdate(s.prueba_termina_el)
        respuesta = self.client.post(self.url + "extender-prueba/", {"dias": 7, "motivo": "Llamada"}, format="json")
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        s.refresh_from_db()
        self.assertEqual(timezone.localdate(s.prueba_termina_el), fin + timedelta(days=7))
        self.assertTrue(LogAccion.objects.filter(accion="suscripcion.extender_prueba", clinica=self.clinica).exists())

    def test_extender_prueba_vencida_la_reabre_desde_hoy(self):
        s = services.crear_prueba(self.clinica, 14)
        Suscripcion.objects.filter(pk=s.pk).update(estado=E.SUSPENDIDA, prueba_termina_el=timezone.now() - timedelta(days=40))
        self.client.post(self.url + "extender-prueba/", {"dias": 5, "motivo": "Retomó"}, format="json")
        s.refresh_from_db()
        self.assertEqual(s.estado, E.PRUEBA)
        self.assertEqual(timezone.localdate(s.prueba_termina_el), timezone.localdate() + timedelta(days=5))

    def test_no_se_extiende_la_prueba_de_quien_ya_pago(self):
        services.crear_manual(self.clinica)
        respuesta = self.client.post(self.url + "extender-prueba/", {"dias": 5, "motivo": "x"}, format="json")
        self.assertEqual(respuesta.status_code, 400)

    def test_pago_manual_activa_la_cuenta(self):
        services.crear_prueba(self.clinica, 14)
        hasta = timezone.localdate() + timedelta(days=30)
        respuesta = self.client.post(self.url + "pago-manual/", {"pagado_hasta": hasta.isoformat(), "ciclo": "anual"}, format="json")
        datos = respuesta.json()
        self.assertEqual((datos["estado"], datos["modo_cobro"], datos["ciclo"]), ("activa", "manual", "anual"))
        self.assertEqual(datos["periodo_fin"], hasta.isoformat())

    def test_crear_clinica_desde_la_consola_arranca_en_prueba_por_defecto(self):
        respuesta = self.client.post(
            "/api/v1/admin/tenants/",
            {"nombre": "Nueva", "nit": "900111222", "admin_email": "nueva@test.com", "dias_prueba": 10},
            format="json",
        )
        self.assertEqual(respuesta.status_code, 201, respuesta.content)
        self.assertEqual(respuesta.json()["suscripcion"]["estado"], "prueba")
        self.assertEqual(respuesta.json()["suscripcion"]["dias_restantes_prueba"], 10)

    def test_crear_clinica_desde_la_consola_con_cobro_manual(self):
        respuesta = self.client.post(
            "/api/v1/admin/tenants/",
            {"nombre": "Paga", "nit": "900111333", "admin_email": "paga@test.com", "inicio": "manual"},
            format="json",
        )
        self.assertEqual(respuesta.json()["suscripcion"]["modo_cobro"], "manual")


class RegistroCreaPruebaTests(TestCase):
    def test_el_registro_exige_el_rol_de_quien_se_registra(self):
        from django.core.cache import cache

        cache.clear()  # el registro tiene límite de intentos por IP
        datos = {
            "nombre_clinica": "Clínica Luna", "nit": "901000222", "nombre_admin": "Ana", "apellido_admin": "Ruiz",
            "email": "ana@luna.com", "telefono": "3001112233",
        }
        respuesta = APIClient().post("/api/v1/registro-clinica/", datos, format="json")
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(respuesta.json()["cargo"], ["Elige tu rol en la clínica."])
        respuesta = APIClient().post("/api/v1/registro-clinica/", {**datos, "cargo": "jefe"}, format="json")
        self.assertEqual(respuesta.json()["cargo"], ["Elige tu rol en la clínica."])

    def test_confirmar_registro_crea_la_suscripcion_en_prueba(self):
        from apps.clinicas.models import RegistroPendiente
        from apps.clinicas.services import confirmar_registro_clinica

        registro = RegistroPendiente.objects.create(
            token="tok-registro", nombre_clinica="Clínica Sol", nit="901000111", nombre_admin="Ana",
            apellido_admin="Ruiz", email="ana@sol.com", telefono="3001112233", acepta_whatsapp=True, cargo="duenio",
            expires_at=timezone.now() + timedelta(hours=1),
        )
        confirmar_registro_clinica(registro.token)
        s = Suscripcion.objects.get(clinica__nit="901000111")
        self.assertEqual(s.estado, E.PRUEBA)
        self.assertEqual(services.dias_restantes_prueba(s), 14)
        self.assertIsNotNone(s.whatsapp_autorizado_at)
        self.assertEqual(s.perfil.get("cargo"), "duenio")
        # La primera sede nace con el nombre de la clínica, sin horario (paso de Preparar mi clínica).
        sede = s.clinica.sedes.get()
        self.assertEqual((sede.nombre, sede.horario), ("Clínica Sol", {}))
        self.assertEqual(User.objects.get(email="ana@sol.com").telefono, "3001112233")


class ActivacionYSeguimientoTests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        from django.core.cache import cache

        cache.clear()
        self.crear_clinica_base()
        self.admin = User.objects.create_user(
            email="admin@test.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.suscripcion = services.crear_prueba(self.clinica, 14)

    def _cita(self, estado):
        from apps.agenda.models import Cita

        inicio = timezone.now() - timedelta(hours=2)
        return Cita.objects.create(
            sede=self.sede, paciente=self.paciente, profesional=self.profesional, servicio=self.servicio,
            fecha_inicio=inicio, fecha_fin=inicio + timedelta(minutes=30), estado=estado,
        )

    def test_hitos_se_calculan_desde_los_datos_y_no_se_recalculan(self):
        from .activacion import actualizar_hitos
        from .models import HitoClinica

        self._cita("completada")
        hitos = actualizar_hitos(self.clinica)
        for clave in ("procedimiento", "paciente", "cita", "atencion"):
            self.assertIn(clave, hitos)
        self.assertNotIn("cinco_atenciones", hitos)
        primera = HitoClinica.objects.get(clinica=self.clinica, hito="atencion").alcanzado_el
        self._cita("completada")
        actualizar_hitos(self.clinica)
        self.assertEqual(HitoClinica.objects.get(clinica=self.clinica, hito="atencion").alcanzado_el, primera)

    def test_la_actividad_se_registra_una_vez_por_ventana_y_sin_suplantacion(self):
        from .activacion import registrar_actividad
        from .models import ActividadDiaria

        registrar_actividad(self.admin, {})
        registrar_actividad(self.admin, {})
        registrar_actividad(self.admin, {"suplantado_por": "x"})
        fila = ActividadDiaria.objects.get(clinica=self.clinica, usuario=self.admin)
        self.assertEqual(fila.bloques, 1)

    def test_una_peticion_real_cuenta_como_actividad(self):
        from .models import ActividadDiaria

        token = LoginSerializer.get_token(self.admin).access_token
        cliente = APIClient()
        cliente.credentials(HTTP_AUTHORIZATION=f"Bearer {token}", HTTP_X_CLINICA_ID=str(self.clinica.id))
        cliente.get("/api/v1/clinicas/procedimientos/")
        self.assertTrue(ActividadDiaria.objects.filter(clinica=self.clinica, fecha=timezone.localdate()).exists())

    def test_activada_con_tres_atenciones_y_tres_dias_de_uso(self):
        from .activacion import actualizar_hitos, evaluar
        from .models import ActividadDiaria

        for _ in range(3):
            self._cita("completada")
        for dias in range(3):
            ActividadDiaria.objects.create(clinica=self.clinica, usuario=self.admin, fecha=timezone.localdate() - timedelta(days=dias))
        actividad = {"dias_activos": 3, "usuarios_activos_7d": 1, "ultima_actividad": timezone.now()}
        resultado = evaluar(self.clinica, self.suscripcion, actualizar_hitos(self.clinica), actividad, 3)
        self.assertEqual(resultado["semaforo"], "activada")

    def test_sin_uso_en_una_semana_esta_dormida(self):
        from .activacion import evaluar

        Clinica = type(self.clinica)
        Clinica.objects.filter(pk=self.clinica.pk).update(created_at=timezone.now() - timedelta(days=9))
        self.clinica.refresh_from_db()
        actividad = {"dias_activos": 0, "usuarios_activos_7d": 0, "ultima_actividad": None}
        self.assertEqual(evaluar(self.clinica, self.suscripcion, {}, actividad, 0)["semaforo"], "dormida")

    def test_consola_lista_pruebas_y_guarda_notas(self):
        superadmin = User.objects.create_user(
            email="root@test.com", password="Secret123!", first_name="R", last_name="S", rol=User.Role.SUPERADMIN,
        )
        cliente = APIClient()
        cliente.force_authenticate(superadmin)
        filas = cliente.get("/api/v1/suscripcion/admin/seguimiento/").json()
        self.assertEqual([f["clinica_nombre"] for f in filas], ["Clinica Test"])
        self.assertEqual(len(filas[0]["hitos"]), 10)
        respuesta = cliente.post(
            f"/api/v1/suscripcion/admin/{self.clinica.id}/notas/",
            {"canal": "whatsapp", "texto": "Le escribí para ofrecer ayuda", "proximo_contacto": timezone.localdate().isoformat()},
            format="json",
        )
        self.assertEqual(respuesta.status_code, 201, respuesta.content)
        fila = cliente.get("/api/v1/suscripcion/admin/seguimiento/").json()[0]
        self.assertEqual(fila["ultima_nota"]["texto"], "Le escribí para ofrecer ayuda")
        embudo = cliente.get("/api/v1/suscripcion/admin/embudo/").json()
        self.assertEqual(embudo["total"]["clinicas"], 1)


class CorreosCicloVidaTests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()
        self.admin = User.objects.create_user(
            email="admin@test.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.suscripcion = services.crear_prueba(self.clinica, 14)

    def test_bienvenida_sale_una_sola_vez_a_los_administradores(self):
        from django.core import mail

        from .ciclo_vida import procesar_avisos

        enviados = procesar_avisos()
        self.assertEqual([(c, clave) for c, clave, _ in enviados], [("Clinica Test", "bienvenida")])
        self.assertEqual(mail.outbox[0].to, ["admin@test.com"])
        self.assertEqual(procesar_avisos(), [])

    def test_aviso_de_vencimiento_vuelve_a_salir_si_se_extiende_la_prueba(self):
        from .ciclo_vida import aviso_pendiente
        from .models import MensajeCicloVida

        Suscripcion.objects.filter(pk=self.suscripcion.pk).update(
            prueba_termina_el=services.fin_del_dia(timezone.localdate() + timedelta(days=3)),
        )
        type(self.clinica).objects.filter(pk=self.clinica.pk).update(created_at=timezone.now() - timedelta(days=11))
        s = Suscripcion.objects.select_related("clinica").get(pk=self.suscripcion.pk)
        self.assertEqual(aviso_pendiente(s).clave, "prueba_vence_3d")
        MensajeCicloVida.objects.create(
            clinica=self.clinica, clave="prueba_vence_3d",
            referencia=timezone.localtime(s.prueba_termina_el).strftime("%d/%m/%Y"),
            enviado_at=timezone.now() - timedelta(days=1),
        )
        self.assertIsNone(aviso_pendiente(s))
        s.prueba_termina_el = services.fin_del_dia(timezone.localdate() + timedelta(days=2))
        self.assertEqual(aviso_pendiente(s).clave, "prueba_vence_3d")

    def test_no_sale_mas_de_un_correo_cada_veinte_horas(self):
        from .ciclo_vida import aviso_pendiente
        from .models import MensajeCicloVida

        MensajeCicloVida.objects.create(clinica=self.clinica, clave="otro")
        self.assertIsNone(aviso_pendiente(Suscripcion.objects.select_related("clinica").get(pk=self.suscripcion.pk)))

    def test_el_comando_no_envia_con_los_correos_apagados(self):
        from io import StringIO

        from django.core import mail
        from django.core.management import call_command

        salida = StringIO()
        call_command("procesar_suscripciones", stdout=salida)
        self.assertEqual(len(mail.outbox), 0)
        self.assertIn("apagados", salida.getvalue())


class BienvenidaYPreparacionTests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()
        self.admin = User.objects.create_user(
            email="admin@test.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        services.crear_prueba(self.clinica, 14)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_la_bienvenida_queda_pendiente_hasta_contestar_o_saltarla(self):
        datos = self.client.get("/api/v1/suscripcion/").json()
        self.assertTrue(datos["bienvenida_pendiente"])
        self.assertEqual(set(datos["preparacion"]), {"nivel", "completados", "total", "todo_listo"})
        respuesta = self.client.post("/api/v1/suscripcion/perfil/", {"profesionales": "2-3", "especialidad": ""}, format="json")
        self.assertEqual(respuesta.json()["perfil"], {"profesionales": "2-3", "visto": True})
        self.assertFalse(self.client.get("/api/v1/suscripcion/").json()["bienvenida_pendiente"])

    def test_quien_no_administra_no_ve_la_bienvenida(self):
        recepcion = User.objects.create_user(
            email="recep@test.com", password="Secret123!", first_name="Rita", last_name="R",
            rol=User.Role.RECEPCION, clinica=self.clinica,
        )
        self.client.force_authenticate(recepcion)
        self.assertFalse(self.client.get("/api/v1/suscripcion/").json()["bienvenida_pendiente"])
        self.assertEqual(self.client.post("/api/v1/suscripcion/perfil/", {}, format="json").status_code, 403)

    def test_el_superadmin_enciende_los_correos_desde_la_consola(self):
        from apps.core.models import ConfiguracionGlobal

        superadmin = User.objects.create_user(
            email="root@test.com", password="Secret123!", first_name="R", last_name="S", rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(superadmin)
        respuesta = self.client.patch("/api/v1/core/configuracion-global/", {"correos_ciclo_vida_habilitados": True}, format="json")
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        self.assertTrue(ConfiguracionGlobal.get_solo().correos_ciclo_vida_habilitados)


class TareaProgramadaTests(TestCase):
    def test_la_tarea_guarda_cuando_corrio_y_la_simulacion_no(self):
        from django.core.management import call_command

        from apps.core.models import ConfiguracionGlobal

        call_command("procesar_suscripciones", "--simular", stdout=StringIO())
        self.assertIsNone(ConfiguracionGlobal.get_solo().suscripciones_procesadas_el)
        call_command("procesar_suscripciones", stdout=StringIO())
        self.assertIsNotNone(ConfiguracionGlobal.get_solo().suscripciones_procesadas_el)
