from rest_framework import serializers
from .models import Servicio, Seguimiento, Novedad
from usuarios.serializers import UsuarioSerializer

class NovedadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Novedad
        fields = ['id', 'descripcion', 'fecha']

class SeguimientoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Seguimiento
        fields = ['id', 'paso', 'descripcion', 'foto', 'completado', 'fecha']


class ServicioResumenSerializer(serializers.ModelSerializer):
    seguimientos = SeguimientoSerializer(many=True, read_only=True)
    creado_por_username = serializers.SerializerMethodField()
    cliente_username = serializers.SerializerMethodField()
    cliente_empresa_nombre = serializers.SerializerMethodField()
    mensajero_username = serializers.SerializerMethodField()
    mensajero_id = serializers.SerializerMethodField()

    class Meta:
        model = Servicio
        fields = [
            'id', 'orden', 'descripcion', 'sede', 'area',
            'nombre_solicitante', 'telefono_solicitante',
            'ciudad_origen', 'ciudad_destino',
            'origen', 'destino', 'fecha_entrega_deseada',
            'nombre_quien_recibe', 'telefono_quien_recibe',
            'tipo_servicio', 'tipo_pago', 'descripcion_pago', 'tipo_recorrido',
            'tipo_vehiculo', 'prioridad', 'estado', 'fecha_creacion',
            'origen_lat', 'origen_lng', 'destino_lat', 'destino_lng',
            'mensajero_lat', 'mensajero_lng', 'mensajero_ubicacion_actualizada_en',
            'seguimientos',
            'creado_por_username', 'cliente_username', 'cliente_empresa_nombre',
            'mensajero_username', 'mensajero_id',
        ]

    def get_creado_por_username(self, obj):
        return obj.creado_por.username if obj.creado_por else None

    def get_cliente_username(self, obj):
        return obj.cliente.username if obj.cliente else None

    def get_cliente_empresa_nombre(self, obj):
        if not obj.cliente or not obj.cliente.empresa:
            return None
        return obj.cliente.empresa.nombre

    def get_mensajero_username(self, obj):
        return obj.mensajero.username if obj.mensajero else None

    def get_mensajero_id(self, obj):
        return obj.mensajero_id

class ServicioSerializer(serializers.ModelSerializer):
    seguimientos = SeguimientoSerializer(many=True, read_only=True)
    novedades = NovedadSerializer(many=True, read_only=True)
    creado_por = UsuarioSerializer(read_only=True)
    mensajero = UsuarioSerializer(read_only=True)
    cliente = UsuarioSerializer(read_only=True)

    class Meta:
        model = Servicio
        fields = [
            'id', 'orden', 'descripcion', 'sede', 'area',
            'nombre_solicitante', 'telefono_solicitante',
            'ciudad_origen', 'ciudad_destino',
            'origen', 'destino', 'fecha_entrega_deseada',
            'nombre_quien_recibe', 'telefono_quien_recibe',
            'tipo_servicio', 'tipo_pago', 'descripcion_pago', 'tipo_recorrido',
            'tipo_vehiculo', 'prioridad', 'estado', 'empresa',
            'creado_por', 'cliente', 'mensajero', 'seguimientos', 'novedades',
            'fecha_creacion', 'origen_lat', 'origen_lng', 'destino_lat', 'destino_lng',
            'mensajero_lat', 'mensajero_lng', 'mensajero_ubicacion_actualizada_en'
        ]