"use client";

import type {
  AttributeData,
  MethodData,
  ParameterData,
  RelationshipLinkData,
  UmlModelData,
  UmlNodeData,
  Visibility,
} from "@/types/uml";

// ---------- helpers ----------
// NOTE: EA's XMI stores UML visibility as *lowercase* ("public", "private",
// "protected", "package"). The Extension block scope attribute uses
// *PascalCase* ("Public", "Private", "Protected", "Package"). We handle both.
const EA_TO_VIS: Record<string, Visibility> = {
  public: "+",
  private: "-",
  protected: "#",
  package: "~",
  // PascalCase fallback (used in Extension scope attribute)
  Public: "+",
  Private: "-",
  Protected: "#",
  Package: "~",
};
const VIS_TO_EA: Record<Visibility, string> = {
  "+": "Public",
  "-": "Private",
  "#": "Protected",
  "~": "Package",
};

function visFromEa(scope?: string): Visibility {
  if (!scope) return "+";
  // Normalise: try as-is first (lowercase), then PascalCase, else default to Public.
  const direct = EA_TO_VIS[scope];
  if (direct) return direct;
  const pascal =
    scope.charAt(0).toUpperCase() + scope.slice(1).toLowerCase();
  return (EA_TO_VIS[pascal] ?? "+") as Visibility;
}
function visToEa(v: Visibility): string {
  // PascalCase scope for Extension block.
  return VIS_TO_EA[v] ?? "Public";
}
function visToEaLower(v: Visibility): string {
  // lowercase for UML visibility attribute.
  return (VIS_TO_EA[v] ?? "Public").toLowerCase();
}

