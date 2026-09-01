---
name: doc-to-hebrew-html
description: Explains, documents, or translates any file (code, markdown, config, scripts) into a beautiful, light-themed, print-optimized standalone Hebrew HTML document saved in the .user folder.
---

# Document / Code Explainer & Translator to Hebrew HTML

Use this skill whenever the user asks to explain, document, or translate a file into a standalone Hebrew HTML page (e.g., "explain @file in HTML", "translate to hebrew html", "/doc-to-hebrew", "generate hebrew doc for @file").

## Supported File Types
Works on **any** file type:
- **Documentation & Notes**: `.md`, `.txt`, `.rst`, `.adoc`, etc.
- **Source Code**: `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.go`, `.rs`, `.java`, `.cs`, `.cpp`, `.c`, etc.
- **Styles & Markup**: `.css`, `.scss`, `.html`, `.svg`, etc.
- **Data & Config**: `.json`, `.yaml`, `.yml`, `.toml`, `.sql`, `.env.example`, `.xml`, etc.

---

## Workflow Steps

### 1. Read and Analyze the Input File
- Read the entire contents of the target file.
- Identify the file type, primary purpose, architecture, key functions/classes/interfaces, logic flows, edge cases, and configuration parameters.

### 2. Generate Hebrew Content Structure
Structure the explanation logically according to the file type:

#### For Code Files (Source / Scripts):
1. **Overview & Purpose (סקירה כללית ומטרה)**: What problem does this code solve? How does it fit into the broader project?
2. **Key Components & Architecture (רכיבים מרכזיים וארכיטקטורה)**: Classes, interfaces, main functions, data structures.
3. **Deep Dive / Step-by-Step Logic (הסבר מעמיק ולוגיקה שלב אחר שלב)**: Detailed explanation of algorithms, state transitions, event handlers, and data flow.
4. **API / Signature Table (טבלת פונקציות ופרמטרים)**: Inputs, outputs, types, and descriptions.
5. **Edge Cases & Error Handling (מקרי קצה וטיפול בשגיאות)**: How exceptions, network failures, or edge cases are handled.
6. **Usage Examples / Integration (דוגמאות שימוש והטמעה)**: Code snippets showing how to use the module.

#### For Documentation / Markdown Files:
- Accurate, natural Hebrew translation and structured breakdown of every section, maintaining original hierarchy, commands, tables, and code snippets.

---

## 3. HTML & CSS Design System Standards

The output **MUST** be a standalone, self-contained HTML file adhering to these exact design rules:

### A. General & Typography
- `<!DOCTYPE html>` with `<html lang="he" dir="rtl">`.
- Use Google Fonts: `Assistant`, `Heebo` (for Hebrew UI/text) and `Fira Code` / `Consolas` (for code snippets).
- All Hebrew text aligned right (`text-align: right; direction: rtl;`).
- All code tokens, identifiers, variable names, and code blocks MUST be rendered with `direction: ltr; text-align: left;`.

### B. Clean Light Theme Palette
- Background: `#f6f8fa` (page background), `#ffffff` (container/cards).
- Text: `#1f2328` (primary text), `#424a53` (secondary text), `#656d76` (muted text).
- Borders: `#d0d7de` (standard border), `#e1e4e8` (subtle border).
- Accents:
  - Blue: `#0969da` (Headers, links, primary badges)
  - Green: `#1a7f37` (Success, completed stages, return types)
  - Purple: `#8250df` (Subheaders, types/interfaces)
  - Amber: `#9a6700` (Warnings, callouts)
  - Red: `#cf222e` (Errors, critical notes, inline code highlights)

### C. Interactive & Structural Elements
1. **Floating Print Button** in top/bottom corner:
   ```html
   <div class="floating-toolbar no-print">
     <button class="btn-print" onclick="window.print()" title="הדפס או שמור כ-PDF">
       🖨️ הדפס / שמור כ-PDF
     </button>
   </div>
   ```
2. **Badges & Header**: Display file metadata (path, language, purpose, timestamp).
3. **Table of Contents (TOC)**: Clickable anchor links to every main section.
4. **Structured Tables**: Styled with alternating rows (`#fafbfc`) and crisp headers.
5. **Callout Boxes**: Danger (`#fff8f8`), Warning (`#fffcf0`), and Info (`#f0f8ff`).

### D. Strict Print Optimization (`@media print`)
Include the following print rules in the `<style>` block:
```css
@media print {
  @page {
    size: A4 portrait;
    margin: 12mm 15mm;
  }
  *, *:before, *:after {
    background: transparent !important;
    color: #000000 !important;
    box-shadow: none !important;
    text-shadow: none !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  body {
    background: #ffffff !important;
    padding: 0 !important;
    font-size: 10pt !important;
  }
  .container {
    max-width: 100% !important;
    width: 100% !important;
    border: none !important;
    padding: 0 !important;
    box-shadow: none !important;
  }
  .no-print, .floating-toolbar {
    display: none !important;
  }
  h2, h3 {
    page-break-after: avoid !important;
    break-after: avoid !important;
  }
  section, .callout, table, tr, pre, .rule-box, .stage-item, .toc-card {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }
}
```

---

## 4. File Saving & Naming Convention

1. Obtain the current timestamp in format `YYYY-MM-DD-HHmmss`.
2. Extract the base name of the source file (e.g., for `src/background.ts` -> `background.ts`).
3. Ensure the `.user` directory exists in the workspace root.
4. Save the generated HTML file to:
   `.user/{original_filename}-hebrew-{timestamp}.html`
5. Report the output with a clickable markdown link to the saved HTML file.
