import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useEffect } from 'react';

import AppLayout from './components/layout/AppLayout';
import ErrorBoundary from './components/ui/ErrorBoundary';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import GraphExplorer from './pages/GraphExplorer';
import ComplianceCheck from './pages/ComplianceCheck';
import Retrieval from './pages/Retrieval';
import DomainPipeline from './pages/DomainPipeline';
import ExportPage from './pages/Export';
import SettingsPage from './pages/Settings';

const pageVariants = {
  initial: { opacity: 0, y: 12, filter: 'blur(4px)' },
  animate: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] }
  },
  exit: {
    opacity: 0,
    y: -8,
    filter: 'blur(2px)',
    transition: { duration: 0.2, ease: [0.4, 0, 1, 1] }
  }
};

function PageWrapper({ children }) {
  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" style={{ height: '100%' }}>
      {children}
    </motion.div>
  );
}

function ScrollToTop() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname]);

  return null;
}

export default function App() {
  const location = useLocation();

  return (
    <ErrorBoundary resetKey={location.pathname}>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<PageWrapper key="/"> <Dashboard /></PageWrapper>} />
          <Route path="upload" element={<PageWrapper key="/upload"><Upload /></PageWrapper>} />
          <Route path="graph" element={<PageWrapper key="/graph"><GraphExplorer /></PageWrapper>} />
          <Route path="compliance" element={<PageWrapper key="/compliance"><ComplianceCheck /></PageWrapper>} />
          <Route path="retrieval" element={<PageWrapper key="/retrieval"><Retrieval /></PageWrapper>} />
          <Route path="domain" element={<PageWrapper key="/domain"><DomainPipeline /></PageWrapper>} />
          <Route path="export" element={<PageWrapper key="/export"><ExportPage /></PageWrapper>} />
          <Route path="settings" element={<PageWrapper key="/settings"><SettingsPage /></PageWrapper>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
