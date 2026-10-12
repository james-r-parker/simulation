// Layering rules (docs/designs/quality-gates-and-test-tiers.md, "Layering and duplication").
// The legacy js/*.js and js/constants/*.js files match no `from` pattern below, so they are outside every rule.
const checked = '^(js/sim|js/evo|scripts|test)/';

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
            name: 'no-circular',
            comment: 'No import cycles among js/sim/, js/evo/, scripts/ and test/.',
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
            comment: 'Runtime code in js/sim/ and js/evo/ never imports a devDependencies package.',
            severity: 'error',
            from: { path: '^js/(sim|evo)/' },
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
