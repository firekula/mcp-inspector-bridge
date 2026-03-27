# Project Constitution (mcp-inspector-bridge)

## Article I: The Artifact Mandate
**Agents shall not perform work without a visible Artifact.**
- Every planning step must produce a Markdown Artifact (Plan, Spec, or Checklist).
- Never rely on "chat memory" alone. If it's important, write it to a file.
- **Language Requirement**: MUST use **Simplified Chinese (简体中文)** for all plans, tasks, artifacts, Code comments (DocStrings, inline comments), and AI Responses/Reasoning.

## Article II: Tech Stack & Standards
**Strictly adhere to the established technologies and patterns.**
- **Tech Stack**: Cocos Creator 2.4.x extension, Electron (主进程), Vue.js (前端面板), IPC bridge.
- **Scripting Language**: MUST use **TypeScript (`.ts`)** for all NEW scripts. Do not create new `.js` files.
- **Documentation**: MUST ensure comprehensive comments for all handled scripts (modified or created). Use JSDoc format for classes and implementation details. Explain the *purpose* and *logic* of complex blocks.

## Article III: Architecture & Consistency
**Follow Cocos Creator Extension Patterns.**
- **Architectural Integrity**: MUST strictly follow the existing project architecture (Cocos Creator patterns).
- **PROHIBITED**: Creating entirely new architectural patterns, frameworks, or bringing in heavy external libraries without explicit user approval.
- **REQUIRED**: Reuse existing managers, utils, and base classes where applicable.

## Article IV: Agent Independence
**Build for Parallelism.**
- Tasks must be atomic.
- Frontend agents should mock IPC/API responses if the Backend/Main process agent isn't finished.
- Never block a thread waiting for another agent.