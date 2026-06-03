from rest_framework import serializers
from .models import Servicio, Seguimiento, Novedad
from usuarios.models import Usuario, Empresa

class EmpresaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Empresa
        fields = ['nombre']

class UsuarioSerializer(serializers.ModelSerializer):
    empresa = EmpresaSerializer(read_only=True)

    class Meta:
        model = Usuario
        fields = ['id', 'username', 'first_name', 'last_name', 'empresa']

class SeguimientoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Seguimiento
        fields = '__all__'

class NovedadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Novedad
        fields = '__all__'

class ServicioSerializer(serializers.ModelSerializer):
    creado_por = UsuarioSerializer(read_only=True)
    cliente = UsuarioSerializer(read_only=True)
    mensajero = UsuarioSerializer(read_only=True)
    seguimientos = SeguimientoSerializer(many=True, read_only=True)
    novedades = NovedadSerializer(many=True, read_only=True)
    motivo_abandono = serializers.SerializerMethodField()

    class Meta:
        model = Servicio
        fields = '__all__'

    def get_motivo_abandono(self, obj):
        novedad = obj.novedades.filter(descripcion__icontains='Servicio abandonado por').order_by('-fecha', '-id').first()
        return novedad.descripcion if novedad else None

class ServicioResumenSerializer(serializers.ModelSerializer):
    empresa_creado_por_nombre = serializers.ReadOnlyField(source='creado_por.empresa.nombre')
    empresa_cliente_nombre = serializers.ReadOnlyField(source='cliente.empresa.nombre')
    creado_por = UsuarioSerializer(read_only=True)
    cliente = UsuarioSerializer(read_only=True)
    mensajero = UsuarioSerializer(read_only=True)
    seguimientos = SeguimientoSerializer(many=True, read_only=True)
    novedades = NovedadSerializer(many=True, read_only=True)
    motivo_abandono = serializers.SerializerMethodField()

    class Meta:
        model = Servicio
        fields = [
            'id', 'orden', 'descripcion', 'sede', 'area',
            'nombre_solicitante', 'telefono_solicitante',
            'ciudad_origen', 'ciudad_destino',
            'origen', 'destino', 'fecha_entrega_deseada',
            'nombre_quien_recibe', 'telefono_quien_recibe',
            'tipo_servicio', 'tipo_pago', 'descripcion_pago', 'tipo_recorrido',
            'tipo_vehiculo', 'prioridad', 'estado', 'empresa_id', 'creado_por_id',
            'cliente_id', 'mensajero_id', 'fecha_creacion',
            'origen_lat', 'origen_lng', 'destino_lat', 'destino_lng',
            'mensajero_lat', 'mensajero_lng', 'mensajero_ubicacion_actualizada_en',
            'empresa_creado_por_nombre',
            'empresa_cliente_nombre',
            'creado_por',
            'cliente',
            'mensajero',
            'seguimientos',
            'novedades',
            'motivo_abandono',
        ]

    def get_motivo_abandono(self, obj):
        novedad = obj.novedades.filter(descripcion__icontains='Servicio abandonado por').order_by('-fecha', '-id').first()
        return novedad.descripcion if novedad else None