"""Datos iniciales — extraídos del HTML original."""
from datetime import date

DEFAULT_USERS = [
    {"email": "admin@skyenergy.mx",          "password": "Sky@Admin2025", "name": "Administrador SKY",     "role": "admin",         "initials": "AD"},
    {"email": "operador@skyenergy.mx",       "password": "Sky@Oper2025",  "name": "Operador Sistema",      "role": "operator",      "initials": "OP"},
    {"email": "mantenimiento@skyenergy.mx",  "password": "Sky@Mant2025",  "name": "Técnico Mantenimiento", "role": "mantenimiento", "initials": "MT"},
]


SEED_ERRORES = [
    # HUAWEI
    {"brand":"HUAWEI","code":"2001","classification":"STRING","problem":"SOBRETENSIÓN DC","cause":"Tensión elevada en string o diseño/configuración fuera de rango","solution":"Verificar Voc del arreglo, número de módulos por string y condiciones de temperatura","priority":"Alta"},
    {"brand":"HUAWEI","code":"2011","classification":"STRING","problem":"INADECUADA CONEXIÓN","cause":"Polaridad invertida en string FV","solution":"Aislar string, corregir polaridad y revisar conectores antes de reconectar","priority":"Critico"},
    {"brand":"HUAWEI","code":"2015","classification":"STRING","problem":"SIN DATOS","cause":"Pérdida de string por fusible, conector, seccionador o desconexión","solution":"Revisar continuidad, fusibles, conectores MC4 y entrada del MPPT","priority":"Alta"},
    {"brand":"HUAWEI","code":"2032","classification":"COMUNICACIÓN","problem":"SIN DATOS","cause":"Falla de red, breaker AC abierto o cable AC desconectado","solution":"Verificar presencia de red, interruptor AC, cableado AC y parámetros de red","priority":"Critico"},
    {"brand":"HUAWEI","code":"2033","classification":"INVERSOR","problem":"SIN DATOS","cause":"Tensión de red por debajo del umbral permitido","solution":"Medir tensión AC y coordinar con CFE/operador si la red está fuera de rango","priority":"Alta"},
    {"brand":"HUAWEI","code":"2034","classification":"INVERSOR","problem":"SIN DATOS","cause":"Sobretensión de red","solution":"Medir tensión AC, revisar caída de voltaje/cableado","priority":"Alta"},
    {"brand":"HUAWEI","code":"2062","classification":"STRING","problem":"INADECUADA CONEXIÓN","cause":"Baja resistencia de aislamiento o fuga a tierra en lado DC","solution":"Prueba de aislamiento, inspección de strings y cajas combinadoras","priority":"Critico"},
    {"brand":"HUAWEI","code":"2063","classification":"INVERSOR","problem":"TEMPERATURA ALTA","cause":"Ventilación deficiente, radiación elevada o falla térmica","solution":"Revisar ventilación, limpieza y operación de ventiladores","priority":"Alta"},
    {"brand":"HUAWEI","code":"2064","classification":"INVERSOR","problem":"ERROR DE INVERSOR INTERNO","cause":"Falla interna de hardware/electrónica de potencia","solution":"Reiniciar; si persiste, escalar a soporte del fabricante","priority":"Critico"},
    # SUNGROW
    {"brand":"SUNGROW","code":"4","classification":"INVERSOR","problem":"SIN DATOS","cause":"Tensión de red baja o cableado AC deficiente","solution":"Medir tensión de red, revisar cableado AC","priority":"Alta"},
    {"brand":"SUNGROW","code":"10","classification":"COMUNICACIÓN","problem":"SIN DATOS","cause":"Sin red, breaker AC disparado o cables AC flojos","solution":"Revisar breaker AC, conexión AC y disponibilidad de red","priority":"Critico"},
    {"brand":"SUNGROW","code":"12","classification":"STRING","problem":"INADECUADA CONEXIÓN","cause":"Fuga a tierra en strings PV","solution":"Inspeccionar strings por falla a tierra","priority":"Critico"},
    {"brand":"SUNGROW","code":"14","classification":"INVERSOR","problem":"SIN DATOS","cause":"Sobretensión sostenida de red","solution":"Verificar selección de código de red y medir voltaje AC","priority":"Alta"},
    {"brand":"SUNGROW","code":"15","classification":"INVERSOR","problem":"SIN DATOS","cause":"Tensión de red alta","solution":"Revisar tensión AC, calibre/longitud de cable","priority":"Alta"},
    {"brand":"SUNGROW","code":"28","classification":"STRING","problem":"INADECUADA CONEXIÓN","cause":"Polaridad invertida en entrada FV","solution":"Corregir polaridad y revisar conexionado del string","priority":"Critico"},
    {"brand":"SUNGROW","code":"36","classification":"INVERSOR","problem":"TEMPERATURA ALTA","cause":"Radiador caliente por ambiente o ventilación deficiente","solution":"Verificar temperatura ambiente, limpieza, ventiladores","priority":"Alta"},
    {"brand":"SUNGROW","code":"39","classification":"STRING","problem":"INADECUADA CONEXIÓN","cause":"Baja resistencia de aislamiento a tierra","solution":"Revisar puesta a tierra, strings y aislamiento DC","priority":"Critico"},
    {"brand":"SUNGROW","code":"59","classification":"COMUNICACIÓN","problem":"EQUIPO BLOQUEADO","cause":"Falla de comunicación interna del equipo","solution":"Esperar autorrecuperación; si persiste, reiniciar","priority":"Alta"},
    {"brand":"SUNGROW","code":"70","classification":"INVERSOR","problem":"TEMPERATURA ALTA","cause":"Ventiladores bloqueados o defectuosos","solution":"Detener, aislar AC/DC, limpiar ductos","priority":"Alta"},
    {"brand":"SUNGROW","code":"84","classification":"MEDIDOR","problem":"INADECUADA CONFIGURACIÓN DE MEDIDOR","cause":"Conexión invertida en medidor o CT","solution":"Corregir polaridad/conexión del medidor","priority":"Intermedia"},
    # SOLIS
    {"brand":"SOLIS","code":"1010","classification":"INVERSOR","problem":"SIN DATOS","cause":"Sobretensión de red","solution":"Confirmar estado de red, cables AC","priority":"Alta"},
    {"brand":"SOLIS","code":"1011","classification":"INVERSOR","problem":"SIN DATOS","cause":"Subtensión de red","solution":"Verificar tensión de red y cableado AC","priority":"Alta"},
    {"brand":"SOLIS","code":"1012","classification":"INVERSOR","problem":"SIN DATOS","cause":"Sobrefrecuencia de red","solution":"Medir frecuencia y confirmar parámetros de red","priority":"Alta"},
    {"brand":"SOLIS","code":"1013","classification":"INVERSOR","problem":"SIN DATOS","cause":"Subfrecuencia de red","solution":"Medir frecuencia y confirmar parámetros de red","priority":"Alta"},
    {"brand":"SOLIS","code":"1014","classification":"INVERSOR","problem":"ERROR DE INVERSOR INTERNO","cause":"Corriente de retorno AC","solution":"Reiniciar inversor; si persiste, escalar a servicio","priority":"Critico"},
    {"brand":"SOLIS","code":"1015","classification":"COMUNICACIÓN","problem":"SIN DATOS","cause":"Sin red o conexión AC ausente","solution":"Confirmar conexión a red","priority":"Critico"},
    {"brand":"SOLIS","code":"1016","classification":"INVERSOR","problem":"SIN DATOS","cause":"Desequilibrio trifásico","solution":"Verificar balance y cableado de fases","priority":"Alta"},
    {"brand":"SOLIS","code":"1017","classification":"INVERSOR","problem":"SIN DATOS","cause":"Frecuencia de red anómala","solution":"Revisar frecuencia y calidad de red","priority":"Alta"},
    {"brand":"SOLIS","code":"1018","classification":"INVERSOR","problem":"SIN DATOS","cause":"Sobreintensidad de salida a red","solution":"Verificar condiciones de red","priority":"Alta"},
    # SMA
    {"brand":"SMA","code":"101","classification":"INVERSOR","problem":"SIN DATOS","cause":"Voltaje de red/impedancia demasiado alto","solution":"Verificar set de país, medir tensión","priority":"Alta"},
    {"brand":"SMA","code":"202","classification":"COMUNICACIÓN","problem":"SIN DATOS","cause":"Red desconectada, cable AC dañado o tensión demasiado baja","solution":"Verificar breaker, cable AC y presencia de red","priority":"Critico"},
    {"brand":"SMA","code":"301","classification":"INVERSOR","problem":"SIN DATOS","cause":"Promedio de tensión de red fuera de rango","solution":"Medir tensión durante operación","priority":"Alta"},
    {"brand":"SMA","code":"501","classification":"INVERSOR","problem":"SIN DATOS","cause":"Frecuencia fuera de rango","solution":"Revisar frecuencia","priority":"Alta"},
    {"brand":"SMA","code":"3401","classification":"STRING","problem":"SOBRETENSIÓN DC","cause":"Sobretensión en entrada DC","solution":"Desconectar fuentes, verificar tensión DC","priority":"Critico"},
    {"brand":"SMA","code":"8708","classification":"COMUNICACIÓN","problem":"SIN DATOS","cause":"Comunicación ausente con control del sistema","solution":"Verificar integridad de cableado y conectores","priority":"Alta"},
]


