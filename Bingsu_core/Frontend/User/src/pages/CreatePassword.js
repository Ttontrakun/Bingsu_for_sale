import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { HiLockClosed, HiOutlineEye, HiOutlineEyeOff, HiCheck, HiX } from 'react-icons/hi';
import bingsuLogo from '../assets/images/หน่องบิงไม่มีพื้นละ.png';
import ntLogo from '../assets/images/NT_Logo.png';
import { authAPI, getErrorMessage } from '../services/api';

function CreatePassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [touched, setTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [isVerified, setIsVerified] = useState(false);

  // Check if email is verified and token exists
  useEffect(() => {
    const token = searchParams.get('token');
    const verified = location.state?.verified;

    if (!token) {
      setError('ไม่พบ verification token กรุณายืนยันอีเมลก่อน');
      // Redirect to verifying page after 3 seconds
      setTimeout(() => {
        navigate('/verifying');
      }, 3000);
      return;
    }

    if (verified) {
      setIsVerified(true);
    } else {
      // If not verified, redirect to verifying page
      setError('กรุณายืนยันอีเมลก่อนสร้างรหัสผ่าน');
      setTimeout(() => {
        navigate('/verifying');
      }, 3000);
    }
  }, [searchParams, location, navigate]);

  // Check password requirements
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const isLengthValid = password.length > 6;
  const passwordsMatch = password === confirmPassword && confirmPassword !== '';

  const isPasswordValid = hasUpperCase && hasLowerCase && hasNumber && isLengthValid;

  // Requirements list
  const requirements = [
    { id: 'length', label: 'รหัสผ่านต้องมีความยาวมากกว่า 6 ตัวอักษร', isValid: isLengthValid },
    { id: 'uppercase', label: 'ตัวอักษรพิมพ์ใหญ่ (A-Z)', isValid: hasUpperCase },
    { id: 'lowercase', label: 'ตัวอักษรพิมพ์เล็ก (a-z)', isValid: hasLowerCase },
    { id: 'number', label: 'ตัวเลข (0-9)', isValid: hasNumber },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched(true);
    setError('');

    if (!isPasswordValid) {
      return;
    }

    if (!passwordsMatch) {
      return;
    }

    const token = searchParams.get('token');
    if (!token) {
      setError('ไม่พบ verification token');
      return;
    }

    setIsSubmitting(true);

    try {
      await authAPI.setPassword(token, password);
      // Password set successfully - redirect to approval or login
    navigate('/approval');
    } catch (error) {
      console.error('Error setting password:', error);
      const errorMessage = getErrorMessage(error) || 'เกิดข้อผิดพลาดในการตั้งรหัสผ่าน';
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className='relative flex items-center justify-center min-h-screen bg-[#D9D9D9]'>
      {/* NT Logo at top-left corner */}
      <div className="absolute top-5 left-5 z-10 hidden md:block">
        <a href="https://ntplc.co.th/home" target="_blank" rel="noopener noreferrer">
          <img src={ntLogo} alt="NT Logo" className="max-w-[150px] max-h-[150px] object-contain hover:opacity-80 transition-opacity cursor-pointer" />
        </a>
      </div>

      {/* กลางจอ */}
      <div className="relative w-full max-w-[420px] m-4">
        {/* BingSu Logo at center top above card */}
        <div className="flex items-center justify-center gap-3 mb-4">
          <img src={bingsuLogo} alt="BingSu Logo" className="h-12 w-12 object-cover rounded-full" />
          <h2 className="text-2xl font-bold text-zinc-800">BingSu</h2>
        </div>

        {/* Card */}
        <div className="relative w-full rounded-[2rem] bg-white p-10 shadow-[0_10px_30px_rgba(0,0,0,0.08)]"
          style={{
            border: '4px solid rgba(252,186,3,0.95)',
            boxShadow: '0 0 20px rgba(252,186,3,0.3), 0 10px 30px rgba(0,0,0,0.08)'
          }}>
          <div className="flex flex-col items-center">
            {/* Lock Icon */}
            <div className="flex justify-center mb-5">
              <HiLockClosed className="text-6xl text-gray-700" />
            </div>

            <h2 className="text-base font-semibold text-gray-800 mb-3 text-center">
              กรุณาสร้างรหัสผ่านของคุณ
            </h2>

            {error && (
              <div className="mb-4 p-2 rounded-lg bg-red-50 border border-red-200">
                <p className="text-xs text-red-600 text-center">{error}</p>
              </div>
            )}

            {!isVerified && (
              <div className="mb-4 p-2 rounded-lg bg-yellow-50 border border-yellow-200">
                <p className="text-xs text-yellow-600 text-center">
                  กำลังตรวจสอบการยืนยันอีเมล...
                </p>
              </div>
            )}

            {/* Password Requirements */}
            <div className="w-full text-left mb-6">
              <p className="font-semibold mb-3 text-xs text-gray-700">ข้อกำหนดรหัสผ่าน</p>
              <ul className="space-y-2">
                {requirements.map((requirement) => (
                  <li
                    key={requirement.id}
                    className={`flex items-center gap-2 text-xs transition-colors ${
                      password && requirement.isValid
                        ? 'text-green-600'
                        : password
                        ? 'text-red-500'
                        : 'text-gray-500'
                    }`}
                  >
                    {password ? (
                      requirement.isValid ? (
                        <HiCheck className="text-green-600 text-base flex-shrink-0" />
                      ) : (
                        <HiX className="text-red-500 text-base flex-shrink-0" />
                      )
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0"></div>
                    )}
                    <span>{requirement.label}</span>
                  </li>
                ))}
              </ul>
            </div>

            <form onSubmit={handleSubmit} className="w-full">
              {/* Password Field */}
              <div className="mb-4">
                <label htmlFor="password" className="block text-xs text-zinc-700 mb-2 text-left font-medium">
                  รหัสผ่าน
                </label>
                <div className="relative">
                  <HiLockClosed className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-lg" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="กรุณากรอกรหัสผ่าน"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() => setTouched(true)}
                    required
                    className={`w-full pl-10 pr-10 py-2.5 rounded-lg border text-sm text-gray-700 placeholder-zinc-400 focus:outline-none transition-all duration-300 ${
                      touched && password && !isPasswordValid
                        ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
                        : 'border-zinc-300 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <HiOutlineEye className="text-xl" /> : <HiOutlineEyeOff className="text-xl" />}
                  </button>
                </div>
                {touched && password && !isPasswordValid && (
                  <p className="text-red-500 text-[10px] mt-1">รหัสผ่านไม่ตรงตามข้อกำหนดทั้งหมด</p>
                )}
              </div>

              {/* Confirm Password Field */}
              <div className="mb-6">
                <label htmlFor="confirmPassword" className="block text-xs text-zinc-700 mb-2 text-left font-medium">
                  ยืนยันรหัสผ่าน
                </label>
                <div className="relative">
                  <HiLockClosed className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-lg" />
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="กรุณายืนยันรหัสผ่าน"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className={`w-full pl-10 pr-10 py-2.5 rounded-lg border text-sm text-gray-700 placeholder-zinc-400 focus:outline-none transition-all duration-300 ${
                      confirmPassword && password !== confirmPassword
                        ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
                        : 'border-zinc-300 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showConfirmPassword ? <HiOutlineEye className="text-xl" /> : <HiOutlineEyeOff className="text-xl" />}
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-red-500 text-[10px] mt-1">รหัสผ่านไม่ตรงกัน</p>
                )}
              </div>

              {/* Submit Button */}
              <div className="flex justify-center">
                <button
                  type="submit"
                  disabled={!isVerified || isSubmitting}
                  className={`w-24 h-9 rounded-full bg-yellow-400 text-sm font-semibold text-black shadow-md cursor-pointer transition-all duration-200 hover:bg-yellow-500 hover:shadow-lg active:scale-95 focus:outline-none focus:ring-2 focus:ring-yellow-300 ${
                    !isVerified || isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isSubmitting ? 'กำลังบันทึก...' : 'ส่ง'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CreatePassword;
