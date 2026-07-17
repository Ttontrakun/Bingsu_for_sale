import { useState, useEffect } from 'react';
import { HiX, HiInformationCircle, HiClipboardCopy } from 'react-icons/hi';
import { HiChatBubbleLeftRight } from 'react-icons/hi2';
import Dropdown from './Dropdown';
import { showToast } from './ToastNotification';
import { botAPI } from '../services/api';

function WebsiteIntegrationModal({ isOpen, onClose }) {
  const [widgetImageUrl, setWidgetImageUrl] = useState('https://storage.googleapis.com/ai-api/AI%20API%20Image/chatbot_chindax.png');
  const [widgetName, setWidgetName] = useState('');
  const [selectedModel, setSelectedModel] = useState(null);
  const [welcomeText, setWelcomeText] = useState('');
  const [ownerId] = useState('c01bd8dd-9163-45d2-b843-c3e77ef93627');
  const [modelOptions, setModelOptions] = useState([]);

  // โหลด bots จาก API
  useEffect(() => {
    if (isOpen) {
      const loadBots = async () => {
        try {
          const botsData = await botAPI.getBots();
          // Transform bots data to dropdown options format
          if (Array.isArray(botsData)) {
            const options = botsData
              .filter(bot => bot && bot.id && bot.name)
              .map(bot => ({
                value: bot.id.toString(),
                label: bot.name
              }));
            setModelOptions(options);
          } else {
            setModelOptions([]);
          }
        } catch (error) {
          console.error('Error loading bots:', error);
          setModelOptions([]);
        }
      };

      loadBots();
    }
  }, [isOpen]);

  const widgetScript = `<script>
  (function() {
    var script = document.createElement('script');
    script.src = 'https://bingsu.ntictsolution.com/widget.js';
    script.defer = true;
    script.setAttribute('data-endpoint', 'https://bingsu.ntictsolution.com');
    script.setAttribute('data-owner-id', '${ownerId}');
    document.head.appendChild(script);
  })();
</script>`;

  const handleSubmit = (e) => {
    e.preventDefault();
    // Handle website integration logic here
    onClose();
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(widgetScript);
      showToast('คัดลอกสคริปต์สำเร็จ!', 'success');
    } catch (err) {
      showToast('ไม่สามารถคัดลอกสคริปต์ได้', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4'>
      <div className='bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto'>
        {/* Header */}
        <div className='flex items-center justify-between p-6 border-b border-gray-200'>
          <h2 className='text-2xl font-bold text-gray-800'>Chat Widget Setting</h2>
          <button
            onClick={onClose}
            className='text-gray-400 hover:text-gray-600 transition-colors'
          >
            <HiX className='text-2xl' />
          </button>
        </div>

        {/* Content */}
        <div className='p-6'>
          <form onSubmit={handleSubmit}>
            <div className='space-y-6'>
              {/* Widget Profile */}
              <div>
                <label className='block text-sm font-medium text-gray-700 mb-3'>
                  Widget Profile
                </label>
                <div className='flex items-center gap-4'>
                  <div className='w-16 h-16 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden'>
                    {widgetImageUrl ? (
                      <img 
                        src={widgetImageUrl} 
                        alt='Widget Profile' 
                        className='w-full h-full object-cover'
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <HiChatBubbleLeftRight 
                      className='text-blue-600 text-3xl' 
                      style={{ display: widgetImageUrl ? 'none' : 'block' }}
                    />
                  </div>
                  <div className='flex-1'>
                    <input
                      type='url'
                      value={widgetImageUrl}
                      onChange={(e) => setWidgetImageUrl(e.target.value)}
                      placeholder='Enter Image URL'
                      className='w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-700 placeholder-gray-400'
                    />
                  </div>
                </div>
              </div>

              {/* Widget Name */}
              <div>
                <label htmlFor='widget-name' className='block text-sm font-medium text-gray-700 mb-3'>
                  Chat Widget Name
                </label>
                <input
                  id='widget-name'
                  type='text'
                  value={widgetName}
                  onChange={(e) => setWidgetName(e.target.value)}
                  placeholder='Enter Widget Name'
                  className='w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-700 placeholder-gray-400'
                />
              </div>

              {/* Select Model */}
              <div>
                <label className='block text-sm font-medium text-gray-700 mb-3'>
                  Select Bot
                </label>
                <Dropdown
                  options={modelOptions}
                  selectedValue={selectedModel}
                  onSelect={setSelectedModel}
                  placeholder="Select"
                />
              </div>

              {/* Welcome Text */}
              <div>
                <label htmlFor='welcome-text' className='block text-sm font-medium text-gray-700 mb-3'>
                  Widget Name (Welcome Text)
                </label>
                <input
                  id='welcome-text'
                  type='text'
                  value={welcomeText}
                  onChange={(e) => setWelcomeText(e.target.value)}
                  placeholder='Enter welcome text'
                  className='w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-700 placeholder-gray-400'
                />
              </div>

              {/* Widget Script */}
              <div>
                <div className='flex items-center gap-2 mb-3'>
                  <label className='block text-sm font-medium text-gray-700'>
                    Widget Script
                  </label>
                  <HiInformationCircle className='text-gray-400 text-lg' />
                </div>
                <div className='relative bg-gray-100 rounded-lg p-4 border border-gray-300'>
                  <pre className='text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap'>
                    {widgetScript}
                  </pre>
                  <button
                    type='button'
                    onClick={handleCopyScript}
                    className='absolute top-4 right-4 text-gray-600 hover:text-gray-800 transition-colors'
                  >
                    <HiClipboardCopy className='text-lg' />
                  </button>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className='flex justify-end gap-4 pt-4 border-t border-gray-200'>
                <button
                  type='button'
                  onClick={onClose}
                  className='px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors'
                >
                  Cancel
                </button>
                <button
                  type='submit'
                  className='px-6 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold rounded-lg transition-colors'
                >
                  Save
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default WebsiteIntegrationModal;
