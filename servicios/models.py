from django.db import models
from django.utils import timezone
from usuarios.models import Usuario, Empresa

class Servicio(models.Model):
    ESTADO_CHOICES = [
        ('sin_asignar', 'Sin asignar'),
        ('en_progreso', 'En progreso'),
        ('terminado', 'Terminado'),
    ]
    PRIORIDAD_CHOICES = [
        ('normal', 'Normal'),
        ('alta', 'Alta'),
    ]

    empresa = models.ForeignKey(
        Empresa,
        on_delete=models.CASCADE,
        related_name='servicios',
        null=True,
        blank=True,
    )
    creado_por = models.ForeignKey(
        Usuario,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='servicios_creados'
    )
    cliente = models.ForeignKey(
        Usuario,
        on_delete=models.CASCADE,
        related_name='servicios_cliente'
    )
    mensajero = models.ForeignKey(
        Usuario,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='servicios_mensajero'
    )
    orden = models.CharField(max_length=20, unique=True, db_index=True)
    descripcion = models.TextField(blank=True)
    sede = models.CharField(max_length=100, blank=True)
    area = models.CharField(max_length=100, blank=True)
    nombre_solicitante = models.CharField(max_length=150, blank=True)
    telefono_solicitante = models.CharField(max_length=30, blank=True)
    ciudad_origen = models.CharField(max_length=100, blank=True)
    ciudad_destino = models.CharField(max_length=100, blank=True)
    origen = models.TextField()
    destino = models.TextField()
    fecha_entrega_deseada = models.DateField(null=True, blank=True)
    nombre_quien_recibe = models.CharField(max_length=150, blank=True)
    telefono_quien_recibe = models.CharField(max_length=30, blank=True)
    tipo_servicio = models.CharField(max_length=100, blank=True)
    tipo_pago = models.CharField(max_length=100, blank=True)
    descripcion_pago = models.TextField(blank=True)
    valor = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tipo_recorrido = models.CharField(max_length=100, blank=True)
    tipo_vehiculo = models.CharField(max_length=50)
    prioridad = models.CharField(max_length=10, choices=PRIORIDAD_CHOICES, default='normal')
    estado = models.CharField(max_length=20, choices=ESTADO_CHOICES, default='sin_asignar', db_index=True)
    fecha_creacion = models.DateTimeField(auto_now_add=True, db_index=True)
    origen_lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    origen_lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    destino_lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    destino_lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    mensajero_lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    mensajero_lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    mensajero_ubicacion_actualizada_en = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Orden #{self.orden} - {self.empresa} - {self.estado}"

    def tiene_mapa(self):
        # El mini mapa se activa si existe al menos una coordenada útil.
        return any([
            self.origen_lat is not None and self.origen_lng is not None,
            self.destino_lat is not None and self.destino_lng is not None,
            self.mensajero_lat is not None and self.mensajero_lng is not None,
        ])

    def tiene_ubicacion_mensajero(self):
        return self.mensajero_lat is not None and self.mensajero_lng is not None

    def _seguimiento_con_foto(self, paso):
        for seguimiento in self.seguimientos.all():
            if seguimiento.paso == paso and seguimiento.foto:
                return seguimiento
        return None

    @property
    def evidencia_recogida(self):
        seguimiento = self._seguimiento_con_foto(2)
        return seguimiento.foto.url if seguimiento else None

    @property
    def evidencia_entrega(self):
        seguimiento = self._seguimiento_con_foto(3)
        return seguimiento.foto.url if seguimiento else None

    @property
    def tiene_evidencia_recogida(self):
        return self.evidencia_recogida is not None

    @property
    def tiene_evidencia_entrega(self):
        return self.evidencia_entrega is not None

    @property
    def estado_evidencias_texto(self):
        if self.estado == 'sin_asignar':
            return 'El servicio está esperando asignación de mensajero'
        if self.estado == 'en_progreso' and not self.tiene_evidencia_recogida:
            return 'El paquete aún no ha sido recogido'
        if self.estado == 'en_progreso' and self.tiene_evidencia_recogida and not self.tiene_evidencia_entrega:
            return 'En ruta: El paquete fue recogido, falta la entrega'
        if self.estado == 'terminado' and not self.tiene_evidencia_entrega:
            return 'Sin evidencias de entrega registradas'
        return ''

    def actualizar_ubicacion_mensajero(self, latitud, longitud):
        self.mensajero_lat = latitud
        self.mensajero_lng = longitud
        self.mensajero_ubicacion_actualizada_en = timezone.now()
        self.save(update_fields=[
            'mensajero_lat',
            'mensajero_lng',
            'mensajero_ubicacion_actualizada_en',
        ])

    class Meta:
        verbose_name = "Servicio"
        verbose_name_plural = "Servicios"

class Seguimiento(models.Model):
    servicio = models.ForeignKey(Servicio, on_delete=models.CASCADE, related_name='seguimientos')
    paso = models.IntegerField()
    descripcion = models.TextField(blank=True)
    foto = models.ImageField(upload_to='seguimientos/', blank=True, null=True)
    completado = models.BooleanField(default=False)
    fecha = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Servicio #{self.servicio.orden} - Paso {self.paso}"

    class Meta:
        verbose_name = "Seguimiento"
        verbose_name_plural = "Seguimientos"

class Novedad(models.Model):
    servicio = models.ForeignKey(Servicio, on_delete=models.CASCADE, related_name='novedades')
    descripcion = models.TextField()
    fecha = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Novedad - Orden #{self.servicio.orden}"

    class Meta:
        verbose_name = "Novedad"
        verbose_name_plural = "Novedades"

class UbicacionMensajero(models.Model):
    """Modelo para rastrear la ubicación exacta del mensajero por servicio"""
    servicio = models.OneToOneField(Servicio, on_delete=models.CASCADE, related_name='ubicacion_tiempo_real')
    latitud = models.DecimalField(max_digits=9, decimal_places=6)
    longitud = models.DecimalField(max_digits=9, decimal_places=6)
    fecha = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Ubicación Orden #{self.servicio.orden} - {self.fecha}"