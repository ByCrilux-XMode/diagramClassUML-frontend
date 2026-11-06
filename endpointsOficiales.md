# Endpoints oficiales — ex1-backend

Documentación completa de la API: todos los endpoints, qué reciben y qué devuelven.

---

## 1. Información general

| Dato | Valor |
|---|---|
| URL base local | `http://localhost:3000` |
| Prefijo global | Ninguno. Las rutas son las de este documento. |
| Formato de entrada/salida | JSON (`Content-Type: application/json`) |
| Autenticación | Cookie `tokenAcceso` (JWT) |
| Documento | API REST del backend `ex1-backend` |

### 1.1 Autenticación

- El login y el registro crean una cookie llamada `tokenAcceso`.
- La cookie es `HttpOnly`, por lo que JavaScript del navegador no puede leerla.
- La estrategia JWT lee **solo** la cookie. No se acepta `Authorization: Bearer ...`.
- Atributos de la cookie:
  - `path: /`
  - `httpOnly: true`
  - `sameSite: lax` si `COOKIE_SECURE=false`; `none` si `COOKIE_SECURE=true`
  - `secure` según `COOKIE_SECURE`
  - `maxAge` calculado desde `JWT_EXPIRES_IN` (por defecto `1d`)

### 1.2 Validación

El backend usa `ValidationPipe` con:

- `whitelist: true`
- `forbidNonWhitelisted: true`
- `transform: true`

Por eso:

- Los campos desconocidos en el body producen `400`.
- Los query params numéricos se convierten automáticamente.
- Los IDs de ruta usan `ParseIntPipe`; un ID no numérico produce `400`.

### 1.3 Paginación

Los endpoints paginados aceptan:

| Query | Tipo | Obligatorio | Valores |
|---|---|---|---|
| `pagina` | entero | No | ≥ 1. Por defecto `1`. |
| `limite` | entero | No | 1–100. Por defecto `10`. |

La respuesta paginada tiene la forma:

```json
{
  "datos": [],
  "total": 0
}
```

`GET /notificaciones` agrega además `noLeidas`.

### 1.4 Códigos de estado

| Código | Uso |
|---|---|
| `200` | Consulta o actualización exitosa. |
| `201` | Recurso creado. |
| `204` | Operación exitosa sin contenido. |
| `400` | Body, query o ID inválido; campo desconocido. |
| `401` | Cookie ausente, expirada o JWT inválido. |
| `403` | Sin permiso para la acción. |
| `404` | Recurso no encontrado. |
| `409` | Conflicto, por ejemplo username repetido o permiso en uso. |

### 1.5 Roles y permisos

| Rol | Cómo se obtiene | Puede |
|---|---|---|
| `CREADOR` | Es el `creador` del proyecto. | Todo: leer, editar, guardar, crear/restaurar versiones, gestionar colaboradores y eliminar el proyecto. |
| `EDITOR` | Colaborador con `permisoId = 2`. | Leer, editar el esquema, guardar colaboración y crear/restaurar versiones. No gestiona colaboradores ni elimina el proyecto. |
| `LECTOR` | Colaborador con `permisoId = 1`. | Leer el proyecto y sus versiones. No puede guardar cambios ni gestionar colaboradores. |

> **Nota:** los endpoints `GET` de proyectos, versiones y colaboradores no verifican membresía; cualquier usuario autenticado puede consultarlos. Las restricciones de creador/editor aplican a las operaciones de escritura y a la gestión de colaboradores.

---

## 2. Índice de endpoints

