import { PrismaClient } from "@prisma/client";
import { fullConversationTitleRedaction, fullUserMessageRedaction, messageStoreRedaction } from "./config.js";
import { redactSensitiveText } from "./lib/privacy.js";

const basePrisma = new PrismaClient();

const redactMessagePayload = (payload) => {
  if (!payload || typeof payload !== "object") return payload;
  const next = { ...payload };
  const role = String(next.role || "").toLowerCase();
  if (role === "user" && typeof next.content === "string" && next.content.trim()) {
    next.content = fullUserMessageRedaction
      ? "[REDACTED_USER_MESSAGE]"
      : redactSensitiveText(next.content);
  }
  return next;
};

const redactConversationPayload = (payload) => {
  if (!payload || typeof payload !== "object") return payload;
  const next = { ...payload };
  if (typeof next.title === "string" && next.title.trim()) {
    next.title = fullConversationTitleRedaction
      ? "[REDACTED_CONVERSATION_TITLE]"
      : redactSensitiveText(next.title);
  }
  return next;
};

const prismaWithRedaction = basePrisma.$extends({
  query: {
    message: {
      async create({ args, query }) {
        if (args?.data) args.data = redactMessagePayload(args.data);
        return query(args);
      },
      async update({ args, query }) {
        if (args?.data) args.data = redactMessagePayload(args.data);
        return query(args);
      },
      async upsert({ args, query }) {
        if (args?.create) args.create = redactMessagePayload(args.create);
        if (args?.update) args.update = redactMessagePayload(args.update);
        return query(args);
      },
      async createMany({ args, query }) {
        if (Array.isArray(args?.data)) args.data = args.data.map(redactMessagePayload);
        else if (args?.data) args.data = redactMessagePayload(args.data);
        return query(args);
      },
      async updateMany({ args, query }) {
        if (Array.isArray(args?.data)) args.data = args.data.map(redactMessagePayload);
        else if (args?.data) args.data = redactMessagePayload(args.data);
        return query(args);
      },
    },
    conversation: {
      async create({ args, query }) {
        if (args?.data) args.data = redactConversationPayload(args.data);
        return query(args);
      },
      async update({ args, query }) {
        if (args?.data) args.data = redactConversationPayload(args.data);
        return query(args);
      },
      async upsert({ args, query }) {
        if (args?.create) args.create = redactConversationPayload(args.create);
        if (args?.update) args.update = redactConversationPayload(args.update);
        return query(args);
      },
      async createMany({ args, query }) {
        if (Array.isArray(args?.data)) args.data = args.data.map(redactConversationPayload);
        else if (args?.data) args.data = redactConversationPayload(args.data);
        return query(args);
      },
      async updateMany({ args, query }) {
        if (Array.isArray(args?.data)) args.data = args.data.map(redactConversationPayload);
        else if (args?.data) args.data = redactConversationPayload(args.data);
        return query(args);
      },
    },
  },
});

export const prisma = messageStoreRedaction ? prismaWithRedaction : basePrisma;
