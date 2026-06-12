import "../config.js";
import { embedTexts } from "../services/embeddings.js";

const text = "ทดสอบ embedding Qwen3";
console.log("Testing embedding:", text);
const vectors = await embedTexts([text]);
console.log("OK. Vector length:", vectors[0]?.length ?? 0);
