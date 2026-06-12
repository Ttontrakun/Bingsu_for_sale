import { useNavigate } from 'react-router-dom';
import { HiCheckCircle } from 'react-icons/hi';
import bingsuLogo from '../assets/images/หน่องบิงไม่มีพื้นละ.png';
import ntLogo from '../assets/images/NT_Logo.png';

function Approval() {
  const navigate = useNavigate();

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
        <div className="relative w-full rounded-[2rem] bg-white p-10 shadow-[0_10px_30px_rgba(0,0,0,0.08)] min-h-[450px] flex flex-col justify-center"
          style={{
            border: '4px solid rgba(252,186,3,0.95)',
            boxShadow: '0 0 20px rgba(252,186,3,0.3), 0 10px 30px rgba(0,0,0,0.08)'
          }}>
          <div className="flex flex-col items-center">
            {/* Approval Icon */}
            <div className="flex justify-center mb-6">
              <div className="relative">
                <svg className="w-20 h-20 text-gray-700" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5">
                  <HiCheckCircle className="text-2xl text-gray-700" />
                </div>
              </div>
            </div>

            <h2 className="text-lg font-semibold text-gray-800 mb-4 text-center">
              Approval in Progress
            </h2>

            <p className="text-xs text-gray-600 leading-relaxed mb-8 text-center px-4">
              Your account request has been submitted and is currently under review by your organization. Access will be granted once the approval process is completed.
            </p>

            <button
              type="button"
              onClick={() => navigate('/auth')}
              className="w-32 h-9 rounded-lg bg-yellow-400 text-sm font-semibold text-black shadow-md cursor-pointer transition-all duration-200 hover:bg-yellow-500 hover:shadow-lg active:scale-95 focus:outline-none focus:ring-2 focus:ring-yellow-300"
            >
              Go to Sign in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Approval;