| # | Método | Ruta | Auth | Descripción |
|---|---|---|---|---|
| 1 | `POST` | `/auth/registrarse` | Público | Registrar usuario e iniciar sesión. |
| 2 | `POST` | `/auth/iniciar-sesion` | Público | Iniciar sesión. |
| 3 | `POST` | `/auth/cerrar-sesion` | Público | Cerrar sesión y borrar la cookie. |
| 4 | `GET` | `/usuarios` | Cookie | Listar usuarios. |
| 5 | `GET` | `/usuarios/me` | Cookie | Ver el perfil propio. |
| 6 | `GET` | `/usuarios/me/proyectos` | Cookie | Ver los proyectos propios. |
| 7 | `PUT` | `/usuarios/me/token-firebase` | Cookie | Registrar/actualizar el token FCM. |
| 8 | `DELETE` | `/usuarios/me/token-firebase` | Cookie | Eliminar el token FCM. |
| 9 | `GET` | `/usuarios/username/:username` | Cookie | Buscar usuario por username. |
| 10 | `GET` | `/usuarios/:id` | Cookie | Buscar usuario por ID. |
| 11 | `POST` | `/proyectos` | Cookie | Crear proyecto. |
| 12 | `GET` | `/proyectos` | Cookie | Listar todos los proyectos. |
| 13 | `GET` | `/proyectos/:id` | Cookie | Obtener un proyecto. |
| 14 | `PATCH` | `/proyectos/:id` | Cookie + CREADOR/EDITOR | Actualizar nombre y/o esquema. |
| 15 | `DELETE` | `/proyectos/:id` | Cookie + CREADOR | Eliminar proyecto. |
| 16 | `POST` | `/proyectos/:id/guardar-colaboracion` | Cookie + CREADOR/EDITOR | Guardar el estado colaborativo. |
| 17 | `GET` | `/proyectos/:id/versiones` | Cookie | Listar versiones. |
| 18 | `GET` | `/proyectos/:id/versiones/:versionId` | Cookie | Obtener una versión. |
| 19 | `POST` | `/proyectos/:id/versiones` | Cookie + CREADOR/EDITOR | Crear versión manual. |
| 20 | `POST` | `/proyectos/:id/versiones/:versionId/restaurar` | Cookie + CREADOR/EDITOR | Restaurar una versión. |
| 21 | `GET` | `/proyectos/:proyectoId/colaboradores` | Cookie + CREADOR | Listar colaboradores. |
| 22 | `POST` | `/proyectos/:proyectoId/colaboradores` | Cookie + CREADOR | Asignar colaborador. |
| 23 | `PATCH` | `/proyectos/:proyectoId/colaboradores/:usuarioId` | Cookie + CREADOR | Cambiar permiso. |
| 24 | `DELETE` | `/proyectos/:proyectoId/colaboradores/:usuarioId` | Cookie + CREADOR | Remover colaborador. |
| 25 | `GET` | `/permisos` | Cookie | Listar permisos. |
| 26 | `POST` | `/permisos` | Cookie | Crear permiso. |
| 27 | `DELETE` | `/permisos/:id` | Cookie | Eliminar permiso. |
| 28 | `GET` | `/notificaciones` | Cookie | Listar notificaciones propias. |
| 29 | `PATCH` | `/notificaciones/leidas` | Cookie | Marcar todas como leídas. |
| 30 | `PATCH` | `/notificaciones/:id/leida` | Cookie | Marcar una como leída. |
| 31 | `GET` | `/` | Público | Estado del servidor. |

---

## 3. Autenticación

### 3.1 `POST /auth/registrarse`

**Descripción:** crea un usuario, inicia sesión y devuelve la cookie `tokenAcceso`.

**Autenticación:** pública.

**Entrada (body):**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `username` | string | Sí | No vacío, máx. 50, único. |
| `password` | string | Sí | 8–72 caracteres. |
| `nombre` | string | Sí | No vacío, máx. 100. |
| `apellido` | string | Sí | No vacío, máx. 100. |
| `tokenFirebase` | string | No | No vacío, máx. 512. |

```json
{
  "username": "luis",
  "password": "clave1234",
  "nombre": "Luis",
  "apellido": "García",
  "tokenFirebase": "token-fcm-opcional"
}
```

**Salida `201`:**

```json
{
  "usuario": {
    "usuarioId": 4,
    "username": "luis",
    "personaId": 4,
    "persona": {
      "personaId": 4,
      "nombre": "Luis",
      "apellido": "García"
    }
  }
}
```

Cabecera de respuesta:

```http
Set-Cookie: tokenAcceso=<jwt>; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400
```

**Errores:**

| Código | Causa |
|---|---|
| `400` | Body inválido o campo desconocido. |
| `409` | El `username` ya está registrado. |

---

### 3.2 `POST /auth/iniciar-sesion`

**Descripción:** valida credenciales, opcionalmente guarda el token FCM y crea la cookie de sesión.

**Autenticación:** pública.

**Entrada (body):**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `username` | string | Sí | No vacío. |
| `password` | string | Sí | No vacío. |
| `tokenFirebase` | string | No | No vacío, máx. 512. |

```json
{
  "username": "user1",
  "password": "user123",
  "tokenFirebase": "token-fcm-opcional"
}
```

**Salida `200`:**

```json
{
  "usuario": {
    "usuarioId": 1,
    "username": "user1",
    "personaId": 1,
    "persona": {
      "personaId": 1,
      "nombre": "Juan",
      "apellido": "Pérez"
    }
  }
}
```

