from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.authentication import SessionAuthentication, TokenAuthentication
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from .models import Usuario
from .serializers import UsuarioSerializer

class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')

        usuario = authenticate(username=username, password=password)

        if usuario is None:
            return Response(
                {'error': 'Usuario o contraseña incorrectos'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Genera los tokens JWT
        refresh = RefreshToken.for_user(usuario)

        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'usuario': UsuarioSerializer(usuario).data
            # Aquí ya sabe si es cliente, mensajero o coordinador
            # y a qué empresa pertenece automáticamente
        })

class PerfilView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [SessionAuthentication, TokenAuthentication, JWTAuthentication]

    def get(self, request):
        return Response(UsuarioSerializer(request.user).data)


class MensajerosActivosView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [SessionAuthentication, TokenAuthentication, JWTAuthentication]

    def get(self, request):
        empresa = getattr(request.user, 'empresa', None)

        queryset = Usuario.objects.filter(rol='mensajero', is_active=True)
        if not request.user.is_superuser and empresa:
            queryset = queryset.filter(empresa=empresa)

        queryset = queryset.only('id', 'username', 'first_name', 'last_name', 'telefono', 'foto_perfil').order_by('first_name', 'last_name', 'username')

        data = []
        for mensajero in queryset:
            nombre_completo = mensajero.get_full_name().strip() or mensajero.username
            data.append({
                'id': mensajero.id,
                'username': mensajero.username,
                'nombre_completo': nombre_completo,
                'nombre': nombre_completo,
                'telefono': mensajero.telefono,
                'foto_perfil': mensajero.foto_perfil.url if mensajero.foto_perfil else None,
            })

        return Response(data, status=status.HTTP_200_OK)