import { prisma } from "../db.js";
import { deleteDocumentVectors, indexDocumentChunks } from "../services/vectorDb.js";
import { ensureSourceFileBlocks } from "../services/text.js";

const run = async () => {
  const documents = await prisma.document.findMany();
  console.log(`Reindexing ${documents.length} documents...`);
  for (const doc of documents) {
    const sourceFiles = ensureSourceFileBlocks(doc.sourceFiles);
    await deleteDocumentVectors(doc.id).catch(() => null);
    await indexDocumentChunks({
      documentId: doc.id,
      userId: doc.ownerId,
      sourceFiles,
    });
    console.log(`Indexed ${doc.displayName} (${doc.id})`);
  }
  await prisma.$disconnect();
};

run().catch((error) => {
  console.error("Reindex failed", error);
  prisma.$disconnect().catch(() => null);
  process.exit(1);
});