También devuelve `Set-Cookie: tokenAcceso=...`.

**Errores:**

| Código | Causa |
|---|---|
| `400` | Body inválido o campo desconocido. |
| `401` | Credenciales inválidas. |

---

### 3.3 `POST /auth/cerrar-sesion`

**Descripción:** borra la cookie de sesión.

**Autenticación:** pública.

**Entrada:** sin body.

**Salida `204`:** sin contenido.

Cabecera de respuesta:

```http
Set-Cookie: tokenAcceso=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT
```

---

## 4. Usuarios

### 4.1 `GET /usuarios`

**Descripción:** lista todos los usuarios registrados.

**Autenticación:** cookie.

**Entrada (query):**

| Query | Tipo | Obligatorio | Valores |
|---|---|---|---|
| `pagina` | entero | No | ≥ 1. Por defecto `1`. |
| `limite` | entero | No | 1–100. Por defecto `10`. |

**Salida `200`:**

```json
{
  "datos": [
    {
      "usuarioId": 1,
      "username": "user1",
      "personaId": 1,
      "persona": {
        "personaId": 1,
        "nombre": "Juan",
        "apellido": "Pérez"
      }
    }
  ],
  "total": 3
}
```

**Errores:** `400` query inválida, `401` sin sesión.

---

### 4.2 `GET /usuarios/me`

**Descripción:** devuelve el perfil del usuario autenticado.

**Autenticación:** cookie.

**Entrada:** sin body ni query.

**Salida `200`:**

```json
{
  "usuarioId": 1,
  "username": "user1",
  "personaId": 1,
  "persona": {
    "personaId": 1,
    "nombre": "Juan",
    "apellido": "Pérez"
  }
}
```

**Errores:** `401` sin sesión.

---

### 4.3 `GET /usuarios/me/proyectos`

**Descripción:** devuelve los proyectos donde el usuario es creador o colaborador.

**Autenticación:** cookie.

**Entrada (query):**

| Query | Tipo | Obligatorio | Valores |
|---|---|---|---|
| `pagina` | entero | No | ≥ 1. Por defecto `1`. |
| `limite` | entero | No | 1–100. Por defecto `10`. |

**Salida `200`:**

```json
{
  "datos": [
    {
      "proyectoId": 5,
      "nombre": "Diagrama UML",
      "rol": "CREADOR"
    },
    {
      "proyectoId": 8,
      "nombre": "Base de datos",
      "rol": "EDITOR"
    }
  ],
  "total": 2
}
```

`rol` puede ser `CREADOR`, `EDITOR` o `LECTOR`.

**Errores:** `400` query inválida, `401` sin sesión.

---

### 4.4 `PUT /usuarios/me/token-firebase`

**Descripción:** registra o actualiza el token FCM del dispositivo.

**Autenticación:** cookie.

**Entrada (body):**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `tokenFirebase` | string | Sí | No vacío, máx. 512. |

```json
{
  "tokenFirebase": "fcm-token-del-dispositivo"
}
```

**Salida `204`:** sin contenido.

**Errores:** `400` token inválido, `401` sin sesión, `404` usuario no encontrado.

---

### 4.5 `DELETE /usuarios/me/token-firebase`

**Descripción:** elimina el token FCM del usuario autenticado.

**Autenticación:** cookie.

**Entrada:** sin body.

**Salida `204`:** sin contenido.

**Errores:** `401` sin sesión, `404` usuario no encontrado.

---

### 4.6 `GET /usuarios/username/:username`

**Descripción:** busca un usuario por su nombre de usuario.

**Autenticación:** cookie.

**Entrada (path):**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `username` | string | Username exacto. |

**Salida `200`:**

```json
{
  "usuarioId": 2,
  "username": "user2",
  "personaId": 2,
  "persona": {
    "personaId": 2,
    "nombre": "María",
    "apellido": "García"
  }
}
```

**Errores:** `401` sin sesión, `404` usuario no encontrado.

---

### 4.7 `GET /usuarios/:id`

**Descripción:** busca un usuario por ID.

**Autenticación:** cookie.

**Entrada (path):**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `id` | entero | ID del usuario. |

**Salida `200`:** objeto `Usuario` (igual al ejemplo anterior).

**Errores:** `400` ID inválido, `401` sin sesión, `404` usuario no encontrado.

---

## 5. Proyectos

### 5.1 `POST /proyectos`

