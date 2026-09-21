// Generadores de las 4 capas: Entity / Repository(interface) / Service / Controller.
// Entidades con Lombok (@Getter @Setter @NoArgsConstructor). Se evita @Data a
// propósito: su equals/hashCode sobre relaciones JPA puede causar recursión.
// Repository: JpaRepository estándar + queries derivados por atributo (findBy,
// getBy, existsBy, countBy, findAllBy, deleteBy). Service/Controller: CRUD puro.

import type { EntityModel, EnumModel, InterfaceModel, DerivedQuery, JavaMethod } from "./mapper";
import { toResourcePlural } from "./utils";

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function uncap(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// ---------------- INTERFACE ----------------

export function interfaceJava(pkg: string, i: InterfaceModel): string {
  const methodSigs = i.methods
    .map((m) => `    ${m.returnJavaType} ${m.javaName}(${m.params.map((p) => `${p.javaType} ${p.name}`).join(", ")});`)
    .join("\n");
  return `package ${pkg}.entity;

public interface ${i.className} {
${methodSigs}
}
`;
}

// ---------------- ENUM ----------------

export function enumJava(pkg: string, e: EnumModel): string {
  const lits = e.literals.map((l) => `    ${l}`).join(",\n");
  return `package ${pkg}.entity;

public enum ${e.className} {
${lits};
}
`;
}

// ---------------- ENTITY ----------------

export function entityJava(pkg: string, e: EntityModel): string {
  const imports = new Set<string>([
    "jakarta.persistence.*",
    "com.fasterxml.jackson.annotation.JsonIgnoreProperties",
    "lombok.Getter",
    "lombok.Setter",
    "lombok.NoArgsConstructor",
  ]);
  for (const s of e.scalars) if (s.importExtra) imports.add(s.importExtra);

  const extendsClause = e.parentClassName ? ` extends ${e.parentClassName}` : "";
  const abstractKw = e.isAbstract ? "abstract " : "";
  const inheritance =
    e.isParent && !e.parentClassName ? "\n@Inheritance(strategy = InheritanceType.JOINED)" : "";

  const pkBlock = e.pk
    ? `    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "${e.pk.columnName}")
    private ${e.pk.javaType} ${e.pk.javaName};
`
    : "";

  const scalarBlocks = e.scalars
    .map((s) => {
      const isEnum = isEnumType(s.javaType);
      const ann = isEnum
        ? `    @Enumerated(EnumType.STRING)\n    @Column(name = "${s.columnName}")`
        : `    @Column(name = "${s.columnName}")`;
      return `${ann}\n    private ${s.javaType} ${s.javaName};`;
    })
    .join("\n") + (e.scalars.length ? "\n" : "");

  const relationBlocks =
    e.relations
      .map((r) => {
        const ann =
          r.kind === "one_to_one"
            ? `    @OneToOne\n    @JoinColumn(name = "${r.columnName}", unique = true)`
            : `    @ManyToOne\n    @JoinColumn(name = "${r.columnName}")`;
        return `${ann}\n    private ${r.targetClassName} ${r.javaName};`;
      })
      .join("\n") + (e.relations.length ? "\n" : "");

const implementsClause = e.implementedInterfaces.length > 0
    ? ` implements ${e.implementedInterfaces.join(", ")}`
    : "";

  // Generar implementaciones stub para métodos de interfaces implementadas
  // Identificar métodos que vienen de interfaces (los que tienen abstractOnly=true)
  const interfaceMethods = e.methods.filter((m) => m.abstractOnly);

  const interfaceMethodBlocks = interfaceMethods.length > 0
    ? `\n    // Métodos de interfaces implementadas\n${interfaceMethods.map((m: JavaMethod) => {
      const stubBody = m.returnJavaType === "void"
        ? "// TODO: implementar"
        : `return ${m.returnJavaType === "String" ? '""' : m.returnJavaType === "Boolean" ? "false" : m.returnJavaType === "Long" || m.returnJavaType === "Integer" ? "0L" : "null"};`;
      return `
    // Operación de interface: ${m.umlName}
    public ${m.returnJavaType} ${m.javaName}(${m.params.map((p) => `${p.javaType} ${p.name}`).join(", ")}) {
        ${stubBody}
    }`;
    }).join("\n")}`
    : "";

  return `package ${pkg}.entity;
${e.parentClassName ? `import ${pkg}.entity.${e.parentClassName};` : ""}
${e.implementedInterfaces.length > 0 ? e.implementedInterfaces.map((i) => `import ${pkg}.entity.${i};`).join("\n") : ""}
${[...imports].map((i) => `import ${i};`).join("\n")}

@Entity${inheritance}
@Getter
@Setter
@NoArgsConstructor
@JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
public ${abstractKw}class ${e.className}${extendsClause}${implementsClause} {

${pkBlock}${scalarBlocks}${relationBlocks}${interfaceMethodBlocks}}
`;
}

const JDK_TYPES = new Set(["String", "Integer", "Long", "Double", "Boolean", "LocalDate", "LocalDateTime"]);

function isEnumType(javaType: string): boolean {
  return !JDK_TYPES.has(javaType) && /^[A-Z]/.test(javaType);
}

// ---------------- REPOSITORY (interface) ----------------

export function repositoryJava(pkg: string, e: EntityModel, pkType: string, derived: DerivedQuery[] = []): string {
  const needOptional = derived.some((d) => d.signature.startsWith("Optional<"));
  const needList = derived.some((d) => d.signature.startsWith("List<"));
  const knownJavaTypes = new Set(["String", "Integer", "Long", "Double", "Boolean", "LocalDate", "LocalDateTime", "Optional", "List", "void"]);
  // Tipos que requieren import java.time aunque sean "conocidos"
  const needsTimeImport = new Set(["LocalDate", "LocalDateTime"]);
  const relationImports = [...new Set(derived
    .map((d) => {
      const paramsMatch = d.signature.match(/\(([^)]*)\)/);
      if (!paramsMatch) return null;
      const params = paramsMatch[1].split(",").map(p => p.trim());
      const imports: string[] = [];
      for (const param of params) {
        if (!param) continue;
        const paramType = param.split(" ")[0];
        if (!knownJavaTypes.has(paramType) && paramType !== e.className) {
          imports.push(`import ${pkg}.entity.${paramType};`);
        } else if (needsTimeImport.has(paramType)) {
          imports.push(`import java.time.${paramType};`);
        }
      }
      return imports.join("\n");
    })
    .filter((x): x is string => x !== null && x !== "")
  )].join("\n");
  const derivedBlock = derived.map((d) => `    ${d.signature}`).join("\n");
  return `package ${pkg}.repository;

import ${pkg}.entity.${e.className};
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
${relationImports}
${needOptional ? "import java.util.Optional;\n" : ""}${needList ? "import java.util.List;\n" : ""}
@Repository
public interface ${e.className}Repository extends JpaRepository<${e.className}, ${pkType}> {
${derivedBlock}}
`;
}

