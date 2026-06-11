from django.shortcuts import render, redirect, get_object_or_404
from django.http import JsonResponse, HttpResponse
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import ensure_csrf_cookie
from django.http import HttpResponseForbidden
from django.core.paginator import Paginator
from django.db.models import Prefetch, Q, Sum
from servicios.models import Servicio, Seguimiento, Novedad
from usuarios.models import Usuario
import logging
import random, string
import pandas as pd
from datetime import datetime, timedelta
from django.utils import timezone


logger = logging.getLogger(__name__)


def _landing_for(user):
    if user.rol == 'mensajero':
        return 'dashboard:mensajero_inicio'
    if user.rol == 'cliente':
        return 'dashboard:cliente_inicio'
    if user.rol == 'coordinador':
        return 'dashboard:inicio'
    if user.rol == 'registro_coordinador':
        return 'dashboard:panel_registros'
    return None


def _servicios_empresa(user):
    servicios = (
        Servicio.objects.filter(empresa=user.empresa)
        .only(
            'id',
            'orden',
            'estado',
            'prioridad',
            'fecha_creacion',
            'nombre_solicitante',
            'telefono_solicitante',
            'tipo_vehiculo',
            'origen',
            'destino',
            'origen_lat',
            'origen_lng',
            'destino_lat',
            'destino_lng',
            'mensajero_lat',
            'mensajero_lng',
            'empresa_id',
            'cliente_id',
            'mensajero_id',
            'creado_por_id',
        )
        .prefetch_related(
            Prefetch(
                'seguimientos',
                queryset=Seguimiento.objects.only(
                    'id',
                    'servicio_id',
                    'paso',
                    'descripcion',
                    'foto',
                    'completado',
                    'fecha',
                ).order_by('paso'),
            ),
            Prefetch(
                'novedades',
                queryset=Novedad.objects.only(
                    'id',
                    'servicio_id',
                    'descripcion',
                    'fecha',
                ).order_by('-fecha'),
            ),
        )
        .order_by('-fecha_creacion')
    )

    return servicios


def _servicios_cliente(user):
    servicios = (
        Servicio.objects.filter(empresa=user.empresa, cliente=user)
        .only(
            'id',
            'orden',
            'estado',
            'prioridad',
            'fecha_creacion',
            'nombre_solicitante',
            'telefono_solicitante',
            'tipo_vehiculo',
            'origen',
            'destino',
            'origen_lat',
            'origen_lng',
            'destino_lat',
            'destino_lng',
            'mensajero_lat',
            'mensajero_lng',
            'empresa_id',
            'cliente_id',
            'mensajero_id',
            'creado_por_id',
        )
        .prefetch_related(
            Prefetch(
                'seguimientos',
                queryset=Seguimiento.objects.only(
                    'id',
                    'servicio_id',
                    'paso',
                    'descripcion',
                    'foto',
                    'completado',
                    'fecha',
                ).order_by('paso'),
            ),
            Prefetch(
                'novedades',
                queryset=Novedad.objects.only(
                    'id',
                    'servicio_id',
                    'descripcion',
                    'fecha',
                ).order_by('-fecha'),
            ),
        )
        .order_by('-fecha_creacion')
    )

    return servicios


def _asegurar_coordenadas_en_servicios(servicios):
    return None


def _puede_gestionar_servicios(user):
    return user.rol in {'cliente', 'coordinador'}


def _contexto_dashboard(user, servicios):
    disponibles = servicios.filter(estado__in=['sin_asignar', 'disponible'])
    return {
        'servicios': servicios,
        'sin_asignar': disponibles.count(),
        'disponibles': disponibles.count(),
        'en_progreso': servicios.filter(estado='en_progreso').count(),
        'terminados': servicios.filter(estado='terminado').count(),
        'puede_gestionar_servicios': _puede_gestionar_servicios(user),
    }


def _servicios_paginados(request, servicios_qs, per_page=15):
    paginator = Paginator(servicios_qs, per_page)
    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)
    return page_obj, paginator


def _servicio_para_gestion(user, pk):
    filtros = {'pk': pk}
    if user.rol == 'cliente':
        filtros['empresa'] = user.empresa
        filtros['cliente'] = user
    elif user.rol == 'coordinador':
        filtros['empresa'] = user.empresa
    else:
        return None

    # Usamos get_object_or_404 con select_related para evitar N+1
    qs = Servicio.objects.select_related('cliente', 'mensajero', 'creado_por').prefetch_related(
        Prefetch(
            'seguimientos',
            queryset=Seguimiento.objects.only(
                'id',
                'servicio_id',
                'paso',
                'descripcion',
                'foto',
                'completado',
                'fecha',
            ).order_by('paso'),
        ),
        Prefetch(
            'novedades',
            queryset=Novedad.objects.only(
                'id',
                'servicio_id',
                'descripcion',
                'fecha',
            ).order_by('-fecha'),
        ),
    )
    return get_object_or_404(qs, **filtros)


