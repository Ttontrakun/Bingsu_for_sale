import { useState, useEffect } from 'react';
import { HiX, HiClipboardCopy, HiEye, HiEyeOff } from 'react-icons/hi';
import Dropdown from './Dropdown';
import { showToast } from './ToastNotification';
import { botAPI, integrationsAPI, getErrorMessage } from '../services/api';

function LineIntegrationModal({ isOpen, onClose }) {
  const [mode, setMode] = useState('simple'); // 'simple' or 'advanced'
  const [currentStep, setCurrentStep] = useState(1); // สำหรับ simple mode
  const [selectedModel, setSelectedModel] = useState(null);
  const [channelAccessToken, setChannelAccessToken] = useState('');
  const [channelSecret, setChannelSecret] = useState('');
  const [lineWebhook, setLineWebhook] = useState('');
  const [modelOptions, setModelOptions] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedBotDetails, setSelectedBotDetails] = useState(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const [channelAccessTokenVisible, setChannelAccessTokenVisible] = useState(false);
  const [channelSecretVisible, setChannelSecretVisible] = useState(false);

  // โหลด bots จาก API
  useEffect(() => {
    if (isOpen) {
      // reset transient form state every open (prevents stale values)
      setMode('simple');
      setCurrentStep(1);
      setChannelAccessToken('');
      setChannelSecret('');
      setChannelAccessTokenVisible(false);
      setChannelSecretVisible(false);
      setSelectedBotDetails(null);
      setIsConfirmOpen(false);
      setConfirmError('');

      const loadInitial = async () => {
        try {
          const [botsData, integrations] = await Promise.all([
            botAPI.getBots(),
            integrationsAPI.list(),
          ]);
          
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

          const lineRow = (integrations || []).find((r) => r.provider === 'line');
          if (lineRow?.webhookUrl) setLineWebhook(lineRow.webhookUrl);
          if (lineRow?.config?.botId) setSelectedModel(String(lineRow.config.botId));
          else setSelectedModel(null);
        } catch (error) {
          console.error('Error loading bots:', error);
          setModelOptions([]);
          showToast(getErrorMessage(error) || 'โหลดข้อมูลไม่สำเร็จ', 'error');
        }
      };

      loadInitial();
    }
  }, [isOpen]);

  // Load selected bot details for confirmation
  useEffect(() => {
    if (!isOpen) return;
    const id = selectedModel ? String(selectedModel).trim() : '';
    if (!id) {
      setSelectedBotDetails(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const bot = await botAPI.getBot(id);
        if (cancelled) return;
        setSelectedBotDetails(bot || null);
      } catch (e) {
        if (cancelled) return;
        setSelectedBotDetails(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedModel, isOpen]);

  const totalSteps = 4;

  const doSave = async () => {
    if (!selectedModel) {
      showToast('กรุณาเลือก Bot ที่ต้องการเชื่อมกับ LINE', 'warning');
      return;
    }
    if (!channelAccessToken?.trim()) {
      showToast('กรุณากรอก Channel Access Token', 'warning');
      return;
    }
    if (!channelSecret?.trim()) {
      showToast('กรุณากรอก Channel Secret', 'warning');
      return;
    }
    if (!lineWebhook?.trim()) {
      showToast('ยังไม่มี LINE Webhook URL — กรุณาตั้งค่า PUBLIC_BASE_URL ที่ backend แล้วรีเฟรช', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      await integrationsAPI.update('line', {
        enabled: true,
        config: {
          botId: selectedModel,
          channelAccessToken: channelAccessToken.trim(),
          channelSecret: channelSecret.trim(),
        },
      });
      showToast('บันทึกการเชื่อม LINE สำเร็จ', 'success');
      onClose?.({ saved: true });
    } catch (error) {
      console.error('LINE integration save failed:', error);
      showToast(getErrorMessage(error) || 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setConfirmError('');
    if (!selectedModel) {
      showToast('กรุณาเลือก Bot ที่ต้องการเชื่อมกับ LINE', 'warning');
      return;
    }
    if (!channelAccessToken?.trim() || !channelSecret?.trim()) {
      // keep existing toasts from doSave validation, but show them now
      if (!channelAccessToken?.trim()) showToast('กรุณากรอก Channel Access Token', 'warning');
      if (!channelSecret?.trim()) showToast('กรุณากรอก Channel Secret', 'warning');
      return;
    }
    if (!lineWebhook?.trim()) {
      showToast('ยังไม่มี LINE Webhook URL — กรุณาตั้งค่า PUBLIC_BASE_URL ที่ backend แล้วรีเฟรช', 'warning');
      return;
    }
    // open confirmation popup (bot details)
    setIsConfirmOpen(true);
  };

  const nextStep = (e) => {
    e?.preventDefault();
    e?.stopPropagation();
    setCurrentStep((prevStep) => {
      if (prevStep < totalSteps) {
        return prevStep + 1;
      }
      return prevStep;
    });
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCopyWebhook = async (e) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (lineWebhook) {
      try {
        await navigator.clipboard.writeText(lineWebhook);
        showToast('คัดลอก Webhook URL สำเร็จ!', 'success');
      } catch (err) {
        console.error('Failed to copy:', err);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = lineWebhook;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          showToast('คัดลอก Webhook URL สำเร็จ!', 'success');
        } catch (fallbackErr) {
          console.error('Fallback copy failed:', fallbackErr);
          showToast('ไม่สามารถคัดลอกได้ กรุณาคัดลอกด้วยตนเอง', 'error');
        }
        document.body.removeChild(textArea);
      }
    } else {
      showToast('กรุณากรอก Webhook URL ก่อน', 'warning');
    }
  };

  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4'>
      <div className='bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto'>
        {/* Header */}
        <div className='flex items-center justify-between p-6 border-b border-gray-200'>
          <h2 className='text-2xl font-bold text-gray-800'>Integration</h2>
          <button
            onClick={onClose}
            className='text-gray-400 hover:text-gray-600 transition-colors'
          >
            <HiX className='text-2xl' />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className='flex gap-2 p-6 border-b border-gray-200'>
          <button
            type='button'
            onClick={() => {
              setMode('simple');
              setCurrentStep(1);
            }}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
              mode === 'simple'
                ? 'bg-yellow-400 text-gray-800'
                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
            }`}
          >
            Simple
          </button>
          <button
            type='button'
            onClick={() => {
              setMode('advanced');
              setCurrentStep(1);
            }}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
              mode === 'advanced'
                ? 'bg-yellow-400 text-gray-800'
                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
            }`}
          >
            Advance
          </button>
        </div>

        {/* Content */}
        <div className='p-6'>
          {/* Confirm popup */}
          {isConfirmOpen && (
            <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-lg border border-gray-200">
                <div className="p-5 border-b border-gray-200 flex items-center justify-between">
                  <div className="text-lg font-bold text-gray-800">ยืนยันการเชื่อม LINE</div>
                  <button
                    type="button"
                    onClick={() => setIsConfirmOpen(false)}
                    className="text-gray-400 hover:text-gray-600"
                    aria-label="close"
                  >
                    <HiX className="text-xl" />
                  </button>
                </div>
                <div className="p-5 space-y-3">
                  <div className="text-sm text-gray-700">
                    คุณกำลังจะเชื่อม LINE กับบอท:
                    <span className="font-semibold"> {selectedBotDetails?.name || '—'}</span>
                  </div>
                  <div className="text-sm text-gray-700">
                    เอกสาร/Knowledge ที่ผูก:
                    <div className="mt-2 max-h-40 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3">
                      {(selectedBotDetails?.documents || []).length > 0 ? (
                        <ul className="list-disc pl-5 space-y-1">
                          {selectedBotDetails.documents
                            .slice(0, 20)
                            .map((d) => (
                              <li key={d.id} className="text-sm text-gray-700">
                                {d.displayName || d.fileName || d.id}
                              </li>
                            ))}
                        </ul>
                      ) : (
                        <div className="text-sm text-gray-500">ยังไม่ผูก Knowledge</div>
                      )}
                    </div>
                    {(selectedBotDetails?.documents || []).length > 20 && (
                      <div className="text-xs text-gray-500 mt-1">แสดง 20 รายการแรก</div>
                    )}
                  </div>

                  {confirmError ? (
                    <div className="text-sm text-red-600">{confirmError}</div>
                  ) : null}
                </div>
                <div className="p-5 border-t border-gray-200 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsConfirmOpen(false)}
                    className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium"
                    disabled={isSaving}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if ((selectedBotDetails?.documents || []).length === 0) {
                        setConfirmError('บอทนี้ยังไม่ผูก Knowledge — ถ้าดำเนินการต่อ LINE อาจตอบไม่ได้จากฐานความรู้');
                        return;
                      }
                      setIsConfirmOpen(false);
                      await doSave();
                    }}
                    className="px-4 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold"
                    disabled={isSaving}
                  >
                    ยืนยันและบันทึก
                  </button>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {mode === 'simple' ? (
              /* Simple Mode - Step by Step */
              <div className='space-y-6'>
                {/* Step Indicator */}
                <div className='mb-6'>
                  <div className='flex items-center justify-between mb-2'>
                    <span className='text-sm text-gray-600'>Step {currentStep} of {totalSteps}</span>
                    <span className='text-sm text-gray-600'>{Math.round((currentStep / totalSteps) * 100)}%</span>
                  </div>
                  <div className='w-full bg-gray-200 rounded-full h-2'>
                    <div
                      className='bg-yellow-400 h-2 rounded-full transition-all duration-300'
                      style={{ width: `${(currentStep / totalSteps) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Step Content */}
                {currentStep === 1 && (
                  <div>
                    <p className='text-sm text-gray-700 mb-4'>
                      คุณต้องเลือก bot ที่ต้องการใช้สำหรับ LINE integration
                    </p>
                    <label className='block text-sm font-medium text-gray-700 mb-3'>
                      Select Bots
                    </label>
                    <Dropdown
                      options={modelOptions}
                      selectedValue={selectedModel}
                      onSelect={(v) => setSelectedModel(v != null ? String(v) : null)}
                      placeholder="Select Bots"
                    />
                  </div>
                )}

                {currentStep === 2 && (
                  <div>
                    <h3 className='text-xl font-bold text-gray-800 mb-4'>Connect to a LINE Account</h3>
                    
                    {/* Instructions */}
                    <div className='space-y-3 mb-4'>
                      <div className='flex gap-3'>
                        <span className='font-semibold text-gray-800'>Step 1:</span>
                        <p className='text-sm text-gray-700'>
                          Open{' '}
                          <a href='https://developers.line.biz' target='_blank' rel='noopener noreferrer' className='text-blue-600 hover:underline underline'>
                            https://developers.line.biz
                          </a>{' '}
                          to log in to the LINE system.
                        </p>
                      </div>
                      <div className='flex gap-3'>
                        <span className='font-semibold text-gray-800'>Step 2:</span>
                        <p className='text-sm text-gray-700'>
                          Select the LINE account you want to connect with Bingsu.
                        </p>
                      </div>
                      <div className='flex gap-3'>
                        <span className='font-semibold text-gray-800'>Step 3:</span>
                        <p className='text-sm text-gray-700'>
                          Go to the "Basic Settings" tab and find the Channel Secret section. Then, copy the code and paste it here.
                        </p>
                      </div>
                    </div>

                    {/* Channel Secret */}
                    <div>
                      <label htmlFor='channel-secret-step2' className='block text-sm font-medium text-gray-700 mb-3'>
                        Channel Secret
                      </label>
                      <div className='relative'>
                        <input
                          id='channel-secret-step2'
                          type={channelSecretVisible ? 'text' : 'password'}
                          value={channelSecret}
                          onChange={(e) => setChannelSecret(e.target.value)}
                          placeholder='Channel Secret'
                          className='w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-700 placeholder-gray-400'
                        />
                        {channelSecret ? (
                          <button
                            type='button'
                            onClick={() => setChannelSecretVisible((v) => !v)}
                            className='absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-800 transition-colors'
                            title={channelSecretVisible ? 'ซ่อน' : 'แสดง'}
                          >
                            {channelSecretVisible ? <HiEyeOff className='text-xl' /> : <HiEye className='text-xl' />}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}

                {currentStep === 3 && (
                  <div>
                    <h3 className='text-xl font-bold text-gray-800 mb-4'>Connect to a Messaging API Account</h3>
                    
                    {/* Instructions */}
                    <div className='space-y-3 mb-4'>
                      <div className='flex gap-3'>
                        <span className='font-semibold text-gray-800'>1.</span>
                        <p className='text-sm text-gray-700'>
                          Check if your LINE account is already connected to the Messaging API.
                        </p>
                      </div>
                      <div className='flex gap-3'>
                        <span className='font-semibold text-gray-800'>2.</span>
                        <p className='text-sm text-gray-700'>
                          If the Messaging API is already connected, go to the Channel access token section, click the Issue button, and copy the token to paste it here.
                        </p>
                      </div>
                      <div className='flex gap-3'>
                        <span className='font-semibold text-gray-800'>3.</span>
                        <p className='text-sm text-gray-700'>
                          If you have never activated the Messaging API, click the Enable Messaging API button to activate it.
                        </p>
                      </div>
                    </div>

                    {/* Channel Access Token */}
                    <div>
                      <label htmlFor='channel-access-token-step3' className='block text-sm font-medium text-gray-700 mb-3'>
                        Channel Access Token
                      </label>
                      <div className='relative'>
                        <input
                          id='channel-access-token-step3'
                          type={channelAccessTokenVisible ? 'text' : 'password'}
                          value={channelAccessToken}
                          onChange={(e) => setChannelAccessToken(e.target.value)}
                          placeholder='Channel Access Token'
                          className='w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-700 placeholder-gray-400'
                        />
                        {channelAccessToken ? (
                          <button
                            type='button'
                            onClick={() => setChannelAccessTokenVisible((v) => !v)}
                            className='absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-800 transition-colors'
                            title={channelAccessTokenVisible ? 'ซ่อน' : 'แสดง'}
                          >
                            {channelAccessTokenVisible ? <HiEyeOff className='text-xl' /> : <HiEye className='text-xl' />}
                          </button>
                        ) : null}
                      </div>
                      <p className='text-xs text-gray-500 mt-2'>Paste the Channel Access Token from LINE Developers Console</p>
                    </div>
                  </div>
                )}

                {currentStep === 4 && (
                  <div>
                    <h3 className='text-xl font-bold text-gray-800 mb-4'>Connect to a Webhook Account</h3>
                    
                    {/* Instructions */}
                    <div className='space-y-3 mb-4'>
                      <div className='flex gap-3'>
                        <span className='font-semibold text-gray-800'>1.</span>
                        <p className='text-sm text-gray-700'>
                          Copy this Webhook URL link and paste it into Webhook Settings section, then press the Update button.
                        </p>
                      </div>
                      <div className='flex gap-3'>
                        <span className='font-semibold text-gray-800'>2.</span>
                        <p className='text-sm text-gray-700'>
                          Press the Save Connection button below to connect Chinda to LINE
                        </p>
                      </div>
                      <div className='flex gap-3'>
                        <span className='font-semibold text-gray-800'>3.</span>
                        <p className='text-sm text-gray-700'>
                          Open LINE again, select the Webhook Settings topic, turn on Use Webhook, and press the Verify button to connect.
                        </p>
                      </div>
                    </div>

                    {/* Line Webhook */}
                    <div>
                      <label htmlFor='line-webhook' className='block text-sm font-medium text-gray-700 mb-3'>
                        Line Webhook
                      </label>
                      <div className='relative'>
                        <input
                          id='line-webhook'
                          type='url'
                          value={lineWebhook}
                          onChange={(e) => setLineWebhook(e.target.value)}
                          placeholder='Enter LINE Webhook URL'
                          className='w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-700 placeholder-gray-400'
                        />
                        {lineWebhook && (
                          <button
                            type='button'
                            onClick={(e) => handleCopyWebhook(e)}
                            className='absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-800 transition-colors z-10'
                            title='Copy webhook URL'
                          >
                            <HiClipboardCopy className='text-xl' />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Navigation Buttons */}
                <div className='flex justify-between pt-4 border-t border-gray-200'>
                  <button
                    type='button'
                    onClick={prevStep}
                    disabled={currentStep === 1}
                    className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                      currentStep === 1
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Previous
                  </button>
                  {currentStep < totalSteps ? (
                    <button
                      type='button'
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        nextStep(e);
                      }}
                      className='px-6 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold rounded-lg transition-colors'
                    >
                      Next
                    </button>
                  ) : (
                    <button
                      type='submit'
                      disabled={isSaving}
                      className={`px-6 py-2 text-gray-800 font-semibold rounded-lg transition-colors ${
                        isSaving ? 'bg-gray-200 cursor-not-allowed' : 'bg-yellow-400 hover:bg-yellow-500'
                      }`}
                    >
                      {isSaving ? 'Saving...' : 'Submit'}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* Advanced Mode - All Fields at Once */
              <div className='space-y-6'>
                {/* LINE Header */}
                <div className='flex items-center gap-3 mb-6'>
                  <div className='w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0'>
                    <span className='text-white font-bold text-lg'>LINE</span>
                  </div>
                  <div>
                    <h3 className='text-lg font-semibold text-gray-800'>Line</h3>
                    <p className='text-sm text-gray-600'>Build an intelligent Chinda LLM Chatbot by iApp to LINE.</p>
                  </div>
                </div>

                {/* Information Box */}
                <div className='bg-gray-50 rounded-lg p-4 mb-6'>
                  <ul className='space-y-2 text-sm text-gray-700'>
                    <li>• If you already have a LINEOA or LINE Business Account, you can fill out the information below.</li>
                    <li>
                      • If you don't have one yet, you can click the link to{' '}
                      <button type='button' onClick={() => window.open('https://business.line.me/', '_blank')} className='text-blue-600 hover:underline font-semibold underline bg-transparent border-none p-0 cursor-pointer'>
                        apply for LINE For Business
                      </button>.
                    </li>
                    <li>
                      • If you still don't know how to install it,{' '}
                      <button type='button' onClick={() => window.open('https://developers.line.biz/docs/', '_blank')} className='text-blue-600 hover:underline font-semibold underline bg-transparent border-none p-0 cursor-pointer'>
                        Click here
                      </button>.
                    </li>
                  </ul>
                </div>

                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-3'>
                    Select Bots
                  </label>
                  <Dropdown
                    options={modelOptions}
                    selectedValue={selectedModel}
                    onSelect={setSelectedModel}
                    placeholder="Select Bots"
                  />
                </div>

                <div>
                  <label htmlFor='channel-access-token-adv' className='block text-sm font-medium text-gray-700 mb-3'>
                    Channel Access Token
                  </label>
                  <div className='relative'>
                    <input
                      id='channel-access-token-adv'
                      type={channelAccessTokenVisible ? 'text' : 'password'}
                      value={channelAccessToken}
                      onChange={(e) => setChannelAccessToken(e.target.value)}
                      placeholder='Name your knowlegde base'
                      className='w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-700 placeholder-gray-400'
                    />
                    {channelAccessToken ? (
                      <button
                        type='button'
                        onClick={() => setChannelAccessTokenVisible((v) => !v)}
                        className='absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-800 transition-colors'
                        title={channelAccessTokenVisible ? 'ซ่อน' : 'แสดง'}
                      >
                        {channelAccessTokenVisible ? <HiEyeOff className='text-xl' /> : <HiEye className='text-xl' />}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div>
                  <label htmlFor='channel-secret-adv' className='block text-sm font-medium text-gray-700 mb-3'>
                    Channel Secret
                  </label>
                  <div className='relative'>
                    <input
                      id='channel-secret-adv'
                      type={channelSecretVisible ? 'text' : 'password'}
                      value={channelSecret}
                      onChange={(e) => setChannelSecret(e.target.value)}
                      placeholder='Name your knowlegde base'
                      className='w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-700 placeholder-gray-400'
                    />
                    {channelSecret ? (
                      <button
                        type='button'
                        onClick={() => setChannelSecretVisible((v) => !v)}
                        className='absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-800 transition-colors'
                        title={channelSecretVisible ? 'ซ่อน' : 'แสดง'}
                      >
                        {channelSecretVisible ? <HiEyeOff className='text-xl' /> : <HiEye className='text-xl' />}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div>
                  <label htmlFor='line-webhook-adv' className='block text-sm font-medium text-gray-700 mb-3'>
                    LINE Webhook
                  </label>
                  <div className='relative'>
                    <input
                      id='line-webhook-adv'
                      type='url'
                      value={lineWebhook}
                      onChange={(e) => setLineWebhook(e.target.value)}
                      placeholder='Enter LINE Webhook URL'
                      className='w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-700 placeholder-gray-400'
                    />
                    {lineWebhook && (
                      <button
                        type='button'
                        onClick={(e) => handleCopyWebhook(e)}
                        className='absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-800 transition-colors z-10'
                        title='Copy webhook URL'
                      >
                        <HiClipboardCopy className='text-xl' />
                      </button>
                    )}
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
                    disabled={isSaving}
                    className={`px-6 py-2 text-gray-800 font-semibold rounded-lg transition-colors ${
                      isSaving ? 'bg-gray-200 cursor-not-allowed' : 'bg-yellow-400 hover:bg-yellow-500'
                    }`}
                  >
                    {isSaving ? 'Saving...' : 'Submit'}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

export default LineIntegrationModal;
