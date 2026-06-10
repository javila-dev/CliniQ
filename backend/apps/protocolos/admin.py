from django.contrib import admin

from apps.protocolos.models import CheckinOTP, ConsentimientoPaciente, SesionProcedimiento, TratamientoPaciente


@admin.register(TratamientoPaciente)
class TratamientoPacienteAdmin(admin.ModelAdmin):
    list_display = ("paciente", "tratamiento_catalogo", "servicio", "estado", "fecha_inicio", "activo")
    search_fields = ("paciente__nombres", "paciente__apellidos", "servicio__nombre", "tratamiento_catalogo__nombre")
    list_filter = ("estado", "activo", "paciente__clinica")


@admin.register(SesionProcedimiento)
class SesionProcedimientoAdmin(admin.ModelAdmin):
    list_display = ("tratamiento", "tipo_sesion", "numero", "procedimiento", "estado", "fecha", "profesional", "checkin_metodo")
    search_fields = ("tratamiento__paciente__nombres", "tratamiento__paciente__apellidos", "tipo_sesion__nombre", "procedimiento__nombre")
    list_filter = ("estado", "checkin_metodo")


@admin.register(CheckinOTP)
class CheckinOTPAdmin(admin.ModelAdmin):
    list_display = ("sesion", "codigo", "expira_en", "usado", "intentos", "created_at")
    search_fields = ("sesion__tratamiento__paciente__nombres", "sesion__tratamiento__paciente__apellidos", "codigo")
    list_filter = ("usado",)


@admin.register(ConsentimientoPaciente)
class ConsentimientoPacienteAdmin(admin.ModelAdmin):
    list_display = ("paciente", "template_nombre", "procedimiento", "fecha_firma", "vigencia_hasta", "metodo", "activo")
    search_fields = ("paciente__nombres", "paciente__apellidos", "template_nombre", "procedimiento__nombre")
    list_filter = ("metodo", "activo", "paciente__clinica")
