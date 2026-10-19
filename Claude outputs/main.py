"""
Constancias de Membresía — app web (FPT)

Front:  GET /                 → página para pegar hasta 20 socios y descargar el ZIP
API:    POST /api/lotes       → crea un lote   {"entradas": ["5576145775", "correo@x.com", "MXC109043", ...]}
        GET  /api/lotes/{id}  → avance del lote
        GET  /api/lotes/{id}/zip → descarga (constancias + contratos + resumen.csv)
        GET  /api/yo          → usuario que inició sesión (Entra ID vía App Service)

El login lo hace Azure App Service (Autenticación → Microsoft). La app lee el usuario de los
encabezados X-MS-CLIENT-PRINCIPAL-* y deja bitácora de cada lote.

Creado por Jair Betancourt
"""
import csv
import datetime as dt
import json
import os
import queue
import re
import shutil
import threading
import time
import uuid
import zipfile

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import constancia_core as core
import navegador

DATOS = os.environ.get("DATOS_DIR", "/home/data")
LOTES_DIR = os.path.join(DATOS, "lotes")
BITACORA = os.path.join(DATOS, "bitacora.jsonl")
MAX_POR_LOTE = int(os.environ.get("MAX_POR_LOTE", "2500"))
DOMINIO = os.environ.get("DOMINIO_PERMITIDO", "fpt.com.mx").lower()
REQUIERE_LOGIN = os.environ.get("REQUIERE_LOGIN", "1") == "1"
HORAS_RETENCION = int(os.environ.get("HORAS_RETENCION", "168"))   # 7 días
USAR_NAVEGADOR = os.environ.get("USAR_NAVEGADOR", "1") == "1"

os.makedirs(LOTES_DIR, exist_ok=True)
app = FastAPI(title="Constancias de Membresía FPT")
LOTES = {}
COLA = queue.Queue()


# ----------------------------------------------------------------- sesión ----
def usuario(request: Request):
    nombre = (request.headers.get("x-ms-client-principal-name") or "").strip()
    if not REQUIERE_LOGIN:
        return nombre or "local"
    if not nombre:
        raise HTTPException(401, "Inicia sesión con tu cuenta Microsoft de FPT.")
    if DOMINIO and not nombre.lower().endswith("@" + DOMINIO):
        raise HTTPException(403, f"Solo cuentas @{DOMINIO}.")
    return nombre


def bitacora(evento, **datos):
    linea = {"fecha": dt.datetime.now().isoformat(timespec="seconds"), "evento": evento, **datos}
    print(json.dumps(linea, ensure_ascii=False), flush=True)
    try:
        with open(BITACORA, "a", encoding="utf-8") as f:
            f.write(json.dumps(linea, ensure_ascii=False) + "\n")
    except OSError:
        pass


# ----------------------------------------------------------- entradas ----
def interpretar(texto):
    """Convierte una línea en filtros de búsqueda: correo, teléfono o ID de cliente."""
    t = texto.strip()
    if not t:
        return None
    # Número de factura o recibo (p. ej. 3373/R222525), opcional con teléfono o correo para verificar
    partes = [p for p in re.split(r"[\s,;|]+", t) if p]
    if re.fullmatch(r"\d{3,5}/[A-Za-z]{1,3}\d+", partes[0]):
        verificar = " ".join(partes[1:])
        return {"factura": partes[0].upper(), "verificar": verificar}
    if "@" in t:
        return {"email": t.lower()}
    if re.fullmatch(r"\d{4}-\d{5,}", t):                 # ID de socio migrado (p. ej. 3206-0936864)
        return {"user_code": t}
    digitos = re.sub(r"\D", "", t)
    if re.fullmatch(r"[\d\s\-\(\)\+\.]+", t) and len(digitos) in (10, 12):
        return {"phone": digitos[-10:]}
    return {"user_code": t.upper() if re.search(r"[A-Za-z]", t) else t}


def no_coincide(verificar, socio):
    """Compara el teléfono/correo que acompaña a la factura con la ficha del socio. '' si coincide."""
    v = (verificar or "").strip()
    if not v:
        return ""
    if "@" in v:
        return "" if v.lower() == str(socio.get("email", "")).strip().lower() else "el correo"
    dig = re.sub(r"\D", "", v)[-10:]
    if len(dig) == 10:
        return "" if re.sub(r"\D", "", str(socio.get("telefono", "")))[-10:] == dig else "el teléfono"
    return ""


