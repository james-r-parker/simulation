// `three` ships no type declarations and @types/three is not a dependency of this repo, so its modules are untyped
// (`any`) for the type check. Tests and the browser spec cover the renderer's use of them.
declare module 'three';
declare module 'three/examples/jsm/*';