def _datos_servicio_desde_request(request):
    return {
        'descripcion': (request.POST.get('descripcion') or '').strip(),
        'sede': (request.POST.get('sede') or '').strip(),
        'area': (request.POST.get('area') or '').strip(),
        'nombre_solicitante': (request.POST.get('nombre_solicitante') or '').strip(),
        'telefono_solicitante': (request.POST.get('telefono_solicitante') or '').strip(),
        'ciudad_origen': (request.POST.get('ciudad_origen') or '').strip(),
        'ciudad_destino': (request.POST.get('ciudad_destino') or '').strip(),
        'fecha_entrega_deseada': request.POST.get('fecha_entrega_deseada') or None,
        'nombre_quien_recibe': (request.POST.get('nombre_quien_recibe') or '').strip(),
        'telefono_quien_recibe': (request.POST.get('telefono_quien_recibe') or '').strip(),
        'tipo_servicio': (request.POST.get('tipo_servicio') or '').strip(),
        'tipo_pago': (request.POST.get('tipo_pago') or '').strip(),
        'descripcion_pago': (request.POST.get('descripcion_pago') or '').strip(),
        'tipo_recorrido': (request.POST.get('tipo_recorrido') or '').strip(),
        'tipo_vehiculo': (request.POST.get('tipo_vehiculo') or 'moto').strip(),
        'prioridad': request.POST.get('prioridad', 'normal'),
        # Agregar coordenadas al diccionario base
        'origen_lat': _coordenada_request(request, 'origen_lat'),
        'origen_lng': _coordenada_request(request, 'origen_lng'),
        'destino_lat': _coordenada_request(request, 'destino_lat'),
        'destino_lng': _coordenada_request(request, 'destino_lng'),
    }


def _coordenada_request(request, clave):
    valor = request.POST.get(clave)
    if valor in (None, ''):
        return None

    try:
        return float(valor)
    except (TypeError, ValueError):
        return None


def _valores_formulario_servicio(request, servicio=None):
    datos = request.POST if request.method == 'POST' else None
    return {
        'descripcion_value': (datos.get('descripcion') if datos else getattr(servicio, 'descripcion', '')) or '',
        'tipo_servicio_value': (datos.get('tipo_servicio') if datos else getattr(servicio, 'tipo_servicio', '')) or '',
        'tipo_pago_value': (datos.get('tipo_pago') if datos else getattr(servicio, 'tipo_pago', '')) or '',
        'tipo_recorrido_value': (datos.get('tipo_recorrido') if datos else getattr(servicio, 'tipo_recorrido', '')) or '',
        'descripcion_pago_value': (datos.get('descripcion_pago') if datos else getattr(servicio, 'descripcion_pago', '')) or '',
        'nombre_solicitante_value': (datos.get('nombre_solicitante') if datos else getattr(servicio, 'nombre_solicitante', '')) or '',
        'telefono_solicitante_value': (datos.get('telefono_solicitante') if datos else getattr(servicio, 'telefono_solicitante', '')) or '',
        'nombre_quien_recibe_value': (datos.get('nombre_quien_recibe') if datos else getattr(servicio, 'nombre_quien_recibe', '')) or '',
        'telefono_quien_recibe_value': (datos.get('telefono_quien_recibe') if datos else getattr(servicio, 'telefono_quien_recibe', '')) or '',
        'ciudad_origen_value': (datos.get('ciudad_origen') if datos else getattr(servicio, 'ciudad_origen', '')) or '',
        'ciudad_destino_value': (datos.get('ciudad_destino') if datos else getattr(servicio, 'ciudad_destino', '')) or '',
        'fecha_entrega_deseada_value': (datos.get('fecha_entrega_deseada') if datos else (servicio.fecha_entrega_deseada.strftime('%Y-%m-%d') if getattr(servicio, 'fecha_entrega_deseada', None) else '')) or '',
        'sede_value': (datos.get('sede') if datos else getattr(servicio, 'sede', '')) or '',
        'area_value': (datos.get('area') if datos else getattr(servicio, 'area', '')) or '',
        'origen_value': (datos.get('origen') if datos else getattr(servicio, 'origen', '')) or '',
        'destino_value': (datos.get('destino') if datos else getattr(servicio, 'destino', '')) or '',
        'prioridad_seleccionada': (datos.get('prioridad') if datos else getattr(servicio, 'prioridad', 'normal')) or 'normal',
        'tipo_vehiculo_seleccionado': (datos.get('tipo_vehiculo') if datos else getattr(servicio, 'tipo_vehiculo', 'moto')) or 'moto',
    }


