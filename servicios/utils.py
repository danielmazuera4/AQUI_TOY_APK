def geocode_address(address):
    """No hace geocodificación síncrona.

    Se mantiene por compatibilidad, pero devuelve coordenadas vacías para evitar
    bloqueos del hilo principal durante request/response.
    """
    return None, None


def ensure_service_coordinates(servicio):
    """No resuelve coordenadas en tiempo de request.

    El backend debe recibir lat/lng ya calculadas o guardar sólo la dirección en texto.
    """
    return servicio