SEED_POLIZAS = [
    {"item":1,"grupo":"ASUR","code":"ASRO-CUN01-BT00101","project":"T4","tarifa":"GDMTH","platform":"SKYCONTROL","panels":"8","inv":"19","polStart":"2023-03-28","polEnd":"2033-03-28","status":"Vigente","poliza":"BESS","zona":"Quintana Roo","cuadrilla":"Península"},
    {"item":2,"grupo":"ASUR","code":"ASRO-CUN02-BT00102","project":"T3","tarifa":"GDMTH","platform":"ON","panels":"8","inv":"20","sysStart":"2023-04-26","polStart":"2023-05-02","polEnd":"2033-05-02","status":"Vigente","poliza":"BESS","zona":"Quintana Roo","cuadrilla":"Península"},
    {"item":19,"grupo":"ASUR","code":"ASRO-MID03-FV00119","project":"ASUR Mérida","tarifa":"GDMTH","platform":"SunGrow","panels":"1296","inv":"8","sysStart":"2022-07-13","polStart":"2022-08-19","polEnd":"2032-08-19","status":"Vigente","poliza":"2 completos, 2 limpiezas","zona":"Yucatán","cuadrilla":"Península"},
    {"item":20,"grupo":"ASUR","code":"ASRO-OAX01-FV00120","project":"ASUR Oaxaca","tarifa":"GDMTH","platform":"Solis","panels":"1210","inv":"8","sysStart":"2023-02-03","polStart":"2023-02-02","polEnd":"2033-02-02","status":"Vigente","poliza":"COMPLETO","zona":"Oaxaca","cuadrilla":"Especial"},
    {"item":35,"grupo":"OMA","code":"OMAO-DGO02-FV00212","project":"Aeropuerto Internacional de Durango","tarifa":"GDMTH","platform":"SunGrow","panels":"747","inv":"5","sysStart":"2021-09-29","polStart":"2021-09-29","polEnd":"2031-09-21","status":"Vigente","poliza":"COMPLETO","zona":"Durango","cuadrilla":"Especial"},
    {"item":36,"grupo":"OMA","code":"OMAO-TRC02-FV00213","project":"Aeropuerto Internacional de Torreón","tarifa":"GDMTH","platform":"SunGrow","panels":"1317","inv":"8","sysStart":"2021-10-07","polStart":"2021-10-07","polEnd":"2031-10-07","status":"Vigente","poliza":"COMPLETO","zona":"Coahuila","cuadrilla":"Especial"},
    {"item":38,"grupo":"OMA","code":"OMAO-CUL02-FV00215","project":"Aeropuerto Internacional de Culiacán","tarifa":"GDMTH","platform":"SunGrow","panels":"1314","inv":"8","sysStart":"2021-10-16","polStart":"2021-10-18","polEnd":"2031-10-18","status":"Vigente","poliza":"COMPLETO","zona":"Sinaloa","cuadrilla":"Especial"},
    {"item":39,"grupo":"OMA","code":"OMAO-CJS02-FV00216","project":"Aeropuerto Internacional de Ciudad Juárez","tarifa":"GDMTH","platform":"SunGrow","panels":"1309","inv":"8","sysStart":"2021-11-30","polStart":"2021-12-04","polEnd":"2031-12-21","status":"Vigente","poliza":"COMPLETO","zona":"Chihuahua","cuadrilla":"Especial"},
    {"item":41,"grupo":"Fantasías Miguel","code":"FTMO-MID09-FV00302","project":"Fantasías Miguel Cancún","tarifa":"GDMTH","platform":"Solis","sysStart":"2024-02-04","polStart":"2024-02-04","polEnd":"2026-02-04","status":"Vencida","poliza":"ELÉCTRICO","zona":"Quintana Roo","cuadrilla":"Península"},
]


