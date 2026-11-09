"""Salas y equipos: bordes del bloqueo y separación por sede y por clínica."""
from datetime import timedelta

from django.contrib.auth import get_user_model

from apps.agenda import recursos
from apps.agenda.models import BloqueoAgenda, Cita, CitaRecurso
from apps.agenda.tests_salas_y_equipos import SalasYEquiposBase, a_las
from apps.clinicas.models import Clinica, Recurso, Sede, Servicio

User = get_user_model()


class BordesDelBloqueoTests(SalasYEquiposBase):
    def test_citas_seguidas_comparten_el_equipo(self):
        self.assertEqual(self._crear(0, self.depilacion).status_code, 201)
        response = self._crear(1, self.depilacion, inicio=a_las(self.lunes, 10, 30))
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(self._asignados(response.json()["id"]), {("Cabina 1", False), ("Soprano", False)})

    def test_cruce_parcial_bloquea(self):
        self.assertEqual(self._crear(0, self.depilacion).status_code, 201)
        response = self._crear(1, self.depilacion, inicio=a_las(self.lunes, 10, 15))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "RECURSO_OCUPADO")
        # Ni empezando antes y terminando dentro.
        response = self._crear(2, self.depilacion, inicio=a_las(self.lunes, 9, 45))
        self.assertEqual(response.status_code, 400)

    def test_editar_sin_mover_no_choca_consigo_misma(self):
        cita = self._crear(0, self.depilacion).json()
        response = self.client.patch(
            f"/api/v1/agenda/citas/{cita['id']}/",
            {"fecha_inicio": a_las(self.lunes, 10).isoformat()}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self._asignados(cita["id"]), {("Cabina 1", False), ("Soprano", False)})

    def test_mover_al_hueco_que_deja_otra_libera_lo_anterior(self):
        a = self._crear(0, self.depilacion).json()
        response = self.client.patch(
            f"/api/v1/agenda/citas/{a['id']}/", {"fecha_inicio": a_las(self.lunes, 11).isoformat()}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        # Las 10:00 quedaron libres para otra.
        self.assertEqual(self._crear(1, self.depilacion).status_code, 201)

    def test_el_profesional_sigue_bloqueando_como_siempre(self):
        self.assertEqual(self._crear(0, self.valoracion).status_code, 201)
        payload = {
            "paciente": str(self.pacientes[1].id), "sede": str(self.sede.id),
            "profesional": str(self.profs[0].id), "servicio": str(self.valoracion.id),
            "fecha_inicio": a_las(self.lunes, 10).isoformat(), "canal_origen": "presencial",
        }
        response = self.client.post("/api/v1/agenda/citas/", payload, format="json")
        self.assertEqual(response.status_code, 400, response.content)
        self.assertNotIn(response.json().get("code"), {"RECURSO_OCUPADO", "RECURSO_SIN_SALA_COMPATIBLE"})

    def test_recurso_inactivo_no_se_asigna_ni_bloquea(self):
        self.cabina1.activo = False
        self.cabina1.save()
        response = self._crear(0, self.facial)
        self.assertEqual(self._asignados(response.json()["id"]), {("Cabina 2", False)})
        self.assertEqual(self._crear(1, self.facial).status_code, 400)

    def test_bloqueo_de_sede_sigue_cerrando_todo(self):
        BloqueoAgenda.objects.create(
            clinica=self.clinica, sede=self.sede, fecha_inicio=a_las(self.lunes, 8), fecha_fin=a_las(self.lunes, 12),
            estado=BloqueoAgenda.Estado.APROBADO,
        )
        self.assertEqual(self._crear(0, self.valoracion).status_code, 400)

    def test_bloqueo_de_un_equipo_no_bloquea_al_profesional(self):
        BloqueoAgenda.objects.create(
            clinica=self.clinica, sede=self.sede, recurso=self.soprano,
            fecha_inicio=a_las(self.lunes, 8), fecha_fin=a_las(self.lunes, 12), estado=BloqueoAgenda.Estado.APROBADO,
        )
        horarios = self._slots(0, self.valoracion, self.lunes).json()
        self.assertIn(a_las(self.lunes, 10).isoformat(), horarios)
        self.assertNotIn(a_las(self.lunes, 10).isoformat(), self._slots(0, self.depilacion, self.lunes).json())


class SeparacionPorSedeTests(SalasYEquiposBase):
    def setUp(self):
        super().setUp()
        self.norte = self._sede("Norte")
        self.cabina_norte = self._recurso("Cabina Norte", Recurso.Tipo.SALA, sede=self.norte)
        self.soprano_norte = self._recurso("Soprano", Recurso.Tipo.EQUIPO, sede=self.norte)
        self.depilacion.equipos.add(self.soprano_norte)

    def test_cada_sede_usa_su_propio_equipo_a_la_misma_hora(self):
        a = self._crear(0, self.depilacion)
        b = self._crear(1, self.depilacion, sede=self.norte)
        self.assertEqual(a.status_code, 201, a.content)
        self.assertEqual(b.status_code, 201, b.content)
        ids_a = set(CitaRecurso.objects.filter(cita_id=a.json()["id"]).values_list("recurso_id", flat=True))
        ids_b = set(CitaRecurso.objects.filter(cita_id=b.json()["id"]).values_list("recurso_id", flat=True))
        self.assertEqual(ids_a, {self.cabina1.id, self.soprano.id})
        self.assertEqual(ids_b, {self.cabina_norte.id, self.soprano_norte.id})
        # El Norte solo tiene una cabina: la siguiente del Norte falla aunque la principal tenga libres.
        self.assertEqual(self._crear(2, self.facial, sede=self.norte).status_code, 400)
        self.assertEqual(self._crear(3, self.facial).status_code, 201)

    def test_no_se_puede_elegir_a_mano_una_sala_de_otra_sede(self):
        response = self._crear(0, self.valoracion, sala=str(self.cabina_norte.id))
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(response.json()["error"], "La cabina o consultorio elegido no está disponible en esta sede.")
        self.assertFalse(CitaRecurso.objects.exists())
        response = self._crear(0, self.valoracion, equipos=[str(self.soprano_norte.id)])
        self.assertEqual(response.status_code, 400, response.content)
        self.assertFalse(CitaRecurso.objects.exists())

    def test_equipo_de_otra_sede_que_sirve_al_procedimiento_no_se_elige(self):
        response = self._crear(0, self.depilacion, equipos=[str(self.soprano_norte.id)])
        self.assertEqual(response.status_code, 400, response.content)

    def test_procedimiento_cuyo_equipo_esta_solo_en_otra_sede(self):
        rf = self._recurso("Radiofrecuencia", Recurso.Tipo.EQUIPO, sede=self.norte)
        tratamiento = Servicio.objects.create(clinica=self.clinica, nombre="RF facial", duracion_min=30)
        tratamiento.equipos.set([rf])
        # En la principal no hay ese equipo: se agenda sin pedirlo.
        response = self._crear(0, tratamiento)
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["recursos"], [])
        # En el Norte sí lo pide.
        response = self._crear(1, tratamiento, sede=self.norte)
        self.assertEqual(self._asignados(response.json()["id"]), {("Radiofrecuencia", False)})

    def test_cambiar_la_cita_de_sede_cambia_sus_recursos(self):
        cita = self._crear(0, self.depilacion).json()
        response = self.client.patch(
            f"/api/v1/agenda/citas/{cita['id']}/", {"sede": str(self.norte.id)}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        ids = set(CitaRecurso.objects.filter(cita_id=cita["id"]).values_list("recurso_id", flat=True))
        self.assertEqual(ids, {self.cabina_norte.id, self.soprano_norte.id})
        # Los de la principal quedaron libres.
        self.assertEqual(self._crear(1, self.depilacion).status_code, 201)

    def test_bloquear_un_equipo_no_afecta_a_la_otra_sede(self):
        response = self.client.post(
            f"/api/v1/clinicas/recursos/{self.soprano.id}/no_disponible/",
            {"fecha_inicio": a_las(self.lunes, 8).isoformat(), "fecha_fin": a_las(self.lunes, 12).isoformat()},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(self._crear(0, self.depilacion).json()["code"], "RECURSO_BLOQUEADO")
        self.assertEqual(self._crear(1, self.depilacion, sede=self.norte).status_code, 201)

    def test_slots_y_recursos_libres_solo_de_la_sede(self):
        self._crear(0, self.depilacion)  # Soprano de la principal ocupado a las 10
        horarios = self.client.get("/api/v1/agenda/citas/slots_disponibles/", {
            "profesional_id": str(self.profs[1].id), "sede_id": str(self.norte.id),
            "fecha": self.lunes.isoformat(), "servicio_id": str(self.depilacion.id),
        }).json()
        self.assertIn(a_las(self.lunes, 10).isoformat(), horarios)
        datos = self.client.get("/api/v1/agenda/citas/recursos_libres/", {
            "sede_id": str(self.norte.id), "fecha_inicio": a_las(self.lunes, 10).isoformat(),
            "servicio_id": str(self.depilacion.id),
        }).json()
        libres = {r["id"] for n in datos["necesarios"] for r in n["libres"]} | {r["id"] for r in datos["otros"]}
        self.assertEqual(libres, {str(self.cabina_norte.id), str(self.soprano_norte.id)})

    def test_reacomodar_una_sede_no_toca_la_otra(self):
        a = self._crear(0, self.depilacion).json()
        b = self._crear(1, self.depilacion, sede=self.norte).json()
        antes_b = set(CitaRecurso.objects.filter(cita_id=b["id"]).values_list("id", flat=True))
        resultado = recursos.reasignar_citas_futuras([self.sede])
        self.assertEqual(resultado["citas_revisadas"], 1)
        self.assertEqual(set(CitaRecurso.objects.filter(cita_id=b["id"]).values_list("id", flat=True)), antes_b)
        self.assertTrue(CitaRecurso.objects.filter(cita_id=a["id"]).exists())

    def test_eliminar_cabina_del_norte_no_toca_la_principal(self):
        a = self._crear(0, self.facial).json()
        response = self.client.delete(f"/api/v1/clinicas/recursos/{self.cabina_norte.id}/")
        self.assertEqual(response.status_code, 204, response.content)
        self.assertEqual(self._asignados(a["id"]), {("Cabina 1", False)})

    def test_filtro_de_citas_por_recurso(self):
        a = self._crear(0, self.facial).json()
        self._crear(1, self.facial, sede=self.norte)
        datos = self.client.get("/api/v1/agenda/citas/", {"recurso": str(self.cabina1.id)}).json()
        filas = datos["results"] if isinstance(datos, dict) else datos
        self.assertEqual([c["id"] for c in filas], [a["id"]])

    def test_salas_del_procedimiento_por_sede(self):
        self.facial.necesita_sala = Servicio.NecesitaSala.ALGUNAS
        self.facial.save()
        self.facial.salas.set([self.cabina2, self.cabina_norte])
        a = self._crear(0, self.facial)
        b = self._crear(1, self.facial, sede=self.norte)
        self.assertEqual(self._asignados(a.json()["id"]), {("Cabina 2", False)})
        self.assertEqual(
            set(CitaRecurso.objects.filter(cita_id=b.json()["id"]).values_list("recurso_id", flat=True)),
            {self.cabina_norte.id},
        )


class SeparacionPorClinicaTests(SalasYEquiposBase):
    def setUp(self):
        super().setUp()
        self.otra = Clinica.objects.create(nombre="Otra Clinica", nit="900888002")
        self.sede_otra = Sede.objects.create(
            clinica=self.otra, nombre="Centro", ciudad="Cali", direccion="Calle 3", telefono="3000000001",
            horario=self.sede.horario,
        )
        self.cabina_otra = Recurso.objects.create(
            clinica=self.otra, sede=self.sede_otra, nombre="Cabina X", tipo=Recurso.Tipo.SALA,
        )
        self.admin_otra = User.objects.create_user(
            email="admin-otra@example.com", password="secret123", first_name="Otro", last_name="Admin",
            rol=User.Role.ADMIN, clinica=self.otra,
        )

    def _filas(self, response):
        datos = response.json()
        return datos["results"] if isinstance(datos, dict) else datos

    def test_no_lista_ni_ve_recursos_de_otra_clinica(self):
        ids = {r["id"] for r in self._filas(self.client.get("/api/v1/clinicas/recursos/"))}
        self.assertNotIn(str(self.cabina_otra.id), ids)
        self.assertIn(str(self.cabina1.id), ids)
        self.assertEqual(self.client.get(f"/api/v1/clinicas/recursos/{self.cabina_otra.id}/").status_code, 404)

    def test_no_edita_ni_borra_ni_bloquea_recursos_de_otra_clinica(self):
        url = f"/api/v1/clinicas/recursos/{self.cabina_otra.id}/"
        self.assertEqual(self.client.patch(url, {"nombre": "Hackeada"}, format="json").status_code, 404)
        self.assertEqual(self.client.delete(url).status_code, 404)
        response = self.client.post(
            f"{url}no_disponible/",
            {"fecha_inicio": a_las(self.lunes, 8).isoformat(), "fecha_fin": a_las(self.lunes, 12).isoformat()},
            format="json",
        )
        self.assertEqual(response.status_code, 404)
        self.cabina_otra.refresh_from_db()
        self.assertEqual(self.cabina_otra.nombre, "Cabina X")
        self.assertFalse(BloqueoAgenda.objects.filter(recurso=self.cabina_otra).exists())

    def test_no_crea_recursos_en_una_sede_de_otra_clinica(self):
        response = self.client.post(
            "/api/v1/clinicas/recursos/",
            {"sede": str(self.sede_otra.id), "nombre": "Intrusa", "tipo": "sala"},
            format="json",
        )
        self.assertEqual(response.status_code, 400, response.content)
        self.assertFalse(Recurso.objects.filter(nombre="Intrusa").exists())

    def test_no_asigna_a_un_procedimiento_recursos_de_otra_clinica(self):
        response = self.client.patch(
            f"/api/v1/clinicas/procedimientos/{self.facial.id}/",
            {"necesita_sala": "algunas", "salas": [str(self.cabina_otra.id)]},
            format="json",
        )
        self.assertEqual(response.status_code, 400, response.content)
        response = self.client.patch(
            f"/api/v1/clinicas/procedimientos/{self.facial.id}/",
            {"equipos": [str(self.cabina_otra.id)]}, format="json",
        )
        self.assertEqual(response.status_code, 400, response.content)

    def test_no_ata_procedimientos_de_otra_clinica_a_un_equipo(self):
        ajeno = Servicio.objects.create(clinica=self.otra, nombre="Ajeno", duracion_min=30)
        response = self.client.patch(
            f"/api/v1/clinicas/recursos/{self.soprano.id}/",
            {"procedimientos": [str(ajeno.id)]}, format="json",
        )
        self.assertEqual(response.status_code, 400, response.content)
        self.assertFalse(ajeno.equipos.exists())

    def test_no_elige_en_la_cita_una_sala_de_otra_clinica(self):
        response = self._crear(0, self.valoracion, sala=str(self.cabina_otra.id))
        self.assertEqual(response.status_code, 400, response.content)
        self.assertFalse(CitaRecurso.objects.exists())

    def test_la_otra_clinica_no_ve_las_citas_por_recurso_ajeno(self):
        self._crear(0, self.facial)
        self.client.force_authenticate(self.admin_otra)
        filas = self._filas(self.client.get("/api/v1/agenda/citas/", {"recurso": str(self.cabina1.id)}))
        self.assertEqual(filas, [])


class CorreccionesDeLaRevisionTests(SalasYEquiposBase):
    """Casos que encontró la revisión del 2026-11-06."""

    def _cita_directa(self, n, servicio, hora=10):
        return Cita.objects.create(
            paciente=self.pacientes[n], sede=self.sede, profesional=self.profs[n], servicio=servicio,
            fecha_inicio=a_las(self.lunes, hora), fecha_fin=a_las(self.lunes, hora, 30), duracion_min=30,
            canal_confirmacion="whatsapp",
        )

    def test_reacomodar_no_le_quita_la_sala_a_una_cita_que_estaba_bien(self):
        # A (agendada primero) quedó sin nada: el Soprano no estaba.
        BloqueoAgenda.objects.create(
            clinica=self.clinica, sede=self.sede, recurso=self.soprano,
            fecha_inicio=a_las(self.lunes, 8), fecha_fin=a_las(self.lunes, 12), estado=BloqueoAgenda.Estado.APROBADO,
        )
        self.cabina2.activo = False
        self.cabina2.save()
        a = self._cita_directa(0, self.depilacion)
        # B toma la única cabina libre.
        b = self._crear(1, self.facial).json()
        self.assertEqual(self._asignados(b["id"]), {("Cabina 1", False)})
        resumen = recursos.reasignar_citas_futuras([self.sede])
        self.assertEqual(self._asignados(b["id"]), {("Cabina 1", False)})
        # A no se queda con media asignación.
        self.assertFalse(CitaRecurso.objects.filter(cita=a).exists())
        self.assertEqual([c["cita_id"] for c in resumen["sin_lugar"]], [str(a.id)])

    def test_sala_elegida_a_mano_no_se_duplica_al_pasar_a_pedir_sala(self):
        cita = self._crear(0, self.valoracion, sala=str(self.cabina2.id)).json()
        response = self.client.patch(
            f"/api/v1/agenda/citas/{cita['id']}/", {"servicio": str(self.facial.id)}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self._asignados(cita["id"]), {("Cabina 2", False)})
        # Lo mismo si el procedimiento cambia y se reacomoda.
        otra = self._crear(1, self.valoracion, sala=str(self.cabina1.id), inicio=a_las(self.lunes, 11)).json()
        self.valoracion.necesita_sala = Servicio.NecesitaSala.CUALQUIERA
        self.valoracion.save()
        recursos.reasignar_citas_futuras([self.sede])
        self.assertEqual({n for n, _ in self._asignados(otra["id"])}, {"Cabina 1"})

    def test_reservar_un_equipo_extra_deja_el_que_pide_el_procedimiento(self):
        # En el formulario: equipo del procedimiento "el que esté libre" + uno extra a mano.
        alma = self._recurso("Alma", Recurso.Tipo.EQUIPO, orden=2)
        cita = self._crear(0, self.depilacion, equipos=[str(alma.id)]).json()
        self.assertEqual(
            self._asignados(cita["id"]), {("Cabina 1", False), ("Soprano", False), ("Alma", True)},
        )

    def test_horarios_solo_cuando_la_sala_elegida_esta_libre(self):
        self._crear(0, self.facial, sala=str(self.cabina2.id))  # Cabina 2 ocupada a las 10
        sin_eleccion = self._slots(1, self.facial, self.lunes).json()
        self.assertIn(a_las(self.lunes, 10).isoformat(), sin_eleccion)  # queda la Cabina 1
        con_cabina2 = self._slots(1, self.facial, self.lunes, sala=str(self.cabina2.id)).json()
        self.assertNotIn(a_las(self.lunes, 10).isoformat(), con_cabina2)
        self.assertIn(a_las(self.lunes, 10, 30).isoformat(), con_cabina2)
        # Un equipo extra elegido a mano también filtra.
        alma = self._recurso("Alma", Recurso.Tipo.EQUIPO, orden=2)
        self._crear(2, self.valoracion, equipos=[str(alma.id)], inicio=a_las(self.lunes, 15))
        horarios = self._slots(3, self.valoracion, self.lunes, equipos=str(alma.id)).json()
        self.assertNotIn(a_las(self.lunes, 15).isoformat(), horarios)
        self.assertIn(a_las(self.lunes, 15, 30).isoformat(), horarios)

    def test_lo_que_sirve_sin_elegir_hora(self):
        response = self.client.get("/api/v1/agenda/citas/recursos_libres/", {
            "sede_id": str(self.sede.id), "servicio_id": str(self.depilacion.id),
        })
        self.assertEqual(response.status_code, 200, response.content)
        datos = response.json()
        self.assertEqual(
            [(n["tipo"], [r["nombre"] for r in n["recursos"]], n["sugerido"]) for n in datos["necesarios"]],
            [("sala", ["Cabina 1", "Cabina 2"], None), ("equipo", ["Soprano"], None)],
        )
        self.assertEqual(datos["otros"], [])

    def test_guardar_el_horario_de_una_cita_con_falta_le_da_lugar(self):
        cita = self._cita_directa(0, self.facial)
        response = self.client.patch(
            f"/api/v1/agenda/citas/{cita.id}/", {"fecha_inicio": a_las(self.lunes, 10).isoformat()}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self._asignados(cita.id), {("Cabina 1", False)})

    def test_bloqueo_de_un_equipo_se_aprueba_y_se_borra_por_su_id(self):
        bloqueo = BloqueoAgenda.objects.create(
            clinica=self.clinica, sede=self.sede, recurso=self.soprano,
            fecha_inicio=a_las(self.lunes, 8), fecha_fin=a_las(self.lunes, 12), estado=BloqueoAgenda.Estado.PENDIENTE,
        )
        response = self.client.post(f"/api/v1/agenda/bloqueos/{bloqueo.id}/aprobar/")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self._crear(0, self.depilacion).json()["code"], "RECURSO_BLOQUEADO")
        response = self.client.delete(f"/api/v1/agenda/bloqueos/{bloqueo.id}/")
        self.assertEqual(response.status_code, 204, response.content)
        self.assertEqual(self._crear(0, self.depilacion).status_code, 201)

    def test_guardar_un_procedimiento_sin_cambiar_sala_ni_equipo_no_reacomoda(self):
        from unittest import mock

        with mock.patch("apps.agenda.recursos.reasignar_citas_futuras") as reacomodo:
            response = self.client.patch(
                f"/api/v1/clinicas/procedimientos/{self.depilacion.id}/",
                {"precio": "90000", "necesita_sala": "cualquiera", "salas": [], "equipos": [str(self.soprano.id)]},
                format="json",
            )
            self.assertEqual(response.status_code, 200, response.content)
            reacomodo.assert_not_called()
            response = self.client.patch(
                f"/api/v1/clinicas/procedimientos/{self.depilacion.id}/", {"equipos": []}, format="json",
            )
            self.assertEqual(response.status_code, 200, response.content)
            reacomodo.assert_called_once()

    def test_rechazar_un_bloqueo_pendiente_no_reacomoda(self):
        from unittest import mock

        bloqueo = BloqueoAgenda.objects.create(
            clinica=self.clinica, sede=self.sede, recurso=self.soprano,
            fecha_inicio=a_las(self.lunes, 8), fecha_fin=a_las(self.lunes, 12), estado=BloqueoAgenda.Estado.PENDIENTE,
        )
        with mock.patch("apps.agenda.recursos.reasignar_citas_futuras") as reacomodo:
            response = self.client.post(f"/api/v1/agenda/bloqueos/{bloqueo.id}/rechazar/")
            self.assertEqual(response.status_code, 200, response.content)
            reacomodo.assert_not_called()

    def test_solo_estas_salas_con_la_sala_inactiva_es_falta(self):
        self.facial.necesita_sala = Servicio.NecesitaSala.ALGUNAS
        self.facial.save()
        self.facial.salas.set([self.cabina2])
        self.cabina2.activo = False
        self.cabina2.save()
        self.assertEqual(self._crear(0, self.facial).status_code, 400)

    def test_eliminar_la_unica_sala_de_solo_estas_salas_la_pasa_a_cualquiera(self):
        self.facial.necesita_sala = Servicio.NecesitaSala.ALGUNAS
        self.facial.save()
        self.facial.salas.set([self.cabina2])
        response = self.client.delete(f"/api/v1/clinicas/recursos/{self.cabina2.id}/")
        self.assertEqual(response.status_code, 204, response.content)
        self.facial.refresh_from_db()
        self.assertEqual(self.facial.necesita_sala, Servicio.NecesitaSala.CUALQUIERA)

    def test_una_sala_no_cambia_de_sede(self):
        norte = self._sede("Norte")
        response = self.client.patch(
            f"/api/v1/clinicas/recursos/{self.cabina1.id}/", {"sede": str(norte.id)}, format="json",
        )
        self.assertEqual(response.status_code, 400, response.content)
        # Mandar la misma sede (como hace el formulario) sí se puede.
        response = self.client.patch(
            f"/api/v1/clinicas/recursos/{self.cabina1.id}/",
            {"sede": str(self.sede.id), "nombre": "Cabina A"}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)

    def test_reprogramar_con_duracion_fija_filtra_por_lo_que_hace_la_cita(self):
        self._crear(0, self.depilacion)  # Soprano ocupado a las 10
        cita = self._crear(1, self.depilacion, inicio=a_las(self.lunes, 14)).json()
        horarios = self.client.get("/api/v1/agenda/citas/slots_disponibles/", {
            "profesional_id": str(self.profs[1].id), "sede_id": str(self.sede.id), "fecha": self.lunes.isoformat(),
            "duracion_min": "30", "cita_id": cita["id"],
        }).json()
        self.assertNotIn(a_las(self.lunes, 10).isoformat(), horarios)
        self.assertIn(a_las(self.lunes, 14).isoformat(), horarios)

    def test_eliminar_una_sede_con_salas_y_sin_citas_no_da_500(self):
        norte = self._sede("Norte")
        self._recurso("Cabina N", Recurso.Tipo.SALA, sede=norte)
        response = self.client.delete(f"/api/v1/clinicas/sedes/{norte.id}/")
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(response.json()["code"], "SEDE_CON_RECURSOS")


class NombreUnicoEnLaClinicaTests(SalasYEquiposBase):
    """Cabinas y equipos se reconocen por el nombre en toda la clínica."""

    def setUp(self):
        super().setUp()
        self.norte = self._sede("Norte")

    def _crear_recurso(self, nombre, tipo, sede):
        return self.client.post(
            "/api/v1/clinicas/recursos/", {"sede": str(sede.id), "nombre": nombre, "tipo": tipo}, format="json",
        )

    def test_una_cabina_no_repite_nombre_en_otra_sede(self):
        response = self._crear_recurso("cabina 1", "sala", self.norte)
        self.assertEqual(response.status_code, 400, response.content)
        self.assertIn("Cabina 1 Norte", response.json()["nombre"][0])
        self.assertEqual(self._crear_recurso("Cabina 1 Norte", "sala", self.norte).status_code, 201)

    def test_renombrar_una_cabina_con_el_nombre_de_otra(self):
        norte = self._recurso("Consultorio", Recurso.Tipo.SALA, sede=self.norte)
        response = self.client.patch(f"/api/v1/clinicas/recursos/{norte.id}/", {"nombre": "Cabina 2"}, format="json")
        self.assertEqual(response.status_code, 400, response.content)

    def test_cabina_y_equipo_no_comparten_nombre(self):
        self.assertEqual(self._crear_recurso("Soprano", "sala", self.norte).status_code, 400)
        self.assertEqual(self._crear_recurso("Cabina 2", "equipo", self.norte).status_code, 400)

    def test_el_mismo_equipo_en_otra_sede_si_pero_no_dos_veces_en_la_misma(self):
        self.assertEqual(self._crear_recurso("soprano", "equipo", self.norte).status_code, 201)
        response = self._crear_recurso("Soprano", "equipo", self.sede)
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(response.json()["nombre"][0], "Soprano ya está en Principal.")
