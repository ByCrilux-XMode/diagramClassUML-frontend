// Base de conocimiento para el mini asistente de /proyectos.
// 100% local, sin depender de Ollama/red. Scoring por palabras clave.

export interface HelpEntry {
  id: string;
  titulo: string;
  pregunta: string; // forma natural como la haría el usuario
  respuesta: string; // markdown ligero, \n para saltos
  keywords: string[]; // para matching
  atajos?: string[]; // chips rápidos
}

export const HELP_ENTRIES: HelpEntry[] = [
  {
    id: "crear-proyecto",
    titulo: "Crear proyecto",
    pregunta: "¿Cómo creo un proyecto?",
    respuesta: "1. En **Mi Espacio de Trabajo** haz clic en **+ Nuevo proyecto** (o en la card vacía si no tienes ninguno).\n2. Ponle un nombre sin tildes ni espacios raros (ej. `veterinaria`). Ese nombre define el paquete del backend (`com.example.veterinaria`).\n3. Entrarás al **editor** con el canvas vacío listo para añadir clases.",
    keywords: ["crear", "nuevo", "proyecto", "añadir", "empezar"],
    atajos: ["crear proyecto", "nuevo proyecto"],
  },
  {
    id: "editar-diagrama",
    titulo: "Editar diagrama UML",
    pregunta: "¿Cómo dibujo clases y relaciones?",
    respuesta: "En el **editor** (`/editor/[id]`):\n- **Clase:** botón *Clase* → pon nombre (ej. `Mascota`), añade atributos `nombre: String`, `raza: String`, `fechaNacimiento: LocalDate`.\n- **Enum:** botón *Enum* → ej. `Estado` con literales `ACTIVO, INACTIVO`.\n- **Interface:** botón *Interface*.\n- **Relaciones:** selecciona tipo (asociación/agregación/composición/generalización/realización) y arrastra entre clases. Define multiplicidades (`1`, `0..*`, `1..*`).\n- **FK:** no crees atributos `*_id` manuales; la FK la genera la relación.\n- Guarda con **Guardar** (sin guardar no se exporta).",
    keywords: ["diagrama", "uml", "clase", "enum", "interface", "relacion", "asociacion", "multiplicidad", "fk", "atributo"],
    atajos: ["diagrama", "clases", "relaciones"],
  },
  {
    id: "guardar",
    titulo: "Guardar cambios",
    pregunta: "¿Cómo guardo?",
    respuesta: "En el editor pulsa **Guardar**. El ZIP de backend siempre se genera desde el **último guardado** (lo dice el modal de exportar). Si ves un triángulo de advertencia, es que tienes cambios sin guardar.",
    keywords: ["guardar", "save", "persistir"],
    atajos: ["guardar"],
  },
  {
    id: "exportar-backend",
    titulo: "Exportar / Descargar backend",
    pregunta: "¿Cómo descargo el backend Spring Boot?",
    respuesta: "1. En `/proyectos` entra a un proyecto → editor → botón **Exportar Backend** (o desde la card *Ver detalles*).\n2. Revisa el preview (entidades, relaciones FK, enums) y resuelve las FK 1:1 ambiguas si aparecen.\n3. **Descargar ZIP** → `veterinaria-springboot.zip`.\n4. Descomprime en `C:\\proyectos\\...` (sin tildes/espacios) → doble clic en **`iniciar.bat`** (o `./iniciar.sh` en Linux/Mac).\n5. Abre `http://localhost:8080/swagger-ui.html` y `http://localhost:8080/api/schema`.",
    keywords: ["exportar", "descargar", "backend", "zip", "spring", "swagger", "iniciar.bat"],
    atajos: ["descargar backend", "exportar zip"],
  },
  {
    id: "api-schema",
    titulo: "Endpoint /api/schema (para móvil/IA)",
    pregunta: "¿Para qué sirve /api/schema?",
    respuesta: "`GET http://127.0.0.1:8080/api/schema` devuelve el **mapa del sistema** generado desde tu UML:\n```json\n{\"version\":1,\"enums\":{...},\"entidades\":[{\"entidad\":\"Mascota\",\"endpoint\":\"/api/mascotas\",\"pk\":\"id\",\"campos\":[...],\"relaciones\":[...]}]}\n```\nLa **app Flutter** (`ex1-movil`) lo lee para construir formularios dinámicos y generar las *tools* del modelo local (ministral-3:3b en Termux). Por USB usa `adb reverse tcp:8080 tcp:8080` y ataca `http://127.0.0.1:8080`.",
    keywords: ["api", "schema", "móvil", "flutter", "endpoint", "adb", "tools", "ollama"],
    atajos: ["/api/schema", "app móvil"],
  },
  {
    id: "importar-colaborar",
    titulo: "Importar / Colaborar",
    pregunta: "¿Cómo invito o colaboro en un proyecto?",
    respuesta: "En la card del proyecto → **Ver detalles** → sección **Colaboradores** (si tu backend la expone) o comparte el **ID del proyecto** (`/editor/[id]`). Roles: **CREADOR** (puede eliminar), **EDITOR** (puede editar), **LECTOR** (solo lectura). Si te invitan, el proyecto aparece en *Proyectos en colaboración*.",
    keywords: ["importar", "colaborar", "compartir", "invitar", "rol", "editor", "lector"],
    atajos: ["colaborar", "compartir"],
  },
  {
    id: "ia-asistente",
    titulo: "Usar la IA del editor",
    pregunta: "¿Cómo uso la IA?",
    respuesta: "En el editor, panel derecho **Asistente IA**:\n- Elige **Proveedor**: `Local (Ollama)` o `Hugging Face`.\n- Elige **Modelo** (ej. `qwen2.5-coder:1.5b`, `ministral-3:3b`). Si no aparece, escríbelo a mano.\n- Usa atajos: **Validar**, **Crear Usuario**, **Conectar 1..* ** o escribe libre: *\"crea una clase Duenio con telefono String\"*.\n- Revisa la **propuesta** (human-in-the-loop) → **Aplicar** o **Descartar**.\n- Si dice *Sin conexión*, verifica Termux `ollama serve` y `ollama list`.",
    keywords: ["ia", "asistente", "ollama", "modelo", "hugging", "validar", "crear", "conectar", "propuesta"],
    atajos: ["IA", "ollama", "modelo"],
  },
  {
    id: "ia-movil",
    titulo: "IA en el celular (voz offline)",
    pregunta: "¿Cómo funciona la voz/IA en el celular?",
    respuesta: "La app `ex1-movil` habla con **Ollama en Termux** (`http://127.0.0.1:11434`, modelo `ministral-3:3b` con `tools`).\n- **Voz a texto:** `speech_to_text` (o `vosk_flutter_service` para 100% offline con modelo `vosk-model-small-es-0.42`).\n- **Texto a voz:** `flutter_tts` (motor del sistema, sin internet).\n- **Offline:** si no hay red, la orden se guarda en **cola Outbox** (`sqflite`) y se reenvía al reconectar. El formulario manual desde `/api/schema` siempre funciona aunque la IA falle.",
    keywords: ["móvil", "voz", "tts", "stt", "vosk", "offline", "cola", "outbox", "termux"],
    atajos: ["voz", "offline", "termux"],
  },
  {
    id: "buscar-filtrar",
    titulo: "Buscar y filtrar proyectos",
    pregunta: "¿Cómo busco proyectos?",
    respuesta: "En la cabecera de **Mi Espacio de Trabajo** usa el input *Buscar diagramas...* Filtra por nombre en tiempo real, tanto en *Mis Proyectos* como en *Proyectos en colaboración*.",
    keywords: ["buscar", "filtrar", "filtro", "query"],
    atajos: ["buscar"],
  },
  {
    id: "eliminar",
    titulo: "Eliminar proyecto",
    pregunta: "¿Cómo elimino un proyecto?",
    respuesta: "En la card → menú **Eliminar** → confirma. Solo el **CREADOR** puede eliminar (403 si no). Es permanente y borra el esquema guardado.",
    keywords: ["eliminar", "borrar", "delete"],
    atajos: ["eliminar"],
  },
  {
    id: "problemas-backend",
    titulo: "Problemas al arrancar backend",
    pregunta: "El backend no arranca, ¿qué hago?",
    respuesta: "• **No se encontró Java** → Instala JDK 17+ desde adoptium.net\n• **Descarga de Maven falla** → Conecta internet la primera vez\n• **Puerto 8080 en uso** → Cierra la otra app o ejecuta `Get-Process java | Stop-Process`\n• **address already in use :11434** (Ollama) → Normal: ya está corriendo, usa `ollama list`\n• **adb reverse no conecta** → Ejecuta `adb reverse tcp:8080 tcp:8080` con el celular por USB",
    keywords: ["error", "falla", "puerto", "java", "maven", "8080", "11434", "adb"],
    atajos: ["error 8080", "no arranca"],
  },
  {
    id: "tipos-datos",
    titulo: "Tipos de datos UML → Java",
    pregunta: "¿Qué tipos puedo usar en atributos?",
    respuesta: "Mapeo: `String`, `Integer`/`int`, `Long`, `Double`/`real`, `Boolean`/`bool`, `LocalDate`/`date`, `LocalDateTime`/`datetime` → tipos Java. Enums se crean aparte y se conectan con relación Clase→Enum. Si usas un tipo desconocido, se mapea a `String` con aviso.",
    keywords: ["tipo", "dato", "string", "integer", "long", "localdate", "enum"],
    atajos: ["tipos"],
  },
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function searchHelp(query: string, limit = 3): HelpEntry[] {
  const nq = normalize(query);
  if (!nq) return HELP_ENTRIES.slice(0, 5);
  const tokens = nq.split(/\s+/).filter(Boolean);
  const scored = HELP_ENTRIES.map((e) => {
    const hay = normalize([e.titulo, e.pregunta, e.respuesta, e.keywords.join(" "), (e.atajos ?? []).join(" ")].join(" "));
    let score = 0;
    for (const t of tokens) {
      if (hay.includes(t)) score += 2;
      // prefijo
      if (hay.split(" ").some((w) => w.startsWith(t))) score += 1;
    }
    // boost si pregunta exacta contiene query
    if (normalize(e.pregunta).includes(nq)) score += 5;
    if (normalize(e.titulo).includes(nq)) score += 4;
    return { e, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.e);
  return scored.length ? scored : HELP_ENTRIES.slice(0, 3);
}
