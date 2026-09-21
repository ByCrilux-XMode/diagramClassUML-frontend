// Punto de entrada del módulo generadorBackend.
export { buildBackendModel, normalizeToUmlModel } from "./mapper";
export type { BackendModel, EntityModel, EnumModel, FkChoice, ScalarField, PkField, RelationField } from "./mapper";
export { buildPreview, exportarSpringBootZip } from "./zipExporter";
export type { PreviewData } from "./zipExporter";
