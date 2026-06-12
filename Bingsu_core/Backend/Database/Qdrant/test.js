/**
 * Test script for Qdrant Vector Database
 * Run: node test.js
 */
import {
  ensureCollection,
  upsertPoints,
  searchQdrant,
  deleteDocumentVectors,
} from "./qdrant.js";
import { qdrantUrl, qdrantCollectionName } from "../../Service/Rag/config.js";
import crypto from "crypto";

// Generate a simple test vector (1536 dimensions - typical for text-embedding-3-small)
const generateTestVector = (size = 1536) => {
  return Array.from({ length: size }, () => Math.random() * 2 - 1);
};

// Generate UUID for point ID
const generateUUID = () => {
  return crypto.randomUUID();
};

const testVectorSize = 1536;

console.log("🚀 Starting Qdrant Test...\n");
console.log(`Qdrant URL: ${qdrantUrl}`);
console.log(`Collection: ${qdrantCollectionName}\n`);

try {
  // Test 1: Ensure collection exists
  console.log("📦 Test 1: Ensuring collection exists...");
  await ensureCollection(testVectorSize);
  console.log("✅ Collection ready!\n");

  // Test 2: Upsert test points
  console.log("📝 Test 2: Upserting test points...");
  const testPoints = [
    {
      id: generateUUID(),
      vector: generateTestVector(testVectorSize),
      payload: {
        docId: "doc-1",
        text: "This is a test document about artificial intelligence",
        label: "Test Chunk 1",
      },
    },
    {
      id: generateUUID(),
      vector: generateTestVector(testVectorSize),
      payload: {
        docId: "doc-1",
        text: "Machine learning is a subset of AI",
        label: "Test Chunk 2",
      },
    },
    {
      id: generateUUID(),
      vector: generateTestVector(testVectorSize),
      payload: {
        docId: "doc-2",
        text: "Python is a popular programming language",
        label: "Test Chunk 3",
      },
    },
  ];

  await upsertPoints(testPoints);
  console.log(`✅ Upserted ${testPoints.length} points!\n`);

  // Test 3: Search vectors
  console.log("🔍 Test 3: Searching vectors...");
  const queryVector = generateTestVector(testVectorSize);
  const searchResults = await searchQdrant(queryVector, { limit: 3 });
  console.log(`✅ Found ${searchResults.length} results:`);
  searchResults.forEach((result, index) => {
    console.log(`   ${index + 1}. Score: ${result.score?.toFixed(4)}, DocId: ${result.payload?.docId}, Text: ${result.payload?.text?.substring(0, 50)}...`);
  });
  console.log();

  // Test 4: Search with docId filter
  console.log("🔍 Test 4: Searching with docId filter...");
  const filteredResults = await searchQdrant(queryVector, {
    docIds: ["doc-1"],
    limit: 2,
  });
  console.log(`✅ Found ${filteredResults.length} results for doc-1:`);
  filteredResults.forEach((result, index) => {
    console.log(`   ${index + 1}. Score: ${result.score?.toFixed(4)}, Text: ${result.payload?.text?.substring(0, 50)}...`);
  });
  console.log();

  // Test 5: Delete document vectors
  console.log("🗑️  Test 5: Deleting document vectors...");
  await deleteDocumentVectors("doc-1");
  console.log("✅ Deleted vectors for doc-1\n");

  // Verify deletion
  console.log("🔍 Test 6: Verifying deletion...");
  const afterDeleteResults = await searchQdrant(queryVector, {
    docIds: ["doc-1"],
    limit: 10,
  });
  console.log(`✅ Found ${afterDeleteResults.length} results for doc-1 (should be 0)\n`);

  console.log("🎉 All tests passed!");
} catch (error) {
  console.error("❌ Test failed:", error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
}
