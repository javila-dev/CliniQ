from apps.configuracion.models import ConfiguracionRegistroPublico

TAB_PERSONAL_FIELDS = (
    "direccion",
    "ciudad",
    "barrio",
    "estado_civil",
    "ocupacion",
    "escolaridad",
    "grupo_etnico",
)
TAB_SALUD_FIELDS = (
    "eps",
    "tipo_afiliado",
    "regimen",
    "grupo_sanguineo",
)


def get_registro_publico_config(clinica):
    config, _ = ConfiguracionRegistroPublico.objects.get_or_create(clinica=clinica)
    return config


def registro_publico_config_as_dict(clinica):
    config = get_registro_publico_config(clinica)
    return {
        "tab_personal_requerido": config.tab_personal_requerido,
        "tab_salud_requerido": config.tab_salud_requerido,
    }


def _field_has_value(attrs, field):
    value = attrs.get(field)
    if value is None:
        return False
    return str(value).strip() != ""


def validate_registro_publico_tabs(clinica, attrs):
    config = get_registro_publico_config(clinica)
    if config.tab_personal_requerido and not any(_field_has_value(attrs, field) for field in TAB_PERSONAL_FIELDS):
        return {
            "error": "Debes completar al menos un campo en Datos personales.",
            "code": "TAB_PERSONAL_REQUERIDO",
        }
    if config.tab_salud_requerido and not any(_field_has_value(attrs, field) for field in TAB_SALUD_FIELDS):
        return {
            "error": "Debes completar al menos un campo en Salud y afiliacion.",
            "code": "TAB_SALUD_REQUERIDO",
        }
    return None