**Descripción:** crea un proyecto. El usuario autenticado queda como creador.

**Autenticación:** cookie.

**Entrada (body):**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `nombre` | string | Sí | No vacío, máx. 100. |
| `esquemaJson` | objeto JSON | No | Esquema inicial. |

```json
{
  "nombre": "Diagrama UML",
  "esquemaJson": {
    "nodos": [],
    "aristas": []
  }
}
```

**Salida `201`:**

```json
{
  "proyectoId": 5,
  "nombre": "Diagrama UML",
  "esquemaJson": {
    "nodos": [],
    "aristas": []
  },
  "creadorId": 1,
  "creador": {
    "usuarioId": 1,
    "username": "user1",
    "personaId": 1
  }
}
```

**Errores:** `400` body inválido, `401` sin sesión.

---

### 5.2 `GET /proyectos`

**Descripción:** lista **todos** los proyectos del sistema. Para los proyectos de un usuario usar `GET /usuarios/me/proyectos`.

**Autenticación:** cookie.

**Entrada (query):**

| Query | Tipo | Obligatorio | Valores |
|---|---|---|---|
| `pagina` | entero | No | ≥ 1. Por defecto `1`. |
| `limite` | entero | No | 1–100. Por defecto `10`. |

**Salida `200`:**

```json
{
  "datos": [
    {
      "proyectoId": 5,
      "nombre": "Diagrama UML",
      "esquemaJson": {
        "nodos": [],
        "aristas": []
      },
      "creadorId": 1,
      "creador": {
        "usuarioId": 1,
        "username": "user1",
        "personaId": 1
      }
    }
  ],
  "total": 10
}
```

**Errores:** `400` query inválida, `401` sin sesión.

---

### 5.3 `GET /proyectos/:id`

**Descripción:** obtiene un proyecto con su esquema actual.

**Autenticación:** cookie.

**Entrada (path):**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `id` | entero | ID del proyecto. |

**Salida `200`:**

```json
{
  "proyectoId": 5,
  "nombre": "Diagrama UML",
  "esquemaJson": {
    "nodos": [],
    "aristas": []
  },
  "creadorId": 1,
  "creador": {
    "usuarioId": 1,
    "username": "user1",
    "personaId": 1
  }
}
```

**Errores:** `400` ID inválido, `401` sin sesión, `404` proyecto no encontrado.

---

### 5.4 `PATCH /proyectos/:id`

**Descripción:** actualiza el nombre y/o el esquema del proyecto. Requiere ser creador o `EDITOR`.

**Autenticación:** cookie.

**Roles:** `CREADOR` o `EDITOR`.

**Entrada (path):**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `id` | entero | ID del proyecto. |

**Entrada (body, al menos un campo):**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `nombre` | string | No | No vacío, máx. 100. |
| `esquemaJson` | objeto JSON | No | Esquema completo. |

```json
{
  "nombre": "Diagrama UML v2",
  "esquemaJson": {
    "nodos": [],
    "aristas": []
  }
}
```

**Salida `200`:** objeto `Proyecto` actualizado (mismo formato que `GET /proyectos/:id`).

> Si se envía `esquemaJson`, se crea automáticamente una versión nueva y se notifica a los demás miembros del proyecto.

**Errores:** `400` body inválido, `401` sin sesión, `403` sin permiso de escritura, `404` proyecto no encontrado.

---

### 5.5 `DELETE /proyectos/:id`

**Descripción:** elimina el proyecto. Solo el creador puede hacerlo.

**Autenticación:** cookie.

**Roles:** `CREADOR`.

**Entrada (path):**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `id` | entero | ID del proyecto. |

**Salida `204`:** sin contenido.

> Al eliminar el proyecto se eliminan en cascada sus colaboradores, versiones y notificaciones.

**Errores:** `400` ID inválido, `401` sin sesión, `403` no es el creador, `404` proyecto no encontrado.

---

### 5.6 `POST /proyectos/:id/guardar-colaboracion`

**Descripción:** persiste en PostgreSQL el estado actual del documento colaborativo (Yjs). Requiere ser creador o `EDITOR`.

**Autenticación:** cookie.

**Roles:** `CREADOR` o `EDITOR`.

**Entrada (path):**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `id` | entero | ID del proyecto. |

**Entrada (body):** ninguno.

**Salida `200`:** objeto `Proyecto` actualizado.

> Si hubo cambios en el documento colaborativo, se crea una versión automática y se notifica a los demás miembros.