def _redirigir_dashboard(user):
    landing = _landing_for(user)
    return redirect(landing) if landing else HttpResponseForbidden('Acceso no permitido')

@never_cache
@ensure_csrf_cookie
def login_view(request):
    if request.user.is_authenticated:
        landing = _landing_for(request.user)
        return redirect(landing) if landing else redirect('dashboard:logout')

    error = None
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        usuario = authenticate(request, username=username, password=password)

        if usuario:
            landing = _landing_for(usuario)
            if landing is None:
                error = 'Este acceso no está habilitado para tu perfil'
                return render(request, 'dashboard/login.html', {'error': error})

            login(request, usuario)
            return redirect(landing)
        else:
            error = 'Usuario o contraseña incorrectos'

    return render(request, 'dashboard/login.html', {'error': error})

def logout_view(request):
    logout(request)
    return redirect('dashboard:login')

@login_required
def inicio(request):
    if request.user.rol != 'coordinador':
        return _redirigir_dashboard(request.user)

    servicios = _servicios_empresa(request.user)
    context = _contexto_dashboard(request.user, servicios)
    context.update({
        'servicios': servicios,
        'servicios_disponibles': servicios.filter(estado__in=['sin_asignar', 'disponible']),
        'servicios_en_progreso': servicios.filter(estado='en_progreso'),
        'servicios_terminados': servicios.filter(estado='terminado'),
        'total_servicios': servicios.count(),
    })
    return render(request, 'dashboard/inicio.html', context)


@login_required
def cliente_inicio(request):
    if request.user.rol != 'cliente':
        return _redirigir_dashboard(request.user)

    servicios = _servicios_cliente(request.user)
    return render(request, 'dashboard/cliente_inicio.html', _contexto_dashboard(request.user, servicios))

@login_required
def crear_servicio(request):
    if not _puede_gestionar_servicios(request.user):
        return _redirigir_dashboard(request.user)

    error = None
    if request.method == 'POST':
        try:
            # 1. Obtener el diccionario base (ya incluye coordenadas extraídas con _coordenada_request)
            datos = _datos_servicio_desde_request(request)
            
            # 2. Extraer origen y destino de texto para validación
            origen_texto = (request.POST.get('origen') or '').strip()
            destino_texto = (request.POST.get('destino') or '').strip()

            if not origen_texto or not destino_texto:
                error = 'Debes completar origen y destino para crear el servicio.'
            elif not request.user.empresa:
                error = 'No se pudo crear el servicio porque el usuario no tiene empresa asociada.'
            else:
                # 3. Consolidar metadatos adicionales en el diccionario antes de crear
                # Esto evita duplicados y mantiene el código limpio
                datos.update({
                    'empresa': request.user.empresa,
                    'cliente': request.user,
                    'creado_por': request.user,
                    'orden': ''.join(random.choices(string.digits, k=5)),
                    'origen': origen_texto,
                    'destino': destino_texto,
                    'estado': 'sin_asignar',
                })

                # 4. Crear el servicio con un solo desempaquetado
                Servicio.objects.create(**datos)
                return redirect(_landing_for(request.user))

        except Exception as exc:
            logger.exception('crear_servicio error inesperado user=%s', request.user.pk)
            error = f'No se pudo crear el servicio: {exc}'

    return render(request, 'dashboard/servicio_form.html', {
        'error': error,
        'titulo': 'Nuevo Servicio',
        'subtitulo': 'Crea un nuevo envío para tu empresa o cuenta.',
        'boton_texto': 'Crear Servicio',
        'servicio': None,
        'edicion_bloqueada': False,
        'volver_url': _landing_for(request.user),
        **_valores_formulario_servicio(request),
    })


