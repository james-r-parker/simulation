// Build-time constants Vite substitutes (`define` in vite.config.js).
// `__PRODUCTION__` is true in `vite build`, false under `vite`.
declare const __PRODUCTION__: boolean | undefined;
// The release being built (`APP_VERSION`, default package.json's version) and its season, which is its major.
declare const __APP_VERSION__: string;
declare const __SEASON__: number;
interface Window {
    __blob?: {
        readonly frames: number;
        readonly tick: number;
        resetFrames: () => void;
    };
}
declare var __blob: Window['__blob'];
declare module '*.css';
