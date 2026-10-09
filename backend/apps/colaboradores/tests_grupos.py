"""Grupos de atención: profesionales asignados en bloque a procedimientos."""
from apps.agenda.tests_filtro_profesionales import FiltroProfesionalesBase
from apps.clinicas.models import Servicio
from apps.colaboradores.models import GrupoAtencion

GRUPOS = "/api/v1/colaboradores/grupos/"


class GruposBase(FiltroProfesionalesBase):
    def setUp(self):
        super().setUp()
        self.peeling = Servicio.objects.create(clinica=self.clinica, nombre="Peeling", duracion_min=30)
        # Sin asignaciones directas: solo realiza lo de sus grupos.
        self.prof_grupo = self._profesional("grupo@example.com", [])
        self.esteticistas = GrupoAtencion.objects.create(clinica=self.clinica, nombre="Esteticistas")
        self.esteticistas.miembros.add(self.prof_grupo.colaborador)

    def _asignar(self, grupo, *procedimientos):
        grupo.procedimientos.add(*procedimientos)


class ReglaDeQuienRealizaTests(GruposBase):
    def test_el_miembro_de_un_grupo_aparece_al_agendar_el_procedimiento_del_grupo(self):
        self._activar_filtro()
        self._asignar(self.esteticistas, self.peeling)

        ids = self._ids_profesionales(servicio_ids=str(self.peeling.id))

        self.assertEqual(ids, {str(self.prof_grupo.id)})

    def test_la_cita_con_el_miembro_del_grupo_pasa_la_validacion(self):
        self._activar_filtro()
        self._asignar(self.esteticistas, self.peeling)

        response = self._crear_cita(self.prof_grupo, servicio=str(self.peeling.id))

        self.assertEqual(response.status_code, 201, response.content)

    def test_sin_el_grupo_asignado_el_miembro_no_realiza_el_procedimiento(self):
        self._activar_filtro()

        response = self._crear_cita(self.prof_grupo, servicio=str(self.peeling.id))

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "PROFESIONAL_NO_REALIZA_PROCEDIMIENTO")

    def test_un_procedimiento_cubierto_por_un_grupo_no_figura_sin_profesional(self):
        url = "/api/v1/clinicas/mi-clinica/procedimientos-sin-profesional/"
        antes = {p["id"] for p in self.client.get(url).json()["procedimientos"]}
        self._asignar(self.esteticistas, self.peeling)
        despues = {p["id"] for p in self.client.get(url).json()["procedimientos"]}

        self.assertIn(str(self.peeling.id), antes)
        self.assertNotIn(str(self.peeling.id), despues)

    def test_la_cobertura_del_listado_cuenta_directos_y_grupos_sin_repetir(self):
        self._asignar(self.esteticistas, self.limpieza)
        # prof_ambos ya hace limpieza directo; en el grupo no debe contarse dos veces.
        self.esteticistas.miembros.add(self.prof_ambos.colaborador)

        datos = {p["id"]: p["cobertura"] for p in self.client.get("/api/v1/clinicas/procedimientos/activos/").json()}

        # limpieza: prof_limpieza + prof_ambos (directos) + prof_grupo (grupo)
        self.assertEqual(datos[str(self.limpieza.id)], 3)
        self.assertEqual(datos[str(self.peeling.id)], 0)

    def test_el_procedimiento_informa_grupos_y_cobertura(self):
        self._asignar(self.esteticistas, self.peeling)

        data = self.client.get(f"/api/v1/clinicas/procedimientos/{self.peeling.id}/").json()

        self.assertEqual([g["id"] for g in data["grupos_detalle"]], [str(self.esteticistas.id)])
        self.assertEqual(data["cobertura"], 1)


