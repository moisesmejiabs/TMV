# TMV Visual Design System

## Content surface contrast

TMV keeps its established muted rose, blush, champagne, lavender, cream, and
berry palette. Do not create hierarchy by introducing saturated colors or
unrelated accent colors.

Create contrast primarily through background layering and shadows:

- Page backgrounds retain the existing neutral or muted palette.
- Primary content surfaces use `--surface`.
- Section cards, generic `.card` elements, and standalone `.form` elements use
  `--shadow-surface`.
- Surface borders use berry (`#6d2140`) at approximately 20–30% opacity.
- Nested content uses translucent white backgrounds and a smaller shadow or
  inset shadow when separation is needed.
- Avoid thick dark borders and highly saturated section backgrounds.

The canonical site-wide surface shadow is defined in
`public/static/css/style.css`:

```css
--shadow-surface:
  0 20px 44px rgba(72, 28, 48, 0.25),
  0 3px 10px rgba(72, 28, 48, 0.14),
  inset 0 1px 0 rgba(255, 255, 255, 0.72);
```

Use the shared variable instead of copying the shadow value into individual
pages. `--shadow-strong` aliases this variable for compatibility with existing
section-card styles.

Interactive controls may use smaller shadows for affordance, but navigation,
menus, dialogs, and overlays should not inherit the full content-surface shadow
unless they are intentionally presented as primary page content.

## Heading contrast

Standard `h1` through `h6` headings use the shared `--shadow-heading` token:

```css
--shadow-heading:
  0 2px 2px rgba(72, 28, 48, 0.16),
  0 7px 16px rgba(72, 28, 48, 0.18);
```

The shadow uses the existing berry tone at low opacity. It should add depth
without looking like an outline or reducing readability. Use the shared token
instead of page-specific heading shadows.

Metallic `.nav-gold` headings are excluded because their gradient, filter, and
shimmer treatment already provide contrast. Brand headings retain their
purpose-built styling.
