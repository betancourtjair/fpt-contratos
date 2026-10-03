# crear-franquicias-lote2-historico.ps1
#
# Carga el portafolio HISTORICO de Franchise Agreements (2021-2026) encontrado en la carpeta
# de SharePoint "FA firmados", distinto del lote de 4 clubes nuevos de 2026 (ese ya se cargo
# con crear-franquicias-lote-2026.ps1). Mismo patron: crea el club si no existe, crea el
# contrato (nace directo en 'activo' por ser franquicia), llena los datos de franquicia, y
# sube el PDF firmado (se enruta solo a SharePoint).
#
# IMPORTANTE - antes de correrlo:
# 1. Descarga TODOS los PDFs de la carpeta "FA firmados" de SharePoint a la carpeta indicada
#    abajo en $carpetaPdfs, SIN cambiarles el nombre (son los nombres originales de SharePoint,
#    incluidos acentos).
# 2. Este script NO incluye: Via Santa Fe, Cuatro Caminos, Escobedo, Izazaga, Melt Polanco
#    (esos ya se cargaron por separado), ni los clubes con problemas de datos pendientes de
#    resolver (ver la tabla de pendientes que te mande aparte): Glorieta (SLP), Andamar (Boca
#    del Rio), El Refugio (QRO) y Tlatelolco -- de esos 4, el PDF real no se pudo localizar o
#    leer con confianza, pedimos que IT/Legal corrija el nombre/contenido en SharePoint antes
#    de cargarlos.
# 3. Varios de los 49 clubes de este lote tienen su PDF guardado en SharePoint con un nombre
#    que NO corresponde al club (desfase de nombres descubierto durante el analisis) -- el
#    script busca el archivo correcto usando palabras clave (Key1/Key2) en vez del nombre
#    completo, precisamente por esto. Cada club con este problema trae una nota de advertencia
#    en su campo "Nota" (se guarda tambien en la descripcion del contrato).
# 4. La mayoria de estos clubes YA ESTAN OPERANDO (son contratos viejos), asi que sus fechas de
#    "Business Commencement Deadline" calculadas ya pasaron -- esto es normal aqui, a diferencia
#    del lote de clubes nuevos. No se interpreten como incumplimientos salvo que Legal lo pida.
# 5. Apodaca (El Molino) es una ADQUISICION, no un FA nuevo: su plazo es fijo (no son 10 anos
#    desde la firma) y no tiene fecha limite de apertura (el club ya operaba). El script lo
#    maneja como caso especial (FechaFinFija / SinBCD).
# 6. Saltillo (Santa Isabel) y Santa Catarina estan franquiciados bajo "Jeg-Mexico Bueno, S. de
#    R.L. de C.V." en vez de Fitness Para Todos directamente -- es normal, asi se confirmo con
#    el equipo. El garante solidario sigue siendo Fitness Para Todos Holdings en ambos casos.

$ErrorActionPreference = "Stop"

$apiBase = "https://fpt-contratos-backend.onrender.com/api"

# Ajusta esta ruta si guardaste los PDFs en otro lugar (debe ser la carpeta que contiene TODOS
# los PDFs de "FA firmados", no solo la subcarpeta "Aperturas 2026").
$carpetaPdfs = "C:\Users\JairPulidoBetancourt\Downloads\Proyectos Desarrollo Jair\Contratos\FA"

$credenciales = Get-Credential -Message "Inicia sesion en Contratos FPT (correo y password)"
$email = $credenciales.UserName
$password = $credenciales.GetNetworkCredential().Password

Write-Host "Iniciando sesion..."
$loginBody = @{ email = $email; password = $password } | ConvertTo-Json
$loginResp = Invoke-RestMethod -Uri "$apiBase/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
$token = $loginResp.token
$headers = @{ Authorization = "Bearer $token" }

Write-Host "Buscando el tipo de contrato de franquicia..."
$tipos = Invoke-RestMethod -Uri "$apiBase/tipos-contrato" -Headers $headers -Method Get
$tipoFranquicia = $tipos.tiposContrato | Where-Object { $_.es_franquicia -eq $true } | Select-Object -First 1
if (-not $tipoFranquicia) {
    Write-Host "No hay ningun tipo de contrato activo marcado como franquicia." -ForegroundColor Red
    exit 1
}
Write-Host "Tipo de contrato: $($tipoFranquicia.nombre) ($($tipoFranquicia.id))"

Add-Type -AssemblyName System.Net.Http