function guid(): string {
  // RFC4122 v4
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
function guidBraced(): string {
  return `{${guid().toUpperCase()}}`;
}
function eaidFromGuid(g: string): string {
  const raw = g.replace(/[{}]/g, "");
  return `EAID_${raw.replace(/-/g, "_")}`;
}
// Packages in EA XMI use the EAPK_ prefix for their external ID (xmi:id,
// xmi:idref and the `package` attribute referenced from children). The
// package2 attribute still uses the EAID_ prefix with the same GUID.
function eapkFromGuid(g: string): string {
  const raw = g.replace(/[{}]/g, "");
  return `EAPK_${raw.replace(/-/g, "_")}`;
}
function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
function parseGeometry(geom: string): { x: number; y: number; w: number; h: number } | null {
  const m = /Left=(-?\d+);Top=(-?\d+);Right=(-?\d+);Bottom=(-?\d+);/.exec(geom);
  if (!m) return null;
  const l = parseInt(m[1], 10);
  const t = parseInt(m[2], 10);
  const r = parseInt(m[3], 10);
  const b = parseInt(m[4], 10);
  return { x: l, y: t, w: r - l, h: b - t };
}

// ---------- IMPORT ----------
export function parseEAXml(xmlText: string): UmlModelData {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) throw new Error("XMI inválido: " + parseError.textContent);

  // Maps EAID -> name/key
  const idToKey = new Map<string, string>();
  const eaidToName = new Map<string, string>();

  // Collect classes (packagedElement xmi:type uml:Class)
  const pkgElements = Array.from(doc.getElementsByTagName("packagedElement"));
  const classes = pkgElements.filter((el) => el.getAttribute("xmi:type") === "uml:Class");

  // Also need elements extension for isAbstract
  const extElements = Array.from(doc.getElementsByTagName("element"));
  const isAbstractById = new Map<string, boolean>();
  for (const el of extElements) {
    const id = el.getAttribute("xmi:idref");
    const props = el.getElementsByTagName("properties")[0];
    if (id && props) {
      const v = props.getAttribute("isAbstract");
      if (v === "true") isAbstractById.set(id, true);
      if (v === "false") isAbstractById.set(id, false);
    }
  }

  // Geometries for loc
  const geomBySubject = new Map<string, { x: number; y: number }>();
  const diagrams = doc.getElementsByTagName("diagram");
  if (diagrams.length > 0) {
    const els = diagrams[0].getElementsByTagName("element");
    for (let i = 0; i < els.length; i++) {
      const e = els[i] as Element;
      const subject = e.getAttribute("subject");
      const geom = e.getAttribute("geometry") ?? "";
      if (!subject || geom.includes("SX=")) continue;
      const p = parseGeometry(geom);
      if (p && subject) geomBySubject.set(subject, { x: p.x, y: p.y });
    }
  }

  const nodes: UmlNodeData[] = [];
  // Build nodes
  for (const c of classes) {
    const eaid = c.getAttribute("xmi:id") ?? "";
    const name = c.getAttribute("name") ?? "Clase";
    if (!eaid || !name) continue;
    const key = eaid; // use EAID as key to keep stable links
    idToKey.set(eaid, key);
    eaidToName.set(eaid, name);
    const isAbstract = isAbstractById.get(eaid) ?? false;

    // Attributes for this class
    const attrEls = Array.from(c.getElementsByTagName("ownedAttribute")).filter(
      (a) => a.parentElement === c && !a.getAttribute("association")
    );
    const attributes: AttributeData[] = [];
    for (const a of attrEls) {
      const assoc = a.getAttribute("association");
      if (assoc) continue;
      const aname = a.getAttribute("name") ?? "";
      if (!aname) continue;
      const vis = visFromEa(a.getAttribute("visibility") ?? "public");
      const typeEl = a.getElementsByTagName("type")[0];
      const typeRef = typeEl?.getAttribute("xmi:idref") ?? "";
      let t = "string";
      if (typeRef.startsWith("EAJava_")) t = typeRef.replace("EAJava_", "");
      else if (typeRef) t = eaidToName.get(typeRef) ?? "string";
      attributes.push({
        name: aname,
        type: t,
        visibility: vis,
        multiplicity: undefined,
        defaultValue: undefined,
        isStatic: a.getAttribute("isStatic") === "true",
        isReadOnly: a.getAttribute("isReadOnly") === "true",
        isDerived: a.getAttribute("isDerived") === "true",
      });
    }

    // Operations
    const opEls = Array.from(c.getElementsByTagName("ownedOperation")).filter(
      (o) => o.parentElement === c
    );
    const methods: MethodData[] = [];
    for (const o of opEls) {
      const oname = o.getAttribute("name") ?? "";
      if (!oname) continue;
      const vis = visFromEa(o.getAttribute("visibility") ?? "public");
      const params = Array.from(o.getElementsByTagName("ownedParameter"));
      let returnType: string | undefined;
      const methodParams: ParameterData[] = [];
      for (const p of params) {
        const dir = (p.getAttribute("direction") ?? "in") as ParameterData["direction"] | "return";
        const pname = p.getAttribute("name") ?? "";
        const ptype = p.getAttribute("type") ?? "";
        let t = "void";
        if (ptype.startsWith("EAJava_")) t = ptype.replace("EAJava_", "");
        else if (ptype) t = ptype;
        if (dir === "return") {
          if (pname === "return") returnType = t;
          else if (!returnType || returnType === "void") returnType = t;
        } else {
          if (pname === "return") continue;
          methodParams.push({ name: pname, type: t, direction: dir as ParameterData["direction"] });
        }
      }
      methods.push({
        name: oname,
        visibility: vis,
        parameters: methodParams,
        returnType: returnType === "void" ? undefined : returnType,
        isAbstract: false,
        isStatic: false,
      });
    }

    const g = geomBySubject.get(eaid);
    const loc = g ? `${Math.round(g.x)} ${Math.round(g.y)}` : undefined;
    nodes.push({
      key,
      name,
      loc,
      category: "Class",
      isAbstract: !!isAbstract,
      attributes,
      methods,
    } as UmlNodeData);
  }

  // Links
  const links: RelationshipLinkData[] = [];
  let linkIdx = 0;
  const linkKey = (prefix: string) => `${prefix}-${++linkIdx}-${Date.now()}`;

  // Associations (including aggregation/composition)
  for (const assoc of pkgElements.filter((el) => el.getAttribute("xmi:type") === "uml:Association")) {
    const assocId = assoc.getAttribute("xmi:id") ?? "";
    const assocName = assoc.getAttribute("name") ?? "";
    const memberEnds = Array.from(assoc.getElementsByTagName("memberEnd")).map(
      (e) => e.getAttribute("xmi:idref") ?? ""
    );
    const ownedEnds = Array.from(assoc.getElementsByTagName("ownedEnd"));
    let extAgg: string | null = null;
    let extSubtype: string | null = null;
    const connectors = Array.from(doc.getElementsByTagName("connector"));
    const conn = connectors.find((c) => c.getAttribute("xmi:idref") === assocId);
    if (conn) {
      const props = conn.getElementsByTagName("properties")[0];
      extSubtype = props?.getAttribute("subtype") ?? null;
      const target = conn.getElementsByTagName("target")[0];
      const ttype = target?.getElementsByTagName("type")[0];
      extAgg = ttype?.getAttribute("aggregation") ?? null;
    }
    let category: "association" | "aggregation" | "composition" = "association";
    const hasComposite = ownedEnds.some((e) => e.getAttribute("aggregation") === "composite");
    const hasShared = ownedEnds.some((e) => e.getAttribute("aggregation") === "shared");
    if (hasComposite || extSubtype === "Strong" || extAgg === "composite") category = "composition";
    else if (hasShared || extAgg === "shared") category = "aggregation";

    let fromEaid: string | null = null;
    let toEaid: string | null = null;
    let fromMult: string | undefined;
    let toMult: string | undefined;
    let fromRole: string | undefined;
    let toRole: string | undefined;

    if (conn) {
      const source = conn.getElementsByTagName("source")[0];
      const target = conn.getElementsByTagName("target")[0];
      fromEaid = source?.getAttribute("xmi:idref") ?? null;
      toEaid = target?.getAttribute("xmi:idref") ?? null;
      const sType = source?.getElementsByTagName("type")[0];
      const tType = target?.getElementsByTagName("type")[0];
      fromMult = sType?.getAttribute("multiplicity") ?? undefined;
      toMult = tType?.getAttribute("multiplicity") ?? undefined;
      const sRole = source?.getElementsByTagName("role")[0]?.getAttribute("name") ?? undefined;
      const tRole = target?.getElementsByTagName("role")[0]?.getAttribute("name") ?? undefined;
      fromRole = sRole || undefined;
      toRole = tRole || undefined;
    } else {
      if (ownedEnds.length >= 2) {
        const e0 = ownedEnds[0];
        const e1 = ownedEnds[1];
        const t0 = e0.getElementsByTagName("type")[0]?.getAttribute("xmi:idref") ?? "";
        const t1 = e1.getElementsByTagName("type")[0]?.getAttribute("xmi:idref") ?? "";
        if (ownedEnds.length === 1 && memberEnds.length === 2) {
          let proxyFound: Element | null = null;
          for (const c of classes) {
            const attrs = Array.from(c.getElementsByTagName("ownedAttribute"));
            for (const a of attrs) {
              if (a.getAttribute("association") === assocId) proxyFound = a;
            }
          }
          if (proxyFound) {
            const proxyType = proxyFound.getElementsByTagName("type")[0]?.getAttribute("xmi:idref") ?? "";
            const ownedType = e0.getElementsByTagName("type")[0]?.getAttribute("xmi:idref") ?? "";
            fromEaid = ownedType;
            toEaid = proxyType;
          }
        } else {
          fromEaid = t0;
          toEaid = t1;
        }
      }
    }

    if (!fromEaid || !toEaid) continue;
    if (!idToKey.has(fromEaid) || !idToKey.has(toEaid)) continue;

    const name = assocName || undefined;
    links.push({
      key: linkKey("link"),
      category,
      from: idToKey.get(fromEaid)!,
      to: idToKey.get(toEaid)!,
      name,
      fromRole,
      toRole,
      fromMultiplicity: fromMult as any,
      toMultiplicity: toMult as any,
    });
  }

  // Generalizations
  for (const cls of classes) {
    const gens = Array.from(cls.getElementsByTagName("generalization")).filter(
      (g) => g.parentElement === cls
    );
    for (const g of gens) {
      const genId = g.getAttribute("xmi:id") ?? "";
      const general = g.getAttribute("general") ?? "";
      const sub = cls.getAttribute("xmi:id") ?? "";
      const conn = Array.from(doc.getElementsByTagName("connector")).find(
        (c) => c.getAttribute("xmi:idref") === genId
      );
      const name = conn?.getAttribute("name") ?? g.getAttribute("name") ?? "";
      if (!general || !sub) continue;
      if (!idToKey.has(sub) || !idToKey.has(general)) continue;
      links.push({
        key: linkKey("gen"),
        category: "generalization",
        from: idToKey.get(sub)!,
        to: idToKey.get(general)!,
        name: name || undefined,
      });
    }
  }

  // Realizations
  const realizations = pkgElements.filter((el) => el.getAttribute("xmi:type") === "uml:Realization");
  for (const r of realizations) {
    const rid = r.getAttribute("xmi:id") ?? "";
    const client = r.getAttribute("client") ?? "";
    const supplier = r.getAttribute("supplier") ?? "";
    const name = r.getAttribute("name") ?? "";
    if (!client || !supplier) continue;
    if (!idToKey.has(client) || !idToKey.has(supplier)) continue;
    links.push({
      key: linkKey("real"),
      category: "realization",
      from: idToKey.get(client)!,
      to: idToKey.get(supplier)!,
      name: name || undefined,
    });
  }

  // Dependencies
  const deps = pkgElements.filter((el) => el.getAttribute("xmi:type") === "uml:Dependency");
  for (const d of deps) {
    const client = d.getAttribute("client") ?? "";
    const supplier = d.getAttribute("supplier") ?? "";
    const name = d.getAttribute("name") ?? "";
    if (!client || !supplier) continue;
    if (!idToKey.has(client) || !idToKey.has(supplier)) continue;
    links.push({
      key: linkKey("dep"),
      category: "dependency",
      from: idToKey.get(client)!,
      to: idToKey.get(supplier)!,
      name: name || undefined,
    });
  }

  return { nodes, links };
}

