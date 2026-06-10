from datetime import date, timedelta

from rest_framework import serializers

from apps.clinicas.models import Clinica
from apps.pacientes.models import AntecedentePaciente, Paciente


class PacienteSerializer(serializers.ModelSerializer):
    clinica = serializers.PrimaryKeyRelatedField(queryset=Clinica.objects.all(), required=False)
    nombre_completo = serializers.CharField(read_only=True)
    edad = serializers.IntegerField(read_only=True)
    clinica_nombre = serializers.CharField(source="clinica.nombre", read_only=True)
    direccion = serializers.CharField(required=False, allow_blank=True, default="")
    ciudad = serializers.CharField(required=False, allow_blank=True, default="")
    barrio = serializers.CharField(required=False, allow_blank=True, default="")
    estado_civil = serializers.ChoiceField(
        choices=Paciente.EstadoCivil.choices,
        required=False,
        allow_blank=True,
        default="",
    )
    tiene_antecedentes = serializers.SerializerMethodField()
    escolaridad = serializers.ChoiceField(
        choices=Paciente.Escolaridad.choices,
        required=False,
        allow_blank=True,
        default="",
    )
    grupo_etnico = serializers.ChoiceField(
        choices=Paciente.GrupoEtnico.choices,
        required=False,
        allow_blank=True,
        default="",
    )
    grupo_sanguineo = serializers.ChoiceField(
        choices=Paciente.GrupoSanguineo.choices,
        required=False,
        allow_blank=True,
        default="",
    )
    eps = serializers.CharField(required=False, allow_blank=True, default="")
    tipo_afiliado = serializers.ChoiceField(
        choices=Paciente.TipoAfiliado.choices,
        required=False,
        allow_blank=True,
        default="",
    )
    regimen = serializers.ChoiceField(
        choices=Paciente.Regimen.choices,
        required=False,
        allow_blank=True,
        default="",
    )
    nombre_responsable = serializers.CharField(required=False, allow_blank=True, default="")
    parentesco_responsable = serializers.CharField(required=False, allow_blank=True, default="")
    telefono_responsable = serializers.CharField(required=False, allow_blank=True, default="")

    class Meta:
        model = Paciente
        fields = (
            "id",
            "clinica",
            "clinica_nombre",
            "tipo_documento",
            "numero_documento",
            "nombres",
            "apellidos",
            "nombre_completo",
            "fecha_nacimiento",
            "edad",
            "sexo",
            "ocupacion",
            "direccion",
            "ciudad",
            "barrio",
            "estado_civil",
            "escolaridad",
            "grupo_etnico",
            "grupo_sanguineo",
            "eps",
            "tipo_afiliado",
            "regimen",
            "nombre_responsable",
            "parentesco_responsable",
            "telefono_responsable",
            "telefono",
            "email",
            "canal_confirmacion",
            "autoriza_datos",
            "fecha_autorizacion",
            "tiene_antecedentes",
            "activo",
            "created_at",
            "updated_at",
        )
        validators = []
        read_only_fields = (
            "id",
            "clinica_nombre",
            "nombre_completo",
            "edad",
            "fecha_autorizacion",
            "created_at",
            "updated_at",
        )

    def get_tiene_antecedentes(self, obj):
        return hasattr(obj, "antecedentes")

    def validate_numero_documento(self, value):
        tipo_documento = self.initial_data.get("tipo_documento")
        if tipo_documento in {Paciente.TipoDocumento.CC, Paciente.TipoDocumento.TI} and not str(value).isdigit():
            raise serializers.ValidationError("El numero de documento debe contener solo digitos.")
        return value

    def validate_fecha_nacimiento(self, value):
        hoy = date.today()
        hace_120 = hoy - timedelta(days=120 * 365)
        if value > hoy:
            raise serializers.ValidationError("La fecha de nacimiento no puede ser futura.")
        if value < hace_120:
            raise serializers.ValidationError("La fecha de nacimiento no puede superar 120 anos.")
        return value

    def validate(self, attrs):
        autoriza_datos = attrs.get("autoriza_datos")
        if self.instance is None and autoriza_datos is not True:
            raise serializers.ValidationError({"autoriza_datos": "Debes autorizar el tratamiento de datos para registrar el paciente."})

        request = self.context.get("request")
        clinica = attrs.get("clinica")
        if clinica is None:
            if self.instance is not None:
                clinica = self.instance.clinica
            elif request and request.user.is_authenticated:
                clinica = request.user.clinica

        tipo_documento = attrs.get("tipo_documento", getattr(self.instance, "tipo_documento", None))
        numero_documento = attrs.get("numero_documento", getattr(self.instance, "numero_documento", None))

        if clinica and tipo_documento and numero_documento:
            queryset = Paciente.objects.filter(
                clinica=clinica,
                tipo_documento=tipo_documento,
                numero_documento=numero_documento,
            )
            if self.instance is not None:
                queryset = queryset.exclude(pk=self.instance.pk)
            if queryset.exists():
                raise serializers.ValidationError(
                    {"numero_documento": "Ya existe un paciente con ese documento en la clinica."}
                )
        return attrs


