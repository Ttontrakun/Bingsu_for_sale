import { useState, useEffect } from 'react';
import CreateBot from './CreateBot';
import { botAPI } from '../services/api';

/**
 * User สร้าง/แก้ไขได้บอทเดียว — ไม่มีบอท = โหมดสร้าง, มีแล้ว = แก้ไขบอทตัวแรก
 */
function MyBotPage() {
  const [bots, setBots] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    botAPI
      .getBots()
      .then((b) => {
        if (!cancelled) setBots(Array.isArray(b) ? b : []);
      })
      .catch(() => {
        if (!cancelled) setBots([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (bots === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <p className="text-gray-600">กำลังโหลด...</p>
      </div>
    );
  }

  return (
    <CreateBot
      singleUserFlow
      forcedBotForEdit={bots.length > 0 ? bots[0] : null}
    />
  );
}

export default MyBotPage;
