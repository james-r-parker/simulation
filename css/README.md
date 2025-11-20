# CSS Styling Documentation

## Overview

The `style.css` file provides a modern dark mode theme for the Blob Evolution simulation interface.

## Design Philosophy

- **Dark Mode First**: Designed for comfortable viewing in low-light environments
- **High Contrast**: Ensures readability while maintaining aesthetic appeal
- **Modern UI**: Clean, gradient-based design with subtle shadows
- **Responsive**: Adapts to different screen sizes

## Color Scheme

### Background
- **Main Background**: `#0a0a0a` to `#1a1a1a` (gradient)
- **Info Bar**: `#1e1e1e` to `#151515` (gradient)
- **Controls Bar**: `#151515` to `#1e1e1e` (gradient)
- **Canvas Container**: `#000` (pure black for WebGL)

### Text
- **Primary Text**: `#e0e0e0` (light gray)
- **Secondary Text**: `#d0d0d0` (slightly darker gray)

### Accents
- **Slider Thumb**: `#4a9eff` (blue) with hover `#5aaeff`
- **Button**: `#d32f2f` to `#b71c1c` (red gradient)
- **Info Bar Spans**: `rgba(255, 255, 255, 0.05)` background with `rgba(255, 255, 255, 0.1)` border

### Scrollbars
- **Track**: `#1a1a1a`
- **Thumb**: `#444` with hover `#555`

## Component Styling

### Body
- Full viewport height with flexbox layout
- Dark gradient background
- System font stack for cross-platform consistency

### Info Bar (`#info-bar`)
- Top bar displaying simulation statistics
- Gradient background with bottom border
- Box shadow for depth
- Flexbox layout with wrapping
- Each span has subtle background and border

### Controls (`#controls`)
- Bottom bar with simulation controls
- Gradient background with top border
- Box shadow for depth
- Flexbox layout with wrapping

### Range Inputs
- Custom styled sliders
- Dark track (`#2a2a2a`)
- Blue thumb with hover effect
- Smooth transitions

### Checkboxes
- System-styled with accent color
- 18x18px size for easy clicking

### Button (`#clearStorage`)
- Red gradient background
- Hover effect with lift animation
- Active state with press effect
- Box shadow for depth

### Canvas Container (`#canvas-container`)
- Flexible container taking remaining space
- Pure black background for WebGL
- Full width and height

## Responsive Design

- Flexbox ensures proper layout on all screen sizes
- Controls wrap on smaller screens
- Info bar spans wrap when needed
- Canvas container adapts to available space

## Browser Compatibility

- Modern CSS features (gradients, flexbox, custom scrollbars)
- Works in Chrome, Firefox, Edge (latest versions)
- Custom scrollbar styling uses `-webkit-` prefix for Chrome/Safari

## Customization

To modify the theme:

1. **Change Color Scheme**: Update color values in the CSS
2. **Adjust Gradients**: Modify `linear-gradient()` values
3. **Modify Spacing**: Adjust `padding` and `margin` values
4. **Change Fonts**: Update `font-family` in body selector

## Key CSS Features Used

- **Flexbox**: For layout and alignment
- **CSS Gradients**: For background effects
- **Box Shadow**: For depth and elevation
- **Transitions**: For smooth hover effects
- **Custom Scrollbars**: For consistent styling
- **CSS Variables**: Could be added for easier theming

## Performance

- Minimal CSS (no heavy frameworks)
- Efficient selectors
- Hardware-accelerated transforms
- No layout thrashing