$polizas = "Responsabilidad civil general, de propiedad (100% del valor de reposicion), interrupcion de negocio, abuso/agresion sexual, camas de bronceado, practicas laborales, auto, desempleo, ciber, y paraguas (umbrella) en exceso. Aseguradora con calificacion AM Best A- o superior, Financial Size Category VIII o mas."
$condicionesRenovacion = "Successor Franchise (Art. 14.1): derecho a 10 anos adicionales, con aviso de 6 a 12 meses de anticipacion, sin incumplimientos pendientes, remodelacion requerida, y pago de la cuota entonces vigente."
$territorio = "Franquicia 'solo el sitio' (site only), sin territorio protegido ni exclusividad (Articulo 3.1), salvo Area Development Agreement."
$garante = "Fitness Para Todos Holdings, S. de R.L. de C.V."
$contraparteNombre = "Planet Fitness Mexico, S. de R.L. de C.V."
$contraparteContacto = "Darrell Chichester"

$clubesLote2 = @(
    [PSCustomObject]@{
        NombreClub = 'Ciudad de Queretaro (Cimatario), QUE'
        PfClubId = '4302'
        Direccion = 'Avenida del Parque No 1001, Colonia Ex hacienda la Providencia, C.P. 76074, Queretaro, Queretaro'
        FechaFirma = '2021-11-30'
        CuotaInicial = 20000
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '4302_'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'Domicilio del PDF difiere del Excel maestro (otra calle/CP); se uso el del Excel. Fecha de firma: Excel 30-Nov-21 vs nombre de archivo 3-Dic-21, se uso Excel.'
    }
    [PSCustomObject]@{
        NombreClub = 'Ciudad de Mexico (Paseo Acoxpa), CMX'
        PfClubId = '4309'
        Direccion = 'Calzada Acoxpa 430, Colonia Vergel del Sur, Alcaldia Tlalpan, CDMX, C.P. 14340'
        FechaFirma = '2022-01-31'
        CuotaInicial = 20000
        RegaliasPorcentaje = 3.0
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '4309_'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'Reduced rate confirmado: regalias 3% plano (no escalonado).'
    }
    [PSCustomObject]@{
        NombreClub = 'La Paz Puebla, PUE'
        PfClubId = '4310'
        Direccion = 'Avenida 9 Poniente No. 1901, Barrio de Santiago, Puebla, Puebla, C.P. 72410'
        FechaFirma = '2022-07-19'
        CuotaInicial = 20000
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '4310_'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'Domicilio del PDF trae CP incompleto/ilegible; se uso el del Excel maestro.'
    }
    [PSCustomObject]@{
        NombreClub = 'Angelopolis, PUE'
        PfClubId = '4312'
        Direccion = 'Blvd. del Nino Poblano 2510, Colonia Reserva Territorial Atlixcayotl, Puebla, Puebla, C.P. 72197'
        FechaFirma = '2023-11-14'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '4312_'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'Cuota inicial confirmada en US$0 (post-ADA). CP del PDF (72197) difiere en 4 digitos del Excel (72193), verificar.'
    }
    [PSCustomObject]@{
        NombreClub = 'Punto Rio Nilo, JAL'
        PfClubId = '4314'
        Direccion = 'Avenida Rio Nilo numero 7377, Lomas Soledad, C.P. 45403, Tonala, Jalisco'
        FechaFirma = '2023-11-14'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '4314_'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'Cuota inicial confirmada en US$0 (post-ADA), mismo dia de firma que Angelopolis.'
    }
    [PSCustomObject]@{
        NombreClub = 'Ciudad de Queretaro (Candiles), QRO'
        PfClubId = '4357'
        Direccion = 'Avenida Prolongacion Candiles No. 204, Colonia Camino Real, Corregidora, Queretaro, C.P. 76190'
        FechaFirma = '2021-12-28'
        CuotaInicial = 20000
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '4357_'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'PDF ubica el club en municipio Queretaro, Excel dice Corregidora (mismo CP); verificar municipio correcto.'
    }
    [PSCustomObject]@{
        NombreClub = 'Portal Queretaro, QRO'
        PfClubId = '4358'
        Direccion = 'Calle Centro del Sombrerete 1199, Colonia Norte, Queretaro, Queretaro'
        FechaFirma = '2022-09-19'
        CuotaInicial = 20000
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '4358_'
        Key2 = 'Sept'
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'No esta en el Excel maestro; fecha de firma tomada del nombre del archivo (pagina de firma ilegible), confianza baja.'
    }
    [PSCustomObject]@{
        NombreClub = 'Cuernavaca (Galerias Cuernavaca), MOR'
        PfClubId = '4426'
        Direccion = 'Autopista Mexico - Acapulco Km 87.5, Colonia Flores Magon, C.P. 62370, Cuernavaca, Morelos'
        FechaFirma = '2021-12-28'
        CuotaInicial = 20000
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '4426_'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = ''
    }
    [PSCustomObject]@{
        NombreClub = 'Plaza Satelite, EDO MEX'
        PfClubId = '4427'
        Direccion = 'Circuito Centro Comercial No. 2251, Fraccionamiento Ciudad Satelite, Naucalpan de Juarez, Estado de Mexico, C.P. 53100'
        FechaFirma = '2022-03-01'
        CuotaInicial = 20000
        RegaliasPorcentaje = 3.0
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '4427_'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'Reduced rate confirmado: regalias 3% plano.'
    }
    [PSCustomObject]@{
        NombreClub = 'Paseo Tollocan, EDO MEX'
        PfClubId = '4443'
        Direccion = 'Paseo Tollocan 600, Colonia Progreso, C.P. 50150, Toluca, Estado de Mexico'
        FechaFirma = '2023-07-06'
        CuotaInicial = 20000
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '4443_'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = ''
    }
    [PSCustomObject]@{
        NombreClub = 'Cuautitlan Izcalli (Plaza San Marcos), MEX'
        PfClubId = '4444'
        Direccion = 'Avenida Chalma Esquina Autopista Mexico-Queretaro lote 2 s/n, Colonia Jardines de la Hacienda Sur, Cuautitlan Izcalli, Estado de Mexico, C.P. 54720'
        FechaFirma = '2022-01-31'
        CuotaInicial = 20000
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '4444_'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = ''
    }
    [PSCustomObject]@{
        NombreClub = 'Encuentro Oceania, CDMX'
        PfClubId = '4446'
        Direccion = 'Avenida del Penon numero 355, Colonia Moctezuma 2a Seccion, Alcaldia Venustiano Carranza, CDMX, C.P. 15530'
        FechaFirma = '2023-04-27'
        CuotaInicial = 20000
        RegaliasPorcentaje = 3.0
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '4446_'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'Reduced rate confirmado: 3% plano. Discrepancia de anio: referencia decia 2022, el PDF y nombre de archivo dicen 2023; se uso 2023.'
    }
    [PSCustomObject]@{
        NombreClub = 'Tlalnepantla de Baz (Valle Dorado), EDO MEX'
        PfClubId = '4540'
        Direccion = 'Boulevard Manuel Avila Camacho 3227, Fraccionamiento Valle Dorado, Tlalnepantla de Baz, Estado de Mexico, C.P. 54020'
        FechaFirma = '2022-07-21'
        CuotaInicial = 20000
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '4540_'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = ''
    }
    [PSCustomObject]@{
        NombreClub = 'Cumbres la Viga, CDMX'
        PfClubId = '4542'
        Direccion = 'Calzada de la Viga 1188, Colonia El Triunfo, C.P. 09430, Alcaldia Iztapalapa, CDMX'
        FechaFirma = '2024-07-26'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '4542_'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = ''
    }
    [PSCustomObject]@{
        NombreClub = 'Lindavista, NL'
        PfClubId = '4564'
        Direccion = 'Miguel Aleman 5000, Colonia Libertad, Municipio de Guadalupe, C.P. 67170, Nuevo Leon'
        FechaFirma = '2023-07-05'
        CuotaInicial = 20000
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '4564_'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'Domicilio del PDF (calle y CP) difiere del Excel maestro; se uso el del PDF (documento firmado).'
    }
    [PSCustomObject]@{
        NombreClub = 'Libramiento (Villa Verde), PUE'
        PfClubId = '4573'
        Direccion = 'No. oficial 5605, manzana 1, Calle Privada 18 A Oriente, Fraccionamiento Villa Verde, Puebla, Puebla, C.P. 72160'
        FechaFirma = '2023-07-28'
        CuotaInicial = 20000
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '4573_'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'CP del PDF (72160) difiere del Excel (72303); se uso el del PDF.'
    }
    [PSCustomObject]@{
        NombreClub = 'Center Plazas, EDO MEX'
        PfClubId = '4588'
        Direccion = 'Av. Hank Gonzalez 50, Seccion B del Fraccionamiento Valle de Anahuac, Ecatepec de Morelos, Estado de Mexico, C.P. 55210'
        FechaFirma = '2024-01-22'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '4588_'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'El PDF se identifica internamente como PF Club ID #4599 (no 4588 como el nombre de archivo); verificar con Legal cual numero es el correcto.'
    }
    [PSCustomObject]@{
        NombreClub = 'Coacalco, EDO MEX'
        PfClubId = '4597'
        Direccion = 'Via Jose Lopez Portillo No. 338, Fraccionamiento Parque Residencial Coacalco 1ra Seccion, Coacalco de Berriozabal, Estado de Mexico, C.P. 55720'
        FechaFirma = '2023-11-14'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '4597_'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = ''
    }
    [PSCustomObject]@{
        NombreClub = 'Acueducto, CDMX'
        PfClubId = '4637'
        Direccion = 'Avenida Luis Espinoza No. 160, Colonia Solidaridad Nacional, C.P. 07268, Alcaldia Gustavo A. Madero, CDMX'
        FechaFirma = '2023-11-14'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '4637_'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'Colonia/CP del PDF difieren ligeramente del Excel maestro; se uso el del PDF.'
    }
    [PSCustomObject]@{
        NombreClub = 'Queretaro (Antea), QRO'
        PfClubId = '4841'
        Direccion = 'Carretera San Luis Potosi-Queretaro 12401, Colonia El Salitre, Ejido Jurica, C.P. 76127, Queretaro, Queretaro'
        FechaFirma = '2024-02-07'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '4841_'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = ''
    }
    [PSCustomObject]@{
        NombreClub = 'San Luis Potosi (The Park), SLP'
        PfClubId = '4885'
        Direccion = 'Boulevard Antonio Rocha Cordero numero 157, Fraccionamiento Desarrollo del Pedregal, San Luis Potosi, San Luis Potosi, C.P. 78295'
        FechaFirma = '2024-01-16'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '4914_'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'ADVERTENCIA: el archivo fisico en SharePoint esta mal nombrado como ''Glorieta'' pero su contenido (PF Club ID #4885) fue confirmado como The Park. Economia asumida por plantilla de la epoca, no reconfirmada en el PDF por falla tecnica del conector.'
    }
    [PSCustomObject]@{
        NombreClub = 'Ciudad de Mexico (Mixcoac), CDMX'
        PfClubId = '4915'
        Direccion = 'Av. Revolucion numero 780, Colonia San Juan, Alcaldia Benito Juarez, CDMX, C.P. 03730'
        FechaFirma = '2024-07-26'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '4915_'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'Economia asumida por plantilla de la epoca, no reconfirmada en el PDF por falla tecnica del conector.'
    }
    [PSCustomObject]@{
        NombreClub = 'Las Americas (Ecatepec), EDO MEX'
        PfClubId = '4916'
        Direccion = 'Avenida Central esq. Primero de Mayo, Manzana 4, Lote 1, Colonia Las Americas, Ecatepec de Morelos, Estado de Mexico, C.P. 55076'
        FechaFirma = '2024-07-26'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '4916_'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'Economia asumida por plantilla de la epoca, no reconfirmada en el PDF por falla tecnica del conector.'
    }
    [PSCustomObject]@{
        NombreClub = 'Xalapa (Paseo Jardines Xalapa), VER'
        PfClubId = '4921'
        Direccion = 'Avenida Lazaro Cardenas numero 521, Colonia Independencia, Xalapa, Veracruz, C.P. 91143'
        FechaFirma = '2024-01-12'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '4921_'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'Economia asumida por plantilla de la epoca, no reconfirmada en el PDF por falla tecnica del conector.'
    }
    [PSCustomObject]@{
        NombreClub = 'Veracruz (Los Pinos), VER'
        PfClubId = '4945'
        Direccion = 'Av. Rafael Cuervo 60, Colonia Playa Linda, Veracruz, Veracruz, C.P. 91810'
        FechaFirma = '2024-09-03'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '4945_'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'Economia asumida por plantilla de la epoca, no reconfirmada en el PDF por falla tecnica del conector.'
    }
    [PSCustomObject]@{
        NombreClub = 'Leon, GTO'
        PfClubId = '5078'
        Direccion = 'Calle Loreto 102, Colonia Las Penitas, Leon, Guanajuato'
        FechaFirma = '2024-07-26'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '5163_'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'ADVERTENCIA: archivo fisico mal nombrado en SharePoint como ''Guadalajara Plaza del Angel'' pero contenido (PF Club ID #5078) confirmado como Leon. Garantia personal real: Positano Holding LP, IB Consulting Group LLC, The 1054 Revocable Trust, Fongobe S. de R.L. de C.V. y Carlos Guillermo Ibarra Covarrubias. Direccion con CP 03730 (de CDMX, no de Leon) parece error de captura, verificar con Legal. BCD calculado ya vencido.'
    }
    [PSCustomObject]@{
        NombreClub = 'Guadalajara (Plaza del Angel), JAL'
        PfClubId = '5163'
        Direccion = 'Adolfo Lopez Mateos Sur numero 2077, Colonia Jardines Plaza del Sol, C.P. 44510, Guadalajara, Jalisco'
        FechaFirma = '2024-09-03'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '5170_'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'ADVERTENCIA: archivo fisico mal nombrado en SharePoint como ''Culiacan'' pero contenido (PF Club ID #5163) confirmado como Guadalajara Plaza del Angel.'
    }
    [PSCustomObject]@{
        NombreClub = 'Culiacan (Plaza Culiacan), SIN'
        PfClubId = '5170'
        Direccion = 'Boulevard Emiliano Zapata 2151, Colonia El Vallado, C.P. 80110, Culiacan Rosales, Sinaloa'
        FechaFirma = '2024-09-03'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = 'Altolivo'
        Key2 = '07.17'
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'ADVERTENCIA: archivo fisico mal nombrado en SharePoint como ''Altolivo'' pero contenido (PF Club ID #5170) confirmado como Culiacan.'
    }
    [PSCustomObject]@{
        NombreClub = 'Altolivo, CDMX'
        PfClubId = '5606'
        Direccion = 'Avenida Toluca numero 479, Colonia Olivar de los Padres, Alcaldia Alvaro Obregon, C.P. 01780, Ciudad de Mexico'
        FechaFirma = '2025-07-17'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = 'Apodaca'
        Key2 = 'NL AA'
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'ADVERTENCIA: archivo fisico mal nombrado en SharePoint como ''Apodaca El Molino AA'' pero contenido (PF Club ID #5606, 127 paginas completas) confirmado como Altolivo. Approved Operator distinto a los demas clubes (David Raya Medina); confirmar si es intencional. BCD calculado ya vencido.'
    }
    [PSCustomObject]@{
        NombreClub = 'Apodaca (El Molino), NL'
        PfClubId = '2836'
        Direccion = 'Av. Carlos Salinas de Gortari #801, Suite A114, Cd Apodaca, Nuevo Leon, C.P. 66600'
        FechaFirma = '2023-12-28'
        CuotaInicial = 0
        RegaliasPorcentaje = 2.25
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = 'El Refugio'
        Key2 = '09162026'
        FechaFinFija = '2030-02-01'
        SinBCD = $true
        Nota = 'ADVERTENCIA: archivo fisico mal nombrado en SharePoint como ''El Refugio'' pero contenido (PF Club ID #2836) confirmado como Apodaca El Molino. ES UNA ADQUISICION, no un FA nuevo: plazo fijo hasta 2030-02-01 (no 10 anios desde firma), SIN Business Commencement Deadline (club ya operaba). Numero de calle en PDF (801) difiere del Excel (404), verificar. Regalias banda actual 2.25%+2.25% (no escalonado nuevo).'
    }
    [PSCustomObject]@{
        NombreClub = 'Galerias Guadalajara, JAL'
        PfClubId = '4568'
        Direccion = 'Rafael Sanzio numero 55, Colonia La Estancia, Zapopan, Jalisco, C.P. 45030'
        FechaFirma = '2025-11-03'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = 'Galer'
        Key2 = 'Guadalajara'
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'Garantia personal real confirmada: Carlos Guillermo Ibarra Covarrubias + Positano Holding LP, IB Consulting Group LLC, The 1054 Revocable Trust, Fongobe S. de R.L. de C.V. (no solo garantia corporativa FPT Holdings). BCD calculado ya vencido (29-sep-2026).'
    }
    [PSCustomObject]@{
        NombreClub = 'Gransur, CDMX'
        PfClubId = '5784'
        Direccion = 'Avenida Periferico 5550 Local L-53, Colonia Pedregal de Carrasco, Alcaldia de Coyoacan, Ciudad de Mexico, C.P. 04700'
        FechaFirma = '2025-11-11'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = 'Gransur'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'Contraparte/garante no confirmados (pagina de firma escaneada). BCD vence en pocos dias (7-oct-2026), confirmar si ya abrio.'
    }
    [PSCustomObject]@{
        NombreClub = 'Guadalajara (Rancho Nuevo) / Estadio Guadalajara, JAL'
        PfClubId = '5666'
        Direccion = 'Calzada Independencia Norte y Eutimio Pizon 2955, Colonia Rancho Nuevo Primera Seccion, C.P. 44240, Guadalajara, Jalisco'
        FechaFirma = '2025-09-09'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '81012982'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'BCD calculado ya vencido (5-ago-2026), confirmar si ya abrio.'
    }
    [PSCustomObject]@{
        NombreClub = 'Guadalupe (Arcadia), NL'
        PfClubId = '2595'
        Direccion = 'Plaza Arcadia, Ave Eloy Cavazos #3301, Suite 21, Colonia Camino Real, Guadalupe, Nuevo Leon, C.P. 67170'
        FechaFirma = '2023-12-28'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = 'Guadalupe'
        Key2 = 'Arcadia'
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'Colonia del PDF (Camino Real) difiere del Excel (15 de Mayo); verificar. Existe addendum ''Guadalupe (Arcadia) NL AA'' relacionado, no leido.'
    }
    [PSCustomObject]@{
        NombreClub = 'Laureles, GTO'
        PfClubId = '5668'
        Direccion = 'Blvd Juan Jose Torres Landa 3304-3314, Fraccionamiento Los Laureles, Leon, Guanajuato, C.P. 37446'
        FechaFirma = '2026-09-23'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = 'Laureles'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'No esta en el Excel maestro (club nuevo). Fecha de firma y garantia de baja confianza, pagina de firma/apendices totalmente ilegibles; se uso la fecha del nombre del archivo.'
    }
    [PSCustomObject]@{
        NombreClub = 'Leon (Parque Vertice), GTO'
        PfClubId = '5557'
        Direccion = 'Boulevard Rio Mayo 6001, Colonia Sur Loma Hermosa, Leon, Guanajuato, C.P. 37530'
        FechaFirma = '2025-09-09'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '81012986'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'Domicilio del PDF (Rio Mayo 6001, Sur Loma Hermosa) difiere del Excel (Rio Mayo 5985, Cerrito Jerez); se uso el del PDF. BCD calculado ya vencido (5-ago-2026).'
    }
    [PSCustomObject]@{
        NombreClub = 'Malecon Las Americas, ROO'
        PfClubId = '5620'
        Direccion = 'Avenida Bonampak, Sm. 06, Mz. 01, lt.01, Local A-09, Benito Juarez, Quintana Roo, C.P. 77500'
        FechaFirma = '2025-11-03'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = 'ROO'
        Key2 = '11.03'
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'BCD calculado ya vencido (29-sep-2026), normal si ya abrio.'
    }
    [PSCustomObject]@{
        NombreClub = 'Mazatlan (La Gran Plaza), SIN'
        PfClubId = '5193'
        Direccion = 'Av. Reforma y Apolo s/n Zona E altos, Colonia Alameda, C.P. 82123, Mazatlan, Sinaloa'
        FechaFirma = '2025-03-24'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = 'Gran Plaza'
        Key2 = 'SIN'
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'Nombre de colonia truncado en el PDF (''Colonia A''); se completo con el del Excel (Alameda).'
    }
    [PSCustomObject]@{
        NombreClub = 'Merida (Plaza Harbor), YUC'
        PfClubId = '5614'
        Direccion = 'Calle 60, Av. Prolongacion Paseo Montejo 1, Local, Merida, Yucatan, C.P. 97204'
        FechaFirma = '2025-09-09'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '81012956'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'BCD calculado ya vencido (5-ago-2026), normal si ya abrio.'
    }
    [PSCustomObject]@{
        NombreClub = 'Merida (Yucalpeten / Canek), YUC'
        PfClubId = '5673'
        Direccion = 'Av. Jacinto Canek y calle 128 numero 277, Merida, Yucatan, C.P. 97248'
        FechaFirma = '2025-09-09'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '81012971'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'CP del PDF (97248) difiere del Excel (97227); se uso el del PDF. BCD calculado ya vencido.'
    }
    [PSCustomObject]@{
        NombreClub = 'Multiplaza Las Palmas, GRO'
        PfClubId = '5781'
        Direccion = 'Blvd. de las Naciones 802, Local 56AM, Fraccionamiento Granjas del Marquez, Acapulco de Juarez, Guerrero, C.P. 39890'
        FechaFirma = '2025-11-11'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = 'Multiplaza'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'ALERTA: domicilio del Excel maestro (Cancun, Q. Roo) NO corresponde al club real segun el PDF (Acapulco, Guerrero); se uso el del PDF, el Excel maestro parece tener esta fila mal cargada, verificar. BCD vence en pocos dias (7-oct-2026).'
    }
    [PSCustomObject]@{
        NombreClub = 'Oaxaca (Col del Maestro), OAX'
        PfClubId = '5961'
        Direccion = 'Carretera Cristobal Colon Lote 1 S/N, Santa Rosa Panzacola, Oaxaca de Juarez, Oaxaca, C.P. 68039'
        FechaFirma = '2026-09-16'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = 'Oaxaca'
        Key2 = '09162026'
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'No esta en el Excel maestro (club nuevo). Fecha de firma inferida del nombre de archivo (pagina de firma escaneada, no confirmada en texto).'
    }
    [PSCustomObject]@{
        NombreClub = 'Playa del Carmen (Mision las Flores), ROO'
        PfClubId = '5810'
        Direccion = 'Av. Constituyentes S/N Lote 002-2 Mz 184, Municipio Solidaridad, Playa del Carmen, Quintana Roo, C.P. 77723'
        FechaFirma = '2026-08-28'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = 'Playa del Carmen'
        Key2 = '09162026'
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'No esta en el Excel maestro (club nuevo).'
    }
    [PSCustomObject]@{
        NombreClub = 'Plaza Torrecillas, PUE'
        PfClubId = '4313'
        Direccion = 'Av. Municipio Libre y calle Nayarit No 555, Colonia Infonavit Loma Bella, Puebla, Puebla, C.P. 72490'
        FechaFirma = '2021-12-03'
        CuotaInicial = 20000
        RegaliasPorcentaje = 1.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = 'Torrecillas'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'Plantilla antigua (2021): cuota US$20,000 y regalias fijas 1.5% (no 4.5% escalonado). Domicilio del PDF difiere del Excel (calle/colonia); se uso el del PDF.'
    }
    [PSCustomObject]@{
        NombreClub = 'Punto Sur, JAL'
        PfClubId = '5719'
        Direccion = 'Av. Paseo Punto Sur No. 235/312, Local LN202, Colonia Los Gavilanes, C.P. 45645, Tlajomulco de Zuniga, Jalisco'
        FechaFirma = '2025-09-22'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = 'Punto Sur'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'Discrepancia de fecha: referencia/nombre de archivo dice 3-nov-2025, el PDF (Acknowledgment Addendum) dice 22-sep-2025; se uso la del PDF, verificar. BCD calculado ya vencido.'
    }
    [PSCustomObject]@{
        NombreClub = 'Saltillo (Echeverria), COA'
        PfClubId = '5981'
        Direccion = 'Boulevard Luis Echeverria 6301, Colonia San Ramon, Saltillo, Coahuila, C.P. 25025'
        FechaFirma = '2026-08-28'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = 'Saltillo'
        Key2 = '09162026'
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'No esta en el Excel maestro (club nuevo, distinto al ''Saltillo Santa Isabel''). Texto con errores de OCR en el domicilio, verificar.'
    }
    [PSCustomObject]@{
        NombreClub = 'Saltillo (Santa Isabel), COA'
        PfClubId = '2837'
        Direccion = 'Plaza Santa Isabel, Blvd Nazario Ortiz 2060, Fraccionamiento Tanque de la Pena, Saltillo, Coahuila, C.P. 25203'
        FechaFirma = '2023-12-21'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Jeg-Mexico Bueno, S. de R.L. de C.V.'
        Key1 = 'Santa Isabel'
        Key2 = 'CH FA'
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'Franquiciatario legal es Jeg-Mexico Bueno, S. de R.L. de C.V. (no FPT directamente); garante sigue siendo FPT Holdings. Existe addendum ''CH AA'' relacionado, no leido.'
    }
    [PSCustomObject]@{
        NombreClub = 'Santa Catarina, NL'
        PfClubId = '1938'
        Direccion = '899-A Avenida Manuel J. Clouthier, Santa Catarina, Nuevo Leon, C.P. 66120'
        FechaFirma = '2023-12-21'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Jeg-Mexico Bueno, S. de R.L. de C.V.'
        Key1 = 'Santa Catarina'
        Key2 = 'NL FA'
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'Franquiciatario legal es Jeg-Mexico Bueno, S. de R.L. de C.V. (no FPT directamente). Discrepancia de fecha: referencia dice 28-sep-23, el PDF dice dic-2023; se uso la del PDF. Existe addendum ''NL AA'' relacionado, no leido.'
    }
    [PSCustomObject]@{
        NombreClub = 'Tlaquepaque (Celta), JAL'
        PfClubId = '4569'
        Direccion = 'Av. Periferico Sur #7887, Delegacion Santa Maria Tequepexpan, Tlaquepaque, Jalisco, C.P. 45601'
        FechaFirma = '2025-08-28'
        CuotaInicial = 0
        RegaliasPorcentaje = 4.5
        Parte = 'Fitness Para Todos, S. de R.L. de C.V.'
        Key1 = '81012978'
        Key2 = ''
        FechaFinFija = $null
        SinBCD = $false
        Nota = 'Discrepancia de fecha: referencia dice 9-sep-2025, el PDF dice 28-ago-2025; se uso la del PDF. BCD calculado ya vencido.'
    }
)
$creados = 0
$saltados = @()

