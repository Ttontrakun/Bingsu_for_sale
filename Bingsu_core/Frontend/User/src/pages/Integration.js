import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import Toggle from '../components/Toggle';
import LineIntegrationModal from '../components/LineIntegrationModal';
import WebsiteIntegrationModal from '../components/WebsiteIntegrationModal';
import { integrationsAPI } from '../services/api';

function Integration() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [lineEnabled, setLineEnabled] = useState(false);
  const [websiteEnabled, setWebsiteEnabled] = useState(false);
  const [isLineModalOpen, setIsLineModalOpen] = useState(false);
  const [isWebsiteModalOpen, setIsWebsiteModalOpen] = useState(false);

  // โหลดสถานะ integration จริงจากหลังบ้าน (เพื่อให้ toggle สะท้อนการตั้งค่า)
  useEffect(() => {
    const load = async () => {
      try {
        const rows = await integrationsAPI.list();
        const lineRow = (rows || []).find((r) => r.provider === 'line');
        const websiteRow = (rows || []).find((r) => r.provider === 'website');
        setLineEnabled(Boolean(lineRow?.enabled));
        setWebsiteEnabled(Boolean(websiteRow?.enabled));
      } catch (e) {
        // ถ้าโหลดไม่ได้ ให้ fallback เป็น false (ผู้ใช้ยังสามารถเปิด modal เพื่อ set ใหม่ได้)
        console.error('Failed to load integrations:', e);
      }
    };
    load();
  }, []);

  const handleLineToggle = (enabled) => {
    setLineEnabled(enabled);
    if (enabled) {
      setIsLineModalOpen(true);
    } else {
      // ปิด integration ผ่าน backend (best effort)
      integrationsAPI.update('line', { enabled: false }).catch((e) => console.error('Disable LINE failed', e));
    }
  };

  const handleWebsiteToggle = (enabled) => {
    setWebsiteEnabled(enabled);
    if (enabled) {
      setIsWebsiteModalOpen(true);
    } else {
      integrationsAPI.update('website', { enabled: false }).catch((e) => console.error('Disable website failed', e));
    }
  };


  return (
    <div className='flex h-screen bg-white relative'>
      {/* Sidebar Component */}
      <Sidebar onCollapseChange={setIsSidebarCollapsed} />

      {/* Main Content */}
      <main className={`flex-1 bg-white px-8 py-6 overflow-auto flex flex-col transition-all duration-300 ${isSidebarCollapsed ? 'pl-16' : ''}`}>
        {/* Header */}
        <div className='mb-8'>
          <h1 className='text-3xl font-bold text-gray-800'>Integration</h1>
        </div>

        {/* Integration Cards */}
        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          {/* LINE Integration Card */}
          <div className='bg-gray-50 border border-gray-200 rounded-lg p-6 flex flex-col'>
            <div className='flex items-start gap-3 mb-4'>
              <div className='w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0'>
                <span className='text-white font-bold text-lg'>LINE</span>
              </div>
              <div className='flex-1'>
                <h2 className='text-lg font-semibold text-gray-800'>
                  LINE <span className='text-sm font-normal text-gray-500'>(connect)</span>
                </h2>
              </div>
            </div>
            
            <p className='text-sm text-gray-600 mb-6 flex-1'>
              Connect to LINE for Seamless Integration and Quick Communication.
            </p>

            <div className='flex items-center justify-end mt-auto'>
              <Toggle enabled={lineEnabled} onChange={handleLineToggle} />
            </div>
          </div>

          {/* Website Integration Card */}
          <div className='bg-gray-50 border border-gray-200 rounded-lg p-6 flex flex-col'>
            <div className='flex items-start gap-3 mb-4'>
              <div className='w-12 h-12 bg-yellow-400 rounded-lg flex items-center justify-center flex-shrink-0'>
                <svg className='w-6 h-6 text-white' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9' />
                </svg>
              </div>
              <div className='flex-1'>
                <h2 className='text-lg font-semibold text-gray-800'>
                  Website Chat Widget <span className='text-sm font-normal text-gray-500'>(connect)</span>
                </h2>
              </div>
            </div>
            
            <p className='text-sm text-gray-600 mb-6 flex-1'>
              Connect to Website for Seamless Integration and Quick Communication.
            </p>

            <div className='flex items-center justify-end mt-auto'>
              <Toggle enabled={websiteEnabled} onChange={handleWebsiteToggle} />
            </div>
          </div>
        </div>

        {/* LINE Integration Modal */}
        <LineIntegrationModal
          isOpen={isLineModalOpen}
          onClose={(result) => {
            setIsLineModalOpen(false);
            // ถ้ากด Submit สำเร็จ ให้ toggle เปิดค้างไว้
            if (result?.saved === true) setLineEnabled(true);
          }}
        />

        {/* Website Integration Modal */}
        <WebsiteIntegrationModal
          isOpen={isWebsiteModalOpen}
          onClose={(result) => {
            setIsWebsiteModalOpen(false);
            if (result?.saved === true) setWebsiteEnabled(true);
          }}
        />

      </main>
    </div>
  );
}

export default Integration;
