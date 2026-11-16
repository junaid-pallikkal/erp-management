# Design rules

## Tokens (define once)
- Put the font, text sizes, colors, radius and shadows in `tailwind.config.js` and `index.css`. Don't repeat them anywhere else.
- Use only config tokens. Never hard-code a color, font size or shadow in a component.
- One primary color, one background, one text color.
- One corner radius. One spacing scale.
- Only a small set of shadow levels, defined once.

## Typography
- Font: Plus Jakarta Sans, loaded once, globally.
- Fixed text sizes (single place only):
  - Page title: 20px
  - Section title: 16px
  - Body and buttons: 14px
  - Helper and small text: 12px
- Weights: 400, 500, 600 only.

## Icons
- One library: `lucide-react`. One icon size across the app.
- Use icons for actions: edit, delete, add, view, download.
- Every icon-only button has a tooltip saying what it does.

## Layout and style
- Flat cards. Never a card inside a card. Use spacing, dividers or sections inside a card.
- Borderless. Separate with soft shadows and spacing, not borders.
- Exception: popups and modals use a divider line between header, body and footer.
- Mobile first, then scale up to desktop.
- Build base components once and reuse them. Don't re-style the same thing per page.