// ---------- EXPORT ----------
export function serializeEAXml(model: UmlModelData, opts?: { packageName?: string }): string {
  const pkgName = opts?.packageName ?? "prueba";
  const pkgGuid = guidBraced();
  // EAPK_ prefix is what EA uses for the package's external ID; EAID_ is used
  // for the package2 attribute inside <model>.
  const pkgEapk = eapkFromGuid(pkgGuid);
  const pkgEaid = eaidFromGuid(pkgGuid);
  const now = new Date();
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;

  const created = fmt(now);

  // Map key -> EAID and GUID
  const keyToEaid = new Map<string, string>();
  const keyToGuid = new Map<string, string>();
  const eaidToLocalId = new Map<string, number>();
  let localIdCounter = 859;
  for (const n of model.nodes) {
    const g = guidBraced();
    const eaid = eaidFromGuid(g);
    keyToEaid.set(String(n.key), eaid);
    keyToGuid.set(String(n.key), g);
    eaidToLocalId.set(eaid, localIdCounter++);
  }

  // Link EAIDs
  const linkToEaid = new Map<string, string>();
  for (const l of model.links) {
    const g = guidBraced();
    const eaid = eaidFromGuid(g);
    linkToEaid.set(String(l.key), eaid);
  }

  // For aggregation/composition links, the proxy ownedAttribute (in the source
  // class) MUST share the same xmi:id as the association's memberEnd reference,
  // otherwise EA cannot link them and creates a "default" relationship.
  // Pre-generate a stable proxy ID per link, keyed by link key.
  const linkToProxyId = new Map<string, string>();
  for (const l of model.links) {
    if (l.category === "aggregation" || l.category === "composition") {
      // Use a derived GUID so it survives across both blocks.
      const g = guidBraced();
      linkToProxyId.set(String(l.key), eaidFromGuid(g));
    }
  }

  // Helper: visibility symbol for signature lines ("+","-","#","~").
  function visSym(v: Visibility | string): string {
    return v;
  }

  // Helper to get geometry. EA's class box must be big enough to fit the
  // class name header, every attribute line and every operation line. If
  // we emit a tiny 90x70 box for a class with 5 attributes and 3 methods,
  // EA will still render all those lines but they will overflow the box
  // bounds and visually overlap with neighbouring elements — this is what
  // the user observes as "todo pegado". We therefore size the box from
  // the content: width driven by the longest signature, height driven by
  // the number of compartment lines.
  function geomForNode(n: UmlNodeData): string {
    let x = 100,
      y = 100;
    if (n.loc) {
      const parts = n.loc.split(" ").map(Number);
      if (parts.length >= 2 && !isNaN(parts[0])) {
        x = Math.round(parts[0]) + 350;
        y = Math.round(parts[1]) + 350;
      }
    }
    const attrs = (n as any).attributes as AttributeData[] | undefined;
    const methods = (n as any).methods as MethodData[] | undefined;

    // Build the longest signature line so we can size the width.
    let maxLineLen = n.name.length + 4; // header line "  ClassName  "
    if (attrs) {
      for (const a of attrs) {
        const line = `${visSym(a.visibility)} ${a.name}: ${a.type}`;
        if (line.length > maxLineLen) maxLineLen = line.length;
      }
    }
    if (methods) {
      for (const m of methods) {
        const params = (m.parameters ?? [])
          .map((p) => `${p.name}: ${p.type}`)
          .join(", ");
        const ret = m.returnType && m.returnType !== "void" && m.returnType !== "Void" ? `: ${m.returnType}` : "";
        const line = `${visSym(m.visibility)} ${m.name}(${params})${ret}`;
        if (line.length > maxLineLen) maxLineLen = line.length;
      }
    }

    // Width: ~8px per char + padding for borders/compartment margins.
    // Minimum 140 to keep the header readable for short class names.
    const w = Math.max(maxLineLen * 8 + 40, 140);
    // Height: header (30) + one line per attr + one line per method + small
    // divider between compartments. Each line ~18px tall.
    const numLines = (attrs?.length ?? 0) + (methods?.length ?? 0);
    const h = Math.max(30 + numLines * 18 + 20, 70);
    return `Left=${x};Top=${y};Right=${x + w};Bottom=${y + h};`;
  }

  // Helper: split a multiplicity string into lower/upper EA values.
  function splitMult(m: string | undefined): { lo: string; hi: string } {
    const fl = m ?? "1";
    if (fl.includes("..")) {
      const [lo, hi] = fl.split("..");
      return { lo: lo === "*" ? "0" : lo, hi: hi === "*" ? "-1" : hi };
    }
    if (fl === "*") return { lo: "0", hi: "-1" };
    return { lo: "1", hi: "1" };
  }

  let xml = `<?xml version="1.0" encoding="windows-1252"?>\n`;
  xml += `<xmi:XMI xmi:version="2.1" xmlns:uml="http://schema.omg.org/spec/UML/2.1" xmlns:xmi="http://schema.omg.org/spec/XMI/2.1">\n`;
  xml += `\t<xmi:Documentation exporter="Enterprise Architect" exporterVersion="6.5"/>\n`;
  xml += `\t<uml:Model xmi:type="uml:Model" name="EA_Model" visibility="public">\n`;
  xml += `\t\t<packagedElement xmi:type="uml:Package" xmi:id="${pkgEapk}" name="${escXml(pkgName)}" visibility="public">\n`;

  // Classes
  for (const n of model.nodes) {
    const eaid = keyToEaid.get(String(n.key))!;
    xml += `\t\t\t<packagedElement xmi:type="uml:Class" xmi:id="${eaid}" name="${escXml(n.name)}" visibility="public"`;
    if ((n as any).isAbstract) xml += ` isAbstract="true"`;
    xml += `>\n`;

    // Generalizations where this class is the child (from-side).
    const gens = model.links.filter(
      (l) => String(l.from) === String(n.key) && l.category === "generalization"
    );
    for (const g of gens) {
      const toEaid = keyToEaid.get(String(g.to))!;
      const genEaid = linkToEaid.get(String(g.key))!;
      xml += `\t\t\t\t<generalization xmi:type="uml:Generalization" xmi:id="${genEaid}" general="${toEaid}"/>\n`;
    }

    // Proxy ownedAttribute for aggregation/composition where this node is the
    // WHOLE (from-side). The proxy ID must match the memberEnd xmi:idref used
    // inside the association block — see linkToProxyId above.
    const outgoingAggs = model.links.filter(
      (l) =>
        String(l.from) === String(n.key) &&
        (l.category === "aggregation" || l.category === "composition")
    );
    for (const agg of outgoingAggs) {
      const toEaid = keyToEaid.get(String(agg.to))!;
      const proxyId = linkToProxyId.get(String(agg.key))!;
      const assocEaid = linkToEaid.get(String(agg.key))!;
      xml += `\t\t\t\t<ownedAttribute xmi:type="uml:Property" xmi:id="${proxyId}" visibility="public" association="${assocEaid}" aggregation="none">\n`;
      xml += `\t\t\t\t\t<type xmi:idref="${toEaid}"/>\n`;
      xml += `\t\t\t\t</ownedAttribute>\n`;
    }

    // Attributes (UML block)
    const attrs = (n as any).attributes as AttributeData[] | undefined;
    if (attrs && attrs.length > 0) {
      for (const a of attrs) {
        const ag = guidBraced();
        const aid = eaidFromGuid(ag);
        (a as any)._guid = ag;
        (a as any)._eaid = aid;
        const visLower = visToEaLower(a.visibility);
        xml += `\t\t\t\t<ownedAttribute xmi:type="uml:Property" xmi:id="${aid}" name="${escXml(a.name)}" visibility="${visLower}" isStatic="${a.isStatic ? "true" : "false"}" isReadOnly="${a.isReadOnly ? "true" : "false"}" isDerived="${a.isDerived ? "true" : "false"}" isOrdered="false" isUnique="true" isDerivedUnion="false">\n`;
        xml += `\t\t\t\t\t<lowerValue xmi:type="uml:LiteralInteger" xmi:id="EAID_LI${guid().slice(0, 8)}" value="1"/>\n`;
        xml += `\t\t\t\t\t<upperValue xmi:type="uml:LiteralInteger" xmi:id="EAID_LI${guid().slice(0, 8)}" value="1"/>\n`;
        const typeId = a.type ? `EAJava_${a.type}` : "EAJava_string";
        xml += `\t\t\t\t\t<type xmi:idref="${typeId}"/>\n`;
        xml += `\t\t\t\t</ownedAttribute>\n`;
      }
    }

    // Operations (UML block)
    const methods = (n as any).methods as MethodData[] | undefined;
    if (methods && methods.length > 0) {
      for (const m of methods) {
        const mg = guidBraced();
        const oid = eaidFromGuid(mg);
        (m as any)._guid = mg;
        (m as any)._eaid = oid;
        const visLower = visToEaLower(m.visibility);
        xml += `\t\t\t\t<ownedOperation xmi:id="${oid}" name="${escXml(m.name)}" visibility="${visLower}" concurrency="sequential">\n`;
        for (const p of m.parameters) {
          const pid = eaidFromGuid(guidBraced());
          xml += `\t\t\t\t\t<ownedParameter xmi:id="${pid}" name="${escXml(p.name)}" direction="${p.direction}" isStream="false" isException="false" isOrdered="false" isUnique="true" type="EAJava_${escXml(p.type)}"/>\n`;
        }
        // Return parameter (EA encodes the return type as a parameter named
        // "return" with direction="return").
        const rid = `EAID_RT${guid().slice(0, 8)}`;
        const retType = m.returnType ?? "void";
        xml += `\t\t\t\t\t<ownedParameter xmi:id="${rid}" name="return" direction="return" type="EAJava_${escXml(retType)}"/>\n`;
        xml += `\t\t\t\t</ownedOperation>\n`;
      }
    }
    xml += `\t\t\t</packagedElement>\n`;
  }

  // Associations (including aggregation/composition)
  for (const l of model.links) {
    if (l.category === "association" || l.category === "aggregation" || l.category === "composition") {
      const eaid = linkToEaid.get(String(l.key))!;
      const fromEaid = keyToEaid.get(String(l.from))!;
      const toEaid = keyToEaid.get(String(l.to))!;
      const name = escXml(l.name ?? "");
      xml += `\t\t\t<packagedElement xmi:type="uml:Association" xmi:id="${eaid}" name="${name}" visibility="public">\n`;

      if (l.category === "association") {
        // Pure association: two ownedEnds inside the association.
        const dstId = `EAID_dst${guid().slice(0, 8)}`;
        const srcId = `EAID_src${guid().slice(0, 8)}`;
        // dst -> to
        xml += `\t\t\t\t<memberEnd xmi:idref="${dstId}"/>\n`;
        xml += `\t\t\t\t<ownedEnd xmi:type="uml:Property" xmi:id="${dstId}" visibility="public" association="${eaid}" aggregation="none">\n`;
        xml += `\t\t\t\t\t<type xmi:idref="${toEaid}"/>\n`;
        const { lo, hi } = splitMult(l.toMultiplicity);
        xml += `\t\t\t\t\t<lowerValue xmi:type="uml:LiteralInteger" xmi:id="EAID_LI${guid().slice(0, 6)}" value="${lo}"/>\n`;
        xml += `\t\t\t\t\t<upperValue xmi:type="uml:LiteralUnlimitedNatural" xmi:id="EAID_LI${guid().slice(0, 6)}" value="${hi}"/>\n`;
        xml += `\t\t\t\t</ownedEnd>\n`;
        // src -> from
        xml += `\t\t\t\t<memberEnd xmi:idref="${srcId}"/>\n`;
        xml += `\t\t\t\t<ownedEnd xmi:type="uml:Property" xmi:id="${srcId}" visibility="public" association="${eaid}" aggregation="none">\n`;
        xml += `\t\t\t\t\t<type xmi:idref="${fromEaid}"/>\n`;
        const { lo: lo2, hi: hi2 } = splitMult(l.fromMultiplicity);
        xml += `\t\t\t\t\t<lowerValue xmi:type="uml:LiteralInteger" xmi:id="EAID_LI${guid().slice(0, 6)}" value="${lo2}"/>\n`;
        xml += `\t\t\t\t\t<upperValue xmi:type="uml:LiteralUnlimitedNatural" xmi:id="EAID_LI${guid().slice(0, 6)}" value="${hi2}"/>\n`;
        xml += `\t\t\t\t</ownedEnd>\n`;
      } else {
        // aggregation/composition: one ownedEnd (with aggregation shared/composite)
        // pointing to the WHOLE (from). The other end is the proxy ownedAttribute
        // already created inside the source class — its memberEnd must reference
        // the SAME proxy id, otherwise EA cannot link them.
        const agg = l.category === "composition" ? "composite" : "shared";
        const srcId = `EAID_src${guid().slice(0, 8)}`;
        const proxyId = linkToProxyId.get(String(l.key))!;
        // Order matches EA's native output: dst memberEnd (the proxy), then src memberEnd (the ownedEnd).
        xml += `\t\t\t\t<memberEnd xmi:idref="${proxyId}"/>\n`;
        xml += `\t\t\t\t<memberEnd xmi:idref="${srcId}"/>\n`;
        xml += `\t\t\t\t<ownedEnd xmi:type="uml:Property" xmi:id="${srcId}" visibility="public" association="${eaid}" aggregation="${agg}">\n`;
        xml += `\t\t\t\t\t<type xmi:idref="${fromEaid}"/>\n`;
        xml += `\t\t\t\t</ownedEnd>\n`;
      }
      xml += `\t\t\t</packagedElement>\n`;
    }
  }

  // Realizations (and dependencies)
  for (const l of model.links) {
    if (l.category === "realization") {
      const eaid = linkToEaid.get(String(l.key))!;
      const client = keyToEaid.get(String(l.from))!;
      const supplier = keyToEaid.get(String(l.to))!;
      const name = escXml(l.name ?? "");
      xml += `\t\t\t<packagedElement xmi:type="uml:Realization" xmi:id="${eaid}" name="${name}" visibility="public" supplier="${supplier}" client="${client}"/>\n`;
    }
    if (l.category === "dependency") {
      const eaid = linkToEaid.get(String(l.key))!;
      const client = keyToEaid.get(String(l.from))!;
      const supplier = keyToEaid.get(String(l.to))!;
      const name = escXml(l.name ?? "");
      xml += `\t\t\t<packagedElement xmi:type="uml:Dependency" xmi:id="${eaid}" name="${name}" visibility="public" client="${client}" supplier="${supplier}"/>\n`;
    }
  }

  xml += `\t\t</packagedElement>\n`;
  xml += `\t</uml:Model>\n`;
  xml += `\t<xmi:Extension extender="Enterprise Architect" extenderID="6.5">\n`;
  xml += `\t\t<elements>\n`;
  // Package element
  xml += `\t\t\t<element xmi:idref="${pkgEapk}" xmi:type="uml:Package" name="${escXml(pkgName)}" scope="public">\n`;
  xml += `\t\t\t\t<model package2="${pkgEaid}" package="${pkgEapk}" tpos="0" ea_localid="101" ea_eleType="package"/>\n`;
  xml += `\t\t\t\t<properties isSpecification="false" sType="Package" nType="0" scope="public"/>\n`;
  xml += `\t\t\t\t<project author="PC" version="1.0" phase="1.0" created="${created}" modified="${created}" complexity="1" status="Proposed"/>\n`;
  xml += `\t\t\t\t<code gentype="Java"/>\n`;
  xml += `\t\t\t\t<style appearance="BackColor=-1;BorderColor=-1;BorderWidth=-1;FontColor=-1;VSwimLanes=1;HSwimLanes=1;BorderStyle=0;"/>\n`;
  xml += `\t\t\t\t<tags/>\n`;
  xml += `\t\t\t\t<xrefs/>\n`;
  xml += `\t\t\t\t<extendedProperties tagged="0" package_name="Package1"/>\n`;
  xml += `\t\t\t\t<packageproperties version="1.0"/>\n`;
  xml += `\t\t\t\t<paths/>\n`;
  xml += `\t\t\t\t<times created="${created}" modified="${created}"/>\n`;
  xml += `\t\t\t\t<flags iscontrolled="FALSE" isprotected="FALSE" batchsave="0" batchload="0" usedtd="FALSE" logxml="FALSE"/>\n`;
  xml += `\t\t\t</element>\n`;

  // Class elements
  for (const n of model.nodes) {
    const eaid = keyToEaid.get(String(n.key))!;
    const localId = eaidToLocalId.get(eaid)!;
    const isAbs = (n as any).isAbstract ? "true" : "false";
    xml += `\t\t\t<element xmi:idref="${eaid}" xmi:type="uml:Class" name="${escXml(n.name)}" scope="public">\n`;
    xml += `\t\t\t\t<model package="${pkgEapk}" tpos="0" ea_localid="${localId}" ea_eleType="element"/>\n`;
    xml += `\t\t\t\t<properties isSpecification="false" sType="Class" nType="0" scope="public" isRoot="false" isLeaf="false" isAbstract="${isAbs}" isActive="false"/>\n`;
    xml += `\t\t\t\t<project author="PC" version="1.0" phase="1.0" created="${created}" modified="${created}" complexity="1" status="Proposed"/>\n`;
    xml += `\t\t\t\t<code gentype="Java"/>\n`;
    xml += `\t\t\t\t<style appearance="BackColor=-1;BorderColor=-1;BorderWidth=-1;FontColor=-1;VSwimLanes=1;HSwimLanes=1;BorderStyle=0;"/>\n`;
    xml += `\t\t\t\t<tags/>\n`;
    xml += `\t\t\t\t<xrefs/>\n`;
    xml += `\t\t\t\t<extendedProperties tagged="0" package_name="${escXml(pkgName)}"/>\n`;

    const attrs = (n as any).attributes as AttributeData[] | undefined;
    const methods = (n as any).methods as MethodData[] | undefined;
    if (attrs && attrs.length > 0) {
      xml += `\t\t\t\t<attributes>\n`;
      for (let i = 0; i < attrs.length; i++) {
        const a = attrs[i];
        const ag = (a as any)._guid;
        const aid = (a as any)._eaid;
        const scope = visToEa(a.visibility);
        xml += `\t\t\t\t\t<attribute xmi:idref="${aid}" name="${escXml(a.name)}" scope="${scope}">\n`;
        xml += `\t\t\t\t\t\t<initial/>\n`;
        xml += `\t\t\t\t\t\t<documentation/>\n`;
        xml += `\t\t\t\t\t\t<model ea_localid="${localId * 10 + i}" ea_guid="${ag}"/>\n`;
        xml += `\t\t\t\t\t\t<properties type="${escXml(a.type)}" derived="0" collection="false" static="${a.isStatic ? "1" : "0"}" duplicates="0" changeability="${a.isReadOnly ? "readonly" : "changeable"}"/>\n`;
        xml += `\t\t\t\t\t\t<coords ordered="0"/>\n`;
        xml += `\t\t\t\t\t\t<containment position="0"/>\n`;
        xml += `\t\t\t\t\t\t<stereotype/>\n`;
        xml += `\t\t\t\t\t\t<bounds lower="1" upper="1"/>\n`;
        xml += `\t\t\t\t\t\t<options/>\n`;
        xml += `\t\t\t\t\t\t<style/>\n`;
        xml += `\t\t\t\t\t\t<styleex value="IsLiteral=0;"/>\n`;
        xml += `\t\t\t\t\t\t<tags/>\n`;
        xml += `\t\t\t\t\t\t<xrefs/>\n`;
        xml += `\t\t\t\t\t</attribute>\n`;
      }
      xml += `\t\t\t\t</attributes>\n`;
    }
    if (methods && methods.length > 0) {
      xml += `\t\t\t\t<operations>\n`;
      for (let i = 0; i < methods.length; i++) {
        const m = methods[i];
        const mg = (m as any)._guid;
        const mid = (m as any)._eaid;
        const scope = visToEa(m.visibility);
        // Normalise the return type. EA's native export writes the return
        // type in TWO places when the method actually returns something:
        //   1. As a `type="..."` attribute on the operation's <type> element
        //   2. As a `type="..."` attribute on the RETURNID parameter's
        //      <properties> element.
        // When the return type is void / undefined, EA omits the type
        // attribute from both places. We mirror that behaviour exactly.
        const retTypeRaw = (m.returnType && m.returnType.trim() !== "") ? m.returnType : "void";
        const returnTypeAttr = ` type="${escXml(retTypeRaw)}"`;
        xml += `\t\t\t\t\t<operation xmi:idref="${mid}" name="${escXml(m.name)}" scope="${scope}">\n`;
        xml += `\t\t\t\t\t\t<properties position="0"/>\n`;
        xml += `\t\t\t\t\t\t<stereotype/>\n`;
        xml += `\t\t\t\t\t\t<model ea_guid="${mg}" ea_localid="${localId * 10 + i + 100}"/>\n`;
        // EA native uses const/static/isAbstract/synchronised/pure/isQuery flags on <type>
        // and adds a `type="..."` attribute when the method has a return type.
        xml += `\t\t\t\t\t\t<type${returnTypeAttr} const="false" static="${m.isStatic ? "true" : "false"}" isAbstract="${m.isAbstract ? "true" : "false"}" synchronised="0" pure="0" isQuery="false"/>\n`;
        xml += `\t\t\t\t\t\t<behaviour/>\n`;
        xml += `\t\t\t\t\t\t<code/>\n`;
        xml += `\t\t\t\t\t\t<style/>\n`;
        xml += `\t\t\t\t\t\t<styleex/>\n`;
        xml += `\t\t\t\t\t\t<documentation/>\n`;
        xml += `\t\t\t\t\t\t<tags/>\n`;
        // Parameters block: FIRST a RETURNID parameter (return slot), then the
        // user-defined parameters. This matches EA's native encoding. The
        // RETURNID parameter's <properties> also gets a `type="..."` attribute
        // when the method has a return type — this is what EA's UI reads to
        // display the return type on the method signature.
        xml += `\t\t\t\t\t\t<parameters>\n`;
        const opGuid = mg.replace(/[{}]/g, "");
        const returnId = `EAID_RETURNID_${opGuid.replace(/-/g, "_")}`;
        xml += `\t\t\t\t\t\t\t<parameter xmi:idref="${returnId}" visibility="public">\n`;
        xml += `\t\t\t\t\t\t\t\t<properties pos="0"${returnTypeAttr} const="false" ea_guid="{RETURNID-${opGuid}}"/>\n`;
        xml += `\t\t\t\t\t\t\t\t<style/>\n`;
        xml += `\t\t\t\t\t\t\t\t<styleex/>\n`;
        xml += `\t\t\t\t\t\t\t\t<documentation/>\n`;
        xml += `\t\t\t\t\t\t\t\t<tags/>\n`;
        xml += `\t\t\t\t\t\t\t\t<xrefs/>\n`;
        xml += `\t\t\t\t\t\t\t</parameter>\n`;
        for (let pi = 0; pi < m.parameters.length; pi++) {
          const p = m.parameters[pi];
          const pg = guidBraced();
          const pid = eaidFromGuid(pg);
          xml += `\t\t\t\t\t\t\t<parameter xmi:idref="${pid}" visibility="public">\n`;
          xml += `\t\t\t\t\t\t\t\t<properties pos="${pi}" type="${escXml(p.type)}" const="false" ea_guid="${pg}"/>\n`;
          xml += `\t\t\t\t\t\t\t\t<style/>\n`;
          xml += `\t\t\t\t\t\t\t\t<styleex/>\n`;
          xml += `\t\t\t\t\t\t\t\t<documentation/>\n`;
          xml += `\t\t\t\t\t\t\t\t<tags/>\n`;
          xml += `\t\t\t\t\t\t\t\t<xrefs/>\n`;
          xml += `\t\t\t\t\t\t\t</parameter>\n`;
        }
        xml += `\t\t\t\t\t\t</parameters>\n`;
        xml += `\t\t\t\t\t\t<xrefs/>\n`;
        xml += `\t\t\t\t\t</operation>\n`;
      }
      xml += `\t\t\t\t</operations>\n`;
    }

    // Links: emit every link where this node is either the source OR the
    // target — EA's native export mirrors both ends, and not doing so can
    // confuse the importer.
    const allLinks = model.links.filter(
      (l) => String(l.from) === String(n.key) || String(l.to) === String(n.key)
    );
    if (allLinks.length > 0) {
      xml += `\t\t\t\t<links>\n`;
      for (const l of allLinks) {
        const leid = linkToEaid.get(String(l.key))!;
        const fromEaid = keyToEaid.get(String(l.from))!;
        const toEaid = keyToEaid.get(String(l.to))!;
        let tag = "Association";
        if (l.category === "generalization") tag = "Generalization";
        else if (l.category === "aggregation" || l.category === "composition") tag = "Aggregation";
        else if (l.category === "realization") tag = "Realisation";
        else if (l.category === "dependency") tag = "Dependency";
        xml += `\t\t\t\t\t<${tag} xmi:id="${leid}" start="${fromEaid}" end="${toEaid}"/>\n`;
      }
      xml += `\t\t\t\t</links>\n`;
    }
    xml += `\t\t\t</element>\n`;
  }

  xml += `\t\t</elements>\n`;
  xml += `\t\t<connectors>\n`;
  for (const l of model.links) {
    const eaid = linkToEaid.get(String(l.key))!;
    const fromEaid = keyToEaid.get(String(l.from))!;
    const toEaid = keyToEaid.get(String(l.to))!;
    const fromName = model.nodes.find((n) => String(n.key) === String(l.from))?.name ?? "";
    const toName = model.nodes.find((n) => String(n.key) === String(l.to))?.name ?? "";
    const name = escXml(l.name ?? "");
    let eaType = "Association";
    let subtypeAttr = "";
    let direction = "Source -&gt; Destination";
    if (l.category === "aggregation") eaType = "Aggregation";
    if (l.category === "composition") {
      eaType = "Aggregation";
      subtypeAttr = ` subtype="Strong"`;
    }
    if (l.category === "generalization") eaType = "Generalization";
    if (l.category === "realization") eaType = "Realisation";
    if (l.category === "dependency") eaType = "Dependency";
    if (l.category === "association") direction = "Unspecified";

    // Multiplicity: when the GoJS model does not specify an explicit
    // multiplicity, do NOT force "1" on both ends. For aggregation/composition
    // we use the UML convention — the "whole" side is 1 (one whole) and the
    // "part" side defaults to "*" (many parts). For plain associations we
    // omit the multiplicity attribute entirely so EA does not show a
    // misleading "1 - 1".
    function defaultMultForSide(
      side: "from" | "to",
      category: string
    ): string | undefined {
      if (category === "aggregation" || category === "composition") {
        // from = whole (1), to = part (*)
        return side === "from" ? "1" : "*";
      }
      // Plain association / generalization / realization / dependency:
      // leave undefined so EA shows nothing instead of "1".
      return undefined;
    }
    const fromMult =
      l.fromMultiplicity ?? defaultMultForSide("from", l.category);
    const toMult =
      l.toMultiplicity ?? defaultMultForSide("to", l.category);
    let fromAgg = "none";
    let toAgg = "none";
    if (l.category === "aggregation") toAgg = "shared";
    if (l.category === "composition") toAgg = "composite";

    // Build the multiplicity attribute strings conditionally so that we
    // emit `multiplicity="..."` only when we actually have a value.
    const fromMultAttr = fromMult ? ` multiplicity="${escXml(fromMult)}"` : "";
    const toMultAttr = toMult ? ` multiplicity="${escXml(toMult)}"` : "";

    xml += `\t\t\t<connector xmi:idref="${eaid}" name="${name}">\n`;
    xml += `\t\t\t\t<source xmi:idref="${fromEaid}">\n`;
    xml += `\t\t\t\t\t<model ea_localid="${eaidToLocalId.get(fromEaid) ?? 859}" type="Class" name="${escXml(fromName)}"/>\n`;
    xml += `\t\t\t\t\t<role visibility="Public" targetScope="instance"/>\n`;
    xml += `\t\t\t\t\t<type${fromMultAttr} aggregation="${fromAgg}" containment="Unspecified"/>\n`;
    xml += `\t\t\t\t\t<constraints/>\n`;
    xml += `\t\t\t\t\t<modifiers isOrdered="false" changeable="none" isNavigable="false"/>\n`;
    xml += `\t\t\t\t\t<style/>\n`;
    xml += `\t\t\t\t\t<documentation/>\n`;
    xml += `\t\t\t\t\t<xrefs/>\n`;
    xml += `\t\t\t\t\t<tags/>\n`;
    xml += `\t\t\t\t</source>\n`;
    xml += `\t\t\t\t<target xmi:idref="${toEaid}">\n`;
    xml += `\t\t\t\t\t<model ea_localid="${eaidToLocalId.get(toEaid) ?? 860}" type="Class" name="${escXml(toName)}"/>\n`;
    xml += `\t\t\t\t\t<role visibility="Public" targetScope="instance"/>\n`;
    xml += `\t\t\t\t\t<type${toMultAttr} aggregation="${toAgg}" containment="Unspecified"/>\n`;
    xml += `\t\t\t\t\t<constraints/>\n`;
    xml += `\t\t\t\t\t<modifiers isOrdered="false" changeable="none" isNavigable="true"/>\n`;
    xml += `\t\t\t\t\t<style/>\n`;
    xml += `\t\t\t\t\t<documentation/>\n`;
    xml += `\t\t\t\t\t<xrefs/>\n`;
    xml += `\t\t\t\t\t<tags/>\n`;
    xml += `\t\t\t\t</target>\n`;
    xml += `\t\t\t\t<model ea_localid="${700 + Math.floor(Math.random() * 200)}"/>\n`;
    xml += `\t\t\t\t<properties ea_type="${eaType}"${subtypeAttr} direction="${direction}"/>\n`;
    xml += `\t\t\t\t<modifiers isRoot="false" isLeaf="false"/>\n`;
    xml += `\t\t\t\t<parameterSubstitutions/>\n`;
    xml += `\t\t\t\t<documentation/>\n`;
    xml += `\t\t\t\t<appearance linemode="3" linecolor="0" linewidth="0" seqno="0" headStyle="0" lineStyle="0"/>\n`;
    // Labels: emit lb / rb only when we actually have a multiplicity value,
    // otherwise EA would print a misleading "1 - 1" on the connector.
    const labelsParts: string[] = [];
    if (fromMult) labelsParts.push(`lb="${escXml(fromMult)}"`);
    if (name) labelsParts.push(`mt="${name}"`);
    if (toMult) labelsParts.push(`rb="${escXml(toMult)}"`);
    if (labelsParts.length > 0) {
      xml += `\t\t\t\t<labels ${labelsParts.join(" ")}/>\n`;
    }
    xml += `\t\t\t\t<extendedProperties virtualInheritance="0"/>\n`;
    xml += `\t\t\t\t<style/>\n`;
    xml += `\t\t\t\t<xrefs/>\n`;
    xml += `\t\t\t\t<tags/>\n`;
    xml += `\t\t\t</connector>\n`;
  }
  xml += `\t\t</connectors>\n`;

  // Primitive types — EA's native export defines these so EAJava_* references
  // can resolve. Without this section EA may fail to resolve attribute types
  // and silently drop them.
  xml += `\t\t<primitivetypes>\n`;
  xml += `\t\t\t<packagedElement xmi:type="uml:Package" xmi:id="EAPrimitiveTypesPackage" name="EA_PrimitiveTypes_Package" visibility="public">\n`;
  xml += `\t\t\t\t<packagedElement xmi:type="uml:Package" xmi:id="EAJavaTypesPackage" name="EA_Java_Types_Package" visibility="public">\n`;
  const primitiveTypes = [
    "String",
    "int",
    "Int",
    "boolean",
    "char",
    "double",
    "float",
    "Float",
    "void",
    "Void",
    "long",
    "Long",
    "short",
    "Short",
    "byte",
    "Byte",
    "Date",
    "decimal",
    "Decimal",
    "Bool",
    "Boolean",
  ];
  for (const pt of primitiveTypes) {
    xml += `\t\t\t\t\t<packagedElement xmi:type="uml:PrimitiveType" xmi:id="EAJava_${pt}" name="${pt}" visibility="public"/>\n`;
  }
  xml += `\t\t\t\t</packagedElement>\n`;
  xml += `\t\t\t</packagedElement>\n`;
  xml += `\t\t</primitivetypes>\n`;
  xml += `\t\t<profiles/>\n`;

  // Diagram — use incremental seqno so EA preserves the order of elements.
  xml += `\t\t<diagrams>\n`;
  const diagramId = `EAID_${guid().replace(/-/g, "_").toUpperCase()}`;
  xml += `\t\t\t<diagram xmi:id="${diagramId}">\n`;
  xml += `\t\t\t\t<model package="${pkgEapk}" localID="117" owner="${pkgEapk}"/>\n`;
  xml += `\t\t\t\t<properties name="${escXml(pkgName)}" type="Logical"/>\n`;
  xml += `\t\t\t\t<project created="${created}" modified="${created}"/>\n`;
  xml += `\t\t\t\t<style1 value="ShowPrivate=1;ShowProtected=1;ShowPublic=1;HideRelationships=0;Locked=0;Border=0;HighlightForeign=0;PackageContents=0;SequenceNotes=0;ScalePrintImage=0;PPgs.cx=0;PPgs.cy=0;DocSize.cx=827;DocSize.cy=1169;ShowDetails=0;Orientation=;Zoom=100;ShowTags=0;OpParams=0;VisibleAttributeDetail=0;ShowOpRetType=1;ShowIcons=1;CollabNums=1;HideProps=1;ShowReqs=0;ShowCons=0;PaperSize=9;HideParents=0;UseAlias=0;HideAtts=0;HideOps=0;HideStereo=0;HideElemStereo=0;ShowTests=0;ShowMaint=0;ConnectorNotation=UML 2.1;ExplicitNavigability=0;ShowShape=1;AllDockable=0;AdvancedElementProps=1;AdvancedFeatureProps=1;AdvancedConnectorProps=1;m_bElementClassifier=1;SPT=1;ShowNotes=0;SuppressBrackets=0;SuppConnectorLabels=0;PrintPageHeadFoot=0;ShowAsList=0;"/>\n`;
  xml += `\t\t\t\t<style2 value="SaveTag=${guid().slice(0, 8).toUpperCase()};ExcludeRTF=0;DocAll=0;HideQuals=0;AttPkg=0;ShowTests=0;ShowMaint=0;SuppressFOC=0;MatrixActive=0;SwimlanesActive=1;KanbanActive=0;MatrixLineWidth=1;MatrixLineClr=0;MatrixLocked=0;TConnectorNotation=UML 2.1;TExplicitNavigability=0;AdvancedElementProps=1;AdvancedFeatureProps=1;AdvancedConnectorProps=1;m_bElementClassifier=1;SPT=1;MDGDgm=;STBLDgm=;ShowNotes=0;VisibleAttributeDetail=0;ShowOpRetType=1;SuppressBrackets=0;SuppConnectorLabels=0;PrintPageHeadFoot=0;ShowAsList=0;SuppressedCompartments=;Theme=:119;"/>\n`;
  xml += `\t\t\t\t<swimlanes value="locked=false;orientation=0;width=0;inbar=false;names=false;color=0;bold=false;fcol=0;tcol=15589597;ofCol=-1;ufCol=-1;hl=0;ufh=0;hh=0;cls=0;bw=0;hli=0;SwimlaneFont=lfh:-10,lfw:0,lfi:0,lfu:0,lfs:0,lfface:Calibri,lfe:0,lfo:0,lfchar:1,lfop:0,lfcp:0,lfq:0,lfpf=0,lfWidth=0;"/>\n`;
  xml += `\t\t\t\t<matrixitems value="locked=false;matrixactive=false;swimlanesactive=true;kanbanactive=false;width=1;clrLine=0;"/>\n`;
  xml += `\t\t\t\t<extendedProperties/>\n`;
  xml += `\t\t\t\t<elements>\n`;
  let seqno = 0;
  for (const n of model.nodes) {
    const eaid = keyToEaid.get(String(n.key))!;
    const geom = geomForNode(n);
    seqno++;
    xml += `\t\t\t\t\t<element geometry="${geom}" subject="${eaid}" seqno="${seqno}" style="DUID=${guid().slice(0, 8).toUpperCase()};"/>\n`;
  }
  for (const l of model.links) {
    const eaid = linkToEaid.get(String(l.key))!;
    seqno++;
    xml += `\t\t\t\t\t<element geometry="SX=0;SY=0;EX=0;EY=0;EDGE=3;Path=;" subject="${eaid}" seqno="${seqno}" style="Mode=3;EOID=${keyToEaid.get(String(l.to))!.slice(-8)};SOID=${keyToEaid.get(String(l.from))!.slice(-8)};Hidden=0;"/>\n`;
  }
  xml += `\t\t\t\t</elements>\n`;
  xml += `\t\t\t</diagram>\n`;
  xml += `\t\t</diagrams>\n`;
  xml += `\t</xmi:Extension>\n`;
  xml += `</xmi:XMI>\n`;
  return xml;
}
