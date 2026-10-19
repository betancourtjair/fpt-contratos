"""
Constancia de membresía — Zenoti (Planet Fitness México / FPT)

Busca a un socio en Zenoti vía API y genera:
  1. Un PDF "Constancia de membresía" con los datos del socio, sus membresías,
     la factura de venta y si el acuerdo digital fue llenado/firmado.
  2. Un JSON con la respuesta cruda de la API (respaldo / auditoría).
  3. Un inventario CSV cuando se procesan varios socios.

La API de Zenoti NO entrega el PDF del acuerdo firmado; la constancia incluye
la liga al perfil del socio en Zenoti para descargarlo desde ahí.

Uso:
  set ZENOTI_API_KEY=xxxxx          (Windows)   |   export ZENOTI_API_KEY=xxxxx (Mac/Linux)
  python constancia_socio.py --email socio@correo.com
  python constancia_socio.py --telefono 5512345678
  python constancia_socio.py --codigo 000123
  python constancia_socio.py --nombre "Juan" --apellido "Pérez"
  python constancia_socio.py --lote socios.csv     (columnas: email,telefono,codigo,nombre,apellido)
  python constancia_socio.py --listar-clubes

Requisitos:  pip install reportlab

Creado por Jair Betancourt
"""
import argparse, csv, datetime as dt, json, os, sys, time, urllib.parse, urllib.request, urllib.error

API = "https://api.zenoti.com/v1"
ADMIN_URL = "https://planetfitnessmx.zenoti.com"
# Liga al perfil del socio en Zenoti (confirmar el formato con la primera prueba).
PERFIL_URL = ADMIN_URL + "/Guests/GuestProfile.aspx?UserId={guest_id}"
# Visor del contrato firmado (requiere tener sesión abierta en Zenoti en el navegador).
CONTRATO_URL = (ADMIN_URL + "/Appointment/AppointmentCustomDataV2.aspx?InvoiceItemId={item}"
                "&UserId={guest_id}&FormType=15&FormId={form}&NoHeader=1&Source=0&ViewOnly=1")
CONTRATO_FORM_ID = "89544786-8A2C-48C9-B0B2-98BD8DF32AB6"   # formulario "Contrato" (En línea - Inscribirse)
# Estatus numéricos observados en Zenoti (se completa conforme aparezcan otros)
ESTATUS = {5: "Caducado", 8: "Suspendido"}
SALIDA = "constancias"


# ---------------------------------------------------------------- API ----
def _key():
    k = os.environ.get("ZENOTI_API_KEY", "").strip()
    if not k:
        sys.exit("Falta la variable de entorno ZENOTI_API_KEY.")
    return k


def api_get(path, params=None, intentos=5):
    q = "?" + urllib.parse.urlencode({k: v for k, v in (params or {}).items() if v not in (None, "")}) if params else ""
    req = urllib.request.Request(API + path + q, headers={
        "Authorization": "apikey " + _key(), "Accept": "application/json"})
    for i in range(intentos):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8") or "{}")
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503, 504) and i < intentos - 1:
                time.sleep(2 ** i)  # límite de peticiones: espera y reintenta
                continue
            cuerpo = e.read().decode("utf-8", "ignore")[:400]
            raise RuntimeError(f"HTTP {e.code} en {path}: {cuerpo}")
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            if i < intentos - 1:
                time.sleep(2 ** i)  # falla de red momentánea: espera y reintenta
                continue
            sys.exit(f"\nNo hay conexión con api.zenoti.com ({e}).\n"
                     "Revisa tu internet/VPN y vuelve a intentar.")
    return {}


def g(d, *names, default=None):
    """Obtiene un campo sin importar mayúsculas/guiones (la API mezcla estilos)."""
    if not isinstance(d, dict):
        return default
    norm = {k.lower().replace("_", ""): v for k, v in d.items()}
    for n in names:
        v = norm.get(n.lower().replace("_", ""))
        if v not in (None, ""):
            return v
    return default


def clubes():
    data = api_get("/centers")
    return data.get("centers", data if isinstance(data, list) else [])


