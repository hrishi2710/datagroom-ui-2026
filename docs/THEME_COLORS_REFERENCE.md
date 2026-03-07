# Theme Colors Reference

**Last Updated:** March 7, 2026

## Overview

This document details the color schemes for all themes in the datagroom-ui-2026 application. Theme styles are defined in `app/theme.css` and provide consistent styling for links, buttons, and status indicators across different visual themes.

## Available Themes

The application supports four themes:
1. **Default (Dark Theme)** - The primary dark mode
2. **Light Theme** (`:root.light-theme`)
3. **Gray Theme** (`:root.gray-theme`)
4. **Beige Theme** (`:root.beige-theme`)

## Link Colors

### Default Dark Theme
- **Default Link:** `#ffa366` (warm coral orange)
- **Hover:** `#ffb84d` (bright amber) + underline
- **Visited:** `#ff99cc` (light pink)
- **Rationale:** Uses warm tones that complement the dark theme's existing orange accent color (`--color-accent: #ffb400`). Provides excellent contrast against dark backgrounds without using blue.

### Light Theme
- **Default Link:** `#5A738E` (muted slate blue)
- **Hover:** `#4a5f76` (darker slate) + underline
- **Visited:** `#6b5a8e` (purple-gray)
- **Rationale:** Original subdued colors from datagroom.css. Less contrasting and easier on the eyes than bright blue.

### Gray Theme
- **Default Link:** `#111111` (very dark charcoal) with `font-weight: 600`
- **Hover:** `#000000` (pure black) + underline
- **Visited:** `#555555` (medium gray)
- **Rationale:** Maintains monochromatic gray aesthetic. Bold font weight helps links stand out while keeping the theme consistent.

### Beige Theme
- **Default Link:** `#b58900` (golden brown)
- **Hover:** `#936f00` (darker brown) + underline
- **Visited:** `#9b6b4d` (warm brown)
- **Rationale:** Uses warm earth tones matching the beige theme's color palette.

## Button Link Styling

Bootstrap's `.btn-link` class is overridden to match regular link colors in each theme. Use high specificity selectors to ensure override:

```css
.btn.btn-link,
button.btn-link,
a.btn-link {
  color: [theme-color] !important;
}
```

This ensures action buttons like "Edit-view", "Edit-log", "Bulk-edit", etc. harmonize with regular links.

## Connection Status Colors

### Default Dark Theme
- **Connected:** `#4ade80` (bright light green)
- **Disconnected:** `#f87171` (soft red)
- **Rationale:** Brighter green looks much better against dark backgrounds than traditional dark green.

### Light Theme
- **Connected:** `darkgreen` (traditional)
- **Disconnected:** `#dc2626` (bright red)
- **Rationale:** Classic status colors work well on light backgrounds.

### Gray Theme
- **Connected:** `#16a34a` (bright green)
- **Disconnected:** `#dc2626` (bright red)
- **Rationale:** Needs brighter colors to stand out against gray background.

### Beige Theme
- **Connected:** `#15803d` (dark green)
- **Disconnected:** `#b91c1c` (dark red)
- **Rationale:** Colors that work with warm beige tones.

## CSS Class Usage

### Connection Status
Use these classes in JSX instead of inline styles:
```jsx
<b className="status-connected">Connected</b>
<b className="status-disconnected">Disconnected</b>
```

## Important Implementation Notes

### CSS Specificity
1. Always use `!important` to override Bootstrap and other legacy stylesheets loaded later in the cascade
2. Bootstrap is loaded in `index.html` before React app, and `datagroom.css` is loaded after
3. Theme CSS must have high specificity: `.btn.btn-link` instead of just `.btn-link`

### Legacy CSS Files
The following files may contain conflicting styles:
- `public/assets/css/datagroom.css` - General link color: `#5A738E`
- `public/assets/css/custom.css` - Duplicate styles
- `public/assets/vendors/bootstrap/dist/css/bootstrap.css` - Button link styles

### Testing Checklist
When modifying theme colors, test:
- [ ] Regular anchor links (`<a>`)
- [ ] React Router `<Link>` components
- [ ] Bootstrap button links (`.btn.btn-link`)
- [ ] Connection status indicators
- [ ] All four themes
- [ ] Hard refresh (Ctrl+Shift+R) to clear CSS cache

## Color Contrast Guidelines

- **Dark backgrounds:** Use light, bright colors (e.g., `#c0e7ff`, `#4ade80`)
- **Light backgrounds:** Use standard darker colors (e.g., `#2563eb`, `darkgreen`)
- **Gray backgrounds:** Need high contrast colors; avoid mid-tones
- **Beige backgrounds:** Use earth tones that complement warm palette

## Future Considerations

1. Consider adding CSS variables for link colors to theme definitions
2. May want to extract status colors to theme variables as well
3. Could add focus states for accessibility (currently only hover states defined)
4. Consider adding dark mode detection based on system preferences

## File Locations

- **Theme CSS:** `app/theme.css`
- **Connection Status Component:** `app/pages/DsView/DsViewPage.jsx` (displayConnectedStatus function)
- **Legacy Stylesheets:** 
  - `public/assets/css/datagroom.css`
  - `public/assets/css/custom.css`