# --------------------------------------------------------- procesamiento ----
def procesar_entrada(texto, carpeta):
    filtros = interpretar(texto)
    if not filtros:
        return []
    factura = None
    if "factura" in filtros:
        factura = navegador.buscar_factura(filtros["factura"])
        if not factura or not factura.get("guest_id"):
            return [{"entrada": texto, "estado": "no_encontrado",
                     "detalle": f"No se encontró la factura {filtros['factura']} en ningún club"}]
        guest = core.socio_por_id(factura["guest_id"])
        if not guest:
            return [{"entrada": texto, "estado": "no_encontrado",
                     "detalle": f"Factura de {factura['cliente']}, pero la API no devolvió al socio"}]
        guests = [guest]
    else:
        guests = core.buscar_socio(**filtros)
        if not guests and "phone" in filtros:
            guests = core.buscar_socio(phone="52" + filtros["phone"])
    if not guests:
        return [{"entrada": texto, "estado": "no_encontrado", "detalle": "No se encontró el socio"}]
    salida = []
    for guest in guests[:3]:
        socio = core.resumen_socio(guest)
        if factura:
            socio["center_id"] = socio.get("center_id") or factura["center_id"]
            dif = no_coincide(filtros["verificar"], socio)
            if dif:
                return [{"entrada": texto, "estado": "no_encontrado", "nombre": socio["nombre"],
                         "codigo": socio["codigo"],
                         "detalle": f"La factura es de {socio['nombre']}, pero {dif} no coincide"}]
        crudas = core.membresias(socio["guest_id"], socio["center_id"])
        mems = [core.resumen_membresia(m) for m in crudas]
        for m_raw, m in zip(crudas, mems):
            if m.get("acuerdo_digital") == "Sí":
                m["invoice_item_id"] = core.invoice_item_de_factura(m_raw, socio["center_id"])
        base = re.sub(r"[^\w\-]+", "_", f"{socio['codigo']}_{socio['nombre']}").strip("_")
        estado, detalle, archivos = "ok", "", []
        if USAR_NAVEGADOR:
            try:
                if core.es_migrado(socio):
                    guardados = navegador.contrato_migrado(socio, base, carpeta)
                    socio["contrato_descargado"] = ", ".join(guardados) or None
                else:
                    socio["contrato_descargado"] = navegador.contrato_formulario(
                        socio, mems, os.path.join(carpeta, base + "_contrato.pdf"))
                if socio.get("contrato_descargado"):
                    archivos += socio["contrato_descargado"].split(", ")
                else:
                    estado, detalle = "sin_contrato", "No se encontró contrato firmado"
            except navegador.ErrorSesion as e:
                estado, detalle = "sin_contrato", str(e)
            except Exception as e:
                estado, detalle = "sin_contrato", f"Error al obtener el contrato: {e}"
        core.generar_pdf(os.path.join(carpeta, base + "_constancia.pdf"), socio, mems)
        archivos.insert(0, base + "_constancia.pdf")
        principal = core.contrato_principal(mems)
        salida.append({
            "entrada": texto, "estado": estado, "detalle": detalle,
            "nombre": socio["nombre"], "codigo": socio["codigo"],
            "migrado": core.es_migrado(socio),
            "membresia": principal["plan"] if principal else "",
            "estatus": principal["estatus"] if principal else "",
            "club": principal["club_venta"] if principal else "",
            "archivos": archivos,
        })
        if factura:
            salida[-1]["detalle"] = (salida[-1]["detalle"] + " · " if salida[-1]["detalle"] else "") + \
                f"Factura {factura['factura']} ({factura['club']}, {factura['fecha']}, {factura['articulos']})"
    if len(guests) > 3:
        salida[-1]["detalle"] += f" (hay {len(guests)} coincidencias; se muestran 3)"
    return salida


