import { prisma } from "../db.js";

/**
 * วันที่ใช้งานล่าสุดต่อ user = ล่าสุดระหว่าง (login สร้าง session) กับ (ข้อความแชทฝั่ง user)
 * @param {string[]} userIds
 * @returns {Promise<Map<string, Date|null>>}
 */
export async function getLastActivityByUserIds(userIds) {
  const unique = [...new Set(userIds.filter(Boolean))];
  const map = new Map(unique.map((id) => [id, null]));
  if (!unique.length) return map;

  const [sessions, messages] = await Promise.all([
    prisma.session.groupBy({
      by: ["userId"],
      where: { userId: { in: unique } },
      _max: { createdAt: true },
    }),
    prisma.message.groupBy({
      by: ["userId"],
      where: { userId: { in: unique }, role: "user" },
      _max: { createdAt: true },
    }),
  ]);

  const bump = (userId, d) => {
    if (!userId || !d) return;
    const t = new Date(d).getTime();
    if (Number.isNaN(t)) return;
    const prev = map.get(userId);
    const prevT = prev ? new Date(prev).getTime() : 0;
    if (t > prevT) map.set(userId, new Date(d));
  };

  for (const s of sessions) bump(s.userId, s._max.createdAt);
  for (const m of messages) bump(m.userId, m._max.createdAt);

  return map;
}
