### 2026-10-17 - The hover peek and the world's y axis

- The world's y axis points up on screen (`screenToWorld` negates the device y), so a ray at `2 PI k / n` from the heading
  turns counter-clockwise; the inspector radar draws it that way.
- `window.localStorage` can throw on read (blocked site data); `main.js` asks for it through `safeStorage` and the
  interface runs without preferences when it is null.
