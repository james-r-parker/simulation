// The closed set of scene names a registry entry's `scenes` field draws from (docs/principles.md, docs/designs/agent-workflow.md).
// A tag says which scene, user failure or user goal a metric detects; it changes no value, direction or status, and no
// sim or evo code reads it. `scripts/scene-scorecard.mjs` turns the tags into docs/scene-scorecard.md.

/** The 15 scenes of the Scenes table in docs/principles.md, in its order. */
export const PRINCIPLE_SCENES = Object.freeze([
    'Leave a dying patch',
    'A real chase',
    'Abort',
    "Call, or don't",
    'Pack, or loner',
    'Refuge',
    'Scavenge',
    'Condition changes the walk',
    'Season changes the map',
    'Cross or stay',
    'Parent spends',
    'Same spec, different custom',
    'Boom and bust',
    'Other blobs are the climate',
    'Something unnamed',
]);

/** The five failures the user flagged (N1 to N5). */
export const FAILURES = Object.freeze(['N1', 'N2', 'N3', 'N4', 'N5']);

/** The four goals the user flagged (G1 to G4). */
export const GOALS = Object.freeze(['G1', 'G2', 'G3', 'G4']);

/** Every name a `scenes` field may hold: the 15 scenes, the 5 N failures and the 4 G goals. */
export const SCENES = Object.freeze([...PRINCIPLE_SCENES, ...FAILURES, ...GOALS]);

/** @typedef {typeof SCENES[number]} SceneName a scene, failure or goal name */
