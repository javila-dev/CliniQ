"""Pasar las citas futuras a otro profesional al desactivar un colaborador."""
from apps.agenda.models import Cita
from apps.agenda.tests_filtro_profesionales import FiltroProfesionalesBase
from apps.colaboradores.models import Colaborador
from apps.core.models import LogAccion


class ReasignacionBase(FiltroProfesionalesBase):
    def setUp(self):
        super().setUp()
        self.saliente = Colaborador.objects.get(user=self.prof_limpieza)

    def _cita(self, profesional, hora, servicio=None):
        response = self._crear_cita(profesional, hora=hora, servicio=str((servicio or self.limpieza).id))
        self.assertEqual(response.status_code, 201, response.content)
        return Cita.objects.get(pk=response.json()["id"])

    def _reasignar(self, profesional, **extra):
        return self.client.post(
            f"/api/v1/colaboradores/{self.saliente.id}/reasignar_citas/",
            {"profesional": str(profesional.id), **extra},
            format="json",
        )


class CitasQueFrenanTests(ReasignacionBase):
    def test_las_canceladas_no_frenan_la_desactivacion(self):
        cita = self._cita(self.prof_limpieza, 10)
        Cita.objects.filter(pk=cita.pk).update(estado=Cita.Estado.CANCELADA)

        response = self.client.patch(f"/api/v1/colaboradores/{self.saliente.id}/", {"activo": False}, format="json")

        self.assertEqual(response.status_code, 200, response.content)

    def test_con_citas_activas_el_error_trae_codigo_y_texto_en_lista(self):
        self._cita(self.prof_limpieza, 10)

        response = self.client.patch(f"/api/v1/colaboradores/{self.saliente.id}/", {"activo": False}, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "COLABORADOR_CON_CITAS_FUTURAS")
        self.assertIsInstance(response.json()["activo"], list)

    def test_lista_las_citas_futuras(self):
        self._cita(self.prof_limpieza, 10)
        self._cita(self.prof_limpieza, 11)

        response = self.client.get(f"/api/v1/colaboradores/{self.saliente.id}/citas_futuras/")

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["total"], 2)
        self.assertEqual(response.json()["citas"][0]["paciente_nombre"], self.paciente.nombre_completo)


class ReasignarCitasTests(ReasignacionBase):
    def test_la_vista_previa_no_mueve_nada(self):
        a = self._cita(self.prof_limpieza, 10)
        b = self._cita(self.prof_limpieza, 11)

        response = self._reasignar(self.prof_ambos, confirmar=False)

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(len(response.json()["movidas"]), 2)
        self.assertEqual(response.json()["pendientes"], [])
        self.assertFalse(response.json()["confirmado"])
        for cita in (a, b):
            cita.refresh_from_db()
            self.assertEqual(cita.profesional_id, self.prof_limpieza.id)
        self.saliente.refresh_from_db()
        self.assertTrue(self.saliente.activo)

    def test_confirmar_mueve_todas_y_desactiva(self):
        a = self._cita(self.prof_limpieza, 10)
        b = self._cita(self.prof_limpieza, 11)

        response = self._reasignar(self.prof_ambos, confirmar=True, desactivar=True)

        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(response.json()["desactivado"])
        for cita in (a, b):
            cita.refresh_from_db()
            self.assertEqual(cita.profesional_id, self.prof_ambos.id)
        self.saliente.refresh_from_db()
        self.prof_limpieza.refresh_from_db()
        self.assertFalse(self.saliente.activo)
        self.assertFalse(self.prof_limpieza.activo)
        self.assertEqual(LogAccion.objects.filter(accion="cita.cambiar_profesional").count(), 2)

    def test_la_que_se_cruza_queda_pendiente_y_no_desactiva(self):
        cruzada = self._cita(self.prof_limpieza, 10)
        libre = self._cita(self.prof_limpieza, 11)
        # El destino ya está ocupado a esa hora (con el mismo paciente la API
        # pediría confirmar el cruce, por eso va directo a la base).
        Cita.objects.create(
            paciente=self.paciente, sede=self.sede, profesional=self.prof_ambos, servicio=self.limpieza,
            servicio_nombre="Limpieza", fecha_inicio=cruzada.fecha_inicio, fecha_fin=cruzada.fecha_fin,
            duracion_min=30, canal_origen=Cita.CanalOrigen.PRESENCIAL,
        )

        response = self._reasignar(self.prof_ambos, confirmar=True, desactivar=True)

        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()
        self.assertFalse(data["desactivado"])
        self.assertEqual([c["id"] for c in data["movidas"]], [str(libre.id)])
        self.assertEqual([c["id"] for c in data["pendientes"]], [str(cruzada.id)])
        self.assertIn("no está disponible", data["pendientes"][0]["motivo"])
        cruzada.refresh_from_db()
        libre.refresh_from_db()
        self.assertEqual(cruzada.profesional_id, self.prof_limpieza.id)
        self.assertEqual(libre.profesional_id, self.prof_ambos.id)
        self.saliente.refresh_from_db()
        self.assertTrue(self.saliente.activo)

    def test_con_el_filtro_activo_respeta_el_procedimiento(self):
        cita = self._cita(self.prof_limpieza, 10)
        self._activar_filtro()

        response = self._reasignar(self.prof_laser, confirmar=True, desactivar=True)

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["movidas"], [])
        self.assertIn("no realiza", response.json()["pendientes"][0]["motivo"])
        cita.refresh_from_db()
        self.assertEqual(cita.profesional_id, self.prof_limpieza.id)

    def test_no_se_pasa_a_si_mismo_ni_a_un_inactivo(self):
        self._cita(self.prof_limpieza, 10)
        Colaborador.objects.filter(user=self.prof_laser).update(activo=False)

        mismo = self._reasignar(self.prof_limpieza, confirmar=False)
        inactivo = self._reasignar(self.prof_laser, confirmar=False)

        self.assertEqual(mismo.status_code, 400)
        self.assertEqual(inactivo.status_code, 400)

    def test_sin_permisos_de_gestion_es_403(self):
        self._cita(self.prof_limpieza, 10)
        self.client.force_authenticate(self.prof_ambos)

        response = self._reasignar(self.prof_ambos, confirmar=True)

        self.assertEqual(response.status_code, 403)