**Errores:** `400` ID inválido, `401` sin sesión, `403` sin permiso de escritura, `404` proyecto no encontrado.

---

### 5.7 `GET /proyectos/:id/versiones`

**Descripción:** lista las versiones del proyecto, de la más reciente a la más antigua.

**Autenticación:** cookie.

**Entrada (path):**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `id` | entero | ID del proyecto. |

**Entrada (query):**

| Query | Tipo | Obligatorio | Valores |
|---|---|---|---|
| `pagina` | entero | No | ≥ 1. Por defecto `1`. |
| `limite` | entero | No | 1–100. Por defecto `10`. |

**Salida `200`:**

```json
{
  "datos": [
    {
      "versionId": 12,
      "nombre": "Versión 3",
      "descripcion": "Guardado automático realizado por Juan Pérez.",
      "esquemaJson": {
        "nodos": [],
        "aristas": []
      },
      "creadaEn": "2026-11-02T19:00:00.000Z",
      "proyectoId": 5,
      "creadoPorId": 1,
      "creadoPor": {
        "usuarioId": 1,
        "username": "user1",
        "persona": {
          "personaId": 1,
          "nombre": "Juan",
          "apellido": "Pérez"
        }
      }
    }
  ],
  "total": 12
}
```

> Este endpoint no valida que el proyecto exista; si no existe, devuelve `{ "datos": [], "total": 0 }`.

**Errores:** `400` parámetros inválidos, `401` sin sesión.

---

### 5.8 `GET /proyectos/:id/versiones/:versionId`

**Descripción:** obtiene una versión concreta con su esquema completo.

**Autenticación:** cookie.

**Entrada (path):**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `id` | entero | ID del proyecto. |
| `versionId` | entero | ID de la versión. |

**Salida `200`:**

```json
{
  "versionId": 12,
  "nombre": "Versión 3",
  "descripcion": "Guardado automático realizado por Juan Pérez.",
  "esquemaJson": {
    "nodos": [],
    "aristas": []
  },
  "creadaEn": "2026-11-02T19:00:00.000Z",
  "proyectoId": 5,
  "creadoPorId": 1,
  "creadoPor": {
    "usuarioId": 1,
    "username": "user1",
    "persona": {
      "personaId": 1,
      "nombre": "Juan",
      "apellido": "Pérez"
    }
  }
}
```

**Errores:** `400` IDs inválidos, `401` sin sesión, `404` versión no encontrada o no pertenece al proyecto.

---

### 5.9 `POST /proyectos/:id/versiones`

**Descripción:** crea una versión manual con el esquema actual del proyecto. Requiere ser creador o `EDITOR`.

**Autenticación:** cookie.

**Roles:** `CREADOR` o `EDITOR`.

**Entrada (path):**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `id` | entero | ID del proyecto. |

**Entrada (body, opcional):**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `nombre` | string | No | Máx. 150. Si se omite: `Versión N`. |
| `descripcion` | string | No | Máx. 1000. |

```json
{
  "nombre": "Entrega parcial",
  "descripcion": "Versión antes de la revisión."
}
```

**Salida `201`:** objeto `Versión de proyecto` (mismo formato que `GET /proyectos/:id/versiones/:versionId`).

**Errores:** `400` body inválido, `401` sin sesión, `403` sin permiso de escritura, `404` proyecto no encontrado.

---

### 5.10 `POST /proyectos/:id/versiones/:versionId/restaurar`

**Descripción:** restaura el esquema de una versión. Requiere ser creador o `EDITOR`.

**Autenticación:** cookie.

**Roles:** `CREADOR` o `EDITOR`.

**Entrada (path):**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `id` | entero | ID del proyecto. |
| `versionId` | entero | ID de la versión a restaurar. |

**Entrada (body):** ninguno.

**Salida `200`:** objeto `Proyecto` con el esquema restaurado.

> Además de restaurar el proyecto, actualiza el documento colaborativo en vivo, crea una versión nueva llamada `Restauración de <nombre>` y notifica a los demás miembros.

**Errores:** `400` IDs inválidos, `401` sin sesión, `403` sin permiso de escritura, `404` proyecto o versión no encontrados.

---

## 6. Colaboradores

> La gestión de colaboradores está permitida **solo al creador del proyecto**. Un `EDITOR` no puede listar, asignar, cambiar permisos ni remover colaboradores.

### 6.1 `GET /proyectos/:proyectoId/colaboradores`

**Descripción:** lista los colaboradores del proyecto.

