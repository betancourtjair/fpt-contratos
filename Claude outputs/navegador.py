"""
Navegador sin pantalla (Playwright/Chromium) con la cuenta de servicio de Zenoti.

- Inicia sesión con ZENOTI_USUARIO / ZENOTI_PASSWORD (solo cuando la sesión caducó).
- Guarda el contrato firmado en PDF:
    * Socios normales: imprime a PDF la página del formulario "Contrato" y verifica que tenga la firma.
    * Socios migrados: descarga el PDF de la Galería del socio.

Todo el trabajo con el navegador se hace de uno en uno (candado), así es estable en un App Service.
"""
import os
import re
import threading
import urllib.parse

import constancia_core as core

PERFIL = os.environ.get("NAVEGADOR_PERFIL", "/home/data/navegador")
USUARIO = os.environ.get("ZENOTI_USUARIO", "")
PASSWORD = os.environ.get("ZENOTI_PASSWORD", "")
HEADLESS = os.environ.get("NAVEGADOR_VISIBLE", "0") != "1"
DIAG = os.path.join(os.environ.get("DATOS_DIR", "/home/data"), "diagnostico")
# User-agent de Chrome normal: Zenoti rechaza el de "HeadlessChrome" ("browser issue")
USER_AGENT = os.environ.get("NAVEGADOR_UA", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                            "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36")

_lock = threading.Lock()
_estado = {}


class ErrorSesion(RuntimeError):
    pass


