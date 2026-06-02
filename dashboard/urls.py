from django.urls import path
from . import views

app_name = 'dashboard'

urlpatterns = [
    path('login/', views.login_view, name='login'),
    path('inicio/', views.inicio, name='inicio'),
    path('cliente/', views.cliente_inicio, name='cliente_inicio'),
    path('mensajero/', views.mensajero_inicio, name='mensajero_inicio'),
    path('crear/', views.crear_servicio, name='crear_servicio'),
    path('servicio/<int:pk>/editar/', views.editar_servicio, name='editar_servicio'),
    path('servicio/<int:pk>/eliminar/', views.eliminar_servicio, name='eliminar_servicio'),
    path('api/servicio/<int:pk>/', views.get_servicio_data, name='get_servicio_data'),
    path('logout/', views.logout_view, name='logout'),
]