@login_required
def get_servicio_data(request, pk):
    """Endpoint liviano que devuelve un JSON con datos clave del servicio.

    Usa get_object_or_404 y serializa fechas a strings ISO.
    """
    try:
        qs = Servicio.objects.select_related('cliente', 'mensajero').prefetch_related(
            Prefetch(
                'seguimientos',
                queryset=Seguimiento.objects.only(
                    'id',
                    'servicio_id',
                    'paso',
                    'descripcion',
                    'foto',
                    'completado',
                    'fecha',
                ).order_by('paso'),
            ),
            Prefetch(
                'novedades',
                queryset=Novedad.objects.only(
                    'id',
                    'servicio_id',
                    'descripcion',
                    'fecha',
                ).order_by('-fecha'),
            ),
        )
        servicio = get_object_or_404(qs, pk=pk, empresa=request.user.empresa)

        seguimientos = []
        for s in servicio.seguimientos.all():
            seguimientos.append({
                'paso': s.paso,
                'descripcion': s.descripcion,
                'foto': s.foto.url if getattr(s, 'foto', None) else None,
                'completado': bool(s.completado),
                'fecha': s.fecha.isoformat() if getattr(s, 'fecha', None) else None,
            })

        novedades = []
        for n in servicio.novedades.all():
            novedades.append({
                'id': n.id,
                'descripcion': n.descripcion,
                'fecha': n.fecha.isoformat() if getattr(n, 'fecha', None) else None,
            })

        mensajero = None
        if servicio.mensajero:
            foto = None
            try:
                if servicio.mensajero.foto_perfil:
                    foto = servicio.mensajero.foto_perfil.url
            except Exception:
                foto = None

            mensajero = {
                'id': servicio.mensajero.id,
                'username': servicio.mensajero.username,
                'nombre_completo': servicio.mensajero.get_full_name() or servicio.mensajero.username,
                'telefono': getattr(servicio.mensajero, 'telefono', '') or None,
                'placa': getattr(servicio.mensajero, 'placa', None),
                'foto_perfil': foto,
            }

        def _num(v):
            try:
                return float(v) if v is not None else None
            except Exception:
                return None

        data = {
            'id': servicio.id,
            'orden': servicio.orden,
            'estado': servicio.estado,
            'estado_display': servicio.get_estado_display() if hasattr(servicio, 'get_estado_display') else servicio.estado,
            'estado_evidencias_texto': servicio.estado_evidencias_texto,
            'tiene_evidencia_recogida': servicio.tiene_evidencia_recogida,
            'tiene_evidencia_entrega': servicio.tiene_evidencia_entrega,
            'evidencia_recogida': servicio.evidencia_recogida,
            'evidencia_entrega': servicio.evidencia_entrega,
            'origen': servicio.origen,
            'destino': servicio.destino,
            'origen_lat': _num(servicio.origen_lat),
            'origen_lng': _num(servicio.origen_lng),
            'destino_lat': _num(servicio.destino_lat),
            'destino_lng': _num(servicio.destino_lng),
            'mensajero': mensajero,
            'mensajero_id': servicio.mensajero_id,
            'seguimientos': seguimientos,
            'novedades': novedades,
            'tipo_vehiculo': servicio.tipo_vehiculo,
            'nombre_solicitante': servicio.nombre_solicitante,
            'telefono_solicitante': servicio.telefono_solicitante,
            'fecha_creacion': servicio.fecha_creacion.isoformat() if getattr(servicio, 'fecha_creacion', None) else None,
            'fecha_entrega_deseada': servicio.fecha_entrega_deseada.isoformat() if getattr(servicio, 'fecha_entrega_deseada', None) else None,
            'mensajero_lat': _num(servicio.mensajero_lat),
            'mensajero_lng': _num(servicio.mensajero_lng),
            'mensajero_ubicacion_actualizada_en': servicio.mensajero_ubicacion_actualizada_en.isoformat() if getattr(servicio, 'mensajero_ubicacion_actualizada_en', None) else None,
        }

        return JsonResponse(data, safe=True, status=200)
    except Exception as exc:
        return JsonResponse({'error': f'No se pudo cargar el servicio: {exc}'}, status=500)