**Autenticación:** cookie.

**Roles:** `CREADOR`.

**Entrada (path):**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `proyectoId` | entero | ID del proyecto. |

**Salida `200`:**

```json
[
  {
    "usuarioId": 2,
    "proyectoId": 5,
    "permisoId": 2,
    "usuario": {
      "usuarioId": 2,
      "username": "user2",
      "personaId": 2,
      "persona": {
        "personaId": 2,
        "nombre": "María",
        "apellido": "García"
      }
    },
    "permiso": {
      "permisoId": 2,
      "nombre": "EDITOR"
    }
  }
]
```

> El creador no aparece en esta lista; ya viene en `proyecto.creador`. Para mostrar todos los miembros, combina el creador con esta lista.

**Errores:** `400` ID inválido, `401` sin sesión, `403` no es el creador, `404` proyecto no encontrado.

---

### 6.2 `POST /proyectos/:proyectoId/colaboradores`

**Descripción:** asigna un usuario como colaborador. Si ya existe, actualiza su permiso.

**Autenticación:** cookie.

**Roles:** `CREADOR`.

**Entrada (path):**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `proyectoId` | entero | ID del proyecto. |

**Entrada (body):**

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `usuarioId` | entero positivo | Sí | Usuario a asignar. |
| `permisoId` | entero positivo | Sí | `1` = LECTOR, `2` = EDITOR. |

```json
{
  "usuarioId": 2,
  "permisoId": 2
}
```

**Salida `201`:**

```json
{
  "usuarioId": 2,
  "proyectoId": 5,
  "permisoId": 2,
  "usuario": {
    "usuarioId": 2,
    "username": "user2",
    "personaId": 2,
    "persona": {
      "personaId": 2,
      "nombre": "María",
      "apellido": "García"
    }
  },
  "permiso": {
    "permisoId": 2,
    "nombre": "EDITOR"
  }
}
```

**Errores:** `400` body inválido, `401` sin sesión, `403` no es el creador, `404` usuario, permiso o proyecto no encontrados.

---

### 6.3 `PATCH /proyectos/:proyectoId/colaboradores/:usuarioId`

**Descripción:** cambia el permiso de un colaborador.

**Autenticación:** cookie.

**Roles:** `CREADOR`.

**Entrada (path):**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `proyectoId` | entero | ID del proyecto. |
| `usuarioId` | entero | ID del colaborador. |

**Entrada (body):**

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `permisoId` | entero positivo | Sí | `1` = LECTOR, `2` = EDITOR. |

```json
{
  "permisoId": 1
}
```

**Salida `200`:** objeto `Colaborador` actualizado (mismo formato que el ejemplo anterior).

**Errores:** `400` body inválido, `401` sin sesión, `403` no es el creador, `404` proyecto, colaborador o permiso no encontrados.

---

### 6.4 `DELETE /proyectos/:proyectoId/colaboradores/:usuarioId`

**Descripción:** remueve a un colaborador del proyecto.

**Autenticación:** cookie.

**Roles:** `CREADOR`.

**Entrada (path):**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `proyectoId` | entero | ID del proyecto. |
| `usuarioId` | entero | ID del colaborador. |

**Salida `204`:** sin contenido.

**Errores:** `400` IDs inválidos, `401` sin sesión, `403` no es el creador, `404` proyecto o colaborador no encontrados.

---

## 7. Permisos

### 7.1 `GET /permisos`

**Descripción:** lista los permisos disponibles.

**Autenticación:** cookie.

**Entrada:** sin body ni query.

**Salida `200`:**

```json
[
  {
    "permisoId": 1,
    "nombre": "LECTOR"
  },
  {
    "permisoId": 2,
    "nombre": "EDITOR"
  }
]
```

**Errores:** `401` sin sesión.

---

### 7.2 `POST /permisos`

**Descripción:** crea un permiso nuevo. No existe un rol de administrador: cualquier usuario autenticado puede llamarlo.

**Autenticación:** cookie.

**Entrada (body):**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `nombre` | string | Sí | No vacío, máx. 50, único. |

```json
{
  "nombre": "COMENTARISTA"
}
```

**Salida `201`:**

```json
{
  "permisoId": 3,
  "nombre": "COMENTARISTA"
}
```

**Errores:** `400` body inválido, `401` sin sesión. El `nombre` es único en la base de datos.

---

### 7.3 `DELETE /permisos/:id`

**Descripción:** elimina un permiso.

**Autenticación:** cookie.

