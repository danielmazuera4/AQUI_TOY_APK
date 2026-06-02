from rest_framework import status
from rest_framework.authentication import SessionAuthentication, TokenAuthentication
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.core.exceptions import FieldError
from django.db import transaction
from django.db.models import Sum, Count, Max
from django.utils import timezone
from datetime import datetime
from .models import Servicio, Seguimiento, Novedad
from .serializers import ServicioSerializer, ServicioResumenSerializer, SeguimientoSerializer, NovedadSerializer
from usuarios.models import Usuario
import random
import string

def generar_orden():
    """Genera un número de orden único"""
    return ''.join(random.choices(string.digits, k=5))


def _coord(data, clave):
    valor = data.get(clave)
    if valor in (None, ''):
        return None

    try:
        return float(valor)
    except (TypeError, ValueError):
        return None


def _es_coordinador(user):
    return bool(user and user.is_authenticated and user.rol == 'coordinador')


def _ultimo_hito_servicio(servicio):
    ultimo_seguimiento = servicio.seguimientos.order_by('-fecha', '-id').first()
    ultimo_novedad = servicio.novedades.order_by('-fecha', '-id').first()

    candidatos = []
    if ultimo_seguimiento is not None:
        candidatos.append(('seguimiento', ultimo_seguimiento, ultimo_seguimiento.fecha, ultimo_seguimiento.pk))
    if ultimo_novedad is not None:
        candidatos.append(('novedad', ultimo_novedad, ultimo_novedad.fecha, ultimo_novedad.pk))

    if not candidatos:
        return None, None

    tipo, objeto, _, _ = max(candidatos, key=lambda item: (item[2], item[3]))
    return tipo, objeto


class ServicioPagination(PageNumberPagination):
    page_size = 15
    page_size_query_param = 'page_size'
    max_page_size = 50

