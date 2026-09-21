# 13.9 LLM Reasoning & Prompt Engineering

---

# 13.9.1 Purpose

The LLM Reasoning Engine performs evidence-based compliance analysis by comparing organizational policy clauses against authoritative legal evidence retrieved from the GraphRAG Engine.

The LLM shall not rely on its internal legal knowledge.

Instead, it shall reason exclusively over the evidence package assembled by the Hybrid Retrieval Engine.

The output shall always be structured, explainable, and traceable.

---

# 13.9.2 Objectives

The LLM Reasoning Engine shall:

✓ Compare policy clauses against legal requirements.

✓ Detect compliance gaps.

✓ Explain findings.

✓ Reference supporting legal evidence.

✓ Generate remediation recommendations.

✓ Produce structured JSON.

✓ Avoid unsupported conclusions.

✓ Support multiple LLM providers.

---

# 13.9.3 Role of the LLM

The LLM is responsible for reasoning.

It is **not** responsible for:

- Retrieving laws
- Searching databases
- Inventing legal citations
- Creating legal knowledge
- Updating the Knowledge Base

The GraphRAG Engine supplies evidence.

The LLM analyzes that evidence.

---

# 13.9.4 Reasoning Workflow

```
Policy Clause

↓

Evidence Package

↓

Prompt Builder

↓

LLM

↓

Structured JSON

↓

Validator

↓

Report Generator
```

The LLM shall never receive raw PDFs.

---

# 13.9.5 Evidence Package

The reasoning engine shall receive:

```
Policy Clause

Relevant Legal Clauses

Definitions

Obligations

Exceptions

Penalties

Cross References

Jurisdiction

Metadata
```

Only retrieved evidence shall be available.

---

# 13.9.6 Prompt Structure

Every prompt shall contain:

```
System Instructions

↓

Task Description

↓

Organization Context

↓

Policy Clause

↓

Retrieved Legal Evidence

↓

Definitions

↓

Constraints

↓

Expected JSON Schema
```

Prompts shall be assembled programmatically.

---

# 13.9.7 System Prompt

The system prompt shall instruct the LLM to:

- Act as a compliance analysis assistant.
- Base conclusions only on supplied evidence.
- Never invent legal citations.
- Identify missing requirements.
- Explain reasoning.
- Produce valid JSON.
- State when evidence is insufficient.

The system prompt shall be version controlled.

---

# 13.9.8 Compliance Analysis Strategy

The LLM shall evaluate each policy clause by answering:

1. Does the policy address the legal requirement?

2. Is the coverage complete?

3. Are mandatory obligations satisfied?

4. Are required definitions included?

5. Are exceptions handled?

6. Are penalties relevant?

7. Is additional information required?

This structured reasoning process shall be applied consistently.

---

# 13.9.9 Output Schema

The LLM shall return structured JSON.

Example

```json
{
  "status": "Non-Compliant",
  "confidence": 0.92,
  "reasoning": "...",
  "findings": [],
  "citations": [],
  "recommendations": []
}
```

Responses not conforming to the schema shall be rejected.

---

# 13.9.10 Compliance Status

Supported statuses

```
Compliant

Partially Compliant

Non-Compliant

Insufficient Evidence

Not Applicable
```

Statuses shall follow predefined definitions.

---

# 13.9.11 Reasoning Requirements

Every finding shall include:

```
Policy Clause

Legal Requirement

Comparison Summary

Reasoning

Supporting Evidence

Confidence

Recommendations
```

Findings shall remain evidence-based.

---

# 13.9.12 Citation Requirements

Every conclusion shall reference:

```
Document

Section

Clause

Jurisdiction

Knowledge Base Version
```

Missing citations shall trigger output validation failure.

---

# 13.9.13 Recommendation Generation

Recommendations shall:

Address identified gaps

Reference applicable legal requirements

Describe suggested improvements

Avoid rewriting entire policies automatically

Recommendations shall be actionable but not constitute legal advice.

---

# 13.9.14 Handling Insufficient Evidence

If retrieved evidence is insufficient:

The LLM shall:

```
Return

↓

Insufficient Evidence

↓

Explain why

↓

Request additional information
```

The model shall not speculate.

---

# 13.9.15 Prompt Injection Protection

The reasoning engine shall ignore instructions contained within:

Uploaded policies

Retrieved legal text

User-provided content

Only system-defined instructions shall control model behavior.

Potential prompt injection attempts shall be treated as untrusted content.

---

# 13.9.16 Model Configuration

The architecture shall support configurable providers.

Examples

```
Gemini

OpenAI

Anthropic

Azure OpenAI
```

Changing providers shall not require workflow redesign.

---

# 13.9.17 Temperature & Generation Settings

Recommended defaults:

```
Temperature: 0.1–0.2

Top-P: Default provider setting

Max Output Tokens: Configurable

Response Format: JSON
```

Low temperature improves consistency and repeatability.

---

# 13.9.18 Validation

Before accepting an LLM response:

Validate:

```
JSON Schema

Required Fields

Evidence References

Confidence Range

Citation Format

Compliance Status
```

Invalid responses shall be repaired or regenerated.

---

# 13.9.19 Monitoring

The platform shall monitor:

```
Average Token Usage

Prompt Size

Completion Size

Latency

Failure Rate

Retry Count

Schema Validation Failures
```

These metrics shall be available through the Administration Dashboard.

---

# 13.9.20 Security

The reasoning engine shall:

Never expose system prompts

Never expose API keys

Avoid logging sensitive prompt contents

Prevent prompt injection

Restrict access to backend services

Maintain audit logs

---

# 13.9.21 Future Enhancements

The architecture shall support:

Multi-model reasoning

Self-consistency evaluation

LLM ensemble voting

Chain-of-verification

Specialized legal reasoning models

Fine-tuned domain models

Automatic prompt optimization

---

# 13.9.22 Acceptance Criteria

The LLM Reasoning Engine shall be considered complete when:

✓ The LLM reasons only over retrieved evidence.

✓ Structured JSON output is enforced.

✓ Every finding includes citations.

✓ Prompt injection defenses are implemented.

✓ Invalid responses are rejected.

✓ Multiple providers are supported.

✓ Model configuration is externalized.

✓ Monitoring and auditing are implemented.

---

# 13.9.23 Summary

The LLM Reasoning & Prompt Engineering module provides the analytical capabilities of LexisGraph by performing structured, evidence-based comparisons between organizational policies and retrieved legal requirements. By separating retrieval from reasoning, enforcing structured outputs, validating responses, and grounding every conclusion in authoritative legal evidence, the module enables transparent, reproducible, and explainable compliance assessments while remaining adaptable to future language models and prompting strategies.

---

End of Section 13.9