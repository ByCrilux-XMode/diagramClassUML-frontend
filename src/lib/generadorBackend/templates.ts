// Archivos estáticos del proyecto Spring Boot generado.
// Spring Boot 3.2.x + Java 17 + H2 en memoria (cero dependencias externas).

export const SPRING_BOOT_VERSION = "3.2.5";
export const JAVA_VERSION = "17";

export function pomXml(packageName: string, artifactId: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>${SPRING_BOOT_VERSION}</version>
        <relativePath/>
    </parent>
    <groupId>${packageName}</groupId>
    <artifactId>${artifactId}</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <name>${artifactId}</name>
    <description>Proyecto generado desde diagrama UML de clases</description>
    <properties>
        <java.version>${JAVA_VERSION}</java.version>
    </properties>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        <dependency>
            <groupId>com.h2database</groupId>
            <artifactId>h2</artifactId>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>
        <dependency>
            <groupId>org.springdoc</groupId>
            <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
            <version>2.5.0</version>
        </dependency>
    </dependencies>
    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
`;
}

export function applicationProperties(): string {
  return `server.port=8080
spring.datasource.url=jdbc:h2:mem:testdb;DB_CLOSE_DELAY=-1
spring.datasource.driver-class-name=org.h2.Driver
spring.datasource.username=sa
spring.datasource.password=
spring.jpa.hibernate.ddl-auto=update
spring.jpa.show-sql=false
spring.h2.console.enabled=true
spring.h2.console.path=/h2-console
spring.jackson.serialization.fail-on-empty-beans=false
`;
}

export function applicationJava(packageName: string, appName: string): string {
  return `package ${packageName};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class ${appName} {

    public static void main(String[] args) {
        SpringApplication.run(${appName}.class, args);
    }
}
`;
}

export function readmeMd(
  projectName: string,
  entities: string[]
): string {
  const list = entities.map((e) => `- \`GET/POST /api/${e}\` (y \`GET/PUT/DELETE /api/${e}/{id}\`)`).join("\n");
  return `# ${projectName} (Spring Boot, generado desde UML)

Proyecto generado automáticamente desde el diagrama de clases.
Stack: Spring Boot ${SPRING_BOOT_VERSION} + Java ${JAVA_VERSION} + H2 en memoria (sin BD externa).

## Puesta en marcha en 3 pasos (para el evaluador)

1. **Descomprimir** este ZIP en cualquier carpeta (ruta sin tildes ni espacios, ej. \`C:\\proyectos\\miapp-notchables\`).
2. **Doble clic** en \`iniciar.bat\` (Windows) o \`./iniciar.sh\` (Linux/Mac; antes: \`chmod +x mvnw iniciar.sh\`).
3. **Probar en el navegador**: http://localhost:8080/swagger-ui.html (documentación interactiva: permite ejecutar cada endpoint sin instalar nada).

> No necesitas instalar Maven: el proyecto trae el Maven Wrapper (\`mvnw\`, \`mvnw.cmd\`) que lo descarga solo la primera vez.

## Requisitos

- JDK ${JAVA_VERSION} o superior: https://adoptium.net/ (verifica con \`java -version\`)
- Internet **solo la primera vez** (descarga Maven ~10 MB + dependencias ~150 MB)
- Puerto 8080 libre

## Alternativas manuales

\`\`\`bash
# Linux / Mac
./mvnw spring-boot:run
# Windows
mvnw.cmd spring-boot:run
\`\`\`

## Probar con Postman (opcional)

1. Importar \`postman_collection.json\` en Postman.
2. \`POST /api/...\` para crear, \`GET /api/...\` para listar.

## Consola H2 (opcional)

http://localhost:8080/h2-console — JDBC URL \`jdbc:h2:mem:testdb\`, usuario \`sa\`, sin contraseña.

## Endpoints generados

${list || "(sin entidades)"}

## Si algo falla

| Síntoma | Causa probable | Solución |
|---|---|---|
| \`No se encontro Java\` / versión menor a 17 | Falta JDK 17+ | Instalar desde https://adoptium.net/ |
| Error descargando Maven o dependencias | Sin internet | Conectar la red e intentar de nuevo (solo 1ra vez) |
| \`Puerto 8080 en uso\` | Otro servidor corriendo | Cerrar la otra ventana o detener ese proceso |
| El navegador dice "sin conexión" | El servidor aún arranca | Esperar a ver \`Started Application\` y recargar |

## Notas

- Las relaciones se envían como objeto anidado con la PK del destino: \`{"persona": {"personaId": 1}}\`.
- La base de datos es en memoria: al reiniciar se borra todo.
`;
}

