import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { userAPI } from '../services/api';

/** กันหน้า private จนกว่า /auth/me จะยืนยัน session */
function RequireAuth({ children }) {
  const location = useLocation();
  const [status, setStatus] = useState('loading'); // loading | ok | no

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await userAPI.getCurrentUser();
        if (!cancelled) setStatus('ok');
      } catch {
        if (!cancelled) {
          localStorage.removeItem('user');
          setStatus('no');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [location.pathname]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-500 text-sm">
        กำลังตรวจสอบสิทธิ์...
      </div>
    );
  }
  if (status === 'no') {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }
  return children;
}

export default RequireAuth;
