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
        self.assertEqual(response.json()["estado_civil"], "")
        self.assertEqual(response.json()["eps"], "")
