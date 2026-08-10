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
import MyBots from './pages/MyBots';
import MyBotDetail from './pages/MyBotDetail';
import MyKnowledge from './pages/MyKnowledge';
import MyKnowledgeCreate from './pages/MyKnowledgeCreate';
import MyKnowledgeAddData from './pages/MyKnowledgeAddData';
import ToastContainer from './components/ToastNotification';
import RequireAuth from './components/RequireAuth';
import { SystemConfigProvider } from './context/SystemConfigContext';

function App() {
  return (
    <SystemConfigProvider>
      <Router>
        <ToastContainer />
        <Routes>
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
          <Route path="/my-bots" element={<RequireAuth><MyBots /></RequireAuth>} />
          <Route path="/my-bots/create" element={<RequireAuth><MyBotDetail /></RequireAuth>} />
          <Route path="/my-bots/:id" element={<RequireAuth><MyBotDetail /></RequireAuth>} />
          <Route path="/my-knowledge" element={<RequireAuth><MyKnowledge /></RequireAuth>} />
          <Route path="/my-knowledge/create" element={<RequireAuth><MyKnowledgeCreate /></RequireAuth>} />
          <Route path="/my-knowledge/:id/add-data" element={<RequireAuth><MyKnowledgeAddData /></RequireAuth>} />
          <Route path="/chat/:chatId" element={<RequireAuth><Chat /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/auth" replace />} />
        </Routes>
      </Router>
    </SystemConfigProvider>
  );
}

export default App;
