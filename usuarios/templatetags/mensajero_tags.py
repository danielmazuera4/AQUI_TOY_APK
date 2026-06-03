from django import template
from servicios.models import Servicio

register = template.Library()


@register.filter
def mensajero_con_rango(mensajero):
    """
    Formatea el nombre del mensajero con su rango y conteo de servicios.
    Formato: "Nombre del Mensajero - [Rango] ([X] servicios)"
    Ejemplo: "Daniel Mazuera - Piloto Novato (12 servicios)"
    """
    if not mensajero:
        return "Sin mensajero"
    
    # Obtener el nombre completo o username
    nombre = mensajero.get_full_name() or mensajero.username
    
    # Contar servicios terminados del mensajero
    servicios_count = Servicio.objects.filter(
        mensajero=mensajero,
        estado='terminado'
    ).count()
    
    # Determinar el rango basado en el número de servicios
    rango = _obtener_rango_por_servicios(servicios_count)
    
    # Formatear el texto
    return f"{nombre} - {rango} ({servicios_count} servicios)"


def _obtener_rango_por_servicios(servicios_count):
    """
    Mapea el número de servicios a un nombre de rango.
    """
    if servicios_count >= 250:
        return "Piloto Diamante"
    elif servicios_count >= 100:
        return "Piloto Élite"
    elif servicios_count >= 30:
        return "Piloto Verificado"
    else:
        return "Piloto Novato"
