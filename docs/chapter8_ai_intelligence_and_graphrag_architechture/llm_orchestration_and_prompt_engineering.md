# 8.5 LLM Orchestration & Prompt Engineering

---

# 8.5.1 Purpose

The Large Language Model (LLM) is responsible for legal reasoning—not legal knowledge.

LexisGraph separates **knowledge** from **reasoning**.

Knowledge resides in:

- MongoDB
- Neo4j
- Retrieved evidence

Reasoning resides in:

- Large Language Model

The LLM shall never be treated as a legal database.

---

# 8.5.2 LLM Responsibilities

The LLM shall:

✓ Compare company policies against legal regulations.

✓ Detect compliance gaps.

✓ Explain findings.

✓ Generate recommendations.

✓ Produce structured JSON.

✓ Assign confidence scores.

The LLM shall NOT:

✗ Invent regulations.

✗ Generate unsupported conclusions.

✗ Cite nonexistent laws.

✗ Answer without retrieved evidence.

---

# 8.5.3 Complete Reasoning Pipeline

```
Company Policy

↓

Clause Extraction

↓

Evidence Retrieval

↓

Evidence Validation

↓

Context Optimization

↓

Prompt Builder

↓

LLM

↓

JSON Validation

↓

Compliance Engine

↓

Report Generation
```

Every stage must complete before the next begins.

---

# 8.5.4 Evidence Validation

Before constructing the prompt, the retrieved evidence shall be validated.

Validation checks include:

- Duplicate removal
- Latest regulation version
- Valid citations
- Metadata completeness
- Minimum similarity threshold
- Graph consistency

Invalid evidence shall not be sent to the LLM.

---

# 8.5.5 Context Optimization

The retrieved evidence shall be optimized to fit within the LLM context window.

Optimization includes:

- Removing duplicate clauses
- Merging identical references
- Prioritizing highly ranked clauses
- Preserving complete legal text
- Maintaining citation order

No legal clause shall be truncated mid-sentence.

---

# 8.5.6 Prompt Builder

The Prompt Builder is responsible for creating deterministic prompts.

Prompt components:

1. System Instructions
2. AI Role Definition
3. Retrieved Legal Evidence
4. Company Policy Clause
5. Output Schema
6. Constraints

The prompt shall be generated programmatically.

Prompt templates shall never be hardcoded inside business logic.

---

# 8.5.7 System Prompt

The system prompt defines the AI's permanent behavior.

Example responsibilities:

- Act as a compliance analysis engine.
- Reason only from supplied evidence.
- Never fabricate legal references.
- Explain every conclusion.
- Return structured JSON only.
- Distinguish facts from interpretations.

The system prompt shall remain version-controlled.

---

# 8.5.8 User Prompt

The user prompt shall contain:

Company policy clause

Retrieved legal clauses

Relevant metadata

Graph relationships

Required JSON schema

The prompt shall never include unrelated legal documents.

---

# 8.5.9 Prompt Constraints

The LLM shall receive explicit constraints.

Examples:

- Do not invent regulations.
- Do not omit citations.
- If evidence is insufficient, state that additional review is required.
- Use only supplied legal clauses.
- Maintain neutral legal language.

These constraints reduce hallucinations.

---

# 8.5.10 Model Abstraction Layer

LexisGraph shall communicate with LLMs through a provider abstraction layer.

Supported providers include:

- OpenAI
- Anthropic
- Google Gemini
- DeepSeek
- Mistral
- Qwen
- Future OpenRouter-supported models

Changing the model shall require configuration changes only.

No business logic shall depend on a specific provider.

---

# 8.5.11 Model Selection Strategy

The system shall support configurable models for different tasks.

Examples:

Reasoning

- GPT-5
- Claude
- Gemini

Cost-sensitive deployments

- DeepSeek
- Qwen

Fallback

- Configurable secondary provider

Model selection shall be centralized.

---

# 8.5.12 Retry & Fallback Strategy

If an LLM request fails:

```
Primary Model

↓

Retry

↓

Secondary Model

↓

Return Result
```

Retry attempts and timeout values shall be configurable.

---

# 8.5.13 Response Format

The LLM shall return structured JSON only.

Example structure:

```json
{
  "policy_clause": "...",
  "compliance_status": "Non-Compliant",
  "severity": "High",
  "confidence": 0.94,
  "summary": "...",
  "explanation": "...",
  "recommendation": "...",
  "citations": [
    {
      "document": "DPDP Act 2023",
      "section": "8",
      "clause": "8(2)"
    }
  ]
}
```

Free-form responses shall not be accepted.

---

# 8.5.14 JSON Validation

Every LLM response shall be validated.

Checks include:

- Valid JSON
- Required fields present
- Confidence score exists
- Citations exist
- Enumerated values are valid

Invalid responses shall trigger:

- Retry
- Repair prompt
- Fallback model (if required)

---

# 8.5.15 Confidence Scoring

Every finding shall include a confidence score.

Confidence should consider:

- Retrieval quality
- Cross-encoder relevance
- Citation completeness
- LLM consistency

Confidence shall be expressed as:

```
0.00 – 1.00
```

or

```
0% – 100%
```

---

# 8.5.16 Hallucination Prevention

The system shall reduce hallucinations through:

- Retrieval-first architecture
- Evidence validation
- Prompt constraints
- JSON validation
- Citation enforcement
- Model temperature control

The LLM shall not infer regulations that were not retrieved.

---

# 8.5.17 Deterministic Configuration

Production settings should prioritize consistency.

Recommended defaults:

Temperature:

```
0.1
```

Top-p:

```
0.9
```

Max Tokens:

Configurable by model.

These values may be tuned but should remain centrally configured.

---

# 8.5.18 Explainable Output

Every compliance finding shall include:

- Compliance status
- Explanation
- Supporting regulations
- Citations
- Recommendation
- Confidence

No conclusion shall be presented without supporting evidence.

---

# 8.5.19 Auditability

Every LLM request shall record:

- Prompt template version
- Model used
- Timestamp
- Retrieved evidence IDs
- Response ID
- Processing duration

Prompt content containing organization data shall not be logged unless explicitly configured for debugging.

---

# 8.5.20 Future Enhancements

The orchestration layer shall support:

- Multi-agent legal reasoning
- Chain-of-thought replacement techniques
- Self-consistency evaluation
- Automated citation verification
- Jurisdiction-aware prompts
- Domain-specific prompt templates
- Fine-grained reasoning strategies

The architecture shall remain provider-agnostic.

---

# 8.5.21 Acceptance Criteria

The LLM Orchestration Layer shall be considered complete when:

✓ The LLM reasons only from retrieved evidence.

✓ Evidence is validated before prompting.

✓ Prompts are generated programmatically.

✓ Responses conform to the required JSON schema.

✓ Hallucination safeguards are enforced.

✓ Confidence scores are included.

✓ Citations accompany every finding.

✓ Model providers can be swapped without changing business logic.

✓ Invalid responses are automatically handled.

---

# 8.5.22 Summary

The LLM Orchestration Layer transforms validated legal evidence into structured, explainable compliance decisions. By separating knowledge retrieval from reasoning, enforcing deterministic prompt construction, validating every response, and remaining independent of any single model provider, LexisGraph delivers reliable, auditable, and production-ready AI reasoning suitable for enterprise compliance workflows.

---

End of Section 8.5