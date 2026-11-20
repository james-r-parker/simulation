// Layering rules (docs/designs/quality-gates-and-test-tiers.md, "Layering and duplication").
const checked = '^(js/sim|js/evo|js/worker|js/app|js/library|functions|scripts|test)/';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
    forbidden: [
        {
            name: 'sim-standalone',
            comment: 'js/sim/ imports only js/sim/: no js/evo/, npm packages or Node built-ins.',
            severity: 'error',
            from: { path: '^js/sim/' },
            to: { pathNot: '^js/sim/' },
        },
        {
            name: 'evo-only-sim',
            comment: 'js/evo/ imports only js/evo/ and js/sim/.',
            severity: 'error',
            from: { path: '^js/evo/' },
            to: { pathNot: '^js/(evo|sim)/' },
        },
        {
            name: 'app-boundary',
            comment:
                'js/app/ imports js/app/, npm packages, js/worker/protocol.js and js/worker/snapshot-ring.js only: never the sim, the evolution code or the rest of the worker.',
            severity: 'error',
            from: { path: '^js/app/' },
            to: { path: '^js/(sim|evo|worker)/', pathNot: '^js/worker/(protocol|snapshot-ring)\\.js$' },
        },
        {
            name: 'app-webgpu-only',
            comment:
                'js/app/ draws through three/webgpu and three/tsl (docs/designs/crisp-renderer.md): never the WebGL `three` root entry.',
            severity: 'error',
            from: { path: '^js/app/' },
            to: { path: 'node_modules/three/build/three\\.(module|cjs|core)\\.js$' },
        },
        {
            name: 'pack-no-three',
            comment:
                'js/app/pack/ never imports three (docs/designs/pack-worker.md): the pack worker has no DOM and no WebGPU, and the worker entry reaches no module that imports it either.',
            severity: 'error',
            from: { path: '^js/app/pack/' },
            to: { path: 'node_modules/three/' },
        },
        {
            name: 'pack-worker-reaches-no-three',
            comment: 'Nothing the pack worker entry imports, however deep, imports three or uplot.',
            severity: 'error',
            from: { path: '^js/app/pack/pack-worker\\.js$' },
            to: { path: 'node_modules/(three|uplot)/', reachable: true },
        },
        {
            name: 'worker-no-dom',
            comment: 'js/worker/ imports js/sim/, js/evo/ and js/worker/ only: not the app, and not three or uplot.',
            severity: 'error',
            from: { path: '^js/worker/' },
            to: { path: ['^js/app/', 'node_modules/(three|uplot)/'] },
        },
        {
            name: 'library-standalone',
            comment:
                'js/library/ imports only js/library/: no sim, evo, worker or app code, no npm packages or Node built-ins.',
            severity: 'error',
            from: { path: '^js/library/' },
            to: { pathNot: '^js/library/' },
        },
        {
            name: 'functions-only-library',
            comment:
                'functions/ imports functions/ and js/library/ only: the Workers runtime has no sim, no Node built-ins and no npm packages.',
            severity: 'error',
            from: { path: '^functions/' },
            to: { pathNot: '^(functions|js/library)/' },
        },
        {
            name: 'no-circular',
            comment:
                'No import cycles among js/sim/, js/evo/, js/worker/, js/app/, js/library/, functions/, scripts/ and test/.',
            severity: 'error',
            from: { path: checked },
            to: { circular: true },
        },
        {
            name: 'no-unresolvable',
            comment: 'Every import resolves to a file or an installed package.',
            severity: 'error',
            from: { path: checked },
            to: { couldNotResolve: true },
        },
        {
            name: 'no-dev-in-runtime',
            comment: 'Runtime code in js/sim/, js/evo/ and js/worker/ never imports a devDependencies package.',
            severity: 'error',
            from: { path: '^js/(sim|evo|worker)/' },
            to: { dependencyTypes: ['npm-dev'] },
        },
    ],
    options: {
        doNotFollow: { path: 'node_modules' },
        exclude: { path: '^test/fixtures/' },
        tsPreCompilationDeps: false,
        enhancedResolveOptions: {
            exportsFields: ['exports'],
            conditionNames: ['import', 'require', 'node', 'default', 'types'],
        },
    },
};