**Entrada (path):**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `id` | entero | ID del permiso. |

**Salida `204`:** sin contenido.

**Errores:** `400` ID inválido, `401` sin sesión, `404` permiso no encontrado, `409` si el permiso está asignado a colaboradores.

---

## 8. Notificaciones

### 8.1 `GET /notificaciones`

**Descripción:** historial de notificaciones del usuario autenticado, de la más reciente a la más antigua.

**Autenticación:** cookie.

**Entrada (query):**

| Query | Tipo | Obligatorio | Valores |
|---|---|---|---|
| `pagina` | entero | No | ≥ 1. Por defecto `1`. |
| `limite` | entero | No | 1–100. Por defecto `10`. |

**Salida `200`:**

```json
{
  "datos": [
    {
      "notificacionId": 30,
      "tipoAccion": "VERSION_RESTAURADA",
      "titulo": "Versión restaurada",
      "mensaje": "María García restauró la versión \"Versión 2\" del proyecto \"Diagrama UML\".",
      "datos": {
        "tipoAccion": "VERSION_RESTAURADA",
        "proyectoId": "5",
        "nombreProyecto": "Diagrama UML",
        "actorId": "2",
        "actorUsername": "user2",
        "actorNombre": "María García",
        "versionId": "10",
        "nombreVersion": "Versión 2"
      },
      "leida": false,
      "enviada": true,
      "creadaEn": "2026-11-02T19:00:00.000Z",
      "destinatarioId": 1,
      "actorId": 2,
      "proyectoId": 5,
      "actor": {
        "usuarioId": 2,
        "username": "user2",
        "persona": {
          "personaId": 2,
          "nombre": "María",
          "apellido": "García"
        }
      }
    }
  ],
  "total": 1,
  "noLeidas": 1
}
```

**Errores:** `400` query inválida, `401` sin sesión.

---

### 8.2 `PATCH /notificaciones/leidas`

**Descripción:** marca todas las notificaciones del usuario como leídas.

**Autenticación:** cookie.

**Entrada:** sin body.

**Salida `204`:** sin contenido.

**Errores:** `401` sin sesión.

---

### 8.3 `PATCH /notificaciones/:id/leida`

**Descripción:** marca una notificación como leída. Solo funciona con notificaciones del usuario autenticado.

**Autenticación:** cookie.

**Entrada (path):**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `id` | entero | ID de la notificación. |

**Salida `200`:**

```json
{
  "notificacionId": 30,
  "tipoAccion": "PROYECTO_GUARDADO",
  "titulo": "Proyecto guardado",
  "mensaje": "María García guardó el proyecto \"Diagrama UML\".",
  "datos": {
    "tipoAccion": "PROYECTO_GUARDADO",
    "proyectoId": "5",
    "nombreProyecto": "Diagrama UML",
    "actorId": "2",
    "actorUsername": "user2",
    "actorNombre": "María García"
  },
  "leida": true,
  "enviada": true,
  "creadaEn": "2026-11-02T19:00:00.000Z",
  "destinatarioId": 1,
  "actorId": 2,
  "proyectoId": 5
}
```

**Errores:** `400` ID inválido, `401` sin sesión, `404` notificación no encontrada o de otro usuario.

---

## 9. Salud

### 9.1 `GET /`

**Descripción:** comprueba que el servidor está arriba.

**Autenticación:** pública.

**Entrada:** ninguna.

**Salida `200`:**

```text
Hello World!
```

---

## 10. Modelos de datos

### 10.1 `Usuario`

```json
{
  "usuarioId": 1,
  "username": "user1",
  "personaId": 1,
  "persona": {
    "personaId": 1,
    "nombre": "Juan",
    "apellido": "Pérez"
  }
}
```

Campos nunca devueltos: `contrasena`, `tokenFirebase`.

### 10.2 `Proyecto`

```json
{
  "proyectoId": 5,
  "nombre": "Diagrama UML",
  "esquemaJson": {
    "nodos": [],
    "aristas": []
  },
  "creadorId": 1,
  "creador": {
    "usuarioId": 1,
    "username": "user1",
    "personaId": 1
  }
}
```

> En los endpoints de proyectos, `creador` viene sin la relación `persona`.

### 10.3 `Colaborador`

```json
{
  "usuarioId": 2,
  "proyectoId": 5,
  "permisoId": 2,
  "usuario": {
    "usuarioId": 2,
    "username": "user2",
    "personaId": 2,
    "persona": {
      "personaId": 2,
      "nombre": "María",
      "apellido": "García"
    }
  },
  "permiso": {
    "permisoId": 2,
    "nombre": "EDITOR"
  }
}
```

