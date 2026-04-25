import { Navigate, Route, Routes } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';

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
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } }
};

function PageWrap({ children }) {
  return (
    <ErrorBoundary>
      <AnimatePresence mode="wait">
        <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
          {children}
        </motion.div>
      </AnimatePresence>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<PageWrap><Dashboard /></PageWrap>} />
        <Route path="upload" element={<PageWrap><Upload /></PageWrap>} />
        <Route path="graph" element={<PageWrap><GraphExplorer /></PageWrap>} />
        <Route path="compliance" element={<PageWrap><ComplianceCheck /></PageWrap>} />
        <Route path="retrieval" element={<PageWrap><Retrieval /></PageWrap>} />
        <Route path="domain" element={<PageWrap><DomainPipeline /></PageWrap>} />
        <Route path="export" element={<PageWrap><ExportPage /></PageWrap>} />
        <Route path="settings" element={<PageWrap><SettingsPage /></PageWrap>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
