import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Auth from './pages/auth';
import ForgotPassword from './pages/forgotpassword';
import Homepage from './pages/homepage';
import Verifying from './pages/verifying';
import CreatePassword from './pages/CreatePassword';
import ResetPassword from './pages/ResetPassword';
import Approval from './pages/Approval';
import Chat from './pages/Chat';
import PrivacyPolicy from './pages/PrivacyPolicy';
import ToastContainer from './components/ToastNotification';
import RequireAuth from './components/RequireAuth';

function App() {
  return (
    <Router>
      <ToastContainer />
      <Routes>
        {/* Auth page is the main/default page */}
        <Route path="/auth" element={<Auth />} />
        <Route path="/" element={<Navigate to="/auth" replace />} />
        <Route path="/forgotpassword" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verifying" element={<Verifying />} />
        <Route path="/create-password" element={<CreatePassword />} />
        <Route path="/approval" element={<Approval />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/homepage" element={<RequireAuth><Homepage /></RequireAuth>} />
        <Route path="/private" element={<RequireAuth><Homepage privateMode /></RequireAuth>} />
        <Route path="/chat/:chatId" element={<RequireAuth><Chat /></RequireAuth>} />
        {/* ไม่รู้จัก path → กลับ auth ไม่ใช่ homepage */}
        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