// ---------------- Maven Wrapper ----------------
// Bootstrap mínimo que delega en el wrapper oficial de Apache:
// descarga maven-wrapper.jar una vez y este a su vez descarga Maven 3.9.x.
// Así el evaluador NO necesita Maven instalado.

export const MAVEN_DIST_URL =
  "https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.9/apache-maven-3.9.9-bin.zip";
export const WRAPPER_JAR_URL =
  "https://repo.maven.apache.org/maven2/org/apache/maven/wrapper/maven-wrapper/3.3.2/maven-wrapper-3.3.2.jar";

export function mavenWrapperProperties(): string {
  return `distributionUrl=${MAVEN_DIST_URL}
wrapperUrl=${WRAPPER_JAR_URL}
`;
}

export function mvnwSh(): string {
  return `#!/bin/sh
# Bootstrap minimo del Maven Wrapper (delega en el wrapper oficial de Apache).
BASEDIR=$(dirname "$0")
PROPS="$BASEDIR/.mvn/wrapper/maven-wrapper.properties"
JAR="$BASEDIR/.mvn/wrapper/maven-wrapper.jar"
if [ -f "$PROPS" ]; then
  WRAPPER_URL=$(grep -E '^wrapperUrl=' "$PROPS" | cut -d= -f2-)
fi
if [ -z "$WRAPPER_URL" ]; then
  WRAPPER_URL="${WRAPPER_JAR_URL}"
fi
if [ -n "$JAVA_HOME" ]; then
  JAVA_EXE="$JAVA_HOME/bin/java"
else
  JAVA_EXE="java"
fi
if ! "$JAVA_EXE" -version >/dev/null 2>&1; then
  echo "[ERROR] No se encontro Java. Instala JDK 17 o superior: https://adoptium.net/"
  exit 1
fi
if [ ! -f "$JAR" ]; then
  mkdir -p "$BASEDIR/.mvn/wrapper"
  echo "Descargando Maven Wrapper (solo la primera vez)..."
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL -o "$JAR" "$WRAPPER_URL" || exit 1
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$JAR" "$WRAPPER_URL" || exit 1
  else
    echo "[ERROR] Se necesita curl o wget para la primera descarga."
    exit 1
  fi
fi
exec "$JAVA_EXE" -classpath "$JAR" "-Dmaven.multiModuleProjectDirectory=$BASEDIR" org.apache.maven.wrapper.MavenWrapperMain "$@"
`;
}

export function mvnwCmd(): string {
  const lines = [
    "@echo off",
    "rem Bootstrap minimo del Maven Wrapper (delega en el wrapper oficial de Apache).",
    "setlocal EnableDelayedExpansion",
    "",
    "set \"BASEDIR=%~dp0\"",
    "if \"%BASEDIR:~-1%\"==\"\\\" set \"BASEDIR=%BASEDIR:~0,-1%\"",
    "set \"WRAPPER_PROPS=%BASEDIR%\\.mvn\\wrapper\\maven-wrapper.properties\"",
    "set \"WRAPPER_JAR=%BASEDIR%\\.mvn\\wrapper\\maven-wrapper.jar\"",
    `set "WRAPPER_URL=${WRAPPER_JAR_URL}"`,
    "if exist \"%WRAPPER_PROPS%\" (",
    "  for /f \"usebackq tokens=1,* delims==\" %%A in (\"%WRAPPER_PROPS%\") do (",
    "    if \"%%A\"==\"wrapperUrl\" set \"WRAPPER_URL=%%B\"",
    "  )",
    ")",
    "",
    "set \"JAVA_EXE=java\"",
    "if defined JAVA_HOME set \"JAVA_EXE=%JAVA_HOME%\\bin\\java\"",
    "\"%JAVA_EXE%\" -version >nul 2>&1",
    "if errorlevel 1 (",
    "  echo [ERROR] No se encontro Java. Instala JDK 17 o superior: https://adoptium.net/",
    "  exit /b 1",
    ")",
    "",
    "if not exist \"%WRAPPER_JAR%\" (",
    "  echo Descargando Maven Wrapper, solo la primera vez...",
    "  if not exist \"%BASEDIR%\\.mvn\\wrapper\" mkdir \"%BASEDIR%\\.mvn\\wrapper\"",
    "  powershell -NoProfile -ExecutionPolicy Bypass -Command \"[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '!WRAPPER_URL!' -OutFile '!WRAPPER_JAR!'\"",
    "  if errorlevel 1 (",
    "    echo [ERROR] Sin internet no se puede descargar Maven. Conecta la red e intenta de nuevo.",
    "    exit /b 1",
    "  )",
    ")",
    "",
    "\"%JAVA_EXE%\" -classpath \"%WRAPPER_JAR%\" \"-Dmaven.multiModuleProjectDirectory=%BASEDIR%\" org.apache.maven.wrapper.MavenWrapperMain %*",
  ];
  return lines.join("\r\n") + "\r\n";
}

