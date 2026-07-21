export {
  detectKind,
  extractText,
  normalizeText,
  type DocumentKind,
} from "./extract.ts";
export { chunkText, type ChunkOptions } from "./chunk.ts";
export { processDocument, type ProcessResult } from "./process.ts";
export {
  buildKnowledgeContext,
  getDocumentSummaries,
  searchChunks,
} from "./retrieve.ts";