def _ctx():
    if "ctx" in _estado:
        return _estado["ctx"]
    from playwright.sync_api import sync_playwright
    os.makedirs(PERFIL, exist_ok=True)
    pw = sync_playwright().start()
    ctx = pw.chromium.launch_persistent_context(
        PERFIL, headless=HEADLESS, bypass_csp=True, accept_downloads=True,
        locale="es-MX", timezone_id="America/Mexico_City", user_agent=USER_AGENT,
        viewport={"width": 1400, "height": 1000},
        args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"])
    ctx.set_default_timeout(60000)
    _estado.update(pw=pw, ctx=ctx)
    return ctx


def cerrar():
    with _lock:
        if "ctx" in _estado:
            try:
                _estado["ctx"].close()
                _estado["pw"].stop()
            except Exception:
                pass
            _estado.clear()


def _pagina():
    ctx = _ctx()
    return ctx.pages[0] if ctx.pages else ctx.new_page()


def _requiere_login(page):
    url = page.url.lower()
    if "signin" in url or "/sso/" in url or "/account/login" in url:
        return True
    # El perfil del socio trae campos de contraseña ocultos (restablecer contraseña): solo cuenta el formulario de login
    return page.locator("#btnLogin, input#Username").count() > 0


def diagnostico(page, nombre):
    """Guarda captura, HTML y URL de la página para revisar qué mostró Zenoti."""
    try:
        os.makedirs(DIAG, exist_ok=True)
        page.screenshot(path=os.path.join(DIAG, nombre + ".png"), full_page=True)
        with open(os.path.join(DIAG, nombre + ".html"), "w", encoding="utf-8") as f:
            f.write("<!-- " + page.url.split("?")[0] + " -->\n" + page.content())
    except Exception:
        pass


def _login(page):
    import time
    ultimo = _estado.get("login_fallo")
    if ultimo and time.time() - ultimo[0] < 600:          # no reintentar el login en cada socio
        raise ErrorSesion(ultimo[1])
    try:
        _login_pasos(page)
        _estado.pop("login_fallo", None)
    except ErrorSesion as e:
        diagnostico(page, "login_fallido")
        _estado["login_fallo"] = (time.time(), str(e))
        raise
    except Exception as e:
        diagnostico(page, "login_fallido")
        msg = f"No se pudo iniciar sesión en Zenoti: {str(e).splitlines()[0]}"
        _estado["login_fallo"] = (time.time(), msg)
        raise ErrorSesion(msg)


def _login_pasos(page):
    """Formulario de Zenoti: #Username, #Password y botón #btnLogin (se habilita al teclear)."""
    if not USUARIO or not PASSWORD:
        raise ErrorSesion("Faltan ZENOTI_USUARIO / ZENOTI_PASSWORD en la configuración del servidor.")
    usuario = page.locator("#Username, input[name=Username]").first
    usuario.wait_for(state="visible", timeout=30000)
    usuario.click()
    usuario.fill("")
    usuario.press_sequentially(USUARIO, delay=40)       # teclear para que la página habilite el botón
    clave = page.locator("#Password, input[name=Password]").first
    clave.click()
    clave.fill("")
    clave.press_sequentially(PASSWORD, delay=40)
    boton = page.locator("#btnLogin").first
    try:
        page.wait_for_function("() => { const b = document.getElementById('btnLogin'); return b && !b.disabled; }",
                               timeout=10000)
    except Exception:
        pass
    with page.expect_navigation(wait_until="domcontentloaded", timeout=60000):
        try:
            boton.click(timeout=10000)
        except Exception:
            clave.press("Enter")
    page.wait_for_timeout(3000)
    # Pantallas posteriores (avisos/condiciones): si hay botón de continuar/aceptar, lo presiona
    for texto in ("Continuar", "Continue", "Aceptar", "Accept", "Acepto", "I Agree"):
        extra = page.locator(f"button:has-text('{texto}'):visible, input[type=submit][value*='{texto}']:visible")
        if extra.count() and ("signin" in page.url.lower() or "/sso/" in page.url.lower()):
            try:
                extra.first.click(timeout=5000)
                page.wait_for_load_state("domcontentloaded")
            except Exception:
                pass
    if _requiere_login(page):
        diagnostico(page, "login_despues_de_enviar")
        raise ErrorSesion("Zenoti no aceptó el inicio de sesión de la cuenta de servicio "
                          "(revisa usuario/contraseña o si pide verificación).")


def _abrir(page, url):
    page.goto(url, wait_until="domcontentloaded", timeout=90000)
    if _requiere_login(page):
        _login(page)
        page.goto(url, wait_until="domcontentloaded", timeout=90000)
        if _requiere_login(page):
            raise ErrorSesion("Zenoti volvió a pedir inicio de sesión.")


def _pdf_como_se_ve(page, destino):
    """Guarda el contrato tal como se ve en pantalla (con las firmas dibujadas), una hoja por pantalla.
    La impresión del navegador no muestra las firmas de Zenoti, por eso se arma el PDF con capturas."""
    import io
    from PIL import Image
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas

    ancho, alto_hoja = 1200, 1553                      # proporción carta
    page.set_viewport_size({"width": ancho, "height": alto_hoja})
    page.wait_for_timeout(500)
    total = page.evaluate("() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)")
    ancho_pt, alto_pt = letter
    margen = 18
    c = canvas.Canvas(destino, pagesize=letter)
    y = 0
    while y < total:
        page.evaluate(f"window.scrollTo(0, {y})")
        page.wait_for_timeout(300)
        real = page.evaluate("() => window.scrollY")         # la última pantalla puede no bajar completa
        img = Image.open(io.BytesIO(page.screenshot(type="png"))).convert("RGB")
        recorte = y - real                                  # parte ya incluida en la hoja anterior
        if recorte > 0:
            img = img.crop((0, recorte, img.width, img.height))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        buf.seek(0)
        escala = (ancho_pt - 2 * margen) / img.width
        h = img.height * escala
        c.drawImage(ImageReader(buf), margen, alto_pt - margen - h, width=img.width * escala, height=h)
        c.showPage()
        y += alto_hoja
    c.save()
    page.set_viewport_size({"width": 1400, "height": 1000})


def _tiene_firma(page):
    """True si el formulario tiene al menos una firma dibujada (imagen con contenido)."""
    tamanos = page.locator("img[src^='data:image']").evaluate_all(
        "imgs => imgs.map(i => (i.getAttribute('src') || '').length)")
    return any(t > 1500 for t in tamanos)


def contrato_formulario(socio, mems, destino):
    """Prueba las membresías candidatas; guarda como PDF el primer contrato que tenga firma.
    Marca en `mems` cuál quedó verificado. Regresa el nombre del archivo o None."""
    with _lock:
        page = _pagina()
        for m in core.candidatos_contrato(mems):
            url = core.CONTRATO_URL.format(item=m["invoice_item_id"], guest_id=socio["guest_id"],
                                           form=core.CONTRATO_FORM_ID)
            _abrir(page, url)
            page.wait_for_load_state("networkidle", timeout=60000)
            if _tiene_firma(page):
                _pdf_como_se_ve(page, destino)
                m["firma_verificada"] = True
                return os.path.basename(destino)
        return None


AGENDA_URL = "https://planetfitnessmx.zenoti.com/Appointment/ApptExtV2.aspx"
PREFIJOS = os.path.join(os.environ.get("DATOS_DIR", "/home/data"), "prefijos_factura.json")

# Misma consulta que hace Zenoti en Agenda → Más → "Buscar Factura / # Recibo" (por club)
_JS_FACTURA = """async ([no, tipos, centros]) => {
  for (const c of centros) {
    for (const t of tipos) {
      const r = await fetch('/Appointment/AppServices.aspx/getInvoiceDetails', {method: 'POST',
        headers: {'Content-Type': 'application/json; charset=utf-8'},
        body: JSON.stringify({strInvoiceNo: no, type: t, strCenterId: c.CenterId})});
      if (!r.ok) continue;
      const d = ((await r.json()).d) || [];
      if (d.length) return {centro: c, filas: d};
    }
  }
  return null;
}"""


def _leer_prefijos():
    try:
        import json
        with open(PREFIJOS, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def _guardar_prefijo(prefijo, centro):
    import json
    datos = _leer_prefijos()
    datos[prefijo] = centro
    try:
        with open(PREFIJOS, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False)
    except OSError:
        pass


def buscar_factura(numero):
    """Número de factura (p. ej. 3373/R222525) o # de recibo → socio.
    El prefijo (3373) es el club; se recuerda para no recorrer los 60 clubes cada vez.
    Regresa {guest_id, cliente, factura, recibo, fecha, articulos, importe, club} o None."""
    numero = numero.strip().upper()
    prefijo = numero.split("/")[0]
    with _lock:
        page = _pagina()
        if "ApptExtV2.aspx" not in page.url or _requiere_login(page):
            _abrir(page, AGENDA_URL)
        page.wait_for_function("() => typeof centersJson !== 'undefined'", timeout=60000)
        centros = page.evaluate("() => (typeof centersJson === 'string' ? JSON.parse(centersJson) : centersJson)"
                                ".map(c => ({CenterId: c.CenterId, centername: c.centername}))")
        conocido = _leer_prefijos().get(prefijo)
        if conocido:                                     # primero el club ya conocido
            centros.sort(key=lambda c: c["CenterId"] != conocido["CenterId"])
        r = page.evaluate(_JS_FACTURA, [numero, ["0", "1"], centros])
    if not r:
        return None
    _guardar_prefijo(prefijo, r["centro"])
    filas = [f for f in r["filas"] if numero in (str(f.get("InvoiceNo", "")).upper(),
                                                  str(f.get("ReceiptNo", "")).upper())] or r["filas"]
    f = filas[0]
    return {"guest_id": f.get("GuestId"), "cliente": (f.get("customer_name") or "").strip(),
            "factura": f.get("InvoiceNo"), "recibo": f.get("ReceiptNo"), "fecha": f.get("SaleDate"),
            "articulos": (f.get("items") or "").strip(), "importe": (f.get("InvoiceAmt") or "").strip(),
            "club": r["centro"]["centername"], "center_id": r["centro"]["CenterId"]}


def contrato_migrado(socio, base, carpeta):
    """Descarga los PDF de 'Archivos de invitados' (Galería) del socio migrado."""
    with _lock:
        page = _pagina()
        _abrir(page, core.PERFIL_URL.format(guest_id=socio["guest_id"]))
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
        archivos = []
        tarjetas = page.locator(".FileUploadElementGuest")
        for i in range(tarjetas.count()):
            t = tarjetas.nth(i)
            liga = t.locator("a", has_text="Mostrar archivo")
            if liga.count():
                href = urllib.parse.urljoin(page.url, liga.first.get_attribute("href") or "")
                archivos.append({"href": href, "texto": " ".join((t.inner_text() or "").split())})
        pdfs = [f for f in archivos if ".pdf" in f["href"].split("?")[0].lower()]
        pdfs.sort(key=lambda f: not re.search(r"\b\d{4}_", f["texto"]))
        guardados = []
        for k, f in enumerate(pdfs, 1):
            destino = os.path.join(carpeta, f"{base}_contrato{'' if k == 1 else '_' + str(k)}.pdf")
            r = page.context.request.get(f["href"], timeout=120000)
            if r.ok:
                with open(destino, "wb") as fh:
                    fh.write(r.body())
                guardados.append(os.path.basename(destino))
        return guardados
