from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import Usuario, Empresa

@admin.register(Empresa)
class EmpresaAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'nit', 'telefono', 'activa']
    search_fields = ['nombre']

@admin.register(Usuario)
class UsuarioAdmin(UserAdmin):
    list_display = ['username', 'email', 'rol', 'empresa', 'telefono', 'is_active']
    list_filter = ['rol', 'is_active', 'empresa']
    search_fields = ['username', 'email', 'telefono']
    fieldsets = UserAdmin.fieldsets + (
        ('Información adicional', {'fields': ('rol', 'empresa', 'telefono', 'foto_perfil')}),
    )