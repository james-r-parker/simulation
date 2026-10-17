// Layering rules (docs/designs/quality-gates-and-test-tiers.md, "Layering and duplication").
// The legacy js/*.js and js/constants/*.js files match no `from` pattern below, so they are outside every rule.
const checked = '^(js/sim|js/evo|js/worker|js/app|scripts|test)/';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
    forbidden: [
        {
            name: 'sim-standalone',
            comment: 'js/sim/ imports only js/sim/: no legacy code, js/evo/, npm packages or Node built-ins.',
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
                'js/app/ imports js/app/, npm packages and js/worker/protocol.js only: never the sim, the evolution code or the worker.',
            severity: 'error',
            from: { path: '^js/app/' },
            to: { path: '^js/(sim|evo|worker)/', pathNot: '^js/worker/protocol\\.js$' },
        },
        {
            name: 'worker-no-dom',
            comment: 'js/worker/ imports js/sim/, js/evo/ and js/worker/ only: not the app, and not three or uplot.',
            severity: 'error',
            from: { path: '^js/worker/' },
            to: { path: ['^js/app/', 'node_modules/(three|uplot)/'] },
        },
        {
            name: 'no-circular',
            comment: 'No import cycles among js/sim/, js/evo/, js/worker/, js/app/, scripts/ and test/.',
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