### 10.4 `Permiso`

```json
{
  "permisoId": 1,
  "nombre": "LECTOR"
}
```

Permisos iniciales:

| `permisoId` | `nombre` |
|---|---|
| `1` | `LECTOR` |
| `2` | `EDITOR` |

### 10.5 `Versión de proyecto`

```json
{
  "versionId": 12,
  "nombre": "Versión 3",
  "descripcion": "Guardado automático realizado por Juan Pérez.",
  "esquemaJson": {
    "nodos": [],
    "aristas": []
  },
  "creadaEn": "2026-11-02T19:00:00.000Z",
  "proyectoId": 5,
  "creadoPorId": 1,
  "creadoPor": {
    "usuarioId": 1,
    "username": "user1",
    "persona": {
      "personaId": 1,
      "nombre": "Juan",
      "apellido": "Pérez"
    }
  }
}
```

### 10.6 `Notificación`

```json
{
  "notificacionId": 30,
  "tipoAccion": "PROYECTO_GUARDADO",
  "titulo": "Proyecto guardado",
  "mensaje": "María García guardó el proyecto \"Diagrama UML\".",
  "datos": {
    "tipoAccion": "PROYECTO_GUARDADO",
    "proyectoId": "5",
    "nombreProyecto": "Diagrama UML",
    "actorId": "2",
    "actorUsername": "user2",
    "actorNombre": "María García"
  },
  "leida": false,
  "enviada": true,
  "creadaEn": "2026-11-02T19:00:00.000Z",
  "destinatarioId": 1,
  "actorId": 2,
  "proyectoId": 5,
  "actor": {
    "usuarioId": 2,
    "username": "user2",
    "persona": {
      "personaId": 2,
      "nombre": "María",
      "apellido": "García"
    }
  }
}
```

---

## 11. Notificaciones push (FCM)

### 11.1 Registro del token

El token se puede enviar:

1. En `POST /auth/registrarse` como `tokenFirebase`.
2. En `POST /auth/iniciar-sesion` como `tokenFirebase`.
3. Después del login con `PUT /usuarios/me/token-firebase`.

Para renovaciones:

```text
FirebaseMessaging.instance.onTokenRefresh → PUT /usuarios/me/token-firebase
```

Para eliminarlo al cerrar sesión:

```text
DELETE /usuarios/me/token-firebase
```

### 11.2 Acciones que generan notificación

| Acción | `tipoAccion` | Cuándo |
|---|---|---|
| Guardar esquema | `PROYECTO_GUARDADO` | `PATCH /proyectos/:id` con `esquemaJson` o `POST /proyectos/:id/guardar-colaboracion` con cambios. |
| Restaurar versión | `VERSION_RESTAURADA` | `POST /proyectos/:id/versiones/:versionId/restaurar`. |

### 11.3 Destinatarios

- Creador del proyecto.
- Todos los colaboradores.
- **Excepto** el usuario que realizó la acción.

### 11.4 Payload FCM

```json
{
  "tipoAccion": "PROYECTO_GUARDADO",
  "proyectoId": "5",
  "nombreProyecto": "Diagrama UML",
  "actorId": "2",
  "actorUsername": "user2",
  "actorNombre": "María García"
}
```

En restauraciones también incluye:

```json
{
  "versionId": "10",
  "nombreVersion": "Versión 2"
}
```

### 11.5 Requisito del backend

Para enviar push, el backend necesita una de estas configuraciones:

```env
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

o:

```env
GOOGLE_APPLICATION_CREDENTIALS=/ruta/al/service-account.json
```

Si no hay credenciales, el backend guarda la notificación en la base de datos con `enviada=false` y no envía el push.

---

## 12. Restricciones y notas actuales

1. **Lecturas abiertas:** los `GET` de proyectos, versiones y colaboradores no validan membresía; cualquier usuario autenticado puede consultarlos.
2. **Gestión de colaboradores:** solo el creador del proyecto.
3. **Eliminación de proyecto:** solo el creador.
4. **Edición y versiones:** creador o `EDITOR`.
5. **Un token FCM por usuario:** si el mismo usuario inicia sesión en dos dispositivos, el último token reemplaza al anterior.
6. **Sincronización de base de datos:** TypeORM usa `synchronize: true`; al arrancar el backend crea las tablas y columnas nuevas automáticamente.