class ServiciosView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        estado = request.query_params.get('estado', None)

        servicios = Servicio.objects.filter(empresa=request.user.empresa).select_related(
            'empresa',
            'creado_por',
            'cliente',
            'cliente__empresa',
            'mensajero',
        ).prefetch_related('seguimientos').distinct().only(
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
        )

        if request.user.rol == 'cliente':
            servicios = servicios.filter(creado_por=request.user)
        elif request.user.rol == 'mensajero':
            if estado == 'sin_asignar':
                servicios = servicios.filter(estado='sin_asignar')
            elif estado in ('en_progreso', 'terminado'):
                servicios = servicios.filter(estado=estado, mensajero=request.user)
            else:
                servicios_propios = servicios.filter(mensajero=request.user)
                servicios_sin_asignar = servicios.filter(estado='sin_asignar')
                servicios = (servicios_propios | servicios_sin_asignar).distinct()
                estado = None
        elif estado:
            servicios = servicios.filter(estado=estado)

        paginator = ServicioPagination()
        page = paginator.paginate_queryset(servicios.order_by('-fecha_creacion', '-id'), request)
        serializer = ServicioResumenSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        if request.user.rol == 'mensajero':
            return Response(
                {'error': 'No tienes permiso para crear servicios'},
                status=status.HTTP_403_FORBIDDEN
            )

        data = request.data.copy()
        data['empresa'] = request.user.empresa.id
        data['cliente'] = request.user.id
        data['orden'] = generar_orden()

        data['origen_lat'] = _coord(data, 'origen_lat')
        data['origen_lng'] = _coord(data, 'origen_lng')
        data['destino_lat'] = _coord(data, 'destino_lat')
        data['destino_lng'] = _coord(data, 'destino_lng')

        serializer = ServicioSerializer(data=data)
        if serializer.is_valid():
            servicio = serializer.save(creado_por=request.user, cliente=request.user)

            return Response(ServicioSerializer(servicio).data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ServicioDetalleView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            servicio = Servicio.objects.select_related(
                'empresa',
                'creado_por',
                'cliente',
                'mensajero',
            ).prefetch_related('seguimientos', 'novedades').get(pk=pk, empresa=request.user.empresa)
        except Servicio.DoesNotExist:
            return Response({'error': 'Servicio no encontrado'}, status=status.HTTP_404_NOT_FOUND)

        return Response(ServicioSerializer(servicio).data)

    def patch(self, request, pk):
        try:
            servicio = Servicio.objects.get(pk=pk, empresa=request.user.empresa)
        except Servicio.DoesNotExist:
            return Response({'error': 'Servicio no encontrado'}, status=status.HTTP_404_NOT_FOUND)

        serializer = ServicioSerializer(servicio, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ActualizarUbicacionMensajeroView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if request.user.rol != 'mensajero':
            return Response({'error': 'Solo los mensajeros pueden actualizar su ubicación'}, status=status.HTTP_403_FORBIDDEN)

        try:
            servicio = Servicio.objects.get(pk=pk, empresa=request.user.empresa, mensajero=request.user)
        except Servicio.DoesNotExist:
            return Response({'error': 'Servicio no encontrado'}, status=status.HTTP_404_NOT_FOUND)

        latitud = request.data.get('latitud')
        longitud = request.data.get('longitud')

        if latitud is None or longitud is None:
            return Response({'error': 'Latitud y longitud son obligatorias'}, status=status.HTTP_400_BAD_REQUEST)

        servicio.mensajero_lat = latitud
        servicio.mensajero_lng = longitud
        servicio.mensajero_ubicacion_actualizada_en = timezone.now()
        servicio.save(update_fields=['mensajero_lat', 'mensajero_lng', 'mensajero_ubicacion_actualizada_en'])

        return Response(ServicioSerializer(servicio).data)


class AceptarServicioView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if request.user.rol != 'mensajero':
            return Response(
                {'error': 'Solo los mensajeros pueden aceptar servicios'},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            servicio = Servicio.objects.get(pk=pk, empresa=request.user.empresa, estado='sin_asignar')
        except Servicio.DoesNotExist:
            return Response({'error': 'Servicio no disponible'}, status=status.HTTP_404_NOT_FOUND)

        servicio.mensajero = request.user
        servicio.estado = 'en_progreso'
        servicio.save()

        return Response(ServicioSerializer(servicio).data)


class RevertirUltimaEntregaView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [SessionAuthentication, TokenAuthentication]

    def post(self, request, pk):
        if request.user.rol != 'coordinador':
            return Response(
                {'error': 'Solo un coordinador puede revertir un servicio completado'},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            with transaction.atomic():
                servicio = Servicio.objects.select_for_update().select_related(
                    'empresa',
                    'creado_por',
                    'cliente',
                    'mensajero',
                ).prefetch_related('seguimientos', 'novedades').get(
                    pk=pk,
                    empresa=request.user.empresa,
                )

                if servicio.estado != 'terminado':
                    return Response(
                        {'error': 'Solo se pueden revertir servicios completados'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                tipo_hito, hito = _ultimo_hito_servicio(servicio)
                if hito is None:
                    return Response(
                        {'error': 'El servicio no tiene hitos para revertir'},
                        status=status.HTTP_404_NOT_FOUND,
                    )

                if tipo_hito == 'seguimiento' and getattr(hito, 'foto', None):
                    foto_name = hito.foto.name
                    if foto_name:
                        hito.foto.storage.delete(foto_name)
                    hito.delete()
                else:
                    hito.delete()

                servicio.estado = 'sin_asignar'
                servicio.mensajero = None
                servicio.save(update_fields=['estado', 'mensajero'])

        except Servicio.DoesNotExist:
            return Response({'error': 'Servicio no encontrado'}, status=status.HTTP_404_NOT_FOUND)

        return Response(
            {
                'message': 'Servicio revertido correctamente',
                'servicio': ServicioSerializer(servicio).data,
            },
            status=status.HTTP_200_OK,
        )


class MensajerosActivosView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [SessionAuthentication, TokenAuthentication]

    def get(self, request):
        if not _es_coordinador(request.user):
            return Response(
                {'error': 'Solo un coordinador puede ver los mensajeros activos'},
                status=status.HTTP_403_FORBIDDEN,
            )

        mensajeros = (
            Usuario.objects.filter(
                empresa=request.user.empresa,
                rol='mensajero',
                is_active=True,
            )
            .only('id', 'username', 'first_name', 'last_name', 'telefono', 'foto_perfil')
            .order_by('first_name', 'last_name', 'username')
        )

        data = []
        for mensajero in mensajeros:
            nombre_completo = mensajero.get_full_name().strip() or mensajero.username
            data.append({
                'id': mensajero.id,
                'username': mensajero.username,
                'nombre_completo': nombre_completo,
                'telefono': mensajero.telefono,
                'foto_perfil': mensajero.foto_perfil.url if mensajero.foto_perfil else None,
            })

        return Response(data, status=status.HTTP_200_OK)


class AsignarServicioView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [SessionAuthentication, TokenAuthentication]

    def post(self, request, pk):
        if not _es_coordinador(request.user):
            return Response(
                {'error': 'Solo un coordinador puede asignar servicios'},
                status=status.HTTP_403_FORBIDDEN,
            )

        mensajero_id = request.data.get('mensajero_id')
        if not mensajero_id:
            return Response(
                {'error': 'Debes seleccionar un mensajero'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                servicio = Servicio.objects.select_for_update().select_related(
                    'empresa',
                    'creado_por',
                    'cliente',
                    'mensajero',
                ).prefetch_related('seguimientos', 'novedades').get(
                    pk=pk,
                    empresa=request.user.empresa,
                )

                if servicio.estado != 'sin_asignar':
                    return Response(
                        {'error': 'Solo se pueden asignar servicios disponibles'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                try:
                    mensajero = Usuario.objects.get(
                        pk=mensajero_id,
                        empresa=request.user.empresa,
                        rol='mensajero',
                        is_active=True,
                    )
                except Usuario.DoesNotExist:
                    return Response(
                        {'error': 'Mensajero no encontrado o inactivo'},
                        status=status.HTTP_404_NOT_FOUND,
                    )

                servicio.mensajero = mensajero
                servicio.estado = 'en_progreso'
                servicio.save(update_fields=['mensajero', 'estado'])

        except Servicio.DoesNotExist:
            return Response({'error': 'Servicio no encontrado'}, status=status.HTTP_404_NOT_FOUND)

        return Response(
            {
                'message': 'Servicio asignado correctamente',
                'servicio': ServicioSerializer(servicio).data,
            },
            status=status.HTTP_200_OK,
        )


class AbandonarServicioView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if request.user.rol != 'mensajero':
            return Response(
                {'error': 'Solo los mensajeros pueden abandonar servicios'},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            servicio = Servicio.objects.get(pk=pk, empresa=request.user.empresa, mensajero=request.user)
        except Servicio.DoesNotExist:
            return Response({'error': 'Servicio no encontrado'}, status=status.HTTP_404_NOT_FOUND)

        motivo = request.data.get('motivo', '').strip()
        mensajero_nombre = request.user.get_full_name() or request.user.username
        descripcion = f'Servicio abandonado por {mensajero_nombre}'
        if motivo:
            descripcion = f'{descripcion}. Motivo: {motivo}'

        Novedad.objects.create(
            servicio=servicio,
            descripcion=descripcion,
        )

        servicio.mensajero = None
        servicio.estado = 'sin_asignar'
        servicio.save(update_fields=['mensajero', 'estado'])

        return Response(ServicioSerializer(servicio).data, status=status.HTTP_200_OK)


class CompletarPasoView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk, paso):
        try:
            servicio = Servicio.objects.get(pk=pk, empresa=request.user.empresa)
        except Servicio.DoesNotExist:
            return Response({'error': 'Servicio no encontrado'}, status=status.HTTP_404_NOT_FOUND)

        # En lugar de fallar con 404 si el paso no existe, lo creamos dinámicamente.
        # Esto es necesario porque ahora los servicios nacen con cero hitos.
        seguimiento, created = Seguimiento.objects.get_or_create(servicio=servicio, paso=paso)

        if 'foto' in request.data:
            foto_data = request.data.get('foto')
            if foto_data and hasattr(foto_data, 'read'):
                seguimiento.foto = foto_data
        if 'foto' in request.FILES:
            seguimiento.foto = request.FILES['foto']

        if 'descripcion' in request.data:
            seguimiento.descripcion = request.data['descripcion']

        seguimiento.completado = bool(seguimiento.foto and seguimiento.descripcion)
        seguimiento.save()

        # El servicio solo pasa a 'terminado' si se completa el paso final (Paso 3: Entrega)
        # Independientemente de cuántos hitos existan en la base de datos en ese momento.
        if paso == 3 and seguimiento.completado:
            servicio.estado = 'terminado'
            servicio.save()

        return Response(SeguimientoSerializer(seguimiento).data)


class ReportarNovedadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            servicio = Servicio.objects.get(pk=pk, empresa=request.user.empresa)
        except Servicio.DoesNotExist:
            return Response({'error': 'Servicio no encontrado'}, status=status.HTTP_404_NOT_FOUND)

        novedad = Novedad.objects.create(
            servicio=servicio,
            descripcion=request.data.get('descripcion', '')
        )

        return Response(NovedadSerializer(novedad).data, status=status.HTTP_201_CREATED)


class EliminarUltimoHitoView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [SessionAuthentication, TokenAuthentication]

    def post(self, request, pk):
        if not _es_coordinador(request.user):
            return Response(
                {'error': 'Solo un coordinador puede eliminar hitos'},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            with transaction.atomic():
                servicio = Servicio.objects.select_for_update().select_related(
                    'empresa',
                    'creado_por',
                    'cliente',
                    'mensajero',
                ).prefetch_related('seguimientos', 'novedades').get(
                    pk=pk,
                    empresa=request.user.empresa,
                )

                seguimientos = list(servicio.seguimientos.all().order_by('paso'))
                
                if not seguimientos:
                    return Response(
                        {'error': 'El servicio no tiene hitos para eliminar'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                ultimo_paso = max(s.paso for s in seguimientos)
                ultimo_hito = next(s for s in seguimientos if s.paso == ultimo_paso)

                tipo_hito, hito_mas_reciente = _ultimo_hito_servicio(servicio)
                if tipo_hito == 'novedad':
                    return Response(
                        {'error': 'El último elemento es una novedad, no un hito de seguimiento'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if hito_mas_reciente and hito_mas_reciente.id != ultimo_hito.id:
                    return Response(
                        {'error': 'Solo se puede eliminar el último hito cronológicamente'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                if ultimo_hito.foto:
                    foto_name = ultimo_hito.foto.name
                    if foto_name:
                        ultimo_hito.foto.storage.delete(foto_name)
                ultimo_hito.delete()

                if servicio.mensajero:
                    servicio.estado = 'en_progreso'
                else:
                    servicio.estado = 'sin_asignar'
                servicio.save(update_fields=['estado'])

        except Servicio.DoesNotExist:
            return Response({'error': 'Servicio no encontrado'}, status=status.HTTP_404_NOT_FOUND)

        servicio.refresh_from_db()
        return Response(
            {
                'message': 'Hito eliminado correctamente',
                'servicio': ServicioSerializer(servicio).data,
            },
            status=status.HTTP_200_OK,
        )


class ReasignarServicioView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [SessionAuthentication, TokenAuthentication]

    def post(self, request, pk):
        if not _es_coordinador(request.user):
            return Response(
                {'error': 'Solo un coordinador puede reasignar servicios'},
                status=status.HTTP_403_FORBIDDEN,
            )

        mensajero_id = request.data.get('mensajero_id')
        if not mensajero_id:
            return Response(
                {'error': 'Debes seleccionar un mensajero'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                servicio = Servicio.objects.select_for_update().select_related(
                    'empresa',
                    'creado_por',
                    'cliente',
                    'mensajero',
                ).prefetch_related('seguimientos', 'novedades').get(
                    pk=pk,
                    empresa=request.user.empresa,
                )

                if servicio.estado == 'terminado':
                    return Response(
                        {'error': 'No se pueden reasignar servicios terminados'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                try:
                    mensajero = Usuario.objects.get(
                        pk=mensajero_id,
                        empresa=request.user.empresa,
                        rol='mensajero',
                        is_active=True,
                    )
                except Usuario.DoesNotExist:
                    return Response(
                        {'error': 'Mensajero no encontrado o inactivo'},
                        status=status.HTTP_404_NOT_FOUND,
                    )

                if servicio.estado == 'sin_asignar':
                    servicio.mensajero = mensajero
                    servicio.estado = 'en_progreso'
                    mensajero_nombre = mensajero.get_full_name() or mensajero.username
                    Novedad.objects.create(
                        servicio=servicio,
                        descripcion=f'Asignado a: {mensajero_nombre}',
                    )
                else:
                    mensajero_anterior = servicio.mensajero
                    mensajero_anterior_nombre = mensajero_anterior.get_full_name() or mensajero_anterior.username if mensajero_anterior else 'Sin asignar'
                    mensajero_nuevo_nombre = mensajero.get_full_name() or mensajero.username
                    servicio.mensajero = mensajero
                    Novedad.objects.create(
                        servicio=servicio,
                        descripcion=f'Reasignado: De {mensajero_anterior_nombre} a {mensajero_nuevo_nombre}',
                    )

                servicio.save(update_fields=['mensajero', 'estado'])

        except Servicio.DoesNotExist:
            return Response({'error': 'Servicio no encontrado'}, status=status.HTTP_404_NOT_FOUND)

        return Response(
            {
                'message': 'Servicio reasignado correctamente',
                'servicio': ServicioSerializer(servicio).data,
            },
            status=status.HTTP_200_OK,
        )


class MetricasMensajeroView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        fecha_hoy = timezone.localdate()
        fecha_inicio_raw = request.query_params.get('fecha_inicio')
        fecha_fin_raw = request.query_params.get('fecha_fin')

        try:
            fecha_inicio = datetime.strptime(fecha_inicio_raw, '%Y-%m-%d').date() if fecha_inicio_raw else fecha_hoy
            fecha_fin = datetime.strptime(fecha_fin_raw, '%Y-%m-%d').date() if fecha_fin_raw else fecha_hoy
        except ValueError:
            return Response(
                {'error': 'Formato de fecha inválido. Usa AAAA-MM-DD.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if fecha_inicio > fecha_fin:
            fecha_inicio, fecha_fin = fecha_fin, fecha_inicio

        servicios_filtrados = Servicio.objects.filter(
            empresa=request.user.empresa,
            fecha_creacion__date__range=(fecha_inicio, fecha_fin),
            estado__in=['terminado', 'completado'],
        )

        if request.user.rol == 'mensajero':
            servicios_filtrados = servicios_filtrados.filter(mensajero=request.user)

        try:
            metricas = servicios_filtrados.aggregate(
                total_km=Sum('kilometros'),
                total_servicios=Count('id'),
            )
            kilometros = metricas.get('total_km') or 0
        except FieldError:
            metricas = servicios_filtrados.aggregate(
                total_servicios=Count('id'),
            )
            kilometros = 0

        return Response(
            {
                'kilometros': kilometros,
                'servicios': metricas.get('total_servicios') or 0,
                'fecha_inicio': fecha_inicio.isoformat(),
                'fecha_fin': fecha_fin.isoformat(),
            },
            status=status.HTTP_200_OK,
        )