import api from './axios';
import axios from 'axios';
import { getServerBaseUrl } from './axios';

export const getHealth = () =>
  axios.get(`${getServerBaseUrl()}/health`, {
    timeout: 10000,
    suppressErrorToast: true
  });

export const uploadDocument = (formData, onUploadProgress) =>
  api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress
  });

export const triggerFetch = (maxItems = 5) => api.get(`/fetch-now?max_items=${maxItems}`);

export const buildGraph = () => api.post('/build-graph');
export const buildKnowledgeGraph = (selection) => api.post('/build-knowledge-graph', selection);
export const resetKnowledgeGraph = () => api.post('/reset-knowledge-graph');
export const getKnowledgeGraphHistory = () => api.get('/graph-history');
export const activateKnowledgeGraph = (buildId) => api.post(`/graph-history/${buildId}/activate`);
export const deleteKnowledgeGraph = (buildId) => api.delete(`/graph-history/${buildId}`);
export const buildSimilarity = () => api.post('/build-similarity');
export const getGraphView = (params = {}) => api.get('/graph-view', { params });
export const getGraphDocuments = () => api.get('/graph-documents');
export const getGraphRoot = (params = {}) => api.get('/graph/root', { params });
export const getGraphDocumentView = (documentId, params = {}) => api.get(`/graph/document/${documentId}`, { params });
export const getGraphClauseView = (clauseId, params = {}) => api.get(`/graph/clause/${clauseId}`, { params });
export const getGraphRegulationView = (regulationId, params = {}) => api.get(`/graph/regulation/${regulationId}`, { params });
export const getLatestGraphJob = (kind) => api.get('/graph-jobs/latest', { params: kind ? { kind } : {} });
export const testNeo4j = () => api.get('/test-neo4j');

export const retrieveQuery = (query) => api.get(`/retrieve?query=${encodeURIComponent(query)}`);

export const runComplianceCheck = () => api.get('/compliance-check');

export const getUserDocuments = () => api.get('/debug/user-documents');
export const getExternalDocuments = () => api.get('/debug/external-documents');
export const getStats = () => api.get('/debug/stats');

export const exportData = (type, format) =>
  api.get(`/export/${type}?format=${format}`, { responseType: 'blob' });

export const uploadDomainDoc = (domain, formData) =>
  api.post(`/domain/upload?domain=${domain}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

export const getDomainStatus = (hash) => api.get(`/domain/status?hash=${hash}`);
export const getDomainStatusLatest = () => api.get('/domain/status/latest');
export const listDomainDocs = (domain) => api.get(`/domain/list?domain=${domain}`);

export const testMongo = () => api.get('/test-mongo');
