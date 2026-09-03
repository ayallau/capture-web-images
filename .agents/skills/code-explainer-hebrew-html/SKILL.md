---
name: code-explainer-hebrew-html
description: Explains any source code file by generating a beautiful, print-optimized standalone Hebrew HTML document with Visual Studio Light syntax highlighting, structured function breakdown cards, centralized CSS color variables, and column-flow TOC saved in the .user folder.
---

# Code Explainer to Hebrew HTML Document

Use this skill whenever the user asks to explain, document, or analyze a source code file into a standalone Hebrew HTML page (e.g., "צור מסמך הסבר לקוד", "create Hebrew HTML documentation for @file", "code-explainer").

---

## 1. Workflow & Analysis Steps

### שלב 1: קריאה וחלוקה לחלקים ממוספרים

1. קרא את כל תוכן קובץ הקוד במלואו.
2. חלק את הקוד לחלקים לוגיים ברורים וממוספרים (למשל: ייבוא והגדרות, פונקציות עזר, ניהול מצב, מאזיני אירועים וכו').
3. תן לכל חלק כותרת מלאה ומספור שיטתי (חלק 1, חלק 2...).

### שלב 2: פירוט שיטתי לכל חלק ופונקציה

לכל חלק בקוד יש ליצור כרטיס ממוסגר (`part-card`) הכולל:

1. **כותרת מלאה ותגית מספר חלק** (בעיצוב `part-tag`).
2. **בלוק קוד צבעוני** התואם לערכת הצבעים **Light Visual Studio**:
   - מילות מפתח (`kwd`): `#0000ff`
   - טיפוסים ומחלקות (`typ`): `#267f99`
   - מחרוזות (`str`): `#a31515`
   - הערות (`cmt`): `#008000`
   - שמות פונקציות (`fn`): `#795e26`
   - מספרים (`num`): `#098658`
   - תכונות ומאפיינים (`prop`): `#001080`
3. **הסבר מובנה ומודגש:**
   - 🔍 **מה החלק הזה עושה?**
   - 🛡️ **על מה הוא אחראי?**
   - ⚙️ **כיצד הוא תורם ללוגיקה של התהליך כולו?**
4. **עבור כל פונקציה הנמצאת בחלק:**
   - 📥 **מה היא מקבלת (Parameters / Inputs):** שמות פרמטרים וטיפוסים מלאים.
   - 📤 **מה היא מחזירה (Return Value / Output):** טיפוס ומשמעות.
   - ⚙️ **כיצד היא תורמת ללוגיקה של התהליך כולו:** תפקידה בארכיטקטורה הכוללת.
5. **הדגשת מושגי מפתח:** כל מונח טכני חשוב (כגון Debounce, Single-Flight, Fallback Chain, Guard Clause) יודגש בעזרת מחלקת `highlight`.

### שלב 3: תוכן עניינים (TOC) ב-Column Flow

בראש המסמך יוצג תוכן עניינים מקושר עם קישורי עוגן (`#part-1`, `#part-2`...) המסודר ב-**Column Flow**:

- ב-CSS מוגדר `grid-auto-flow: column; grid-template-rows: repeat(N, auto);` (כאשר `N` הוא חצי ממספר החלקים מעוגל כלפי מעלה).
- **התוצאה:** פריט 2 מופיע ישירות מתחת לפריט 1 בטור הימני, ויתר הפריטים ממשיכים בטור השמאלי.
- **במובייל (`max-width: 768px`):** חזרה אוטומטית לטור יחיד רציף.

---

## 2. CSS & Design System Standards

כל המסמך חייב להיות דף HTML עצמאי לחלוטין (`standalone`) הכולל את ה-CSS בתוך תגית `<style>`.

### חובה: ריכוז כל הצבעים ב-`:root`

כל הצבעים במסמך חייבים להיות מוגדרים תחת משתני CSS תקניים ב-`:root`:

```css
:root {
  /* Base & Surfaces */
  --bg-page: #f6f8fa;
  --bg-card: #ffffff;
  --border-main: #d0d7de;
  --border-subtle: #e1e4e8;
  --shadow-sm: rgba(27, 31, 36, 0.08);
  --shadow-card: rgba(0, 0, 0, 0.03);

  /* Text Colors */
  --text-main: #1f2328;
  --text-heading: #0f1419;
  --text-muted: #57606a;

  /* Primary / Brand (Blue) */
  --primary: #0969da;
  --primary-hover: #0550ae;
  --primary-light: #ddf4ff;
  --primary-border: #b6e3ff;
  --primary-shadow: rgba(9, 105, 218, 0.35);
  --primary-shadow-hover: rgba(9, 105, 218, 0.45);
  --primary-dark: #044f9c;

  /* Success & Green */
  --success: #1a7f37;
  --success-light: #dafbe1;
  --success-border: #aceebb;
  --bg-section-green: #f6fbf7;

  /* Purple */
  --purple: #8250df;
  --purple-light: #fbefff;
  --purple-border: #e2c4f2;
  --bg-section-purple: #fbf8ff;

  /* Warning & Highlights (Amber / Yellow) */
  --warning: #9a6700;
  --warning-light: #fffcf0;
  --warning-border: #fae17d;
  --highlight-bg: #fff8c5;
  --highlight-border: #d4a72c;
  --bg-section-amber: #fffdf5;

  /* Danger / Errors (Red) */
  --danger: #cf222e;
  --danger-light: #fff8f8;
  --inline-code-text: #cf222e;
  --inline-code-bg: #f1f3f5;

  /* Section Backgrounds & Tables */
  --bg-section-default: #f8fafc;
  --bg-table-header: #f6f8fa;
  --bg-table-zebra: #fafbfc;
  --bg-code-header: #f0f3f6;

  /* Light Visual Studio Syntax Colors */
  --vs-kwd: #0000ff; /* Keywords: import, function, const, return, async, await */
  --vs-typ: #267f99; /* Types: Set, Map, string, number, Promise */
  --vs-str: #a31515; /* Strings: 'src', 'textContent' */
  --vs-cmt: #008000; /* Comments: // ... */
  --vs-fn: #795e26; /* Functions: getHeader, sweep */
  --vs-num: #098658; /* Numbers: 300, 0 */
  --vs-prop: #001080; /* Properties: url, width, height */
  --vs-text: #000000; /* Default code text & operators */
  --btn-text: #ffffff;
}
```

### שימוש ב-`--primary-dark`:

המשתנה `--primary-dark` ישמש עבור:

- [`.toc-num`](file:///c:/Users/ayall/Projects/Chrome/capture-web-images-v1/capture-web-images/.user/background.ts-hebrew-2026-09-03-131500.html#L240) (העיגול/מלבן של מספר הפריט בתוכן העניינים).
- [`.part-tag`](file:///c:/Users/ayall/Projects/Chrome/capture-web-images-v1/capture-web-images/.user/background.ts-hebrew-2026-09-03-131500.html#L274) (התגית "חלק X" בכותרת של כל כרטיס).

---

## 3. Strict Print Optimization (`@media print`)

המסמך חייב להכיל כפתור צף להדפסה (`floating-toolbar`) וכללי הדפסה קפדניים:

```css
@media print {
  @page {
    size: A4 portrait;
    margin: 12mm 14mm;
  }
  *,
  *::before,
  *::after {
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
    font-size: 9.5pt !important;
    line-height: 1.5 !important;
  }
  .container {
    max-width: 100% !important;
    width: 100% !important;
    border: none !important;
    padding: 0 !important;
    box-shadow: none !important;
  }
  .no-print,
  .floating-toolbar {
    display: none !important;
  }
  .part-card {
    border: 1px solid #999999 !important;
    padding: 14px 18px !important;
    margin-bottom: 20px !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }
  h1,
  h2,
  h3,
  .part-header {
    page-break-after: avoid !important;
    break-after: avoid !important;
  }
  pre {
    border: 1px solid #cccccc !important;
    background: #fdfdfd !important;
    font-size: 8pt !important;
    line-height: 1.4 !important;
    padding: 10px !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }
  table,
  tr,
  td,
  th {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }
  .highlight {
    background: none !important;
    text-decoration: underline !important;
    font-weight: bold !important;
  }
  .badge,
  .part-tag {
    border: 1px solid #555555 !important;
    color: #000000 !important;
  }
}
```

---

## 4. File Saving & Output Reporting

1. חלץ את שם הקובץ המקורי (למשל עבור `src/utils.ts` -> `utils.ts`).
2. צור חותמת זמן בפורמט `YYYY-MM-DD-HHmmss`.
3. שמור את הקובץ שנוצר בנתיב:
   `.user/{original_filename}-hebrew-{timestamp}.html`
4. דווח למשתמש בעברית תמציתית עם קישור קליקבילי (markdown link עם פרוטוקול `file:///`) לקובץ ה-HTML שנוצר.
