import js from '@eslint/js';
import jsdoc from 'eslint-plugin-jsdoc';
import globals from 'globals';

const MATH_MSG = 'Not bit-exact across engines: use js/sim/det-math.js, or + - * / and Math.sqrt.';
const POW_MSG = 'The ** operator is not bit-exact across engines: multiply out or use det-math.js.';

// Lint covers the new code only. Legacy modules under js/ join as they are replaced
// (docs/designs/worker-and-renderer.md widens this list and the tsconfig include together).
export default [
    {
        ignores: [
            'dist/**',
            'node_modules/**',
            'public/**',
            'js/*.js',
            'js/constants/**',
            'vite.config.js',
            'test/fixtures/**',
        ],
    },
    js.configs.recommended,
    // Coding standards (docs/coding-standards.md and the AGENTS.md size limits): small single-purpose modules and functions.
    {
        files: ['js/sim/**/*.js', 'js/evo/**/*.js', 'js/dev/**/*.js', 'scripts/**/*.{js,mjs}'],
        plugins: { jsdoc },
        rules: {
            'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
            'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
            complexity: ['error', 10],
            'max-depth': ['error', 3],
            'max-params': ['error', 4],
            'jsdoc/require-jsdoc': ['error', { publicOnly: true }],
        },
    },
    {
        files: [
            'js/sim/**/*.js',
            'js/evo/**/*.js',
            'js/dev/**/*.js',
            'scripts/**/*.{js,mjs}',
            'test/**/*.js',
            '*.config.js',
        ],
        rules: {
            eqeqeq: ['error', 'always'],
            curly: ['error', 'all'],
            'no-var': 'error',
            'prefer-const': 'error',
            'no-param-reassign': ['error', { props: false }],
            'no-shadow': 'error',
            'no-else-return': 'error',
            'no-implicit-coercion': 'error',
            'no-warning-comments': ['error', { terms: ['todo', 'fixme', 'xxx', 'hack'], location: 'start' }],
        },
    },
    {
        files: ['test/**/*.js'],
        rules: {
            'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
        },
    },
    {
        files: ['js/sim/**/*.js', 'js/evo/**/*.js'],
        plugins: { jsdoc },
        languageOptions: { globals: { ...globals.worker } },
        rules: {
            'jsdoc/check-types': 'warn',
            'jsdoc/valid-types': 'error',
            'no-restricted-globals': [
                'error',
                { name: 'window', message: 'The sim core never touches the DOM.' },
                { name: 'document', message: 'The sim core never touches the DOM.' },
                { name: 'navigator', message: 'The sim core never touches the browser.' },
            ],
            'no-restricted-properties': [
                'error',
                { object: 'Math', property: 'random', message: 'Use js/sim/rng.js so runs are replayable.' },
                { object: 'Math', property: 'sin', message: MATH_MSG },
                { object: 'Math', property: 'cos', message: MATH_MSG },
                { object: 'Math', property: 'tan', message: MATH_MSG },
                { object: 'Math', property: 'asin', message: MATH_MSG },
                { object: 'Math', property: 'acos', message: MATH_MSG },
                { object: 'Math', property: 'atan', message: MATH_MSG },
                { object: 'Math', property: 'atan2', message: MATH_MSG },
                { object: 'Math', property: 'sinh', message: MATH_MSG },
                { object: 'Math', property: 'cosh', message: MATH_MSG },
                { object: 'Math', property: 'tanh', message: MATH_MSG },
                { object: 'Math', property: 'asinh', message: MATH_MSG },
                { object: 'Math', property: 'acosh', message: MATH_MSG },
                { object: 'Math', property: 'atanh', message: MATH_MSG },
                { object: 'Math', property: 'exp', message: MATH_MSG },
                { object: 'Math', property: 'expm1', message: MATH_MSG },
                { object: 'Math', property: 'log', message: MATH_MSG },
                { object: 'Math', property: 'log2', message: MATH_MSG },
                { object: 'Math', property: 'log10', message: MATH_MSG },
                { object: 'Math', property: 'log1p', message: MATH_MSG },
                { object: 'Math', property: 'pow', message: MATH_MSG },
                { object: 'Math', property: 'cbrt', message: MATH_MSG },
                { object: 'Math', property: 'hypot', message: MATH_MSG },
                { object: 'Math', property: 'clz32', message: MATH_MSG },
                { object: 'Date', property: 'now', message: 'Simulation time is counted in ticks.' },
                { object: 'performance', property: 'now', message: 'Simulation time is counted in ticks.' },
            ],
            'no-restricted-imports': ['error', { paths: ['three'], patterns: ['three/*', '../*.js'] }],
            'no-console': 'error',
            'no-restricted-syntax': [
                'error',
                { selector: "BinaryExpression[operator='**']", message: POW_MSG },
                { selector: "AssignmentExpression[operator='**=']", message: POW_MSG },
            ],
        },
    },
    {
        files: ['scripts/**/*.{js,mjs}', 'test/**/*.js', '*.config.js'],
        languageOptions: { globals: { ...globals.node } },
    },
    {
        files: ['scripts/browser/**/*.js'],
        languageOptions: { globals: { ...globals.worker } },
    },
];
