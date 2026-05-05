# CLAUDE.md

## Project Name
LoRA Forge

## Product Vision
LoRA Forge is a local-first web application for designing, testing, and auditing regulatory AI workflows built around modular LoRA adapters and local LLM runtimes such as Ollama.

The primary domain is bank resolution, specifically workflows used by Internal Resolution Teams (IRTs), including:
- MREL eligibility assessment
- Prospectus clause extraction
- Instrument classification
- Regulatory decision support

LoRA Forge is NOT a chatbot. It is a visual, auditable, workflow-driven AI system for regulated decision support.

## Core Principles
1. Regulatory outputs must be auditable
2. AI must provide traceable reasoning and source references
3. Human review must be supported
4. Adapters are governed, versioned artifacts
5. Base model compatibility must be enforced
6. System must be local-first (Ollama)
7. UI must be usable by regulatory analysts
8. Prefer explicit workflows over hidden automation
9. Simplicity and correctness over feature bloat

## Core Architecture Concept
The system separates:
- Fine-tune flows → produce adapters
- Regulatory workflows → consume adapters

## Target Users
Regulatory Analyst:
- Uses templates
- Reviews outputs
- Needs auditability

AI / Model Engineer:
- Builds workflows
- Configures adapters

## MVP Scope
Templates:
- MREL Eligibility Assessment
- Prospectus Clause Extraction
- Instrument Classification

Features:
- Constrained visual workflow builder
- Adapter registry
- Fine-tune flow representation (mock)
- Workflow execution (mocked)
- Ollama integration
- Auditable outputs

## Visual Workflow Design
Constrained graphical interface:
- Node-based canvas (React Flow)
- Drag & drop nodes
- Strict validation rules
- No arbitrary flows

## Node Groups
Documents:
- Prospectus Loader
- PDF Extractor

AI:
- Clause Extractor
- MREL Classifier
- Instrument Classifier

Rules:
- Validator
- Confidence Filter

Logic:
- Router
- Human Review

Output:
- Decision Output
- Report Generator

## Validation Rules
- Must have input & output nodes
- Valid connections only
- Adapter must exist
- Base model compatibility enforced
- Confidence between 0 and 1
- No invalid cycles

## Fine-Tune Flow
Dataset → Preprocess → Base Model → LoRA Trainer → Evaluation → Adapter Registry

## Adapter Schema
Adapter:
- id
- name
- baseModel
- taskType
- version
- status
- trainingDataSummary
- evaluationMetrics
- createdAt

## Workflow Example (MREL)
Prospectus → Extract → Clause → Classifier → Validator → Confidence → Review → Output

## Output Requirements
- Decision
- Confidence
- Explanation
- Sources
- Adapter version
- Workflow version
- Timestamp

## Backend (FastAPI)
Endpoints:
- /adapters
- /workflows
- /runs
- /ollama/status
- /ollama/models

## Frontend (Next.js)
Pages:
- dashboard
- templates
- workflows
- adapters
- runs
- settings

## Audit & Governance
Store:
- Workflow version
- Adapter version
- Node outputs
- Decision
- Timestamp

## Security
- Local-first
- No external APIs
- Mark AI outputs

## Non-Goals
- Full training infra
- Cloud deployment
- Auth system
- Real-time collaboration

## Milestones
1. Setup
2. Models
3. Dashboard
4. Workflow builder
5. Mock execution
6. Ollama integration

## Definition of Done
User can:
- Create workflow
- Edit visually
- Run workflow
- See output
- View history

## Development Guidelines
- TypeScript strict
- Domain naming
- Simple architecture

## Final Instruction
Build MVP with:
- Visual workflow builder
- Adapter registry
- Mock execution
- Ollama integration
