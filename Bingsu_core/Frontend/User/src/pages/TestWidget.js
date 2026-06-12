import { useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import { useState } from 'react';

function TestWidget() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    // สร้างและเพิ่ม script widget
    const script = document.createElement('script');
    script.src = 'https://bingsu.ntictsolution.com/widget.js';
    script.defer = true;
    script.setAttribute('data-endpoint', 'https://bingsu.ntictsolution.com');
    script.setAttribute('data-owner-id', 'affcebbe-c7d5-44dc-af09-064bf4335da7');
    document.head.appendChild(script);

    // Cleanup: ลบ script เมื่อ component unmount
    return () => {
      const existingScript = document.querySelector('script[src="https://bingsu.ntictsolution.com/widget.js"]');
      if (existingScript) {
        document.head.removeChild(existingScript);
      }
      // ลบ widget element ถ้ามี
      const widget = document.querySelector('[data-bingsu-widget]');
      if (widget) {
        widget.remove();
      }
    };
  }, []);

  return (
    <div className='flex h-screen bg-white relative'>
      {/* Sidebar Component */}
      <Sidebar onCollapseChange={setIsSidebarCollapsed} />

      {/* Main Content */}
      <main className={`flex-1 bg-white px-8 py-6 overflow-auto flex flex-col transition-all duration-300 ${isSidebarCollapsed ? 'pl-16' : ''}`}>
        {/* Header */}
        <div className='mb-8'>
          <h1 className='text-3xl font-bold text-gray-800 mb-2'>Test Widget Page</h1>
          <p className='text-gray-600'>หน้านี้ใช้สำหรับทดสอบ BingSu Chat Widget</p>
        </div>

        {/* Content Area */}
        <div className='flex-1 bg-gray-50 rounded-lg p-8 border border-gray-200'>
          <div className='max-w-4xl mx-auto'>
            <div className='bg-white rounded-lg shadow-md p-6 mb-6'>
              <h2 className='text-xl font-semibold text-gray-800 mb-4'>ข้อมูล Widget</h2>
              <div className='space-y-3 text-sm'>
                <div className='flex items-start gap-3'>
                  <span className='font-medium text-gray-700 min-w-[120px]'>Endpoint:</span>
                  <span className='text-gray-600'>https://bingsu.ntictsolution.com</span>
                </div>
                <div className='flex items-start gap-3'>
                  <span className='font-medium text-gray-700 min-w-[120px]'>Owner ID:</span>
                  <span className='text-gray-600 font-mono'>affcebbe-c7d5-44dc-af09-064bf4335da7</span>
                </div>
                <div className='flex items-start gap-3'>
                  <span className='font-medium text-gray-700 min-w-[120px]'>Script URL:</span>
                  <span className='text-gray-600'>https://bingsu.ntictsolution.com/widget.js</span>
                </div>
              </div>
            </div>

            <div className='bg-white rounded-lg shadow-md p-6'>
              <h2 className='text-xl font-semibold text-gray-800 mb-4'>คำแนะนำ</h2>
              <ul className='space-y-2 text-gray-700 text-sm'>
                <li className='flex items-start gap-2'>
                  <span className='text-yellow-400 font-bold'>•</span>
                  <span>Widget จะปรากฏที่มุมล่างขวาของหน้าจอ</span>
                </li>
                <li className='flex items-start gap-2'>
                  <span className='text-yellow-400 font-bold'>•</span>
                  <span>คลิกที่ widget เพื่อเปิดหน้าต่างแชท</span>
                </li>
                <li className='flex items-start gap-2'>
                  <span className='text-yellow-400 font-bold'>•</span>
                  <span>ทดสอบการส่งข้อความและรับการตอบกลับจากบอท</span>
                </li>
                <li className='flex items-start gap-2'>
                  <span className='text-yellow-400 font-bold'>•</span>
                  <span>ตรวจสอบว่า widget ทำงานได้ถูกต้องและแสดงผลสวยงาม</span>
                </li>
              </ul>
            </div>

            {/* Test Content */}
            <div className='mt-8 bg-white rounded-lg shadow-md p-6'>
              <h2 className='text-xl font-semibold text-gray-800 mb-4'>เนื้อหาทดสอบ</h2>
              <div className='space-y-4 text-gray-700'>
                <p>
                  นี่คือหน้า test สำหรับทดสอบ BingSu Chat Widget คุณสามารถเลื่อนหน้าลงไปเพื่อดูเนื้อหาอื่นๆ 
                  และทดสอบว่า widget ยังคงแสดงผลที่มุมล่างขวาได้ถูกต้อง
                </p>
                <p>
                  Widget ควรจะทำงานได้ดีในทุกขนาดหน้าจอและไม่รบกวนการใช้งานของหน้าเว็บ
                </p>
              </div>
            </div>

            {/* Spacer เพื่อให้มีเนื้อหาให้เลื่อนดู */}
            <div className='mt-8 space-y-6'>
              {[...Array(5)].map((_, i) => (
                <div key={i} className='bg-white rounded-lg shadow-md p-6'>
                  <h3 className='text-lg font-semibold text-gray-800 mb-2'>Section {i + 1}</h3>
                  <p className='text-gray-600'>
                    นี่คือเนื้อหาสำหรับทดสอบการเลื่อนหน้าเว็บ ตรวจสอบว่า widget ยังคงอยู่ที่ตำแหน่งเดิม
                    เมื่อผู้ใช้เลื่อนหน้าจอ
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default TestWidget;