SEED_INCIDENCIAS = [
    {"platform":"SUNGROW","num":1,"site":"ASUR Merida","client":"ASUR","code":"ASRO-MID03-FV00119","priority":"Alta","notes":"valle de producción","incDate":"2025-11-20","errCode":"14","classification":"INVERSOR","problem":"SIN DATOS","cause":"Sobretensión sostenida de red","solution":"Verificar selección de código de red y medir voltaje AC","ticketAlta":"SI","ticketDate":"2026-01-20"},
    {"platform":"SUNGROW","num":2,"site":"Aeropuerto Internacional de Ciudad Juárez","client":"OMA","code":"OMAO-CJS02-FV00216","priority":"Alta","notes":"Sobre voltaje en la red y Anomalía en el inversor 6","incDate":"2025-11-21","ticketAlta":"SI","ticketDate":"2025-10-03"},
    {"platform":"SUNGROW","num":3,"site":"Aeropuerto Internacional de Culiacán","client":"OMA","code":"OMAO-CUL02-FV00215","priority":"Alta","notes":"Anomalías en inversor 3, 4 y 8","incDate":"2025-11-07","ticketAlta":"SI","ticketDate":"2025-12-30"},
    {"platform":"SUNGROW","num":4,"site":"Aeropuerto Internacional de Durango","client":"OMA","code":"OMAO-DGO02-FV00212","priority":"Alta","notes":"Reducción de generación en inversor 5","incDate":"2025-10-25","errCode":"15","classification":"INVERSOR","problem":"SIN DATOS","cause":"Tensión de red alta","solution":"Revisar tensión AC y calibre","ticketAlta":"SI","ticketDate":"2025-12-09"},
    {"platform":"ENNEXOS","num":18,"site":"Aquamatic División Del Norte","client":"INDEPENDIENTE","code":"INDO-EDO04-FV05017","priority":"Critico","errCode":"202","classification":"COMUNICACIÓN","problem":"SIN DATOS","cause":"Red desconectada, cable AC dañado o tensión demasiado baja","solution":"Verificar breaker, cable AC y presencia de red","ticketAlta":"NO"},
    {"platform":"SOLIS","num":29,"site":"Fantasías Miguel Cancún","client":"FANTASÍAS MIGUEL","code":"FTMO-MID09-FV00302","priority":"Alta","incDate":"2025-12-11","errCode":"1016","classification":"INVERSOR","problem":"SIN DATOS","cause":"Desequilibrio trifásico","solution":"Verificar balance y cableado de fases","ticketAlta":"SI","ticketDate":"2026-02-10"},
]