// ---------------- SERVICE ----------------
// Re-adjunta las relaciones por id (findById().orElse(null)): evita el
// TransientPropertyValueException cuando el JSON trae {"entidad": {"<pk>": 1}}.

export function serviceJava(
  pkg: string,
  e: EntityModel,
  pkType: string,
  allEntities: EntityModel[]
): string {
  const repo = `${e.className}Repository`;
  const repoField = `${uncap(e.className)}Repository`;
  const copies = [
    ...e.scalars.map((s) => `            actual.set${cap(s.javaName)}(datos.get${cap(s.javaName)}());`),
    ...e.relations.map((r) => `            actual.set${cap(r.javaName)}(datos.get${cap(r.javaName)}());`),
  ].join("\n");

  const repoImports = e.relations.map((r) => `import ${pkg}.repository.${r.targetClassName}Repository;`).join("\n");
  const repoFields = e.relations
    .map((r) => `    private final ${r.targetClassName}Repository ${uncap(r.targetClassName)}Repository;`)
    .join("\n");
  const ctorParams = [
    `${repo} ${repoField}`,
    ...e.relations.map((r) => `${r.targetClassName}Repository ${uncap(r.targetClassName)}Repository`),
  ].join(", ");
  const ctorAssigns = [
    `        this.${repoField} = ${repoField};`,
    ...e.relations.map((r) => `        this.${uncap(r.targetClassName)}Repository = ${uncap(r.targetClassName)}Repository;`),
  ].join("\n");
  const reattachLines = e.relations
    .map((r) => {
      const pkGetter = pkGetterOf(allEntities, r.targetClassName);
      return `        if (datos.get${cap(r.javaName)}() != null && datos.get${cap(r.javaName)}().${pkGetter}() != null) {
            datos.set${cap(r.javaName)}(${uncap(r.targetClassName)}Repository.findById(datos.get${cap(r.javaName)}().${pkGetter}()).orElse(null));
        }`;
    })
    .join("\n");
  const reattachBlock = reattachLines
    ? `
    private void reatacharRelaciones(${e.className} datos) {
${reattachLines}
    }
`
    : "";

  return `package ${pkg}.service;

import ${pkg}.entity.*;
import ${pkg}.repository.${repo};
${repoImports}
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

@Service
public class ${e.className}Service {

    private final ${repo} ${repoField};
${repoFields}

    public ${e.className}Service(${ctorParams}) {
${ctorAssigns}
    }
${reattachBlock}
    public List<${e.className}> listarTodos() {
        return ${repoField}.findAll();
    }

    public ${e.className} buscarPorId(${pkType} id) {
        return ${repoField}.findById(id).orElse(null);
    }

    @Transactional
    public ${e.className} guardar(${e.className} datos) {
${e.relations.length ? "        reatacharRelaciones(datos);\n" : ""}        return ${repoField}.save(datos);
    }

    @Transactional
    public ${e.className} actualizar(${pkType} id, ${e.className} datos) {
        ${e.className} actual = ${repoField}.findById(id).orElse(null);
        if (actual == null) {
            return null;
        }
${copies}
${e.relations.length ? "        reatacharRelaciones(actual);\n" : ""}        return ${repoField}.save(actual);
    }

    @Transactional
    public boolean eliminar(${pkType} id) {
        if (!${repoField}.existsById(id)) {
            return false;
        }
        ${repoField}.deleteById(id);
        return true;
    }
}
`; 
}

