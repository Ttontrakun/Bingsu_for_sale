export const BOT_LIMIT_PER_USER = 3;

export const botListRaw = [
  { id: 1, name: 'Customer Support Bot', description: 'ตอบคำถามลูกค้าอัตโนมัติ', username: 'วิชัย เทคโน', enabled: true, knowledge: ['Customer Service Guide', 'FAQ Database'], groups: [1] },
  { id: 2, name: 'Sales Assistant', description: 'ช่วยงานขายและแนะนำสินค้า', username: 'วิชัย เทคโน', enabled: false, knowledge: ['Product Catalog', 'Company Policy'], groups: [2] },
  { id: 3, name: 'Tech Support Pro', description: 'แก้ปัญหาทางเทคนิค', username: 'วิชัย เทคโน', enabled: true, knowledge: ['Technical Documentation', 'FAQ Database'], groups: [1] },
  { id: 4, name: 'Thai Language Bot', description: 'ตอบเป็นภาษาไทยเท่านั้น', username: 'วิชัย เทคโน', enabled: true, knowledge: ['Company Policy', 'FAQ Database'], groups: [3] },
  { id: 5, name: 'FAQ Assistant', description: 'ตอบคำถามที่พบบ่อย', username: 'วิชัย เทคโน', enabled: true, knowledge: ['FAQ Database', 'Customer Service Guide'], groups: [1] },
  { id: 6, name: 'Product Info Bot', description: 'ให้ข้อมูลสินค้าและราคา', username: 'ธนาธิป พานิช', enabled: true, knowledge: ['pricing', 'presentation'], groups: [2] },
  { id: 7, name: 'Order Tracking', description: 'ตรวจสอบสถานะคำสั่งซื้อ', username: 'ธนาธิป พานิช', enabled: true, knowledge: ['manual', 'form'], groups: [4] },
  { id: 8, name: 'Booking Bot', description: 'จองและนัดหมาย', username: 'ธนาธิป พานิช', enabled: false, knowledge: ['form', 'manual'], groups: [2] },
  { id: 9, name: 'Payment Helper', description: 'ช่วยเรื่องการชำระเงิน', username: 'ธนาธิป พานิช', enabled: true, knowledge: ['pricing', 'manual'], groups: [4] },
  { id: 10, name: 'Promotion Bot', description: 'แจ้งโปรโมชั่นและข่าวสาร', username: 'สุภาพร น้อยหน่า', enabled: true, knowledge: ['presentation', 'pricing'], groups: [2] },
  { id: 11, name: 'HR Assistant', description: 'ตอบคำถามด้าน HR', username: 'สุภาพร น้อยหน่า', enabled: true, knowledge: ['form', 'manual'], groups: [5] },
  { id: 12, name: 'Restaurant Bot', description: 'สั่งอาหารและจองโต๊ะ', username: 'ชาญชัย สมบูรณ์', enabled: true, knowledge: ['manual', 'form'], groups: [1] },
  { id: 13, name: 'Medical Info', description: 'ให้ข้อมูลสุขภาพทั่วไป', username: 'ชาญชัย สมบูรณ์', enabled: true, knowledge: ['manual'], groups: [3] },
  { id: 14, name: 'Travel Guide', description: 'แนะนำที่เที่ยวและโรงแรม', username: 'ปรีชา แก้วงาม', enabled: false, knowledge: ['presentation', 'manual'], groups: [1] },
  { id: 15, name: 'Education Bot', description: 'ตอบคำถามด้านการศึกษา', username: 'สุรศักดิ์ ชัยชนะ', enabled: true, knowledge: ['manual', 'form'], groups: [3] },
  { id: 16, name: 'E-commerce Bot', description: 'ช่วยช้อปปิ้งออนไลน์', username: 'อรทัย บุญมา', enabled: true, knowledge: ['pricing', 'manual'], groups: [2] },
  { id: 17, name: 'Legal Advisor Bot', description: 'คำแนะนำเบื้องต้นทางกฎหมาย', username: 'ชัยวัฒน์ บำรุง', enabled: true, knowledge: ['form', 'manual'], groups: [4] },
  { id: 18, name: 'Fitness Coach', description: 'แนะนำการออกกำลังกาย', username: 'นภัสสร เพ็ชรดี', enabled: false, knowledge: ['manual'], groups: [1] },
  { id: 19, name: 'Event Organizer', description: 'จัดงานอีเว้นท์', username: 'ณัฐพล รักษา', enabled: true, knowledge: ['form', 'presentation'], groups: [2] },
  { id: 20, name: 'Language Tutor', description: 'สอนภาษาออนไลน์', username: 'ขวัญใจ รุ่งเจริญ', enabled: true, knowledge: ['manual'], groups: [3] }
];
