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

Nested information surfaces use `--shadow-nested`:

```css
--shadow-nested:
  0 9px 22px rgba(72, 28, 48, 0.18),
  inset 0 1px 0 rgba(255, 255, 255, 0.80);
```

This is appropriate for items such as event metadata rows inside a larger
event card. It provides separation without competing with the primary surface.

Interactive controls may use smaller shadows for affordance, but navigation,
menus, dialogs, and overlays should not inherit the full content-surface shadow
unless they are intentionally presented as primary page content.

## Editable field contrast

Text inputs, date and number controls, textareas, and selects use a solid light
surface, a two-pixel berry border at moderate opacity, and `--shadow-field`:

```css
--shadow-field:
  inset 0 2px 5px rgba(72, 28, 48, 0.12),
  0 5px 13px rgba(72, 28, 48, 0.16);
```

Focused fields use a stronger berry border, white background, deeper outer
shadow, and a gold-tinted four-pixel focus outline. Do not remove the focus
outline. Checkboxes, radios, buttons, file inputs, and other specialized
controls keep their component-specific styling.

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

## Site-wide inner surfaces

The homepage contrast treatment is the baseline for all TMV pages. Primary
sections use the normal `--shadow-surface` outer shadow. Content inside those
sections uses `--shadow-nested` so lists, detail groups, forms, feedback areas,
media presentations, partner cards, and Mission and Vision panels remain
visually separate from their containing section.

The homepage image slider uses the primary surface shadow on its outer frame
and the nested shadow on its inner image frame. Section descriptions and
Mission and Vision paragraphs may use smaller berry-toned shadows with
translucent white backgrounds.

Keep all of these backgrounds within the existing muted palette. Homepage
contrast should come from layering, borders, and shadow depth rather than
stronger saturation.

The shared `.content-surface` utility is available for new inner panels.
Existing recurring components are mapped to the same treatment in the shared
stylesheet. Use the utility for new markup instead of adding a page-specific
shadow value.

Specialized milk registration pages retain their own layout styles, but their
primary and nested panels consume the same `--shadow-surface` and
`--shadow-nested` variables.

## Expandable checkbox controls

Optional form areas use a full-width description row with the checkbox aligned
on the right. The description contains a bold action name and a short
explanation. Use a large checkbox, berry accent color, visible border, and
small shadow so the control remains easy to identify.

Participant and account selection rows follow the same direction: identifying
text is grouped on the left and the checkbox is aligned on the far right. Use
the `.participant-choice-row` pattern so shared form-label rules cannot change
that alignment.

When selected, strengthen the row border and muted blush background, then
reveal the associated nested content surface immediately below it. The
checkbox must expose `aria-controls` and keep `aria-expanded` synchronized with
the panel's visible state.

Event creation forms use a wide content area (up to `1100px`) so multi-column
details and participant controls do not feel compressed. Related core event
fields—Event Details, Description, and Event Image—belong to one primary
surface, separated by subheadings and restrained dividers rather than separate
outer cards.

Event detail pages follow the same grouping principle. About This Event, Event
Details, and Requirements belong to one `.event-information-section` surface.
Use internal headings and restrained dividers instead of three separate outer
cards. Metadata rows inside that surface remain flat: do not add individual
backgrounds, rounded borders, or shadows to Day, Time, Presenter, Location, or
Capacity. The enclosing event-information surface is the single background
rectangle.

Event metadata uses a consistent key/value layout within that rectangle. Keys
occupy a fixed left column; values use a wider indented right column with a
subtle berry vertical divider. Horizontal separators may distinguish rows
without turning them into individual cards. On narrow screens, stack the value
below the key while retaining a smaller indentation.

Event registration messaging and administrator Edit/Delete controls belong in
one `.event-participation-section` surface under a bilingual Participation /
Participación heading.
