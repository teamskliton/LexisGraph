// ─── Documents Feature Types ──────────────────────────────────────────────────
// Source of truth: docs/product/Information_Architecture.md, Database_Entity_Model.md

export type ProcessingStatus =
  | "Uploaded"
  | "Processing"
  | "Parsing"
  | "Indexed"
  | "Knowledge Graph Ready"
  | "Analysis Ready"
  | "Analysis Running"
  | "Error";

export type DocumentCategory = "Policy" | "Regulation" | "Supporting Document";

export interface OrganizationDocumentExtended {
  id: string;
  organizationId: string;
  name: string;
  category: DocumentCategory;
  file_size: string;
  file_type: "pdf" | "docx" | "txt";
  version: string;
  uploaded_at: string;
  uploaded_by: string;
  status: ProcessingStatus;
  tags: string[];
  description?: string;
  clause_count?: number;
  extracted_nodes?: number;
  history?: Array<{
    id: string;
    version: string;
    uploaded_at: string;
    uploaded_by: string;
    action: string;
  }>;
}



// ─── Mock Documents Data ───────────────────────────────────────────────────────

export const MOCK_ORGANIZATION_DOCUMENTS: OrganizationDocumentExtended[] = [
  // Policies Section
  {
    id: "doc-posh-policy",
    organizationId: "org-001",
    name: "POSH_Workplace_Policy_v3.2_2026.pdf",
    category: "Policy",
    file_size: "2.4 MB",
    file_type: "pdf",
    version: "v3.2",
    uploaded_at: "2026-08-04T07:12:00Z",
    uploaded_by: "Priya Sharma",
    status: "Analysis Ready",
    tags: ["POSH", "Internal Policy", "HR"],
    description: "Workplace sexual harassment prevention, redressal, and IC charter policy.",
    clause_count: 28,
    extracted_nodes: 42,
    history: [
      { id: "h-1", version: "v3.2", uploaded_at: "2026-08-04T07:12:00Z", uploaded_by: "Priya Sharma", action: "Uploaded v3.2 policy update" },
      { id: "h-2", version: "v3.1", uploaded_at: "2026-06-10T09:00:00Z", uploaded_by: "Arjun Mehta", action: "Initial upload" },
    ],
  },
  {
    id: "doc-icc-charter",
    organizationId: "org-001",
    name: "Internal_Complaints_Committee_Constitution.pdf",
    category: "Policy",
    file_size: "1.1 MB",
    file_type: "pdf",
    version: "v1.0",
    uploaded_at: "2026-08-03T11:45:00Z",
    uploaded_by: "Arjun Mehta",
    status: "Knowledge Graph Ready",
    tags: ["IC Committee", "Governance"],
    description: "Official constitution list of internal complaints committee members and presiding officer.",
    clause_count: 14,
    extracted_nodes: 26,
    history: [
      { id: "h-3", version: "v1.0", uploaded_at: "2026-08-03T11:45:00Z", uploaded_by: "Arjun Mehta", action: "Uploaded IC Charter" },
    ],
  },
  {
    id: "doc-code-conduct",
    organizationId: "org-001",
    name: "Employee_Code_of_Conduct_2026.docx",
    category: "Policy",
    file_size: "1.8 MB",
    file_type: "docx",
    version: "v2.0",
    uploaded_at: "2026-07-25T14:30:00Z",
    uploaded_by: "Priya Sharma",
    status: "Indexed",
    tags: ["Code of Conduct", "Ethics"],
    description: "General corporate employee conduct guidelines and disciplinary procedures.",
    clause_count: 45,
    extracted_nodes: 58,
  },

  // Regulations Section
  {
    id: "doc-posh-act",
    organizationId: "org-001",
    name: "POSH_Act_2013_Statutory_Text.pdf",
    category: "Regulation",
    file_size: "4.8 MB",
    file_type: "pdf",
    version: "2013 Statutory",
    uploaded_at: "2026-07-12T08:15:00Z",
    uploaded_by: "Priya Sharma",
    status: "Analysis Ready",
    tags: ["Statute", "Central Act", "POSH Act 2013"],
    description: "Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013.",
    clause_count: 32,
    extracted_nodes: 64,
  },
  {
    id: "doc-shw-rules",
    organizationId: "org-001",
    name: "SHW_Rules_2013_Notifications.pdf",
    category: "Regulation",
    file_size: "1.5 MB",
    file_type: "pdf",
    version: "2013 Rules",
    uploaded_at: "2026-07-15T09:30:00Z",
    uploaded_by: "Arjun Mehta",
    status: "Knowledge Graph Ready",
    tags: ["Statutory Rules", "POSH Rules"],
    description: "Sexual Harassment of Women at Workplace Rules, 2013 issued under Section 29.",
    clause_count: 18,
    extracted_nodes: 31,
  },

  // Supporting Documents Section
  {
    id: "doc-annual-report-mca",
    organizationId: "org-001",
    name: "POSH_Annual_Return_Form_5A.pdf",
    category: "Supporting Document",
    file_size: "850 KB",
    file_type: "pdf",
    version: "FY25-26",
    uploaded_at: "2026-08-02T16:00:00Z",
    uploaded_by: "Priya Sharma",
    status: "Parsing",
    tags: ["Annual Return", "District Officer"],
    description: "Draft annual compliance return for submission to District Officer under Section 21.",
    clause_count: 8,
    extracted_nodes: 12,
  },
];


