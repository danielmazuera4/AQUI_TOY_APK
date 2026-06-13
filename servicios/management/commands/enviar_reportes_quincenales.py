import io
import pandas as pd
from django.core.management.base import BaseCommand
from django.core.mail import EmailMessage
from django.utils import timezone
from django.db.models import Sum, Count
from servicios.models import Servicio
from usuarios.models import Usuario


class Command(BaseCommand):
    help = 'Genera reportes quincenales en Excel y los envía por correo electrónico'

    def add_arguments(self, parser):
        parser.add_argument(
            '--correo',
            type=str,
            help='Correo electrónico de destino (opcional)',
            default='pruebas@example.com'
        )

    def handle(self, *args, **options):
        correo_destino = options['correo']
        
        try:
            # Calcular rango de fecha de los últimos 15 días
            fecha_actual = timezone.now()
            fecha_inicio = fecha_actual - timezone.timedelta(days=15)
            
            self.stdout.write(f"Generando reportes del {fecha_inicio.strftime('%Y-%m-%d')} al {fecha_actual.strftime('%Y-%m-%d')}")
            
            # Filtrar servicios del rango quincenal
            servicios_quincena = Servicio.objects.filter(
                fecha_creacion__gte=fecha_inicio,
                fecha_creacion__lte=fecha_actual
            )
            
            # A) REPORTE POR EMPRESAS
            self.stdout.write("Generando reporte por empresas...")
            df_empresas = self.generar_reporte_empresas(servicios_quincena)
            archivo_empresas = self.generar_excel(df_empresas, 'reporte_empresas.xlsx')
            
            # B) REPORTE POR MENSAJEROS
            self.stdout.write("Generando reporte por mensajeros...")
            df_mensajeros = self.generar_reporte_mensajeros(servicios_quincena)
            archivo_mensajeros = self.generar_excel(df_mensajeros, 'reporte_mensajeros.xlsx')
            
            # C) REPORTE POR COORDINADORES/USUARIOS
            self.stdout.write("Generando reporte por coordinadores...")
            df_coordinadores = self.generar_reporte_coordinadores(servicios_quincena)
            archivo_coordinadores = self.generar_excel(df_coordinadores, 'reporte_coordinadores.xlsx')
            
            # Enviar correo con los adjuntos
            self.stdout.write("Enviando correo electrónico...")
            self.enviar_correo(correo_destino, archivo_empresas, archivo_mensajeros, archivo_coordinadores)
            
            self.stdout.write(self.style.SUCCESS('✓ Reportes generados y enviados exitosamente'))
            
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'✗ Error: {str(e)}'))
            raise

    def generar_reporte_empresas(self, servicios):
        """Genera reporte detallado por empresas"""
        datos = []
        for servicio in servicios:
            # Obtener novedades/comentarios del servicio
            novedades = ', '.join([n.descripcion for n in servicio.novedades.all()]) if servicio.novedades.exists() else ''
            
            datos.append({
                'ID Servicio': servicio.id,
                'Orden': servicio.orden,
                'Origen': servicio.origen,
                'Destino': servicio.destino,
                'Cliente': servicio.cliente.username if servicio.cliente else 'N/A',
                'Empresa': servicio.empresa.nombre if servicio.empresa else 'Sin empresa',
                'Mensajero': servicio.mensajero.username if servicio.mensajero else 'Sin asignar',
                'Valor': float(servicio.valor),
                'Fecha': servicio.fecha_creacion.strftime('%Y-%m-%d %H:%M'),
                'Estado': servicio.get_estado_display(),
                'Novedades/Comentarios': novedades
            })
        
        df = pd.DataFrame(datos)
        
        if not df.empty:
            # Ordenar por Empresa
            df = df.sort_values('Empresa')
            
            # Calcular totales
            total_filas = len(df)
            suma_valores = df['Valor'].sum()
            
            # Crear fila de totales
            fila_totales = pd.DataFrame([{
                'ID Servicio': 'TOTALES',
                'Orden': f'Total servicios: {total_filas}',
                'Origen': '',
                'Destino': '',
                'Cliente': '',
                'Empresa': '',
                'Mensajero': '',
                'Valor': suma_valores,
                'Fecha': '',
                'Estado': '',
                'Novedades/Comentarios': f'Suma total: ${suma_valores:,.2f}'
            }])
            
            df = pd.concat([df, fila_totales], ignore_index=True)
        
        return df

    def generar_reporte_mensajeros(self, servicios):
        """Genera reporte detallado por mensajeros"""
        datos = []
        for servicio in servicios:
            # Obtener novedades/comentarios del servicio
            novedades = ', '.join([n.descripcion for n in servicio.novedades.all()]) if servicio.novedades.exists() else ''
            
            datos.append({
                'ID Servicio': servicio.id,
                'Orden': servicio.orden,
                'Origen': servicio.origen,
                'Destino': servicio.destino,
                'Cliente': servicio.cliente.username if servicio.cliente else 'N/A',
                'Empresa': servicio.empresa.nombre if servicio.empresa else 'Sin empresa',
                'Mensajero': servicio.mensajero.username if servicio.mensajero else 'Sin asignar',
                'Valor': float(servicio.valor),
                'Fecha': servicio.fecha_creacion.strftime('%Y-%m-%d %H:%M'),
                'Estado': servicio.get_estado_display(),
                'Novedades/Comentarios': novedades
            })
        
        df = pd.DataFrame(datos)
        
        if not df.empty:
            # Ordenar por Mensajero
            df = df.sort_values('Mensajero')
            
            # Calcular totales
            total_filas = len(df)
            suma_valores = df['Valor'].sum()
            
            # Crear fila de totales
            fila_totales = pd.DataFrame([{
                'ID Servicio': 'TOTALES',
                'Orden': f'Total servicios: {total_filas}',
                'Origen': '',
                'Destino': '',
                'Cliente': '',
                'Empresa': '',
                'Mensajero': '',
                'Valor': suma_valores,
                'Fecha': '',
                'Estado': '',
                'Novedades/Comentarios': f'Suma total: ${suma_valores:,.2f}'
            }])
            
            df = pd.concat([df, fila_totales], ignore_index=True)
        
        return df

    def generar_reporte_coordinadores(self, servicios):
        """Genera reporte detallado por coordinadores"""
        datos = []
        for servicio in servicios:
            # Obtener novedades/comentarios del servicio
            novedades = ', '.join([n.descripcion for n in servicio.novedades.all()]) if servicio.novedades.exists() else ''
            
            datos.append({
                'ID Servicio': servicio.id,
                'Orden': servicio.orden,
                'Origen': servicio.origen,
                'Destino': servicio.destino,
                'Cliente': servicio.cliente.username if servicio.cliente else 'N/A',
                'Empresa': servicio.empresa.nombre if servicio.empresa else 'Sin empresa',
                'Mensajero': servicio.mensajero.username if servicio.mensajero else 'Sin asignar',
                'Valor': float(servicio.valor),
                'Fecha': servicio.fecha_creacion.strftime('%Y-%m-%d %H:%M'),
                'Estado': servicio.get_estado_display(),
                'Novedades/Comentarios': novedades,
                'Coordinador': servicio.creado_por.username if servicio.creado_por else 'Sin coordinador'
            })
        
        df = pd.DataFrame(datos)
        
        if not df.empty:
            # Ordenar por Coordinador (creado_por)
            df = df.sort_values('Coordinador')
            
            # Eliminar columna temporal Coordinador (no se necesita en el Excel final)
            df = df.drop('Coordinador', axis=1)
            
            # Calcular totales
            total_filas = len(df)
            suma_valores = df['Valor'].sum()
            
            # Crear fila de totales
            fila_totales = pd.DataFrame([{
                'ID Servicio': 'TOTALES',
                'Orden': f'Total servicios: {total_filas}',
                'Origen': '',
                'Destino': '',
                'Cliente': '',
                'Empresa': '',
                'Mensajero': '',
                'Valor': suma_valores,
                'Fecha': '',
                'Estado': '',
                'Novedades/Comentarios': f'Suma total: ${suma_valores:,.2f}'
            }])
            
            df = pd.concat([df, fila_totales], ignore_index=True)
        
        return df

    def generar_excel(self, df, nombre_archivo):
        """Genera archivo Excel en memoria RAM"""
        output = io.BytesIO()
        
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name='Reporte', index=False)
            
            # Ajustar ancho de columnas
            worksheet = writer.sheets['Reporte']
            for idx, col in enumerate(df.columns, 1):
                max_length = max(
                    df[col].astype(str).str.len().max(),
                    len(str(col))
                )
                worksheet.column_dimensions[chr(64 + idx)].width = min(max_length + 2, 50)
        
        output.seek(0)
        return output

    def enviar_correo(self, correo_destino, archivo_empresas, archivo_mensajeros, archivo_coordinadores):
        """Envía correo electrónico con los reportes adjuntos"""
        asunto = 'Reportes Quincenales de Servicios - Aquitoy'
        
        cuerpo_html = '''
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background-color: #f9f9f9; }
                .footer { padding: 10px; text-align: center; color: #666; font-size: 12px; }
                h1 { margin: 0; }
                p { margin: 10px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Reportes Quincenales</h1>
                </div>
                <div class="content">
                    <p>Estimado/a,</p>
                    <p>Se adjuntan los reportes quincenales de servicios generados automáticamente:</p>
                    <ul>
                        <li><strong>reporte_empresas.xlsx:</strong> Resumen de servicios por empresa</li>
                        <li><strong>reporte_mensajeros.xlsx:</strong> Resumen de servicios por mensajero</li>
                        <li><strong>reporte_coordinadores.xlsx:</strong> Resumen de servicios por coordinador</li>
                    </ul>
                    <p>Los reportes incluyen el periodo de los últimos 15 días.</p>
                    <p>Saludos cordiales,<br>Sistema Aquitoy</p>
                </div>
                <div class="footer">
                    <p>Este correo fue generado automáticamente. Por favor no responda.</p>
                </div>
            </div>
        </body>
        </html>
        '''
        
        email = EmailMessage(
            subject=asunto,
            body=cuerpo_html,
            from_email=None,  # Usa DEFAULT_FROM_EMAIL de settings.py
            to=[correo_destino],
        )
        
        email.content_subtype = 'html'
        
        # Adjuntar los archivos Excel
        email.attach('reporte_empresas.xlsx', archivo_empresas.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        email.attach('reporte_mensajeros.xlsx', archivo_mensajeros.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        email.attach('reporte_coordinadores.xlsx', archivo_coordinadores.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        
        email.send()
