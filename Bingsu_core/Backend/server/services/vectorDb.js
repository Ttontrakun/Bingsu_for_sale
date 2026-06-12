/**
 * Vector DB layer — เลือก Qdrant หรือ Pinecone ตาม VECTOR_DB ใน env
 */
import { vectorDb } from "../config.js";
import * as qdrant from "./qdrant.js";
import * as pinecone from "./pinecone.js";

const usePinecone = vectorDb === "pinecone";
const impl = usePinecone ? pinecone : qdrant;

export const ensureCollection = impl.ensureCollection;
export const upsertPoints = impl.upsertPoints;
export const deleteDocumentVectors = impl.deleteDocumentVectors;
export const searchQdrant = impl.searchQdrant;
export const indexDocumentChunks = impl.indexDocumentChunks;
export const updateChunkText = impl.updateChunkText;
export const replaceTextInDocument = impl.replaceTextInDocument;
