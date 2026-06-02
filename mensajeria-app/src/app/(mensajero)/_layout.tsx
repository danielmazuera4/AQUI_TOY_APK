import { Stack } from 'expo-router';

export default function MensajeroLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade', // Hace que la transición al entrar sea suave
      }}
    >
      {/* Registramos explícitamente las pantallas del grupo */}
      <Stack.Screen 
        name="inicio" 
        options={{ 
          title: 'Inicio Mensajero',
          gestureEnabled: false // Evita que el mensajero vuelva al login arrastrando la pantalla hacia atrás
        }} 
      />
      <Stack.Screen 
        name="servicio" 
        options={{ 
          title: 'Detalle del Servicio' 
        }} 
      />
      <Stack.Screen
        name="profile"
        options={{
          headerShown: false,
          title: 'Perfil',
        }}
      />
    </Stack>
  );
}