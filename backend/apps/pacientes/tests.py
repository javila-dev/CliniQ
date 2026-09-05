from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.clinicas.models import Clinica
from apps.pacientes.models import AntecedentePaciente, Paciente


User = get_user_model()


class AntecedentesEstructuradosTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            email="root-paciente@example.com",
            password="secret123",
            first_name="Root",
            last_name="Paciente",
            rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(self.superadmin)
        self.clinica = Clinica.objects.create(nombre="Clinica Pacientes", nit="900444555")
        self.client.credentials(HTTP_X_ACTIVE_CLINICA=str(self.clinica.id))
        self.paciente = Paciente.objects.create(
            clinica=self.clinica,
            tipo_documento=Paciente.TipoDocumento.CC,
            numero_documento="111222333",
            nombres="Sara",
            apellidos="Mejia",
            fecha_nacimiento=timezone.localdate() - timedelta(days=32 * 365),
            sexo=Paciente.Sexo.FEMENINO,
            direccion="Calle 8",
            telefono="3001230000",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP,
            autoriza_datos=True,
        )

    def test_put_acepta_formato_anidado_y_get_lo_devuelve(self):
        response = self.client.put(
            f"/api/v1/pacientes/{self.paciente.id}/antecedentes/",
            {
                "personales": {
                    "toxicologicos": {
                        "tabaquismo": True,
                        "alcohol": False,
                        "drogas": False,
                        "otros": "",
                    },
                    "patologicos": "HTA controlada",
                    "quirurgicos": "Rinoplastia 2018",
                    "farmacologicos": "Losartan 50mg",
                    "alergicos": "Penicilina",
                    "contraindicaciones": "Ninguna",
                    "tipo_piel": "II",
                    "antecedentes_esteticos": "Botox 2023",
                },
                "ginecoobstetricos": {
                    "formula_obstetrica": "G2P1A1",
                    "fecha_ultima_menstruacion": "2026-04-01",
                    "metodo_anticonceptivo": "DIU",
                    "menopausia": False,
                    "observaciones": "",
                },
                "familiares": "Madre con HTA.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        antecedente = AntecedentePaciente.objects.get(paciente=self.paciente)
        self.assertEqual(antecedente.condiciones_medicas, "HTA controlada")
        self.assertEqual(antecedente.patologicos, "HTA controlada")
        self.assertEqual(antecedente.medicamentos_actuales, "Losartan 50mg")

        detail = self.client.get(f"/api/v1/pacientes/{self.paciente.id}/antecedentes/")

        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["personales"]["farmacologicos"], "Losartan 50mg")
        self.assertEqual(detail.json()["personales"]["patologicos"], "HTA controlada")
        self.assertEqual(detail.json()["ginecoobstetricos"]["metodo_anticonceptivo"], "DIU")

    def test_patch_legacy_fields_sigue_reflejando_formato_nuevo(self):
        AntecedentePaciente.objects.create(paciente=self.paciente)

        response = self.client.patch(
            f"/api/v1/pacientes/{self.paciente.id}/antecedentes/",
            {
                "condiciones_medicas": "Diabetes mellitus",
                "medicamentos_actuales": "Metformina",
                "alergias": "Latex",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["personales"]["patologicos"], "Diabetes mellitus")
        self.assertEqual(response.json()["personales"]["farmacologicos"], "Metformina")
        self.assertEqual(response.json()["personales"]["alergicos"], "Latex")


class PacienteCamposExtendidosTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            email="root-h52@example.com",
            password="secret123",
            first_name="Root",
            last_name="H52",
            rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(self.superadmin)
        self.clinica = Clinica.objects.create(nombre="Clinica H52", nit="900123999")
        self.client.credentials(HTTP_X_ACTIVE_CLINICA=str(self.clinica.id))
        self.paciente = Paciente.objects.create(
            clinica=self.clinica,
            tipo_documento=Paciente.TipoDocumento.CC,
            numero_documento="777888999",
            nombres="Laura",
            apellidos="Perez",
            fecha_nacimiento=timezone.localdate() - timedelta(days=34 * 365),
            sexo=Paciente.Sexo.FEMENINO,
            telefono="3004567890",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP,
            autoriza_datos=True,
        )

    def test_get_devuelve_campos_extendidos_vacios_por_defecto(self):
        response = self.client.get(f"/api/v1/pacientes/{self.paciente.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["direccion"], "")
        self.assertEqual(response.json()["ciudad"], "")
        self.assertEqual(response.json()["grupo_sanguineo"], "")
        self.assertEqual(response.json()["eps"], "")
        self.assertEqual(response.json()["nombre_responsable"], "")

    def test_patch_persiste_subconjunto_de_campos_extendidos(self):
        response = self.client.patch(
            f"/api/v1/pacientes/{self.paciente.id}/",
            {
                "direccion": "Calle 123",
                "ciudad": "Bogota",
                "barrio": "Chapinero",
                "estado_civil": "soltero",
                "escolaridad": "universitario",
                "grupo_etnico": "mestizo",
                "grupo_sanguineo": "O+",
                "eps": "Sura",
                "tipo_afiliado": "cotizante",
                "regimen": "contributivo",
                "nombre_responsable": "Marta Perez",
                "parentesco_responsable": "Madre",
                "telefono_responsable": "3000001111",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.paciente.refresh_from_db()
        self.assertEqual(self.paciente.ciudad, "Bogota")
        self.assertEqual(self.paciente.grupo_sanguineo, "O+")
        self.assertEqual(response.json()["eps"], "Sura")
        self.assertEqual(response.json()["telefono_responsable"], "3000001111")

    def test_post_sigue_funcionando_con_payload_minimo(self):
        response = self.client.post(
            "/api/v1/pacientes/",
            {
                "clinica": str(self.clinica.id),
                "tipo_documento": Paciente.TipoDocumento.CC,
                "numero_documento": "123450001",
                "nombres": "Camila",
                "apellidos": "Rojas",
                "fecha_nacimiento": (timezone.localdate() - timedelta(days=25 * 365)).isoformat(),
                "sexo": Paciente.Sexo.FEMENINO,
                "telefono": "3002223333",
                "canal_confirmacion": Paciente.CanalConfirmacion.WHATSAPP,
                "autoriza_datos": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["direccion"], "")


class RegistroPublicoTests(TestCase):
    def setUp(self):
        import uuid

        from apps.users.models import Rol

        self.client = APIClient()
        self.clinica = Clinica.objects.create(nombre="Clinica Publica", nit=f"906{uuid.uuid4().hex[:6]}")
        self.token = self.clinica.token_registro_publico
        self.admin = User.objects.create_user(
            email=f"admin-pub-{uuid.uuid4().hex[:6]}@test.com",
            password="Secret123!",
            first_name="Admin",
            last_name="Publico",
            rol=User.Role.ADMIN,
            clinica=self.clinica,
        )
        self.admin.rol_dinamico = Rol.objects.get(clinica=self.clinica, slug="admin")
        self.admin.save(update_fields=["rol_dinamico"])
        self.payload = {
            "token": self.token,
            "tipo_documento": Paciente.TipoDocumento.CC,
            "numero_documento": "9988776655",
            "nombres": "Pedro",
            "apellidos": "Publico",
            "fecha_nacimiento": (timezone.localdate() - timedelta(days=30 * 365)).isoformat(),
            "sexo": Paciente.Sexo.MASCULINO,
            "telefono": "3009998877",
            "email": "pedro.publico@example.com",
            "canal_confirmacion": Paciente.CanalConfirmacion.WHATSAPP,
            "autoriza_datos": True,
        }

    def test_get_clinica_publica_por_token(self):
        response = self.client.get("/api/v1/registro-publico/clinica/", {"token": self.token})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["clinica_nombre"], self.clinica.nombre)
        self.assertFalse(response.json()["tab_personal_requerido"])
        self.assertFalse(response.json()["tab_salud_requerido"])

    def test_get_sin_token_devuelve_400(self):
        response = self.client.get("/api/v1/registro-publico/clinica/")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "TOKEN_REQUERIDO")

    def test_post_crea_paciente_sin_auth(self):
        response = self.client.post("/api/v1/registro-publico/pacientes/", self.payload, format="json")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["nombre_completo"], "Pedro Publico")
        paciente = Paciente.objects.get(id=response.json()["id"])
        self.assertEqual(paciente.clinica_id, self.clinica.id)

    def test_post_rechaza_duplicado_por_telefono(self):
        Paciente.objects.create(
            clinica=self.clinica,
            tipo_documento=Paciente.TipoDocumento.CC,
            numero_documento="1110002222",
            nombres="Existente",
            apellidos="Paciente",
            fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO,
            telefono="3009998877",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP,
            autoriza_datos=True,
        )

        response = self.client.post("/api/v1/registro-publico/pacientes/", self.payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "PACIENTE_YA_EXISTE")
        self.assertEqual(response.json()["campo"], "telefono")

    def test_mi_clinica_expone_registro_publico_token(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/clinicas/mi-clinica/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["registro_publico_token"], self.token)
        self.assertEqual(
            response.json()["registro_publico"],
            {"tab_personal_requerido": False, "tab_salud_requerido": False},
        )

    def test_post_rechaza_tab_personal_vacio_cuando_requerido(self):
        from apps.configuracion.models import ConfiguracionRegistroPublico

        ConfiguracionRegistroPublico.objects.create(
            clinica=self.clinica,
            tab_personal_requerido=True,
        )
        response = self.client.post("/api/v1/registro-publico/pacientes/", self.payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "TAB_PERSONAL_REQUERIDO")

    def test_post_acepta_tab_personal_con_un_campo(self):
        from apps.configuracion.models import ConfiguracionRegistroPublico

        ConfiguracionRegistroPublico.objects.create(
            clinica=self.clinica,
            tab_personal_requerido=True,
        )
        payload = {**self.payload, "ciudad": "Bogota"}
        response = self.client.post("/api/v1/registro-publico/pacientes/", payload, format="json")

        self.assertEqual(response.status_code, 201)

    def test_post_rechaza_tab_salud_vacio_cuando_requerido(self):
        from apps.configuracion.models import ConfiguracionRegistroPublico

        ConfiguracionRegistroPublico.objects.create(
            clinica=self.clinica,
            tab_salud_requerido=True,
        )
        response = self.client.post("/api/v1/registro-publico/pacientes/", self.payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "TAB_SALUD_REQUERIDO")

    def test_patch_configuracion_registro_publico(self):
        self.client.force_authenticate(self.admin)
        response = self.client.patch(
            "/api/v1/configuracion/registro-publico/",
            {"tab_personal_requerido": True, "tab_salud_requerido": True},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["tab_personal_requerido"])
        self.assertTrue(response.json()["tab_salud_requerido"])


class DatosSensiblesPacienteTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.clinica = Clinica.objects.create(nombre="Clinica Sensibles", nit="900777888")
        self.admin = User.objects.create_user(
            email="admin-sensibles@example.com",
            password="secret123",
            first_name="Admin",
            last_name="Sensibles",
            rol=User.Role.ADMIN,
            clinica=self.clinica,
        )
        self.recepcion = User.objects.create_user(
            email="recepcion-sensibles@example.com",
            password="secret123",
            first_name="Recepcion",
            last_name="Sensibles",
            rol=User.Role.RECEPCION,
            clinica=self.clinica,
        )
        self.paciente = Paciente.objects.create(
            clinica=self.clinica,
            tipo_documento=Paciente.TipoDocumento.CC,
            numero_documento="1098765432",
            nombres="Laura",
            apellidos="Restrepo",
            fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO,
            direccion="Calle 45 # 12-30",
            ciudad="Medellin",
            barrio="El Poblado",
            telefono="+573001234567",
            email="laura.restrepo@example.com",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP,
            autoriza_datos=True,
        )

    def _auth(self, user):
        self.client.force_authenticate(user)
        self.client.credentials(HTTP_X_ACTIVE_CLINICA=str(self.clinica.id))

    def test_recepcion_recibe_datos_enmascarados(self):
        self._auth(self.recepcion)
        data = self.client.get(f"/api/v1/pacientes/{self.paciente.id}/").json()

        self.assertTrue(data["datos_sensibles_ocultos"])
        self.assertEqual(data["numero_documento"], "••••••5432")
        self.assertTrue(data["telefono"].endswith("4567"))
        self.assertIn("•", data["telefono"])
        self.assertTrue(data["email"].startswith("•"))
        self.assertTrue(data["email"].endswith("po@example.com"))
        self.assertEqual(data["direccion"], "••••")
        self.assertEqual(data["ciudad"], "••••")
        self.assertEqual(data["barrio"], "••••")
        self.assertIsNone(data["fecha_nacimiento"])
        # La edad (campo aparte) sigue disponible.
        self.assertIsNotNone(data["edad"])
        self.assertEqual(data["edad"], self.paciente.edad)

    def test_admin_ve_datos_completos(self):
        self._auth(self.admin)
        data = self.client.get(f"/api/v1/pacientes/{self.paciente.id}/").json()

        self.assertFalse(data["datos_sensibles_ocultos"])
        self.assertEqual(data["numero_documento"], "1098765432")
        self.assertEqual(data["telefono"], "+573001234567")
        self.assertEqual(data["email"], "laura.restrepo@example.com")
        self.assertEqual(data["direccion"], "Calle 45 # 12-30")
        self.assertIsNotNone(data["fecha_nacimiento"])

    def test_recepcion_no_puede_sobrescribir_dato_sensible(self):
        self._auth(self.recepcion)
        response = self.client.patch(
            f"/api/v1/pacientes/{self.paciente.id}/",
            {"numero_documento": "0000000000", "telefono": "+570000000000", "ocupacion": "Ingeniera"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.paciente.refresh_from_db()
        self.assertEqual(self.paciente.numero_documento, "1098765432")
        self.assertEqual(self.paciente.telefono, "+573001234567")
        # Un campo no sensible sí se actualiza.
        self.assertEqual(self.paciente.ocupacion, "Ingeniera")

    def test_buscar_enmascara_para_recepcion(self):
        self._auth(self.recepcion)
        resultados = self.client.get("/api/v1/pacientes/buscar/?q=Restrepo").json()
        self.assertEqual(len(resultados), 1)
        self.assertEqual(resultados[0]["numero_documento"], "••••••5432")

        self._auth(self.admin)
        resultados = self.client.get("/api/v1/pacientes/buscar/?q=Restrepo").json()
        self.assertEqual(resultados[0]["numero_documento"], "1098765432")
