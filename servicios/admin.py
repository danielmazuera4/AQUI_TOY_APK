from django.contrib import admin
from .models import Servicio, Seguimiento, Novedad

class SeguimientoInline(admin.TabularInline):
    model = Seguimiento
    extra = 0

class NovedadInline(admin.TabularInline):
    model = Novedad
    extra = 0

@admin.register(Servicio)
class ServicioAdmin(admin.ModelAdmin):
    list_display = ['orden', 'cliente', 'mensajero', 'estado', 'prioridad', 'fecha_creacion']
    list_filter = ['estado', 'prioridad']
    search_fields = ['orden', 'cliente__username', 'mensajero__username']
    inlines = [SeguimientoInline, NovedadInline]

@admin.register(Seguimiento)
class SeguimientoAdmin(admin.ModelAdmin):
    list_display = ['servicio', 'paso', 'completado', 'fecha']
    list_filter = ['completado']

@admin.register(Novedad)
class NovedadAdmin(admin.ModelAdmin):
    list_display = ['servicio', 'descripcion', 'fecha']