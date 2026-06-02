from django.urls import path
from .views import LoginView, PerfilView, MensajerosActivosView

urlpatterns = [
    path('login/', LoginView.as_view(), name='login'),
    path('perfil/', PerfilView.as_view(), name='perfil'),
    path('mensajeros/activos/', MensajerosActivosView.as_view(), name='mensajeros-activos'),
]