class BusquedaPacienteSerializer(serializers.ModelSerializer):
    nombre_completo = serializers.CharField(read_only=True)

    class Meta:
        model = Paciente
        fields = (
            "id",
            "nombre_completo",
            "numero_documento",
            "tipo_documento",
            "telefono",
            "canal_confirmacion",
        )


class AntecedentePacienteSerializer(serializers.ModelSerializer):
    paciente = serializers.UUIDField(source="paciente_id", read_only=True)
    personales = serializers.SerializerMethodField()
    ginecoobstetricos = serializers.SerializerMethodField()
    familiares = serializers.CharField(required=False, allow_blank=True, default="")
    alergias = serializers.CharField(required=False, allow_blank=True, write_only=True)
    medicamentos_actuales = serializers.CharField(required=False, allow_blank=True, write_only=True)
    condiciones_medicas = serializers.CharField(required=False, allow_blank=True, write_only=True)
    contraindicaciones = serializers.CharField(required=False, allow_blank=True, write_only=True)
    tipo_piel = serializers.CharField(required=False, allow_blank=True, allow_null=True, write_only=True)
    antecedentes_esteticos = serializers.CharField(required=False, allow_blank=True, write_only=True)
    toxicologicos_tabaquismo = serializers.BooleanField(required=False, write_only=True)
    toxicologicos_alcohol = serializers.BooleanField(required=False, write_only=True)
    toxicologicos_drogas = serializers.BooleanField(required=False, write_only=True)
    toxicologicos_otros = serializers.CharField(required=False, allow_blank=True, write_only=True)
    patologicos = serializers.CharField(required=False, allow_blank=True, write_only=True)
    quirurgicos = serializers.CharField(required=False, allow_blank=True, write_only=True)
    ant_quirurgicos = serializers.CharField(required=False, allow_blank=True, write_only=True)
    ant_traumaticos = serializers.CharField(required=False, allow_blank=True, write_only=True)
    ant_familiares = serializers.CharField(required=False, allow_blank=True, write_only=True)
    gestaciones = serializers.IntegerField(required=False, allow_null=True, write_only=True)
    partos = serializers.IntegerField(required=False, allow_null=True, write_only=True)
    abortos = serializers.IntegerField(required=False, allow_null=True, write_only=True)
    cesareas = serializers.IntegerField(required=False, allow_null=True, write_only=True)
    fum = serializers.DateField(required=False, allow_null=True, write_only=True)
    planificacion_familiar = serializers.CharField(required=False, allow_blank=True, write_only=True)
    metodo_anticonceptivo = serializers.CharField(required=False, allow_blank=True, write_only=True)

    class Meta:
        model = AntecedentePaciente
        fields = (
            "paciente",
            "personales",
            "ginecoobstetricos",
            "familiares",
            "alergias",
            "medicamentos_actuales",
            "condiciones_medicas",
            "contraindicaciones",
            "tipo_piel",
            "antecedentes_esteticos",
            "toxicologicos_tabaquismo",
            "toxicologicos_alcohol",
            "toxicologicos_drogas",
            "toxicologicos_otros",
            "patologicos",
            "quirurgicos",
            "ant_quirurgicos",
            "ant_traumaticos",
            "ant_familiares",
            "gestaciones",
            "partos",
            "abortos",
            "cesareas",
            "fum",
            "planificacion_familiar",
            "metodo_anticonceptivo",
            "updated_at",
            "created_at",
        )
        read_only_fields = ("paciente", "updated_at", "created_at")

    def get_personales(self, obj):
        return {
            "toxicologicos": {
                "tabaquismo": obj.toxicologicos_tabaquismo,
                "alcohol": obj.toxicologicos_alcohol,
                "drogas": obj.toxicologicos_drogas,
                "otros": obj.toxicologicos_otros,
            },
            "patologicos": obj.patologicos or obj.condiciones_medicas,
            "quirurgicos": obj.quirurgicos,
            "traumaticos": obj.ant_traumaticos,
            "farmacologicos": obj.medicamentos_actuales,
            "alergicos": obj.alergias,
            "contraindicaciones": obj.contraindicaciones,
            "tipo_piel": obj.tipo_piel,
            "antecedentes_esteticos": obj.antecedentes_esteticos,
        }

    def get_ginecoobstetricos(self, obj):
        return {
            "gestaciones": obj.gestaciones,
            "partos": obj.partos,
            "abortos": obj.abortos,
            "cesareas": obj.cesareas,
            "fum": obj.fum.isoformat() if obj.fum else None,
            "planificacion_familiar": obj.planificacion_familiar,
            "metodo_anticonceptivo": obj.metodo_anticonceptivo,
        }

    def to_internal_value(self, data):
        data = dict(data)
        personales = data.get("personales") or {}
        toxicologicos = personales.get("toxicologicos") or {}
        gineco_raw = data.get("ginecoobstetricos") or {}

        normalized = {
            "familiares": data.get("ant_familiares", data.get("familiares", serializers.empty)),
            "toxicologicos_tabaquismo": toxicologicos.get(
                "tabaquismo",
                data.get("toxicologicos_tabaquismo", serializers.empty),
            ),
            "toxicologicos_alcohol": toxicologicos.get(
                "alcohol",
                data.get("toxicologicos_alcohol", serializers.empty),
            ),
            "toxicologicos_drogas": toxicologicos.get(
                "drogas",
                data.get("toxicologicos_drogas", serializers.empty),
            ),
            "toxicologicos_otros": toxicologicos.get(
                "otros",
                data.get("toxicologicos_otros", serializers.empty),
            ),
            "patologicos": personales.get(
                "patologicos",
                data.get("patologicos", data.get("condiciones_medicas", serializers.empty)),
            ),
            "quirurgicos": personales.get(
                "quirurgicos",
                data.get("ant_quirurgicos", data.get("quirurgicos", serializers.empty)),
            ),
            "ant_traumaticos": personales.get(
                "traumaticos",
                data.get("ant_traumaticos", serializers.empty),
            ),
            "medicamentos_actuales": personales.get(
                "farmacologicos",
                data.get("medicamentos_actuales", data.get("farmacologicos", serializers.empty)),
            ),
            "alergias": personales.get("alergicos", data.get("alergias", serializers.empty)),
            "contraindicaciones": personales.get(
                "contraindicaciones",
                data.get("contraindicaciones", serializers.empty),
            ),
            "tipo_piel": personales.get("tipo_piel", data.get("tipo_piel", serializers.empty)),
            "antecedentes_esteticos": personales.get(
                "antecedentes_esteticos",
                data.get("antecedentes_esteticos", serializers.empty),
            ),
            "gestaciones": gineco_raw.get("gestaciones", data.get("gestaciones", serializers.empty)),
            "partos": gineco_raw.get("partos", data.get("partos", serializers.empty)),
            "abortos": gineco_raw.get("abortos", data.get("abortos", serializers.empty)),
            "cesareas": gineco_raw.get("cesareas", data.get("cesareas", serializers.empty)),
            "fum": gineco_raw.get("fum", data.get("fum", serializers.empty)),
            "planificacion_familiar": gineco_raw.get(
                "planificacion_familiar",
                data.get("planificacion_familiar", serializers.empty),
            ),
            "metodo_anticonceptivo": gineco_raw.get(
                "metodo_anticonceptivo",
                data.get("metodo_anticonceptivo", serializers.empty),
            ),
        }

        if not self.partial:
            defaults = {
                "familiares": "",
                "toxicologicos_tabaquismo": False,
                "toxicologicos_alcohol": False,
                "toxicologicos_drogas": False,
                "toxicologicos_otros": "",
                "patologicos": "",
                "quirurgicos": "",
                "ant_traumaticos": "",
                "medicamentos_actuales": "",
                "alergias": "",
                "contraindicaciones": "",
                "tipo_piel": "",
                "antecedentes_esteticos": "",
                "gestaciones": None,
                "partos": None,
                "abortos": None,
                "cesareas": None,
                "fum": None,
                "planificacion_familiar": "",
                "metodo_anticonceptivo": "",
            }
            for key, default in defaults.items():
                if normalized.get(key, serializers.empty) is serializers.empty:
                    normalized[key] = default

        cleaned = {key: value for key, value in normalized.items() if value is not serializers.empty}
        return super().to_internal_value(cleaned)

    def validate(self, attrs):
        patologicos = attrs.get("patologicos")
        if patologicos is not None:
            attrs["condiciones_medicas"] = patologicos
        return attrs
