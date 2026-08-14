// @aether/manifestation · 入口
export {
  bindManifestation,
  getManifestation,
  listManifestationsByThread,
  unbindManifestation,
  type BindManifestationInput,
  type ManifestationBinding,
  type ManifestationDb,
  type UpdateManifestationBindingInput,
} from './manifestation.js'

export {
  createAnnotation,
  deleteAnnotation,
  getAnnotation,
  getManifestationsMap,
  listAllAnnotations,
  listAnnotationsByFile,
  listAnnotationsByThread,
  resolveAnnotation,
  type CreateAnnotationInput,
  type InlineAnnotation,
  type ResolveAnnotationInput,
} from './annotation.js'