@login_required
def editar_servicio(request, pk):
    if not _puede_gestionar_servicios(request.user):
        return _redirigir_dashboard(request.user)

    servicio = _servicio_para_gestion(request.user, pk)

    error = None
    if request.method == 'POST':
        try:
            logger.info(
                'editar_servicio POST pk=%s user=%s post_keys=%s file_keys=%s',
                pk,
                request.user.pk,
                list(request.POST.keys()),
                list(request.FILES.keys()),
            )
            if servicio.estado == 'terminado':
                return HttpResponseForbidden('No se puede editar un servicio finalizado')
            datos = _datos_servicio_desde_request(request)
            origen = (request.POST.get('origen') or '').strip()
            destino = (request.POST.get('destino') or '').strip()

            if not origen or not destino:
                error = 'Debes completar origen y destino para actualizar el servicio.'
            else:
                servicio.descripcion = datos['descripcion']
                servicio.sede = datos['sede']
                servicio.area = datos['area']
                servicio.nombre_solicitante = datos['nombre_solicitante']
                servicio.telefono_solicitante = datos['telefono_solicitante']
                servicio.ciudad_origen = datos['ciudad_origen']
                servicio.ciudad_destino = datos['ciudad_destino']
                servicio.fecha_entrega_deseada = datos['fecha_entrega_deseada']
                servicio.nombre_quien_recibe = datos['nombre_quien_recibe']
                servicio.telefono_quien_recibe = datos['telefono_quien_recibe']
                servicio.tipo_servicio = datos['tipo_servicio']
                servicio.tipo_pago = datos['tipo_pago']
                servicio.descripcion_pago = datos['descripcion_pago']
                servicio.tipo_recorrido = datos['tipo_recorrido']
                servicio.origen = origen
                servicio.destino = destino
                servicio.tipo_vehiculo = datos['tipo_vehiculo'] or servicio.tipo_vehiculo
                servicio.prioridad = datos['prioridad'] or servicio.prioridad
                origen_lat = _coordenada_request(request, 'origen_lat')
                origen_lng = _coordenada_request(request, 'origen_lng')
                destino_lat = _coordenada_request(request, 'destino_lat')
                destino_lng = _coordenada_request(request, 'destino_lng')
                if origen_lat is not None:
                    servicio.origen_lat = origen_lat
                if origen_lng is not None:
                    servicio.origen_lng = origen_lng
                if destino_lat is not None:
                    servicio.destino_lat = destino_lat
                if destino_lng is not None:
                    servicio.destino_lng = destino_lng
                servicio.save()

                return redirect(_landing_for(request.user))
        except Exception as exc:
            logger.exception(
                'editar_servicio fallo pk=%s user=%s post=%s files=%s',
                pk,
                request.user.pk,
                request.POST.dict(),
                {k: getattr(v, 'name', str(v)) for k, v in request.FILES.items()},
            )
            error = f'No se pudo editar el servicio: {exc}'

    return render(request, 'dashboard/servicio_form.html', {
        'error': error,
        'titulo': f'Editar servicio #{servicio.orden}',
        'subtitulo': 'Actualiza la información visible en el panel.',
        'boton_texto': 'Guardar Cambios',
        'servicio': servicio,
        'edicion_bloqueada': servicio.estado == 'terminado',
        'volver_url': _landing_for(request.user),
        **_valores_formulario_servicio(request, servicio),
    })


@login_required
def eliminar_servicio(request, pk):
    if not _puede_gestionar_servicios(request.user):
        return _redirigir_dashboard(request.user)

    if request.method != 'POST':
        return _redirigir_dashboard(request.user)

    servicio = _servicio_para_gestion(request.user, pk)
    servicio.delete()
    return redirect(_landing_for(request.user))


@login_required
def mensajero_inicio(request):
    if request.user.rol != 'mensajero':
        return _redirigir_dashboard(request.user)

    servicios = _servicios_empresa(request.user)
    asignados = servicios.filter(mensajero=request.user)
    disponibles = servicios.filter(estado='sin_asignar')
    terminados = servicios.filter(mensajero=request.user, estado='terminado')

    context = {
        'asignados': asignados,
        'disponibles': disponibles,
        'terminados': terminados,
        'en_progreso': asignados.filter(estado='en_progreso').count(),
        'sin_asignar': disponibles.count(),
        'terminados_count': terminados.count(),
    }
    return render(request, 'dashboard/mensajero_inicio.html', context)