foreach ($club in $clubesLote2) {

    Write-Host ""
    Write-Host "=== $($club.NombreClub) (PF Club #$($club.PfClubId)) ===" -ForegroundColor Cyan

    # Buscar el PDF por palabras clave (varios archivos de este lote tienen el nombre
    # desfasado respecto al club real -- ver notas en el encabezado del script).
    $candidatos = Get-ChildItem -Path $carpetaPdfs -File -Filter "*.pdf" | Where-Object {
        $_.Name -like "*$($club.Key1)*" -and ($club.Key2 -eq "" -or $_.Name -like "*$($club.Key2)*")
    }

    if ($candidatos.Count -eq 0) {
        Write-Host "No encontre ningun PDF que coincida con Key1='$($club.Key1)' Key2='$($club.Key2)'." -ForegroundColor Red
        Write-Host "Saltando este club. Revisa el nombre del archivo en la carpeta." -ForegroundColor Red
        $saltados += $club.NombreClub
        continue
    }
    if ($candidatos.Count -gt 1) {
        Write-Host "Encontre mas de un PDF que coincide ($($candidatos.Count)), uso el primero: $($candidatos[0].Name)" -ForegroundColor Yellow
    }
    $rutaPdf = $candidatos[0].FullName
    Write-Host "PDF encontrado: $($candidatos[0].Name)"

    # 1. Buscar o crear el club en el catalogo.
    $clubesResp = Invoke-RestMethod -Uri "$apiBase/clubes" -Headers $headers -Method Get
    $clubExistente = $clubesResp.clubes | Where-Object { $_.nombre -eq $club.NombreClub }

    if ($clubExistente) {
        $clubId = $clubExistente.id
        Write-Host "Club ya existia en el catalogo: $($club.NombreClub)"
    } else {
        $nuevoClubBody = @{ nombre = $club.NombreClub; direccion = $club.Direccion } | ConvertTo-Json
        $nuevoClub = Invoke-RestMethod -Uri "$apiBase/clubes" -Headers $headers -Method Post -Body $nuevoClubBody -ContentType "application/json"
        $clubId = $nuevoClub.club.id
        Write-Host "Club creado en el catalogo: $($club.NombreClub)"
    }

    # 2. Calcular fecha de fin y fecha limite de apertura.
    $fechaInicioDt = [datetime]::ParseExact($club.FechaFirma, "yyyy-MM-dd", $null)
    if ($club.FechaFinFija) {
        $fechaFin = $club.FechaFinFija
    } else {
        $fechaFin = $fechaInicioDt.AddYears(10).ToString("yyyy-MM-dd")
    }
    if (-not $club.SinBCD) {
        $fechaLimiteApertura = $fechaInicioDt.AddDays(330).ToString("yyyy-MM-dd")
    } else {
        $fechaLimiteApertura = $null
    }

    $descripcion = "Franchise Agreement historico de $($club.NombreClub) (PF Club #$($club.PfClubId)), firmado $($club.FechaFirma)."
    if ($club.Nota -ne "") {
        $descripcion = "$descripcion NOTA: $($club.Nota)"
    }

    # 3. Crear el contrato (draft -> nace directo en 'activo' por ser franquicia).
    $contratoBody = @{
        titulo               = "Contrato de Franquicia - $($club.NombreClub) (PF Club #$($club.PfClubId))"
        tipoContratoId       = $tipoFranquicia.id
        parte                = $club.Parte
        contraparteNombre    = $contraparteNombre
        contraparteContacto  = $contraparteContacto
        monto                = 0
        moneda               = "USD"
        fechaInicio          = $club.FechaFirma
        fechaFin             = $fechaFin
        renovacionAutomatica = $false
        diasAvisoVencimiento = 90
        descripcion          = $descripcion
    } | ConvertTo-Json

    $contratoResp = Invoke-RestMethod -Uri "$apiBase/contratos" -Headers $headers -Method Post -Body $contratoBody -ContentType "application/json"
    $contratoId = $contratoResp.contrato.id
    $folio = $contratoResp.contrato.folio
    Write-Host "Contrato creado: $folio (estatus: $($contratoResp.contrato.estatus))"

    # 4. Llenar los datos de franquicia.
    $franquiciaBody = @{
        clubId                       = $clubId
        cuotaInicial                 = $club.CuotaInicial
        regaliasPorcentaje           = $club.RegaliasPorcentaje
        fondoMercadeoPorcentaje      = 9
        periodicidadPagoRegalias     = "mensual"
        territorio                  = $territorio
        direccionPunto               = $club.Direccion
        numeroRenovacionesPermitidas = 1
        condicionesRenovacion        = $condicionesRenovacion
        polizasSeguroRequeridas      = $polizas
        garantiaPersonal             = $false
        garanteNombre                = $garante
    }
    if ($fechaLimiteApertura) {
        $franquiciaBody["fechaLimiteApertura"] = $fechaLimiteApertura
    }
    $franquiciaBodyJson = $franquiciaBody | ConvertTo-Json

    Invoke-RestMethod -Uri "$apiBase/contratos/$contratoId/franquicia" -Headers $headers -Method Put -Body $franquiciaBodyJson -ContentType "application/json" | Out-Null
    Write-Host "Datos de franquicia guardados."

    # 5. Subir el PDF firmado (se enruta solo a SharePoint).
    $httpClient = New-Object System.Net.Http.HttpClient
    $httpClient.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $token)

    $multipart = New-Object System.Net.Http.MultipartFormDataContent
    $fileStream = [System.IO.File]::OpenRead($rutaPdf)
    $fileContent = New-Object System.Net.Http.StreamContent($fileStream)
    $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("application/pdf")
    $multipart.Add($fileContent, "archivo", [System.IO.Path]::GetFileName($rutaPdf))
    $multipart.Add((New-Object System.Net.Http.StringContent("version_firmada")), "categoria")

    $uploadResult = $httpClient.PostAsync("$apiBase/contratos/$contratoId/documentos", $multipart).Result
    $fileStream.Close()

    if ($uploadResult.IsSuccessStatusCode) {
        Write-Host "PDF subido correctamente (se enruta solo a SharePoint)." -ForegroundColor Green
        $creados++
    } else {
        $errorBody = $uploadResult.Content.ReadAsStringAsync().Result
        Write-Host "Error subiendo el PDF: $($uploadResult.StatusCode) $errorBody" -ForegroundColor Red
    }

    $httpClient.Dispose()
}

Write-Host ""
Write-Host "Listo. $creados de $($clubesLote2.Count) clubes procesados correctamente." -ForegroundColor Green
if ($saltados.Count -gt 0) {
    Write-Host "No se encontraron PDFs para estos clubes (revisa el nombre del archivo):" -ForegroundColor Yellow
    $saltados | ForEach-Object { Write-Host " - $_" -ForegroundColor Yellow }
}
