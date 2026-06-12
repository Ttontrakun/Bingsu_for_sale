import { useState } from 'react';
import { HiX, HiCode } from 'react-icons/hi';
import Dropdown from './Dropdown';
import { showToast } from './ToastNotification';

function ApiIntegrationModal({ isOpen, onClose }) {
  const [secretKey, setSecretKey] = useState('sk-645a7b5c48d540428d6d32707ad05925');
  const [selectedModel, setSelectedModel] = useState(null);
  const [inputText, setInputText] = useState('สวัสดีครับ! ช่วยเขียนจดหมายให้ผมหน่อย');
  const [result, setResult] = useState('');
  const [showCode, setShowCode] = useState(false);

  const modelOptions = [
    { value: 'gcc1111', label: 'gcc1111' },
    { value: 'model2', label: 'Model 2' },
    { value: 'model3', label: 'Model 3' },
  ];

  const generateCurlCommand = () => {
    const model = selectedModel || 'gcc1111';
    const endpoint = 'https://bingsu.ntictsolution.com/api/chat/completions';
    const content = inputText.replace(/"/g, '\\"');
    
    return `curl -X POST ${endpoint} \\
-H "Authorization: Bearer ${secretKey}" \\
-H "Content-Type: application/json" \\
-d '{
  "model": "${model}",
  "messages": [
    {
      "role": "user",
      "content": "${content}"
    }
  ]
}'`;
  };

  const handleRun = async () => {
    // Simulate API call
    setShowCode(false);
    setResult('Processing...');
    
    // In a real implementation, you would make an actual API call here
    setTimeout(() => {
      setResult('API response would appear here...');
    }, 1000);
  };

  const handleCode = () => {
    setShowCode(true);
    setResult(generateCurlCommand());
  };

  const handleCopyResult = async () => {
    try {
      await navigator.clipboard.writeText(result);
      showToast('คัดลอกสำเร็จ!', 'success');
    } catch (err) {
      showToast('ไม่สามารถคัดลอกได้', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4'>
      <div className='bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-auto'>
        {/* Header */}
        <div className='flex items-center justify-between p-6 border-b border-gray-200'>
          <div className='flex items-center gap-3'>
            <div className='w-12 h-12 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0'>
              <span className='text-white font-bold text-lg'>&lt;/&gt;</span>
            </div>
            <div>
              <h2 className='text-2xl font-bold text-gray-800'>API</h2>
              <p className='text-sm text-gray-600'>Using our api building your own llm application</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className='text-gray-400 hover:text-gray-600 transition-colors'
          >
            <HiX className='text-2xl' />
          </button>
        </div>

        {/* Content */}
        <div className='p-6'>
          {/* Secret Key */}
          <div className='mb-6'>
            <label className='block text-sm font-medium text-gray-700 mb-3'>
              Secret Key
            </label>
            <input
              type='text'
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder='Enter Secret Key'
              className='w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-700 placeholder-gray-400'
            />
          </div>

          {/* Select Model */}
          <div className='mb-6'>
            <label className='block text-sm font-medium text-gray-700 mb-3'>
              Select Model
            </label>
            <Dropdown
              options={modelOptions}
              selectedValue={selectedModel}
              onSelect={setSelectedModel}
              placeholder="Select"
            />
          </div>

          {/* Input Text */}
          <div className='mb-6'>
            <label className='block text-sm font-medium text-gray-700 mb-3'>
              Input text
            </label>
            <div className='flex gap-4'>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder='Enter your prompt here...'
                rows={8}
                className='flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-700 placeholder-gray-400 resize-none'
              />
              <div className='flex flex-col gap-3'>
                <button
                  type='button'
                  onClick={handleRun}
                  className='px-6 py-3 bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold rounded-lg transition-colors whitespace-nowrap'
                >
                  Run
                </button>
                <button
                  type='button'
                  onClick={handleCode}
                  className='px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white font-semibold rounded-lg transition-colors whitespace-nowrap flex items-center justify-center gap-2'
                >
                  <HiCode className='text-lg' />
                  Code
                </button>
              </div>
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className='mb-6'>
              <div className='flex items-center justify-between mb-3'>
                <label className='block text-sm font-medium text-gray-700'>
                  Result
                </label>
                {showCode && (
                  <button
                    type='button'
                    onClick={handleCopyResult}
                    className='text-xs text-gray-600 hover:text-gray-800 transition-colors'
                  >
                    Copy
                  </button>
                )}
              </div>
              <div className='bg-gray-100 rounded-lg p-4 border border-gray-300'>
                {showCode ? (
                  <pre className='text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap font-mono'>
                    {result}
                  </pre>
                ) : (
                  <div className='text-sm text-gray-700 whitespace-pre-wrap'>
                    {result}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className='flex justify-end gap-4 pt-4 border-t border-gray-200'>
            <button
              type='button'
              onClick={onClose}
              className='px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors'
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ApiIntegrationModal;