/** Nombre del getter de la PK de la entidad objetivo (respeta persona_id -> getPersonaId). */
export function pkGetterOf(allEntities: EntityModel[], targetClassName: string): string {
  const t = allEntities.find((x) => x.className === targetClassName);
  const pkName = t?.pk?.javaName ?? (t?.parentKey ? pkNameOf(allEntities, t.parentKey) : "id");
  return `get${cap(pkName)}`;
}

function pkNameOf(allEntities: EntityModel[], entityKey: string): string {
  const t = allEntities.find((x) => x.key === entityKey);
  if (t?.pk) return t.pk.javaName;
  if (t?.parentKey) return pkNameOf(allEntities, t.parentKey);
  return "id";
}

// ---------------- CONTROLLER ----------------

export function controllerJava(
  pkg: string,
  e: EntityModel,
  pkType: string,
  allEntities: EntityModel[] = []
): string {
  const resource = toResourcePlural(e.className);

  return `package ${pkg}.controller;

import ${pkg}.entity.${e.className};
import ${pkg}.service.${e.className}Service;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/${resource}")
@CrossOrigin(origins = "*")
public class ${e.className}Controller {

    private final ${e.className}Service service;

    public ${e.className}Controller(${e.className}Service service) {
        this.service = service;
    }

    @GetMapping
    public List<${e.className}> listar() {
        return service.listarTodos();
    }

    @GetMapping("/{id}")
    public ResponseEntity<${e.className}> obtener(@PathVariable ${pkType} id) {
        ${e.className} obj = service.buscarPorId(id);
        if (obj == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(obj);
    }

    @PostMapping
    public ResponseEntity<${e.className}> crear(@RequestBody ${e.className} datos) {
        ${e.className} creado = service.guardar(datos);
        return ResponseEntity.status(HttpStatus.CREATED).body(creado);
    }

    @PutMapping("/{id}")
    public ResponseEntity<${e.className}> actualizar(@PathVariable ${pkType} id, @RequestBody ${e.className} datos) {
        ${e.className} actualizado = service.actualizar(id, datos);
        if (actualizado == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(actualizado);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> eliminar(@PathVariable ${pkType} id) {
        boolean ok = service.eliminar(id);
        if (!ok) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.noContent().build();
    }
}
`; 
}