class GrupoVacioTests(GruposBase):
    def setUp(self):
        super().setUp()
        self.vacio = GrupoAtencion.objects.create(clinica=self.clinica, nombre="Enfermeria")

    def test_no_se_puede_asignar_un_grupo_vacio_a_un_procedimiento(self):
        response = self.client.patch(
            f"/api/v1/clinicas/procedimientos/{self.peeling.id}/", {"grupos": [str(self.vacio.id)]}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(self.peeling.grupos_atencion.exists())

    def test_asignar_procedimientos_a_un_grupo_vacio_se_rechaza(self):
        response = self.client.post(
            f"{GRUPOS}{self.vacio.id}/asignar_procedimientos/", {"procedimientos": [str(self.peeling.id)]}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "GRUPO_SIN_MIEMBROS")

    def test_no_se_puede_quitar_al_ultimo_miembro_de_un_grupo_asignado(self):
        self._asignar(self.esteticistas, self.peeling)

        response = self.client.patch(f"{GRUPOS}{self.esteticistas.id}/", {"miembros": []}, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "GRUPO_ASIGNADO_SIN_MIEMBROS")
        self.assertEqual(self.esteticistas.miembros.count(), 1)

    def test_desde_el_usuario_no_se_puede_salir_del_grupo_si_queda_vacio(self):
        self._asignar(self.esteticistas, self.peeling)
        colaborador = self.prof_grupo.colaborador

        response = self.client.patch(f"/api/v1/colaboradores/{colaborador.id}/", {"grupos": []}, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "GRUPO_ASIGNADO_SIN_MIEMBROS")

    def test_dejar_de_atender_pacientes_siendo_el_ultimo_miembro_se_bloquea(self):
        self._asignar(self.esteticistas, self.peeling)
        colaborador = self.prof_grupo.colaborador

        response = self.client.patch(
            f"/api/v1/colaboradores/{colaborador.id}/", {"es_profesional": False}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.prof_grupo.refresh_from_db()
        self.assertTrue(self.prof_grupo.es_profesional)

    def test_dejar_de_atender_pacientes_con_otro_miembro_lo_saca_de_sus_grupos(self):
        self._asignar(self.esteticistas, self.peeling)
        self.esteticistas.miembros.add(self.prof_laser.colaborador)
        colaborador = self.prof_grupo.colaborador

        response = self.client.patch(
            f"/api/v1/colaboradores/{colaborador.id}/", {"es_profesional": False}, format="json"
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(colaborador.grupos_atencion.exists())

    def test_desactivar_la_cuenta_del_ultimo_miembro_no_se_bloquea(self):
        self._asignar(self.esteticistas, self.peeling)
        colaborador = self.prof_grupo.colaborador

        response = self.client.patch(f"/api/v1/colaboradores/{colaborador.id}/", {"activo": False}, format="json")

        self.assertEqual(response.status_code, 200, response.content)
        # Sigue en el grupo pero no cuenta: el procedimiento queda sin profesional.
        self.assertTrue(self.esteticistas.miembros.filter(id=colaborador.id).exists())
        data = self.client.get(f"{GRUPOS}{self.esteticistas.id}/").json()
        self.assertEqual(data["miembros_disponibles"], 0)

    def _desactivar_unico_miembro(self):
        self._asignar(self.esteticistas, self.peeling)
        colaborador = self.prof_grupo.colaborador
        self.client.patch(f"/api/v1/colaboradores/{colaborador.id}/", {"activo": False}, format="json")
        return colaborador

    def test_un_grupo_que_ya_quedo_vacio_se_puede_renombrar(self):
        self._desactivar_unico_miembro()

        response = self.client.patch(
            f"{GRUPOS}{self.esteticistas.id}/",
            {"nombre": "Esteticistas sede norte", "miembros": [str(self.prof_grupo.colaborador.id)]},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.content)

    def test_al_miembro_inactivo_se_le_puede_sacar_del_grupo(self):
        colaborador = self._desactivar_unico_miembro()

        response = self.client.patch(f"/api/v1/colaboradores/{colaborador.id}/", {"grupos": []}, format="json")

        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(self.esteticistas.miembros.exists())

    def test_a_un_grupo_que_ya_quedo_vacio_no_se_le_agregan_procedimientos(self):
        self._desactivar_unico_miembro()

        response = self.client.patch(
            f"{GRUPOS}{self.esteticistas.id}/",
            {"procedimientos": [str(self.peeling.id), str(self.laser.id)]},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "GRUPO_SIN_MIEMBROS")

    def test_por_usuarios_tampoco_se_deja_de_atender_siendo_el_ultimo_miembro(self):
        self._asignar(self.esteticistas, self.peeling)

        response = self.client.patch(f"/api/v1/usuarios/{self.prof_grupo.id}/", {"es_profesional": False}, format="json")

        self.assertEqual(response.status_code, 400)
        self.prof_grupo.refresh_from_db()
        self.assertTrue(self.prof_grupo.es_profesional)

    def test_el_usuario_indica_de_que_grupos_depende(self):
        self._asignar(self.esteticistas, self.peeling)

        data = self.client.get(f"/api/v1/colaboradores/{self.prof_grupo.colaborador.id}/").json()

        self.assertTrue(data["grupos_detalle"][0]["depende_de_el"])

    def test_no_se_puede_eliminar_un_grupo_asignado(self):
        self._asignar(self.esteticistas, self.peeling)

        response = self.client.delete(f"{GRUPOS}{self.esteticistas.id}/")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "GRUPO_ASIGNADO")

    def test_un_grupo_sin_asignar_se_puede_eliminar(self):
        response = self.client.delete(f"{GRUPOS}{self.vacio.id}/")

        self.assertEqual(response.status_code, 204)


class GestionDeGruposTests(GruposBase):
    def test_crear_grupo_con_miembros(self):
        response = self.client.post(
            GRUPOS,
            {"nombre": "Medicos esteticos", "miembros": [str(self.prof_laser.colaborador.id)]},
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.content)
        grupo = GrupoAtencion.objects.get(id=response.json()["id"])
        self.assertEqual(grupo.clinica, self.clinica)
        self.assertEqual(response.json()["miembros_disponibles"], 1)

    def test_el_nombre_no_se_repite_en_la_clinica(self):
        response = self.client.post(GRUPOS, {"nombre": "esteticistas"}, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("nombre", response.json())

    def test_quien_no_atiende_pacientes_no_puede_ser_miembro(self):
        self.admin_colaborador = self._profesional("noatiende@example.com", [])
        self.admin_colaborador.es_profesional = False
        self.admin_colaborador.save(update_fields=["es_profesional"])

        response = self.client.post(
            GRUPOS, {"nombre": "Recepcion", "miembros": [str(self.admin_colaborador.colaborador.id)]}, format="json"
        )

        self.assertEqual(response.status_code, 400)

    def test_asignar_procedimientos_agrega_sin_quitar_los_anteriores(self):
        self._asignar(self.esteticistas, self.peeling)

        response = self.client.post(
            f"{GRUPOS}{self.esteticistas.id}/asignar_procedimientos/",
            {"procedimientos": [str(self.laser.id)]},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(set(self.esteticistas.procedimientos.all()), {self.peeling, self.laser})

    def test_el_usuario_muestra_lo_que_realiza_por_sus_grupos(self):
        self._asignar(self.esteticistas, self.peeling)

        data = self.client.get(f"/api/v1/colaboradores/{self.prof_grupo.colaborador.id}/").json()

        self.assertEqual([g["id"] for g in data["grupos_detalle"]], [str(self.esteticistas.id)])
        self.assertEqual([p["id"] for p in data["procedimientos_por_grupos"]], [str(self.peeling.id)])

    def test_solo_lista_los_grupos_de_la_clinica(self):
        from apps.clinicas.models import Clinica

        otra = Clinica.objects.create(nombre="Otra", nit="900777999")
        GrupoAtencion.objects.create(clinica=otra, nombre="Ajeno")

        nombres = {g["nombre"] for g in self.client.get(GRUPOS).json()}

        self.assertEqual(nombres, {"Esteticistas"})
