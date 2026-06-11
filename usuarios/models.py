from django.contrib.auth.models import AbstractUser
from django.db import models

class Empresa(models.Model):
    nombre = models.CharField(max_length=100)
    nit = models.CharField(max_length=20, blank=True)
    telefono = models.CharField(max_length=20, blank=True)
    activa = models.BooleanField(default=True)

    def __str__(self):
        return self.nombre

    class Meta:
        verbose_name = "Empresa"
        verbose_name_plural = "Empresas"

class Usuario(AbstractUser):
    ROL_CHOICES = [
        ('coordinador', 'Coordinador'),
        ('cliente', 'Cliente'),
        ('mensajero', 'Mensajero'),
        ('registro_coordinador', 'Registro Coordinador'),
    ]
    rol = models.CharField(max_length=25, choices=ROL_CHOICES)
    telefono = models.CharField(max_length=20, blank=True)
    foto_perfil = models.ImageField(upload_to='perfiles/', blank=True, null=True)
    empresa = models.ForeignKey(
        Empresa,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='usuarios'
    )

    def __str__(self):
        return f"{self.username} - {self.rol} - {self.empresa}"

    class Meta:
        verbose_name = "Usuario"
        verbose_name_plural = "Usuarios"