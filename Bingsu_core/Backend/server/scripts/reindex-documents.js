import dotenv from "dotenv";
import { prisma } from "../db.js";
import { qdrantCollectionName } from "../config.js";
import { ensureSourceFileBlocks } from "../services/text.js";
import { deleteDocumentVectors, indexDocumentChunks } from "../services/vectorDb.js";

// Ensure env is loaded when running directly.
dotenv.config({ path: ".env.local" });
dotenv.config();

const main = async () => {
  const docs = await prisma.document.findMany({
    select: { id: true, ownerId: true, displayName: true, sourceFiles: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Found ${docs.length} document(s) to reindex.`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of docs) {
    const name = doc.displayName || doc.id;
    try {
      const preparedFiles = ensureSourceFileBlocks(doc.sourceFiles);
      if (!preparedFiles || (Array.isArray(preparedFiles) && preparedFiles.length === 0)) {
        console.log(`- SKIP ${name}: no sourceFiles`);
        skipped += 1;
        continue;
      }

      await deleteDocumentVectors(doc.id).catch(() => null);
      await indexDocumentChunks({
        documentId: doc.id,
        userId: doc.ownerId,
        sourceFiles: preparedFiles,
      });
      await prisma.document.update({
        where: { id: doc.id },
        data: { ragStoreName: qdrantCollectionName },
      }).catch(() => null);

      console.log(`- OK   ${name}`);
      ok += 1;
    } catch (error) {
      console.error(`- FAIL ${name}`, error);
      failed += 1;
    }
  }

  console.log(`Done. ok=${ok} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
};

main()
  .catch((err) => {
    console.error("Reindex failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

