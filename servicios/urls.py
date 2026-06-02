from django.urls import path
from .views import (
    ServiciosView,
    ServicioDetalleView,
    AceptarServicioView,
    AbandonarServicioView,
    CompletarPasoView,
    ReportarNovedadView,
    ActualizarUbicacionMensajeroView,
    MensajerosActivosView,
    AsignarServicioView,
    RevertirUltimaEntregaView,
    EliminarUltimoHitoView,
    ReasignarServicioView,
    MetricasMensajeroView,
)

urlpatterns = [
    path('', ServiciosView.as_view(), name='servicios'),
    path('metricas/', MetricasMensajeroView.as_view(), name='metricas-mensajero'),
    path('mensajeros/activos/', MensajerosActivosView.as_view(), name='mensajeros-activos'),
    path('<int:pk>/', ServicioDetalleView.as_view(), name='servicio-detalle'),
    path('<int:pk>/aceptar/', AceptarServicioView.as_view(), name='aceptar-servicio'),
    path('<int:pk>/abandonar/', AbandonarServicioView.as_view(), name='abandonar-servicio'),
    path('<int:pk>/paso/<int:paso>/', CompletarPasoView.as_view(), name='completar-paso'),
    path('<int:pk>/novedad/', ReportarNovedadView.as_view(), name='reportar-novedad'),
    path('<int:pk>/ubicacion/', ActualizarUbicacionMensajeroView.as_view(), name='actualizar-ubicacion'),
    path('<int:pk>/asignar/', AsignarServicioView.as_view(), name='asignar-servicio'),
    path('<int:pk>/reasignar/', ReasignarServicioView.as_view(), name='reasignar-servicio'),
    path('<int:pk>/eliminar-hito/', EliminarUltimoHitoView.as_view(), name='eliminar-ultimo-hito'),
    path('<int:pk>/revertir/', RevertirUltimaEntregaView.as_view(), name='revertir-ultima-entrega'),
]