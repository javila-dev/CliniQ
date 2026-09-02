from datetime import date, datetime, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.caja.models import Caja, CategoriaGasto, GastoCaja, SesionCaja
from apps.clinicas.models import Clinica, Sede
from apps.cobros.models import Cobro
from apps.pacientes.models import Paciente

User = get_user_model()


class _BaseCajaTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            email="root-caja@example.com",
            password="secret123",
            first_name="Root",
            last_name="Caja",
            rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(self.superadmin)
        self.clinica = Clinica.objects.create(nombre="Clinica Caja", nit="901666555")
        # Superadmin necesita la clínica activa por header para las vistas scoped.
        self.client.credentials(HTTP_X_ACTIVE_CLINICA=str(self.clinica.id))
        self.sede = Sede.objects.create(
            clinica=self.clinica, nombre="Principal", ciudad="Bogota",
            direccion="Calle 1", telefono="3000000000",
        )
        self.paciente = Paciente.objects.create(
            clinica=self.clinica,
            tipo_documento=Paciente.TipoDocumento.CC,
            numero_documento="777111222",
            nombres="Marcela",
            apellidos="Torres",
            fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO,
            direccion="Calle 7",
            telefono="3000000005",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP,
            autoriza_datos=True,
        )
        self.categoria = CategoriaGasto.objects.create(clinica=self.clinica, nombre="Arriendo")
        self.caja = Caja.objects.create(sede=self.sede, saldo_inicial=Decimal("100000"))

    # -- helpers -----------------------------------------------------------
    def _abrir(self, monto_apertura=None):
        payload = {"caja": str(self.caja.id)}
        if monto_apertura is not None:
            payload["monto_apertura"] = str(monto_apertura)
        return self.client.post("/api/v1/caja/sesiones/abrir/", payload, format="json")

    def _cerrar(self, sesion_id, efectivo_contado):
        return self.client.post(
            f"/api/v1/caja/sesiones/{sesion_id}/cerrar/",
            {"efectivo_contado": str(efectivo_contado)},
            format="json",
        )

    def _cobro_efectivo(self, valor, medio_pago="efectivo", fecha=None):
        cobro = Cobro.objects.create(
            origen=Cobro.Origen.LIBRE,
            paciente=self.paciente,
            sede=self.sede,
            created_by=self.superadmin,
            total=valor,
            subtotal=valor,
            estado=Cobro.Estado.PAGADO,
        )
        cobro.pagos.create(
            medio_pago=medio_pago,
            valor=valor,
            referencia="REF",
            fecha=fecha or timezone.now(),
            recibido_por=self.superadmin,
        )
        return cobro

    def _post_gasto(self, valor="10000.00", **extra):
        payload = {
            "sede": str(self.sede.id),
            "categoria": str(self.categoria.id),
            "descripcion": "Gasto de prueba",
            "valor": valor,
        }
        payload.update(extra)
        return self.client.post("/api/v1/caja/gastos/", payload, format="json")


class SesionCajaFlujoTests(_BaseCajaTest):
    def test_abrir_usa_saldo_inicial_la_primera_vez(self):
        r = self._abrir()
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["monto_apertura"], "100000.00")
        self.assertEqual(r.json()["estado"], "abierta")

    def test_solo_una_sesion_abierta_por_caja(self):
        self.assertEqual(self._abrir().status_code, 201)
        segundo = self._abrir()
        self.assertEqual(segundo.status_code, 400)
        self.assertEqual(segundo.json()["code"], "CAJA_YA_ABIERTA")

    def test_arqueo_suma_efectivo_resta_gastos_ignora_no_efectivo(self):
        sesion_id = self._abrir().json()["id"]
        self._cobro_efectivo(Decimal("500000"))
        self._cobro_efectivo(Decimal("200000"), medio_pago="transferencia")
        g = self._post_gasto(valor="30000.00")
        self.assertEqual(g.status_code, 201)

        # esperado = 100000 apertura + 500000 efectivo - 30000 gasto = 570000
        r = self._cerrar(sesion_id, "570000.00")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["total_ingresos"], "500000.00")
        self.assertEqual(body["total_egresos"], "30000.00")
        self.assertEqual(body["esperado"], "570000.00")
        self.assertEqual(body["diferencia"], "0.00")
        self.assertEqual(body["estado"], "cerrada")

    def test_diferencia_refleja_sobrante_y_faltante(self):
        sesion_id = self._abrir().json()["id"]
        self._cobro_efectivo(Decimal("300000"))

        r = self._cerrar(sesion_id, "410000.00")  # 100000 + 300000 esperado
        self.assertEqual(r.json()["diferencia"], "10000.00")

    def test_el_fondo_se_arrastra_al_siguiente_cierre(self):
        s1 = self._abrir().json()["id"]
        self._cerrar(s1, "120000.00")  # cuenta 20k de mas -> queda 120k en caja

        r2 = self._abrir()
        self.assertEqual(r2.status_code, 201)
        self.assertEqual(r2.json()["monto_apertura"], "120000.00")

    def test_no_se_puede_cerrar_dos_veces(self):
        sesion_id = self._abrir().json()["id"]
        self.assertEqual(self._cerrar(sesion_id, "100000.00").status_code, 200)
        segundo = self._cerrar(sesion_id, "100000.00")
        self.assertEqual(segundo.status_code, 400)
        self.assertEqual(segundo.json()["code"], "SESION_YA_CERRADA")

    def test_ingresos_entre_cierres_no_se_pierden(self):
        # Sesion 1: se abre y se cierra sin contar un cobro que entra despues.
        s1 = self._abrir().json()["id"]
        self._cerrar(s1, "100000.00")

        # Cobro en efectivo en la ventana entre el cierre de s1 y la apertura de s2.
        self._cobro_efectivo(Decimal("80000"))

        s2 = self._abrir().json()["id"]
        r = self._cerrar(s2, "300000.00")  # 120000? no: apertura=100000 (contado en s1) + 80000 = 180000
        self.assertEqual(r.json()["total_ingresos"], "80000.00")
        self.assertEqual(r.json()["esperado"], "180000.00")


