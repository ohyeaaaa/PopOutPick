# PopOutPick Website Text Guide

This file organizes the website text by priority so it is easier to know what to edit first.

## Priority Levels

- **Priority 1 — Main customer text**: Large headings, important page titles, navigation buttons.
- **Priority 2 — Product/configurator text**: Labels, choices, step names, option text.
- **Priority 3 — Helper/status text**: Small hints, progress/loading messages, summaries.

---

# Priority 1 — Main Customer Text

These are the most visible words on the website.

| Text | Where to change | Size/style controlled by |
|---|---|---|
| `Choose Your Pick Type` | `index.html` | Browser default `h1`, can be styled in `style.css` with `h1 { font-size: ... }` |
| `Pickholders` | `index.html` | Inline style in `index.html`, plus `h1` styling if added |
| `Your Custom PopOutPick` | `index.html` | Browser default `h1`, can be styled in `style.css` with `h1 { font-size: ... }` |
| `← Previous` | `index.html` | `.btn-nav` in `style.css` |
| `Next →` | `index.html` | `.btn-nav` and `.btn-next` in `style.css` |

Recommended CSS if you want all main headings controlled in one place:

```css
h1 {
    font-size: 42px;
    font-weight: 700;
}
```

---

# Priority 2 — Product / Configurator Text

These are important for the configurator experience.

## Step 1 Product Type Cards

| Text | Where to change | Size/style controlled by |
|---|---|---|
| `Guitar` | `index.html` | Add/change `.type-card h3` in `style.css` |
| `10MM - 6MM` | `index.html` | Add/change `.type-card p` in `style.css` |
| `Bass` | `index.html` | Add/change `.type-card h3` in `style.css` |
| `30MM - 6MM` | `index.html` | Add/change `.type-card p` in `style.css` |

Recommended CSS:

```css
.type-card h3 {
    font-size: 24px;
}

.type-card p {
    font-size: 14px;
}
```

## Step Titles

These are generated in `script.js`:

```js
const titles = ["", "Body", "Pickholders", "Module", "Slider", "Top Plate", "Bottom Plate"];
```

| Text | Where to change | Size/style controlled by |
|---|---|---|
| `Body` | `script.js` | `h1` styling in `style.css` if added |
| `Pickholders` | `script.js` / `index.html` | `h1` styling or inline styles |
| `Module` | `script.js` | `h1` styling in `style.css` if added |
| `Slider` | `script.js` | `h1` styling in `style.css` if added |
| `Top Plate` | `script.js` | `h1` styling in `style.css` if added |
| `Bottom Plate` | `script.js` | `h1` styling in `style.css` if added |

## Progress Bar Labels

These are generated in `script.js`:

```js
const labels = ['Type', 'Body', 'Pickholders', 'Module', 'Slider', 'Top Plate', 'Bottom Plate'];
```

Size controlled by:

```css
.step-label {
    font-size: 10px;
}

.step-circle {
    font-size: 12px;
}
```

## Pickholder Thickness Choices

These are generated in `script.js`:

```js
const thicknessOptions = selections.type === 'bass'
    ? ['30mm', '20mm', '10mm', '8mm', '6mm']
    : ['10mm', '8mm', '7mm', '6mm'];
```

| Product type | Current choices |
|---|---|
| Guitar | `10mm`, `8mm`, `7mm`, `6mm` |
| Bass | `30mm`, `20mm`, `10mm`, `8mm`, `6mm` |

Important: if you add a new size choice, you also need a matching GLB file path in `glbModels` in `script.js`.

Thickness button size is currently controlled mostly by this inline style in `script.js`:

```js
style="padding:12px; text-align:center; border-radius:14px; font-size:14px;"
```

And partly by `.thick-btn` in `style.css`:

```css
.thick-btn {
    padding: 10px 18px;
    border-radius: 10px;
}
```

## Pickholder Color Labels

These are generated in `script.js`:

```js
COLOR BEFORE 15.2MM
COLOR AFTER 15.2MM
```

They use this CSS:

```css
.label-caps {
    font-size: 11px;
}
```

---

# Priority 3 — Helper / Status Text

These are smaller text pieces that guide the customer.

| Text | Where to change | Size/style controlled by |
|---|---|---|
| `Are you a guitar player or a bass player?` | `index.html` | Add/change `.subtitle` in `style.css` |
| `Choose 4 pickholders — click each slot to configure its thickness and color` | `index.html` | Inline style in `index.html`, or `.subtitle` if moved to CSS |
| `✓ All 4 pickholders configured` | `index.html` | Inline style in `index.html` |
| `Configure the thickness and color for this slot` | `script.js` | Inline style in `script.js` |
| `Review your design before finishing` | `index.html` | Add/change `.subtitle` in `style.css` |
| `Assembling your PopOutPick...` | `index.html` and `script.js` | `#assembly-status` in `style.css` |
| `FINAL REVIEW` | `script.js` | Browser/default footer text style |
| `STEP ${currentStep} OF 7` | `script.js` | Browser/default footer text style |

Recommended CSS for subtitles:

```css
.subtitle {
    font-size: 18px;
    color: #777;
}
```

---

# Text Size Locations Summary

| Text type | CSS selector / file |
|---|---|
| Main page headings | Add `h1` in `style.css` |
| Subtitles | Add `.subtitle` in `style.css` |
| Progress labels | `.step-label` in `style.css` |
| Progress circle numbers | `.step-circle` in `style.css` |
| Small labels like COLOR/THICKNESS | `.label-caps` in `style.css` |
| Guitar/Bass card titles | Add `.type-card h3` in `style.css` |
| Guitar/Bass card subtitles | Add `.type-card p` in `style.css` |
| Thickness buttons | Inline style in `script.js` and `.thick-btn` in `style.css` |
| Footer buttons | `.btn-nav` in `style.css` |
| Loading text | `#assembly-status` in `style.css` |

---

# Suggested Editing Priority

If you are cleaning up the website text, edit in this order:

1. Main headings: `Choose Your Pick Type`, `Pickholders`, `Your Custom PopOutPick`.
2. Product choice text: `Guitar`, `Bass`, size ranges.
3. Pickholder instructions and labels.
4. Step/progress labels.
5. Footer buttons and status/loading messages.
6. Small helper text.

---

# Recommended Next Improvement

Right now, some text sizes are controlled in `style.css`, while some are controlled directly inside `index.html` or `script.js` using inline styles.

For a cleaner setup, move more text sizing into `style.css`, for example:

```css
h1 {
    font-size: 42px;
    font-weight: 700;
}

.subtitle {
    font-size: 18px;
    color: #777;
}

.pickholder-title {
    font-size: 18px;
    font-weight: 700;
}

.pickholder-helper {
    font-size: 12px;
    color: #888;
}
```

Then the website will be easier to style from one place.