class QuitarAccesoDejandoCitasTests(ReasignacionBase):
    def _estado(self, cita, estado):
        return self.client.post(f"/api/v1/agenda/citas/{cita.id}/cambiar_estado/", {"estado": estado}, format="json")

    def test_desactiva_y_deja_las_citas_a_su_nombre(self):
        cita = self._cita(self.prof_limpieza, 10)

        response = self.client.patch(
            f"/api/v1/colaboradores/{self.saliente.id}/", {"activo": False, "conservar_citas": True}, format="json",
        )

        self.assertEqual(response.status_code, 200, response.content)
        cita.refresh_from_db()
        self.assertEqual(cita.profesional_id, self.prof_limpieza.id)
        detalle = self.client.get(f"/api/v1/agenda/citas/{cita.id}/").json()
        self.assertFalse(detalle["profesional_activo"])

    def test_recepcion_debe_cambiar_el_profesional_antes_de_recibir(self):
        cita = self._cita(self.prof_limpieza, 10)
        self.assertEqual(self._estado(cita, "confirmada").status_code, 200)
        self.client.patch(
            f"/api/v1/colaboradores/{self.saliente.id}/", {"activo": False, "conservar_citas": True}, format="json",
        )

        bloqueada = self._estado(cita, "en_espera")

        self.assertEqual(bloqueada.status_code, 400, bloqueada.content)
        self.assertEqual(bloqueada.json()["code"], "PROFESIONAL_NO_DISPONIBLE")
        self.assertIn("recibir al paciente", bloqueada.json()["error"])

        cambio = self.client.patch(
            f"/api/v1/agenda/citas/{cita.id}/", {"profesional": str(self.prof_ambos.id)}, format="json",
        )
        self.assertEqual(cambio.status_code, 200, cambio.content)
        self.assertTrue(cambio.json()["profesional_activo"])
        self.assertEqual(self._estado(cita, "en_espera").status_code, 200)

    def test_sin_conservar_citas_sigue_frenando(self):
        self._cita(self.prof_limpieza, 10)

        response = self.client.patch(
            f"/api/v1/colaboradores/{self.saliente.id}/", {"activo": False, "conservar_citas": "false"}, format="json",
        )

        self.assertEqual(response.status_code, 400)