class EstadoActualTests(_BaseCajaTest):
    def test_actual_devuelve_balance_en_vivo(self):
        sin_abrir = self.client.get(f"/api/v1/caja/sesiones/actual/?sede={self.sede.id}")
        self.assertEqual(sin_abrir.status_code, 200)
        self.assertIsNotNone(sin_abrir.json()["caja"])
        self.assertIsNone(sin_abrir.json()["sesion"])

        self._abrir()
        self._cobro_efectivo(Decimal("250000"))
        self._post_gasto(valor="40000.00")

        r = self.client.get(f"/api/v1/caja/sesiones/actual/?sede={self.sede.id}")
        sesion = r.json()["sesion"]
        self.assertEqual(sesion["total_ingresos"], "250000.00")
        self.assertEqual(sesion["total_egresos"], "40000.00")
        # 100000 + 250000 - 40000
        self.assertEqual(sesion["esperado"], "310000.00")


class GastoRequiereSesionAbiertaTests(_BaseCajaTest):
    def test_no_deja_registrar_gasto_con_caja_cerrada(self):
        r = self._post_gasto(valor="10000.00")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["code"], "CAJA_CERRADA")

    def test_gasto_se_ata_a_la_sesion_abierta(self):
        self._abrir()
        r = self._post_gasto(valor="10000.00")
        self.assertEqual(r.status_code, 201)
        gasto = GastoCaja.objects.get(id=r.json()["id"])
        self.assertIsNotNone(gasto.sesion_id)
        self.assertEqual(gasto.sesion.estado, SesionCaja.Estado.ABIERTA)

    def test_gasto_inmutable_tras_cerrar_la_sesion(self):
        sesion_id = self._abrir().json()["id"]
        gasto_id = self._post_gasto(valor="10000.00").json()["id"]
        self._cerrar(sesion_id, "90000.00")

        patch = self.client.patch(
            f"/api/v1/caja/gastos/{gasto_id}/", {"descripcion": "editado"}, format="json"
        )
        self.assertEqual(patch.status_code, 400)
        self.assertEqual(patch.json()["code"], "SESION_CERRADA")

        borrar = self.client.delete(f"/api/v1/caja/gastos/{gasto_id}/")
        self.assertEqual(borrar.status_code, 400)
        self.assertEqual(borrar.json()["code"], "SESION_CERRADA")

    def test_gasto_editable_mientras_la_sesion_este_abierta(self):
        self._abrir()
        gasto_id = self._post_gasto(valor="10000.00").json()["id"]
        patch = self.client.patch(
            f"/api/v1/caja/gastos/{gasto_id}/", {"descripcion": "editado"}, format="json"
        )
        self.assertEqual(patch.status_code, 200)
        self.assertEqual(patch.json()["descripcion"], "editado")


class PermisosSesionTests(_BaseCajaTest):
    def test_recepcion_no_puede_abrir_ni_cerrar(self):
        recepcion = User.objects.create_user(
            email="recepcion-caja@example.com",
            password="secret123",
            first_name="Rosa",
            last_name="Recepcion",
            rol=User.Role.RECEPCION,
            clinica=self.clinica,
        )
        self.client.force_authenticate(recepcion)
        r = self._abrir()
        self.assertEqual(r.status_code, 403)
        self.assertFalse(SesionCaja.objects.filter(caja=self.caja).exists())


class CategoriaGastoTests(_BaseCajaTest):
    def test_nombre_unico_por_clinica_sin_distinguir_mayusculas(self):
        # self.categoria ya existe con nombre "Arriendo".
        r = self.client.post('/api/v1/caja/categorias/', {'nombre': '  arriendo '}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('Ya existe', str(r.json()['nombre']))

    def test_crea_y_normaliza_espacios(self):
        r = self.client.post('/api/v1/caja/categorias/', {'nombre': '  Servicios públicos  '}, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()['nombre'], 'Servicios públicos')

    def test_renombrar_a_uno_existente_falla(self):
        otra = CategoriaGasto.objects.create(clinica=self.clinica, nombre='Papelería')
        r = self.client.patch(f'/api/v1/caja/categorias/{otra.id}/', {'nombre': 'ARRIENDO'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('Ya existe', str(r.json()['nombre']))


class GastoCajaFiltroFechaTests(_BaseCajaTest):
    def _gasto_orm(self, fecha, valor="10000.00"):
        return GastoCaja.objects.create(
            sede=self.sede, categoria=self.categoria, descripcion="x", valor=valor,
            fecha=fecha, registrado_por=self.superadmin,
        )

    def test_filtra_gastos_por_rango_de_fecha(self):
        self._gasto_orm(date(2026, 7, 15))
        dentro = self._gasto_orm(date(2026, 8, 10))
        self._gasto_orm(date(2026, 9, 1))

        r = self.client.get("/api/v1/caja/gastos/", {
            "fecha__gte": "2026-08-01", "fecha__lte": "2026-08-31",
        })
        self.assertEqual(r.status_code, 200)
        ids = {row["id"] for row in r.json()["results"]}
        self.assertEqual(ids, {str(dentro.id)})
