// Roles con el mismo nivel de acceso administrativo que "Administrador": entran a Usuarios,
// Flujos de autorización y Tipos de contrato, y pueden editar/ver cualquier contrato sin
// restricción de dueño/estatus (ver esRolPrivilegiado en routes/contratos.js). CEO, CFO y Cabeza
// de Jurídico son, sobre todo, un "puesto" — el flujo de autorización ya identifica a estas
// personas por id fijo (aprobadorId en flujo_pasos), no por rol — pero se les dio el mismo nivel
// de acceso administrativo que admin.
const ROLES_NIVEL_ADMIN = ['super_admin', 'admin', 'ceo', 'cfo', 'cabeza_juridico'];

// Autoridad exclusiva del lado de Jurídico: cancelar un contrato ya vigente y adjuntar un
// "Documento firmado manual" (ver routes/contratos.js). Antes era cualquier persona con rol
// "juridico"; ahora es solo Cabeza de Jurídico (con super_admin como respaldo de sistema) — el
// rol "juridico" normal pasa a solo poder ver esos contratos y comentar mientras están en
// solicitud (ver ESTATUS_SOLICITUD).
const ROLES_AUTORIDAD_JURIDICA = ['super_admin', 'cabeza_juridico'];

// Quién puede ver el apartado "Rentas" del módulo de Arrendamientos (calendario de renta
// consolidado de todas las ubicaciones): dato financiero sensible, así que se restringe a
// Super Admin, CEO, CFO y Jurídico (Cabeza de Jurídico y Jurídico) — deliberadamente sin
// "admin" genérico, a diferencia de ROLES_NIVEL_ADMIN.
const ROLES_RENTAS = ['super_admin', 'ceo', 'cfo', 'cabeza_juridico', 'juridico'];

// Quién puede entrar al módulo de Franquicias completo (dashboard, listado de contratos de
// franquicia, catálogo de Clubes): instrucción explícita de negocio — solo Jurídico, Cabeza de
// Jurídico, CEO y CFO deben poder ver esta sección, deliberadamente sin "admin" genérico. Se
// mantiene "super_admin" como respaldo de sistema (acceso total a todo, igual que en el resto de
// la app) — a diferencia de ROLES_RENTAS, aquí NO se incluye "admin".
const ROLES_MODULO_FRANQUICIAS = ['super_admin', 'juridico', 'cabeza_juridico', 'ceo', 'cfo'];

module.exports = { ROLES_NIVEL_ADMIN, ROLES_AUTORIDAD_JURIDICA, ROLES_RENTAS, ROLES_MODULO_FRANQUICIAS };
