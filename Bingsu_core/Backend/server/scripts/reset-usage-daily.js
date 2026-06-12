import dotenv from "dotenv";
import { prisma } from "../db.js";

dotenv.config({ path: ".env.local" });
dotenv.config();

const getDateKey = () => new Date().toISOString().slice(0, 10);

const main = async () => {
  const dateKey = getDateKey();
  const result = await prisma.usageDaily.updateMany({
    where: { dateKey },
    data: {
      chatCount: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
  });
  console.log(`Reset usage for date ${dateKey}: ${result.count} record(s).`);
};

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
