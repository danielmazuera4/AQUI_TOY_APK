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
            
            # A) REPORTE POR EMPRESAS (un archivo por empresa)
            self.stdout.write("Generando reportes por empresas...")
            archivos_empresas = self.generar_reportes_empresas(servicios_quincena)
            
            # B) REPORTE POR MENSAJEROS (un archivo con pestañas)
            self.stdout.write("Generando reporte por mensajeros...")
            archivo_mensajeros = self.generar_reporte_mensajeros(servicios_quincena)
            
            # C) REPORTE POR COORDINADORES/USUARIOS (un archivo con pestañas)
            self.stdout.write("Generando reporte por coordinadores...")
            archivo_coordinadores = self.generar_reporte_coordinadores(servicios_quincena)
            
            # Enviar correo con los adjuntos
            self.stdout.write("Enviando correo electrónico...")
            self.enviar_correo(correo_destino, archivos_empresas, archivo_mensajeros, archivo_coordinadores)
            
            self.stdout.write(self.style.SUCCESS('✓ Reportes generados y enviados exitosamente'))
            
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'✗ Error: {str(e)}'))
            raise

    def generar_reportes_empresas(self, servicios):
        """Genera un archivo Excel independiente por cada empresa"""
        # Obtener empresas únicas
        empresas_unicas = set()
        for servicio in servicios:
            if servicio.empresa:
                empresas_unicas.add(servicio.empresa.nombre)
        
        archivos = []
        
        for nombre_empresa in empresas_unicas:
            # Filtrar servicios de esta empresa
            servicios_empresa = servicios.filter(empresa__nombre=nombre_empresa)
            
            # Crear dataframe para esta empresa
            datos = []
            for servicio in servicios_empresa:
                novedades = ', '.join([n.descripcion for n in servicio.novedades.all()]) if servicio.novedades.exists() else ''
                
                datos.append({
                    'ID Servicio': servicio.id,
                    'Orden': servicio.orden,
                    'Origen': servicio.origen,
                    'Destino': servicio.destino,
                    'Cliente': servicio.cliente.username if servicio.cliente else 'N/A',
                    'Empresa': nombre_empresa,
                    'Mensajero': servicio.mensajero.username if servicio.mensajero else 'Sin asignar',
                    'Valor': float(servicio.valor),
                    'Fecha': servicio.fecha_creacion.strftime('%Y-%m-%d %H:%M'),
                    'Estado': servicio.get_estado_display(),
                    'Novedades/Comentarios': novedades
                })
            
            df = pd.DataFrame(datos)
            
            if not df.empty:
                # Ordenar por fecha
                df = df.sort_values('Fecha')
                
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
            
            # Generar archivo Excel
            nombre_archivo = f'reporte_{nombre_empresa.replace(" ", "_").replace("/", "_")}.xlsx'
            archivo = self.generar_excel(df, nombre_archivo)
            archivos.append((nombre_archivo, archivo))
            self.stdout.write(f"  - Generado: {nombre_archivo}")
        
        return archivos

    def generar_reporte_mensajeros(self, servicios):
        """Genera un archivo Excel con pestañas por cada mensajero"""
        # Obtener mensajeros únicos
        mensajeros_unicos = set()
        for servicio in servicios:
            if servicio.mensajero:
                mensajeros_unicos.add(servicio.mensajero.username)
        
        output = io.BytesIO()
        
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            for nombre_mensajero in mensajeros_unicos:
                # Filtrar servicios de este mensajero
                servicios_mensajero = servicios.filter(mensajero__username=nombre_mensajero)
                
                # Crear dataframe para este mensajero
                datos = []
                for servicio in servicios_mensajero:
                    novedades = ', '.join([n.descripcion for n in servicio.novedades.all()]) if servicio.novedades.exists() else ''
                    
                    datos.append({
                        'ID Servicio': servicio.id,
                        'Orden': servicio.orden,
                        'Origen': servicio.origen,
                        'Destino': servicio.destino,
                        'Cliente': servicio.cliente.username if servicio.cliente else 'N/A',
                        'Empresa': servicio.empresa.nombre if servicio.empresa else 'Sin empresa',
                        'Mensajero': nombre_mensajero,
                        'Valor': float(servicio.valor),
                        'Fecha': servicio.fecha_creacion.strftime('%Y-%m-%d %H:%M'),
                        'Estado': servicio.get_estado_display(),
                        'Novedades/Comentarios': novedades
                    })
                
                df = pd.DataFrame(datos)
                
                if not df.empty:
                    # Ordenar por fecha
                    df = df.sort_values('Fecha')
                    
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
                
                # Nombre de pestaña (máximo 31 caracteres para Excel)
                nombre_pestana = nombre_mensajero[:31]
                df.to_excel(writer, sheet_name=nombre_pestana, index=False)
                
                # Ajustar ancho de columnas
                worksheet = writer.sheets[nombre_pestana]
                for idx, col in enumerate(df.columns, 1):
                    max_length = max(
                        df[col].astype(str).str.len().max(),
                        len(str(col))
                    )
                    worksheet.column_dimensions[chr(64 + idx)].width = min(max_length + 2, 50)
                
                self.stdout.write(f"  - Pestaña creada: {nombre_pestana}")
        
        output.seek(0)
        return output

    def generar_reporte_coordinadores(self, servicios):
        """Genera un archivo Excel con pestañas por cada coordinador"""
        # Obtener coordinadores únicos
        coordinadores_unicos = set()
        for servicio in servicios:
            if servicio.creado_por:
                coordinadores_unicos.add(servicio.creado_por.username)
        
        output = io.BytesIO()
        
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            for nombre_coordinador in coordinadores_unicos:
                # Filtrar servicios de este coordinador
                servicios_coordinador = servicios.filter(creado_por__username=nombre_coordinador)
                
                # Crear dataframe para este coordinador
                datos = []
                for servicio in servicios_coordinador:
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
                    # Ordenar por fecha
                    df = df.sort_values('Fecha')
                    
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
                
                # Nombre de pestaña (máximo 31 caracteres para Excel)
                nombre_pestana = nombre_coordinador[:31]
                df.to_excel(writer, sheet_name=nombre_pestana, index=False)
                
                # Ajustar ancho de columnas
                worksheet = writer.sheets[nombre_pestana]
                for idx, col in enumerate(df.columns, 1):
                    max_length = max(
                        df[col].astype(str).str.len().max(),
                        len(str(col))
                    )
                    worksheet.column_dimensions[chr(64 + idx)].width = min(max_length + 2, 50)
                
                self.stdout.write(f"  - Pestaña creada: {nombre_pestana}")
        
        output.seek(0)
        return output

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

    def enviar_correo(self, correo_destino, archivos_empresas, archivo_mensajeros, archivo_coordinadores):
        """Envía correo electrónico con los reportes adjuntos"""
        asunto = 'Reportes Quincenales de Servicios - Aquitoy'
        
        # Crear lista de archivos adjuntos para el HTML
        lista_archivos = ""
        for nombre_archivo, _ in archivos_empresas:
            lista_archivos += f"<li><strong>{nombre_archivo}:</strong> Servicios detallados por empresa</li>"
        lista_archivos += "<li><strong>reporte_mensajeros.xlsx:</strong> Servicios por mensajero (pestañas)</li>"
        lista_archivos += "<li><strong>reporte_coordinadores.xlsx:</strong> Servicios por coordinador (pestañas)</li>"
        
        cuerpo_html = f'''
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background-color: #4CAF50; color: white; padding: 20px; text-align: center; }}
                .content {{ padding: 20px; background-color: #f9f9f9; }}
                .footer {{ padding: 10px; text-align: center; color: #666; font-size: 12px; }}
                h1 {{ margin: 0; }}
                p {{ margin: 10px 0; }}
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
                        {lista_archivos}
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
        
        # Adjuntar archivos de empresas (múltiples)
        for nombre_archivo, archivo in archivos_empresas:
            email.attach(nombre_archivo, archivo.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        
        # Adjuntar archivo de mensajeros
        email.attach('reporte_mensajeros.xlsx', archivo_mensajeros.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        
        # Adjuntar archivo de coordinadores
        email.attach('reporte_coordinadores.xlsx', archivo_coordinadores.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        
        email.send()
