---
name: add-section-headers
description: Adds structured, numbered English section header comment banners (starting from [1] with double-line borders ═) into source code files to organize and label logical parts.
---

# Add Section Headers in English (Code Commenter)

Use this skill whenever the user asks to add section headers or comment banners in English into a source code file (e.g., "add section headers", "insert section banners", "organize code into sections", "/add-section-headers").

---

## 1. Workflow Steps

### Step 1: Read and Analyze Code Structure

1. Read the full content of the target source code file.
2. Identify the core logical sections of the file in order of appearance:
   - Module imports, interfaces, and type declarations
   - Constants, configuration, and environment flags
   - In-memory state declarations and variables
   - Utility and helper functions
   - Core domain logic, processing, and data transformations
   - Event listeners, subscriptions, lifecycle hooks, and initial execution

### Step 2: Comment Banner Template (Style A)

Every section header must be added as a comment banner enclosed by double-line `═` borders (59 characters long), with sequential numbering **starting from 1**:

```typescript
// ═══════════════════════════════════════════════════════════
// [1] Module Imports and Type Declarations
// ═══════════════════════════════════════════════════════════
```

**Examples of Standard English Section Banners:**

```typescript
// ═══════════════════════════════════════════════════════════
// [1] Module Imports and Type Declarations
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// [2] Constants and Local State Management
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// [3] Helper Utilities and Data Extraction
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// [4] DOM Sweeping and Record Dispatch
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// [5] Event Listeners and Initial Lifecycle Startup
// ═══════════════════════════════════════════════════════════
```

---

## 2. Safety and Workflow Rules

1. **Existing Headers Detection & Overwrite Prompt:** If the target file already contains section headers or comment banners (such as lines with `// ═` or `// [...]`), you must explicitly ask the user:
   > _"Existing section headers were detected in this file. Would you like to overwrite/replace them with the new headers?"_  
   > Do not replace or double-stack headers on top of existing ones without explicit user approval.
2. **Zero Logic Alterations:** Never modify, move, or delete any functional line of code. Only insert comment banners and clean spacing lines.
3. **Proper Spacing:** Include a single empty blank line above each banner (unless it starts at line 1) and keep code naturally placed beneath it.
4. **Explicit User Confirmation:** Before modifying the target file, outline the proposed sections and titles to the user, and wait for explicit confirmation ("אשר" / "המשך" / "כן").