// ---------------- Scripts de un clic ----------------

export function iniciarBat(): string {
  const lines = [
    "@echo off",
    "rem === INICIAR: backend Spring Boot generado desde UML (doble clic) ===",
    "cd /d \"%~dp0\"",
    "echo ===============================================",
    "echo  Backend Spring Boot (generado desde UML)",
    "echo ===============================================",
    "echo.",
    "where java >nul 2>nul",
    "if errorlevel 1 goto :nojava",
    "for /f \"tokens=3\" %%v in ('java -version 2^>^&1 ^| findstr /i \"version\"') do set JAVAV=%%v",
    "set JAVAV=%JAVAV:\"=%",
    "for /f \"tokens=1 delims=.\" %%a in (\"%JAVAV%\") do set JAVAMAJOR=%%a",
    "if %JAVAMAJOR% LSS 17 goto :oldjava",
    "echo [OK] Java %JAVAV% detectado.",
    "goto :portcheck",
    ":nojava",
    "echo [ERROR] No se encontro Java.",
    "echo Instala JDK 17 o superior desde https://adoptium.net/ y vuelve a intentarlo.",
    "pause",
    "exit /b 1",
    ":oldjava",
    "echo [ERROR] Tu Java es %JAVAV% y se necesita 17 o superior.",
    "echo Instala JDK 17 o superior desde https://adoptium.net/ y vuelve a intentarlo.",
    "pause",
    "exit /b 1",
    ":portcheck",
    "netstat -ano | findstr /r /c:\":8080 .*LISTENING\" >nul 2>nul",
    "if not errorlevel 1 (",
    "  echo [AVISO] El puerto 8080 ya esta en uso por otro servidor.",
    "  echo Cierra la otra ventana o detiene ese proceso antes de continuar.",
    "  pause",
    "  exit /b 1",
    ")",
    "echo [OK] Puerto 8080 libre.",
    "echo.",
    "echo Arrancando el servidor (la primera vez descarga Maven y dependencias)...",
    "echo Cuando veas 'Started Application', abre http://localhost:8080/swagger-ui.html",
    "echo.",
    "start \"\" /min cmd /c \"timeout /t 60 /nobreak >nul & start http://localhost:8080/swagger-ui.html\"",
    "call mvnw.cmd spring-boot:run",
    "pause",
  ];
  return lines.join("\r\n") + "\r\n";
}

export function iniciarSh(): string {
  return `#!/bin/sh
# === INICIAR: backend Spring Boot generado desde UML ===
cd "$(dirname "$0")" || exit 1
echo "==============================================="
echo " Backend Spring Boot (generado desde UML)"
echo "==============================================="
echo ""
if ! command -v java >/dev/null 2>&1; then
  echo "[ERROR] No se encontro Java."
  echo "Instala JDK 17 o superior desde https://adoptium.net/ y vuelve a intentarlo."
  exit 1
fi
JAVAV=$(java -version 2>&1 | grep -i version | head -n 1 | cut -d'"' -f2 | cut -d. -f1)
if [ "$JAVAV" -lt 17 ] 2>/dev/null; then
  echo "[ERROR] Tu Java es antiguo y se necesita 17 o superior."
  echo "Instala JDK 17 o superior desde https://adoptium.net/ y vuelve a intentarlo."
  exit 1
fi
echo "[OK] Java detectado."
if command -v ss >/dev/null 2>&1; then
  if ss -ltn 2>/dev/null | grep -q ":8080 "; then
    echo "[AVISO] El puerto 8080 ya esta en uso. Cierra el otro servidor antes de continuar."
    exit 1
  fi
fi
echo "[OK] Puerto 8080 libre."
echo ""
echo "Arrancando el servidor (la primera vez descarga Maven y dependencias)..."
echo "Cuando veas 'Started Application', abre http://localhost:8080/swagger-ui.html"
echo ""
if command -v xdg-open >/dev/null 2>&1; then
  (sleep 60; xdg-open http://localhost:8080/swagger-ui.html) >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
  (sleep 60; open http://localhost:8080/swagger-ui.html) >/dev/null 2>&1 &
fi
exec ./mvnw spring-boot:run
`;
}