def guardar(lote):
    """Guarda el avance en disco para poder continuar si el servidor se reinicia."""
    datos = {k: v for k, v in lote.items() if k != "zip"}
    tmp = os.path.join(lote["carpeta"], ".estado.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False)
    os.replace(tmp, os.path.join(lote["carpeta"], ".estado.json"))


def recuperar():
    """Al arrancar: carga los lotes guardados y vuelve a poner en fila los que no terminaron."""
    for lid in sorted(os.listdir(LOTES_DIR)):
        ruta = os.path.join(LOTES_DIR, lid, ".estado.json")
        if not os.path.exists(ruta):
            continue
        try:
            with open(ruta, encoding="utf-8") as f:
                lote = json.load(f)
        except (OSError, ValueError):
            continue
        z = os.path.join(LOTES_DIR, f"constancias_{lid}.zip")
        if os.path.exists(z):
            lote["zip"] = z
        LOTES[lid] = lote
        if lote["estado"] in ("en_cola", "procesando"):
            lote["estado"] = "en_cola"
            COLA.put(lid)


def trabajador():
    while True:
        lote_id = COLA.get()
        lote = LOTES.get(lote_id)
        if not lote:
            continue
        lote["estado"] = "procesando"
        carpeta = lote["carpeta"]
        try:
            if not core.NOMBRES_CLUB:
                core.NOMBRES_CLUB.update({str(core.g(c, "id", default="")).lower():
                                          core.g(c, "name", "display_name", default="—") for c in core.clubes()})
            for i in range(lote["hechos"], len(lote["entradas"])):     # continúa donde se quedó
                texto = lote["entradas"][i]
                lote["actual"] = texto
                try:
                    lote["resultados"] += procesar_entrada(texto, carpeta)
                except SystemExit as e:        # errores de red/API de constancia_core
                    lote["resultados"].append({"entrada": texto, "estado": "error", "detalle": str(e)})
                except Exception as e:
                    lote["resultados"].append({"entrada": texto, "estado": "error", "detalle": str(e)})
                lote["hechos"] = i + 1
                guardar(lote)
            armar_zip(lote)
            lote["estado"] = "listo"
            guardar(lote)
        except Exception as e:
            lote["estado"], lote["error"] = "error", str(e)
        lote["actual"] = ""
        lote["terminado"] = dt.datetime.now().strftime("%d/%m/%Y %H:%M")
        guardar(lote)
        bitacora("lote_terminado", lote=lote_id, usuario=lote["usuario"], estado=lote["estado"],
                 socios=len(lote["entradas"]),
                 ok=sum(1 for r in lote["resultados"] if r["estado"] == "ok"))


def armar_zip(lote, parcial=False):
    carpeta = lote["carpeta"]
    with open(os.path.join(carpeta, "resumen.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["Búsqueda", "Resultado", "Nombre", "Código", "Migrado", "Membresía", "Estatus",
                    "Club", "Archivos", "Detalle"])
        etiquetas = {"ok": "Con contrato", "sin_contrato": "Sin contrato", "no_encontrado": "No encontrado",
                     "error": "Error"}
        for r in lote["resultados"]:
            w.writerow([r["entrada"], etiquetas.get(r["estado"], r["estado"]), r.get("nombre", ""),
                        r.get("codigo", ""), "Sí" if r.get("migrado") else "", r.get("membresia", ""),
                        r.get("estatus", ""), r.get("club", ""), " | ".join(r.get("archivos", [])),
                        r.get("detalle", "")])
    ruta = os.path.join(LOTES_DIR, f"constancias_{lote['id']}{'_parcial' if parcial else ''}.zip")
    with zipfile.ZipFile(ruta, "w", zipfile.ZIP_DEFLATED) as z:
        for nombre in sorted(os.listdir(carpeta)):
            if not nombre.startswith("."):
                z.write(os.path.join(carpeta, nombre), nombre)
    if not parcial:
        lote["zip"] = ruta
    return ruta


def limpieza():
    while True:
        limite = time.time() - HORAS_RETENCION * 3600
        for lid, lote in list(LOTES.items()):
            if lote["creado_ts"] < limite and lote["estado"] in ("listo", "error"):
                shutil.rmtree(lote["carpeta"], ignore_errors=True)
                for sufijo in ("", "_parcial"):
                    z = os.path.join(LOTES_DIR, f"constancias_{lid}{sufijo}.zip")
                    if os.path.exists(z):
                        os.remove(z)
                LOTES.pop(lid, None)
        time.sleep(1800)


recuperar()
threading.Thread(target=trabajador, daemon=True).start()
threading.Thread(target=limpieza, daemon=True).start()


# ---------------------------------------------------------------- rutas ----
def vista(lote, completo=False):
    res = lote["resultados"]
    conteo = {k: sum(1 for r in res if r["estado"] == k) for k in ("ok", "sin_contrato", "no_encontrado", "error")}
    en_cola = list(COLA.queue)
    return {"id": lote["id"], "estado": lote["estado"], "hechos": lote["hechos"], "total": len(lote["entradas"]),
            "actual": lote["actual"], "creado": lote["creado"], "terminado": lote.get("terminado", ""),
            "conteo": conteo, "error": lote.get("error", ""),
            "en_cola": en_cola.index(lote["id"]) + 1 if lote["id"] in en_cola else 0,
            "resultados": res if completo else res[-100:], "resultados_total": len(res)}


@app.get("/api/yo")
def yo(request: Request):
    return {"usuario": usuario(request), "max_por_lote": MAX_POR_LOTE}


@app.post("/api/lotes")
async def crear_lote(request: Request):
    quien = usuario(request)
    datos = await request.json()
    entradas = [e.strip() for e in (datos.get("entradas") or []) if str(e).strip()]
    entradas = list(dict.fromkeys(entradas))            # sin repetidos
    if not entradas:
        raise HTTPException(400, "Agrega al menos un teléfono, correo o ID de cliente.")
    if len(entradas) > MAX_POR_LOTE:
        raise HTTPException(400, f"Máximo {MAX_POR_LOTE} socios por lote.")
    lid = dt.datetime.now().strftime("%Y%m%d_%H%M%S_") + uuid.uuid4().hex[:6]
    carpeta = os.path.join(LOTES_DIR, lid)
    os.makedirs(carpeta, exist_ok=True)
    LOTES[lid] = {"id": lid, "usuario": quien, "entradas": entradas, "estado": "en_cola", "hechos": 0,
                  "actual": "", "resultados": [], "carpeta": carpeta, "creado_ts": time.time(),
                  "creado": dt.datetime.now().strftime("%d/%m/%Y %H:%M")}
    COLA.put(lid)
    bitacora("lote_creado", lote=lid, usuario=quien, entradas=entradas)
    return vista(LOTES[lid])


@app.get("/api/lotes")
def mis_lotes(request: Request):
    quien = usuario(request)
    mios = [l for l in LOTES.values() if not REQUIERE_LOGIN or l["usuario"] == quien]
    mios.sort(key=lambda l: l["creado_ts"], reverse=True)
    return [{k: v for k, v in vista(l).items() if k != "resultados"} for l in mios[:20]]


@app.get("/api/lotes/{lid}")
def ver_lote(lid: str, request: Request):
    quien = usuario(request)
    lote = LOTES.get(lid)
    if not lote or (REQUIERE_LOGIN and lote["usuario"] != quien):
        raise HTTPException(404, "Lote no encontrado.")
    return vista(lote)


@app.get("/api/lotes/{lid}/zip")
def descargar_zip(lid: str, request: Request):
    quien = usuario(request)
    lote = LOTES.get(lid)
    if not lote or (REQUIERE_LOGIN and lote["usuario"] != quien):
        raise HTTPException(404, "Archivo no disponible.")
    if lote.get("zip") and os.path.exists(lote["zip"]):
        ruta, nombre = lote["zip"], f"constancias_{lid[:15]}.zip"
    else:                                                 # descarga del avance mientras sigue trabajando
        ruta, nombre = armar_zip(lote, parcial=True), f"constancias_{lid[:15]}_avance_{lote['hechos']}.zip"
    bitacora("zip_descargado", lote=lid, usuario=quien, parcial=not lote.get("zip"))
    return FileResponse(ruta, media_type="application/zip", filename=nombre)


@app.get("/salud")
def salud():
    return JSONResponse({"ok": True})


app.mount("/", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "static"), html=True),
          name="front")