def api_call(method, path, params=None, body=None):
    """Llamada simple (sin reintentos) que regresa (status, json|texto). Para pruebas de endpoints."""
    q = "?" + urllib.parse.urlencode(params) if params else ""
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(API + path + q, data=data, method=method, headers={
        "Authorization": "apikey " + _key(), "Accept": "application/json",
        "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            txt = r.read().decode("utf-8", "ignore")
            status = r.status
    except urllib.error.HTTPError as e:
        txt, status = e.read().decode("utf-8", "ignore"), e.code
    except (urllib.error.URLError, OSError) as e:
        return 0, str(e)
    try:
        return status, json.loads(txt or "{}")
    except ValueError:
        return status, txt[:2000]


def galeria_socio(guest_id, center_id):
    """EXPERIMENTAL: intenta obtener los archivos de la Galería del socio (socios migrados).
    Prueba varios endpoints; regresa (bitácora, [urls de PDF encontradas])."""
    intentos = [
        ("POST", "/photo_management/global_gallery/files/flat_file", None,
         {"guest_ids": [guest_id], "center_ids": [center_id], "page": 1, "size": 50}),
        ("POST", "/photo_management/global_gallery/files/flat_file", None,
         {"guest_id": guest_id, "center_id": center_id, "page": 1, "size": 50}),
        ("POST", "/photo_management/global_gallery/files/grouped_data/flat_file", None,
         {"guest_ids": [guest_id], "center_ids": [center_id], "page": 1, "size": 50}),
        ("GET", "/photo_management/global_gallery/filters", None, None),
        ("GET", f"/guests/{guest_id}/gallery", {"center_id": center_id}, None),
        ("GET", f"/guests/{guest_id}/files", {"center_id": center_id}, None),
        ("GET", f"/guests/{guest_id}/documents", {"center_id": center_id}, None),
    ]
    bitacora, urls = [], []
    for metodo, ruta, params, body in intentos:
        st, resp = api_call(metodo, ruta, params, body)
        bitacora.append({"metodo": metodo, "ruta": ruta, "body": body, "status": st, "respuesta": resp})
        texto = json.dumps(resp) if not isinstance(resp, str) else resp
        for u in __import__("re").findall(r'https://[^"\\\s]+?\.pdf[^"\\\s]*', texto):
            if u not in urls:
                urls.append(u)
    return bitacora, urls


def descargar(url, ruta):
    """Descarga un archivo público/temporal (SAS) sin enviar la API key."""
    with urllib.request.urlopen(urllib.request.Request(url), timeout=120) as r, open(ruta, "wb") as f:
        f.write(r.read())


# ------------------------------------------------ navegador (migrados) ----
PERFIL_NAVEGADOR = os.path.join(os.path.expanduser("~"), ".zenoti_constancias_navegador")
_NAV = {}


def _navegador():
    """Abre (una sola vez) Chrome/Edge con un perfil propio donde queda guardada la sesión de Zenoti."""
    if "ctx" in _NAV:
        return _NAV["ctx"]
    from playwright.sync_api import sync_playwright
    pw = sync_playwright().start()
    ultimo = None
    for canal in ("chrome", "msedge", None):
        try:
            ctx = pw.chromium.launch_persistent_context(
                PERFIL_NAVEGADOR, channel=canal, headless=False, accept_downloads=True, bypass_csp=True,
                viewport={"width": 1400, "height": 900})
            break
        except Exception as e:
            ultimo, ctx = e, None
    if ctx is None:
        raise RuntimeError(f"No se pudo abrir Chrome/Edge: {ultimo}")
    _NAV.update(pw=pw, ctx=ctx)
    return ctx


def cerrar_navegador():
    if "ctx" in _NAV:
        try:
            _NAV["ctx"].close(); _NAV["pw"].stop()
        except Exception:
            pass
        _NAV.clear()


def contrato_migrado_navegador(guest_id, base):
    """Abre el perfil del socio en Zenoti, entra a Galería y descarga los PDF de 'Archivos de invitados'.
    Regresa la lista de archivos guardados."""
    import re
    ctx = _navegador()
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    url = PERFIL_URL.format(guest_id=guest_id)
    page.goto(url, wait_until="domcontentloaded", timeout=90000)
    if "GuestProfile" not in page.url or page.locator("input[type=password]").count():
        print("\n  >> Inicia sesión en Zenoti en la ventana del navegador que se abrió.")
        input("  >> Cuando veas Zenoti ya dentro, regresa aquí y presiona Enter... ")
        page.goto(url, wait_until="domcontentloaded", timeout=90000)
    # Pestaña Galería (Zenoti la carga con un postback de ASP.NET)
    pestana = page.locator("a", has_text=re.compile(r"^\s*Galer\S*\s*$")).first
    pestana.wait_for(state="attached", timeout=60000)
    with page.expect_navigation(wait_until="domcontentloaded", timeout=90000):
        try:
            pestana.click(timeout=10000)
        except Exception:
            pestana.dispatch_event("click")
    try:
        page.wait_for_selector("a:has-text('Mostrar archivo')", timeout=45000)
    except Exception:
        return []
    archivos = []   # sin evaluar JavaScript propio (Zenoti lo bloquea con su política CSP)
    tarjetas = page.locator(".FileUploadElementGuest")
    for i in range(tarjetas.count()):
        t = tarjetas.nth(i)
        liga = t.locator("a", has_text="Mostrar archivo")
        if liga.count():
            href = urllib.parse.urljoin(page.url, liga.first.get_attribute("href") or "")
            archivos.append({"href": href, "texto": " ".join((t.inner_text() or "").split())})
    pdfs = [f for f in archivos if ".pdf" in f["href"].split("?")[0].lower()]
    # primero los del sistema anterior (nombre que inicia con el número de club, p. ej. 3206_...)
    pdfs.sort(key=lambda f: not re.search(r"\b\d{4}_", f["texto"]))
    guardados = []
    for k, f in enumerate(pdfs, 1):
        destino = os.path.join(SALIDA, f"{base}_contrato{'' if k == 1 else '_' + str(k)}.pdf")
        r = ctx.request.get(f["href"], timeout=120000)
        if r.ok:
            with open(destino, "wb") as fh:
                fh.write(r.body())
            guardados.append(os.path.basename(destino))
    return guardados


def buscar_socio(center_id=None, **filtros):
    """Busca en un club; si no se indica, busca en toda la zona y luego club por club."""
    base = {"size": 100, **filtros}
    lista = clubes()
    if center_id:
        lista = [c for c in lista if g(c, "id") == center_id] or [{"id": center_id}]
    # 1) intento rápido: búsqueda a nivel zona
    if lista and not center_id:
        r = api_get("/guests/search", {**base, "center_id": g(lista[0], "id"), "search_across_zone": "true"})
        if r.get("guests"):
            return r["guests"]
    # 2) club por club
    for c in lista:
        r = api_get("/guests/search", {**base, "center_id": g(c, "id")})
        if r.get("guests"):
            return r["guests"]
    return []


def socio_por_id(guest_id):
    """Ficha del socio por su GuestId (se usa al buscar por número de factura)."""
    r = api_get(f"/guests/{guest_id}")
    return g(r, "guest", default=None) or (r if g(r, "id") else None)


def membresias(guest_id, center_id):
    r = api_get(f"/guests/{guest_id}/memberships", {"center_id": center_id, "is_active": -1})
    return r.get("memberships", r.get("guest_memberships", []))


def detalle_factura(invoice_id, center_id):
    """Detalle de una factura con sus conceptos (se guarda en el JSON para diagnóstico)."""
    for params in ({"expand": "InvoiceItems"}, {"expand": "InvoiceItems", "center_id": center_id}):
        try:
            return api_get(f"/invoices/{invoice_id}", params)
        except RuntimeError as e:
            err = str(e)
    return {"error": err}


def invoice_item_de_factura(m, center_id):
    """InvoiceItemId que usa Zenoti para el contrato: el concepto de la membresía en la
    factura de la VENTA ORIGINAL (primera factura del historial), no en la de la última renovación."""
    inv = g(m, "invoice", default={}) or {}
    pv = primera_venta(m)
    invoice_id = g(g(pv, "invoice", default={}) or {}, "id") or g(inv, "id")
    if not invoice_id:
        return None
    det = detalle_factura(invoice_id, center_id)
    m["_detalle_factura"] = det           # respaldo en el .json
    items = [it for it in (buscar_lista(det, "invoiceitems") or buscar_lista(det, "items") or [])
             if isinstance(it, dict)]
    membresia = g(m, "membership", default={}) or {}
    plan_id = str(g(membresia, "id", default="")).lower()
    plan = str(g(membresia, "name", default="")).lower()
    # concepto de la misma membresía (mismo id de catálogo o mismo nombre)
    for it in items:
        if (plan_id and str(g(it, "id", default="")).lower() == plan_id) or \
           (plan and str(g(it, "name", default="")).lower() == plan):
            v = g(it, "invoice_item_id", "invoiceitemid")
            if v:
                return str(v).upper()
    return g(inv, "item_id")


def buscar_lista(obj, clave):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k.lower().replace("_", "") == clave and isinstance(v, list):
                return v
        for v in obj.values():
            r = buscar_lista(v, clave)
            if r:
                return r
    return None


# ------------------------------------------------------------ helpers ----
def fecha(v):
    if not v:
        return "—"
    s = str(v)
    for f, n in (("%Y-%m-%dT%H:%M:%S", 19), ("%Y-%m-%d", 10)):
        try:
            return dt.datetime.strptime(s[:n], f).strftime("%d/%m/%Y")
        except ValueError:
            pass
    return s


def si_no(v):
    if v is None:
        return "No disponible"
    return "Sí" if str(v).lower() in ("true", "1", "yes") else "No"


def resumen_socio(guest):
    pi = g(guest, "personal_info", default={}) or {}
    tel = g(pi, "mobile_phone", default={})
    tel = g(tel, "number", "display_number", default="") if isinstance(tel, dict) else tel
    return {
        "guest_id": g(guest, "id"),
        "center_id": g(guest, "center_id"),
        "codigo": g(guest, "code", "user_code", default="—"),
        "nombre": f"{g(pi, 'first_name', default='')} {g(pi, 'last_name', default='')}".strip() or "—",
        "email": g(pi, "email", default="—"),
        "telefono": tel or "—",
        "alta": fecha(g(guest, "created_date", "creation_date")),
    }


def resumen_membresia(m):
    info = g(m, "membership", default={}) or {}
    inv = g(m, "invoice", default={}) or {}
    invd = g(m, "GuestMembershipInvoiceDetails", default={}) or {}
    if isinstance(invd, list):
        invd = invd[0] if invd else {}
    return {
        "membresia_id": g(m, "user_membership_id", "id", default="—"),
        "plan": g(info, "name", "display_name", default=g(m, "name", default="—")),
        "estatus": texto_estatus(g(m, "status")),
        "club_venta": g(m, "SaleCenterName", "sale_center_name") or NOMBRES_CLUB.get(str(g(m, "invoice_center_id", default="")).lower(), "—"),
        "fecha_venta": fecha(primera_venta(m).get("sale_date") or g(invd, "InvoiceDate") or g(m, "member_since")),
        "primer_cobro": fecha(g(m, "first_collection_date")),
        "proximo_cobro": fecha(g(m, "next_collection_date")),
        "vencimiento": fecha(g(m, "expiry_date")),
        "factura": g(inv, "invoice_no", "invoice_number", "receipt_no", default=g(invd, "InvoiceId", default="—")),
        "acuerdo_digital": si_no(g(m, "HasMembershipDigitalForm")),
        "invoice_item_id": None,
        "factura_venta": g(g(primera_venta(m), "invoice", default={}) or {}, "no", default="—"),
        "es_transferencia": es_transferencia(m),
    }


def _orden_fecha(m):
    try:
        return dt.datetime.strptime(m.get("fecha_venta", ""), "%d/%m/%Y")
    except ValueError:
        return dt.datetime.min


def candidatos_contrato(mems):
    """Membresías que pueden tener el contrato firmado, de la más probable a la menos:
    primero las ventas nuevas más recientes; al final transferencias (por si acaso)."""
    cand = [m for m in mems if m.get("invoice_item_id") and m.get("acuerdo_digital") == "Sí"
            and not any(w in str(m.get("plan", "")).lower() for w in ("setup", "inscrip"))]
    orden = sorted(enumerate(cand), key=lambda t: (not t[1].get("es_transferencia"), _orden_fecha(t[1]), -t[0]),
                   reverse=True)
    return [m for _, m in orden]


def contrato_principal(mems):
    """Membresía con el contrato firmado. Si el navegador ya verificó la firma, usa esa;
    si no, la venta más reciente que no sea transferencia ni cuota de inscripción."""
    for m in mems:
        if m.get("firma_verificada"):
            return m
    cand = [m for m in candidatos_contrato(mems) if not m.get("es_transferencia")]
    return cand[0] if cand else None


def buscar_clave(obj, clave):
    """Busca recursivamente un campo (p. ej. invoice_item_id) en la respuesta de la API."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k.lower().replace("_", "") == clave and v:
                return str(v)
        for v in obj.values():
            r = buscar_clave(v, clave)
            if r:
                return r
    elif isinstance(obj, list):
        for v in obj:
            r = buscar_clave(v, clave)
            if r:
                return r
    return None


NOMBRES_CLUB = {}
USAR_NAVEGADOR = True    # socios migrados: descargar contrato de Galería con el navegador
PROBAR_GALERIA = False   # --probar-galeria: intenta bajar el contrato de migrados (hoy la API responde 401)


def primera_venta(m):
    hist = [h for h in (g(m, "historical_invoices", default=[]) or []) if isinstance(h, dict) and h.get("sale_date")]
    return min(hist, key=lambda h: h["sale_date"]) if hist else {}


def es_migrado(socio):
    """Socios migrados del sistema anterior: su código empieza con 4 dígitos (p. ej. 3206-0936864)."""
    import re
    return bool(re.match(r"^\d{4}", str(socio.get("codigo", ""))))


def es_transferencia(m):
    """Transferencia de club: la primera factura de la membresía es por $0 (no hubo venta nueva)."""
    pv = primera_venta(m)
    return bool(pv) and float(pv.get("price_paid") or 0) == 0 and float(pv.get("price") or 0) == 0


def texto_estatus(v):
    try:
        n = int(v)
        return f"{ESTATUS[n]}" if n in ESTATUS else f"Código {n}"
    except (TypeError, ValueError):
        return v or "—"


# ---------------------------------------------------------------- PDF ----
def generar_pdf(ruta, socio, mems):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

    st = getSampleStyleSheet()
    h = ParagraphStyle("h", parent=st["Title"], fontSize=16, spaceAfter=4)
    s = ParagraphStyle("s", parent=st["Normal"], fontSize=9, textColor=colors.grey)
    n = ParagraphStyle("n", parent=st["Normal"], fontSize=10, leading=14)
    sec = ParagraphStyle("sec", parent=st["Heading3"], spaceBefore=10)
    ahora = dt.datetime.now().strftime("%d/%m/%Y %H:%M")

    def liga(socio, m):  # & escapado para el marcado de reportlab
        return CONTRATO_URL.replace("&", "&amp;").format(item=m["invoice_item_id"], guest_id=socio["guest_id"], form=CONTRATO_FORM_ID)

    def ligas_contrato(socio, m):
        if not m.get("invoice_item_id"):
            return Paragraph("—", n)
        return Paragraph(f'<link href="{liga(socio, m)}" color="blue"><u>Ver contrato</u></link>', n)

    def tabla(filas, anchos):
        t = Table(filas, colWidths=anchos)
        t.setStyle(TableStyle([
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F1F1F4")),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CCCCCC")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ]))
        return t

    el = [Paragraph("Constancia de membresía", h),
          Paragraph(f"Generada el {ahora} a partir del sistema Zenoti (Planet Fitness México)", s),
          Spacer(1, 8),
          Paragraph("Datos del socio", sec),
          tabla([["Nombre", socio["nombre"]], ["Código de socio", socio["codigo"]],
                 ["Correo", socio["email"]], ["Teléfono", socio["telefono"]],
                 ["ID Zenoti", socio["guest_id"]], ["Alta en sistema", socio["alta"]]],
                [4.5 * cm, 12 * cm])]

    perfil = PERFIL_URL.format(guest_id=socio["guest_id"])
    principal = None if es_migrado(socio) else contrato_principal(mems)
    if es_migrado(socio):
        bloque = [Paragraph("<b>Socio migrado</b> (código numérico). Su contrato es un PDF cargado en la "
                            "<b>Galería</b> del perfil del socio (archivo que inicia con el número de club, "
                            "p. ej. <i>3206_…pdf</i>).", n),
                  *([Paragraph(f"<b>Contrato descargado automáticamente:</b> {socio['contrato_descargado']} "
                               "(en la misma carpeta que esta constancia).", n)] if socio.get("contrato_descargado") else []),
                  Paragraph(f'1) Abrir el perfil: <link href="{perfil}" color="blue"><u>{perfil}</u></link>', n),
                  Paragraph("2) Pestaña <b>Galería</b> → sección <i>Archivos de invitados</i> → "
                            "<b>Mostrar archivo</b> → descargar el PDF.", n)]
    elif principal:
        url = liga(socio, principal)
        bloque = [Paragraph(f"Membresía <b>{principal['plan']}</b> · factura de venta "
                            f"{principal['factura_venta']} · club {principal['club_venta']} · "
                            f"venta {principal['fecha_venta']}", n),
                  Spacer(1, 4),
                  *([Paragraph(f"<b>Contrato adjunto:</b> {socio['contrato_descargado']} "
                               "(firma del socio verificada).", n)] if socio.get("contrato_descargado") else []),
                  Paragraph(f'<link href="{url}" color="blue"><u><b>ABRIR CONTRATO FIRMADO</b></u></link>', n),
                  Paragraph(f'<font size="7" color="grey">{url}</font>', n)]
    else:
        bloque = [Paragraph("No se pudo identificar el contrato desde la API; usar la consulta manual (al final).", n)]
    el += [Paragraph("Contrato firmado", sec), *bloque,
           Paragraph("Requiere sesión iniciada en Zenoti. Para guardarlo en PDF: Ctrl+P → Guardar como PDF.", s)]

    if not mems:
        el += [Spacer(1, 8), Paragraph("El socio no tiene membresías registradas.", n)]
    for i, m in enumerate(mems, 1):
        marca = "  ← contrato firmado" if m is principal else ""
        el += [Paragraph(f"Membresía {i}: {m['plan']}{marca}", sec),
               tabla([["Estatus", m["estatus"]], ["Club de venta", m["club_venta"]],
                      ["Fecha de venta", m["fecha_venta"]], ["Factura de venta", m["factura_venta"]],
                      ["Último recibo", m["factura"]], ["Próximo cobro", m["proximo_cobro"]],
                      ["Vencimiento", m["vencimiento"]], ["ID de membresía", m["membresia_id"]]],
                     [4.5 * cm, 12 * cm])]

    el += [Spacer(1, 12),
           Paragraph("Consulta manual: abrir el perfil "
                     f'del socio (<link href="{perfil}" color="blue">{perfil}</link>), pestaña '
                     "<b>Planes</b> → columna <b>Formulario → Ver</b> → formulario <b>Contrato</b> "
                     "con estado <i>Enviado</i> (el que tiene la firma del socio).", s),
           Spacer(1, 10),
           Paragraph("Esta constancia refleja la información registrada en Zenoti al momento de su "
                     "generación. Uso interno de Fitness Para Todos.", s)]

    SimpleDocTemplate(ruta, pagesize=letter, leftMargin=2 * cm, rightMargin=2 * cm,
                      topMargin=1.8 * cm, bottomMargin=1.8 * cm,
                      title=f"Constancia de membresía — {socio['nombre']}").build(el)


# ------------------------------------------------------------- flujo -----
def procesar(filtros, center_id=None, elegir_primero=False):
    if not NOMBRES_CLUB:
        NOMBRES_CLUB.update({str(g(c, "id", default="")).lower(): g(c, "name", "display_name", default="—") for c in clubes()})
    guests = buscar_socio(center_id, **filtros)
    if not guests:
        print(f"  Sin resultados para {filtros}")
        return []
    if len(guests) > 1 and not elegir_primero:
        print(f"  {len(guests)} coincidencias para {filtros}; se genera una constancia por cada una.")
    filas = []
    os.makedirs(SALIDA, exist_ok=True)
    for guest in guests:
        socio = resumen_socio(guest)
        crudas = membresias(socio["guest_id"], socio["center_id"])
        mems = [resumen_membresia(m) for m in crudas]
        for m_raw, m in zip(crudas, mems):
            if m.get("acuerdo_digital") == "Sí":
                m["invoice_item_id"] = invoice_item_de_factura(m_raw, socio["center_id"])
        # Fecha y hora en el nombre: conserva el historial y evita choques con un PDF abierto
        base = f"{socio['codigo']}_{socio['nombre']}_{dt.datetime.now():%Y%m%d_%H%M%S}".replace(" ", "_").replace("/", "-")
        extra = {}
        if es_migrado(socio) and USAR_NAVEGADOR:
            try:
                guardados = contrato_migrado_navegador(socio["guest_id"], base)
                socio["contrato_descargado"] = ", ".join(guardados) or None
                print(f"  Contrato (Galería) descargado → {socio['contrato_descargado']}" if guardados
                      else "  Galería: no se encontraron PDFs en 'Archivos de invitados'")
            except ImportError:
                print("  Para descargar contratos de migrados instala Playwright:  pip install playwright")
            except Exception as e:
                print(f"  No se pudo descargar el contrato desde la Galería: {e}")
        if es_migrado(socio) and PROBAR_GALERIA:
            bitacora, urls = galeria_socio(socio["guest_id"], socio["center_id"])
            extra["_prueba_galeria"] = bitacora
            socio["contrato_descargado"] = None
            for k, u in enumerate(urls, 1):
                destino = os.path.join(SALIDA, f"{base}_contrato{'' if k == 1 else '_' + str(k)}.pdf")
                try:
                    descargar(u, destino)
                    socio["contrato_descargado"] = socio["contrato_descargado"] or os.path.basename(destino)
                    print(f"  Contrato (Galería) descargado → {os.path.basename(destino)}")
                except Exception as e:
                    print(f"  No se pudo descargar un archivo de la Galería: {e}")
            if not urls:
                print("  Galería: la API no devolvió archivos (ver _prueba_galeria en el .json)")
        generar_pdf(os.path.join(SALIDA, base + ".pdf"), socio, mems)
        with open(os.path.join(SALIDA, base + ".json"), "w", encoding="utf-8") as f:
            json.dump({"guest": guest, "memberships": crudas, **extra}, f, ensure_ascii=False, indent=2)
        print(f"  OK  {socio['nombre']} ({socio['codigo']}) → {base}.pdf")
        for m in (mems or [{}]):
            filas.append({**socio, **m})
        if elegir_primero:
            break
    return filas


def main():
    p = argparse.ArgumentParser(description="Constancia de membresía desde Zenoti")
    p.add_argument("--email"); p.add_argument("--telefono"); p.add_argument("--codigo")
    p.add_argument("--nombre"); p.add_argument("--apellido")
    p.add_argument("--club", help="center_id para limitar la búsqueda (más rápido)")
    p.add_argument("--lote", help="CSV con columnas email,telefono,codigo,nombre,apellido")
    p.add_argument("--listar-clubes", action="store_true")
    p.add_argument("--sin-navegador", action="store_true",
                   help="No abrir el navegador para descargar contratos de socios migrados")
    p.add_argument("--probar-galeria", action="store_true",
                   help="Socios migrados: intentar descargar el contrato de la Galería vía API")
    a = p.parse_args()
    global PROBAR_GALERIA, USAR_NAVEGADOR
    PROBAR_GALERIA = a.probar_galeria
    USAR_NAVEGADOR = not a.sin_navegador

    if a.listar_clubes:
        for c in clubes():
            print(g(c, "id"), "|", g(c, "name", "display_name"))
        return

    def a_filtros(email=None, telefono=None, codigo=None, nombre=None, apellido=None):
        return {k: v for k, v in {"email": email, "phone": telefono, "user_code": codigo,
                                  "first_name": nombre, "last_name": apellido}.items() if v}

    filas = []
    if a.lote:
        with open(a.lote, encoding="utf-8-sig") as f:
            for row in csv.DictReader(f):
                fl = a_filtros(**{k: (row.get(k) or "").strip() for k in
                                  ("email", "telefono", "codigo", "nombre", "apellido")})
                if fl:
                    filas += procesar(fl, a.club, elegir_primero=True)
    else:
        fl = a_filtros(a.email, a.telefono, a.codigo, a.nombre, a.apellido)
        if not fl:
            p.error("Indica --email, --telefono, --codigo, --nombre/--apellido o --lote")
        filas = procesar(fl, a.club)

    if filas:
        os.makedirs(SALIDA, exist_ok=True)
        ruta = os.path.join(SALIDA, f"inventario_{dt.datetime.now():%Y%m%d_%H%M}.csv")
        with open(ruta, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=list(dict.fromkeys(k for r in filas for k in r)))
            w.writeheader(); w.writerows(filas)
        print(f"\nInventario: {ruta}")


if __name__ == "__main__":
    try:
        main()
    finally:
        cerrar_navegador()