@login_required
def panel_registros_view(request):
    if request.user.rol != 'registro_coordinador':
        return HttpResponseForbidden('No autorizado: Solo registro coordinadores pueden acceder a este panel')

    if request.method == 'POST':
        tipo_reporte = request.POST.get('tipo_reporte')
        registro_id = request.POST.get('registro_id')
        rango_tiempo = request.POST.get('rango_tiempo')
        fecha_inicio = request.POST.get('fecha_inicio')
        fecha_fin = request.POST.get('fecha_fin')

        hoy = timezone.now().date()
        
        if rango_tiempo == 'dia':
            fecha_inicio = hoy
            fecha_fin = hoy
        elif rango_tiempo == 'quincena':
            if hoy.day <= 15:
                fecha_inicio = hoy.replace(day=1)
                fecha_fin = hoy.replace(day=15)
            else:
                fecha_inicio = hoy.replace(day=16)
                fecha_fin = (hoy.replace(day=1) + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        elif rango_tiempo == 'mes':
            fecha_inicio = hoy.replace(day=1)
            fecha_fin = (hoy.replace(day=1) + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        elif rango_tiempo == 'personalizado':
            if fecha_inicio:
                fecha_inicio = datetime.strptime(fecha_inicio, '%Y-%m-%d').date()
            if fecha_fin:
                fecha_fin = datetime.strptime(fecha_fin, '%Y-%m-%d').date()

        queryset = Servicio.objects.filter(
            fecha_creacion__date__gte=fecha_inicio,
            fecha_creacion__date__lte=fecha_fin
        ).select_related('cliente', 'mensajero', 'creado_por').prefetch_related('novedades')

        if tipo_reporte == 'usuario' and registro_id:
            queryset = queryset.filter(creado_por_id=registro_id)
        elif tipo_reporte == 'cliente' and registro_id:
            queryset = queryset.filter(cliente_id=registro_id)
        elif tipo_reporte == 'mensajero' and registro_id:
            queryset = queryset.filter(mensajero_id=registro_id)

        servicios_data = []
        for servicio in queryset:
            novedades_texto = '; '.join([n.descripcion for n in servicio.novedades.all()])
            
            servicios_data.append({
                'ID Servicio': servicio.id,
                'Orden': servicio.orden,
                'Origen': servicio.origen,
                'Destino': servicio.destino,
                'Cliente': f"{servicio.cliente.username} - {servicio.cliente.get_full_name() or ''}",
                'Mensajero': f"{servicio.mensajero.username} - {servicio.mensajero.get_full_name() or ''}" if servicio.mensajero else 'Sin asignar',
                'Valor': float(servicio.valor),
                'Fecha': servicio.fecha_creacion.strftime('%Y-%m-%d %H:%M:%S'),
                'Estado': servicio.get_estado_display(),
                'Novedades/Comentarios': novedades_texto or 'Sin novedades'
            })

        df = pd.DataFrame(servicios_data)

        if df.empty:
            df = pd.DataFrame(columns=['ID Servicio', 'Orden', 'Origen', 'Destino', 'Cliente', 'Mensajero', 'Valor', 'Fecha', 'Estado', 'Novedades/Comentarios'])

        total_servicios = len(df)
        suma_total = df['Valor'].sum() if not df.empty else 0

        fila_totales = pd.DataFrame([{
            'ID Servicio': 'TOTALES',
            'Orden': f'Total servicios: {total_servicios}',
            'Origen': '',
            'Destino': '',
            'Cliente': '',
            'Mensajero': '',
            'Valor': suma_total,
            'Fecha': '',
            'Estado': '',
            'Novedades/Comentarios': f'Suma total: ${suma_total:,.2f}'
        }])

        df_final = pd.concat([df, fila_totales], ignore_index=True)

        response = HttpResponse(content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        response['Content-Disposition'] = f'attachment; filename=reporte_{tipo_reporte}_{hoy.strftime("%Y%m%d")}.xlsx'
        
        with pd.ExcelWriter(response, engine='openpyxl') as writer:
            df_final.to_excel(writer, index=False, sheet_name='Reporte')
            
            worksheet = writer.sheets['Reporte']
            
            for column in worksheet.columns:
                max_length = 0
                column_letter = column[0].column_letter
                for cell in column:
                    try:
                        if len(str(cell.value)) > max_length:
                            max_length = len(str(cell.value))
                    except:
                        pass
                adjusted_width = min(max_length + 2, 50)
                worksheet.column_dimensions[column_letter].width = adjusted_width

        return response

    clientes = Usuario.objects.filter(rol='cliente', empresa=request.user.empresa).values('id', 'username', 'first_name', 'last_name')
    usuarios = Usuario.objects.filter(rol__in=['coordinador', 'registro_coordinador'], empresa=request.user.empresa).values('id', 'username', 'first_name', 'last_name')
    mensajeros = Usuario.objects.filter(rol='mensajero', empresa=request.user.empresa).values('id', 'username', 'first_name', 'last_name')

    context = {
        'clientes': list(clientes),
        'usuarios': list(usuarios),
        'mensajeros': list(mensajeros),
    }
    return render(request, 'dashboard/panel_registros.html', context)