import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import KnowledgeDetail from './KnowledgeDetail';
import SupportAddKnowledgeData from './SupportAddKnowledgeData';
import { api } from '../services/api';

const GUIDE_DISPLAY_NAME = 'คู่มือการใช้งาน';

/**
 * Knowledge ทั่วไป → หน้าอัปโหลด/แก้ไขเอกสารแบบ User เดิม
 * "คู่มือการใช้งาน" → หน้าแก้คู่มือ (.txt / อัปโหลด) เดิม
 */
function KnowledgeDocumentRoute() {
  const { id } = useParams();
  const [doc, setDoc] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    if (!id) {
      setDoc(null);
      return undefined;
    }
    api
      .getAdminDocument(id)
      .then((d) => {
        if (!cancelled) setDoc(d);
      })
      .catch(() => {
        if (!cancelled) setDoc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (doc === undefined) {
    return (
      <div className="max-w-5xl">
        <p className="text-gray-500">กำลังโหลด...</p>
      </div>
    );
  }
  if (!doc) {
    return (
      <div className="max-w-5xl">
        <p className="text-red-600">โหลด Knowledge ไม่สำเร็จ</p>
      </div>
    );
  }

  const displayName = doc.displayName || doc.name || '';
  if (displayName === GUIDE_DISPLAY_NAME) {
    return <KnowledgeDetail />;
  }
  return <SupportAddKnowledgeData />;
}

export default KnowledgeDocumentRoute;