SEED_GARANTIAS = [
    {"project":"ACRILICO SABLON","equipment":"INVERSOR","brand":"SOLIS","model":"60K-HV","error":"FAN Error","supplier":"EXEL SOLAR","contact":"Plataforma Exel","ticket":"178371","status":"En espera de respuesta de distribuidor","uploadDate":"2023-03-31"},
    {"project":"ASUR OAXACA","equipment":"INVERSOR","brand":"SOLIS","model":"60K-HV","error":"No enciende el inversor","supplier":"EXEL SOLAR","contact":"Plataforma Exel","ticket":"177454","status":"En espera de respuesta de distribuidor","uploadDate":"2023-03-27"},
    {"project":"Centro Médico Toluca","equipment":"Mal calibración de datos","brand":"SOLIS","error":"Mala calibración de datos en equipos","supplier":"BAYWARE","contact":"Erik valdez - +52 33 3441 2399","status":"En revisión"},
]


SEED_DIRECTORIO = [
    {"name":"Erik Valdez","company":"BAYWARE","role":"Soporte técnico","phone":"+52 33 3441 2399","category":"Proveedor"},
    {"name":"Plataforma Exel","company":"EXEL SOLAR","role":"Atención garantías","category":"Proveedor"},
    {"name":"Equipo Península","company":"SKY","role":"Cuadrilla","category":"Interno"},
]
