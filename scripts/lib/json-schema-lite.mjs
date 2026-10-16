// A validator for the small JSON Schema subset the repo's own schemas use. No dependency: the subset is
// type, required, properties, additionalProperties (false or a schema), enum, pattern, minLength, items, minItems.

/**
 * @typedef {{ schemaPath: string, instancePath: string, message: string }} SchemaError
 */

/**
 * Names a value's JSON type.
 * @param {unknown} value any JSON value
 * @returns {string} object, array, string, number, boolean or null
 */
function typeOf(value) {
    if (value === null) {
        return 'null';
    }
    return Array.isArray(value) ? 'array' : typeof value;
}

/**
 * Checks the keywords that apply to any value.
 * @param {Record<string, any>} schema the schema
 * @param {unknown} value the value
 * @param {string} at the schema path of `schema`
 * @returns {{ schemaPath: string, message: string }[]} problems, with the keyword's schema path
 */
function checkScalar(schema, value, at) {
    const found = [];
    if (schema.type !== undefined && typeOf(value) !== schema.type) {
        found.push({ schemaPath: `${at}/type`, message: `${JSON.stringify(value)} is not of type ${schema.type}` });
        return found;
    }
    if (schema.enum !== undefined && !schema.enum.includes(value)) {
        found.push({
            schemaPath: `${at}/enum`,
            message: `${JSON.stringify(value)} is not one of ${schema.enum.join(', ')}`,
        });
    }
    if (typeof value === 'string') {
        if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
            found.push({
                schemaPath: `${at}/pattern`,
                message: `${JSON.stringify(value)} does not match ${schema.pattern}`,
            });
        }
        if (schema.minLength !== undefined && value.length < schema.minLength) {
            found.push({ schemaPath: `${at}/minLength`, message: `string is shorter than ${schema.minLength}` });
        }
    }
    return found;
}

/**
 * Checks an object against `required`, `properties` and `additionalProperties`.
 * @param {Record<string, any>} schema the schema
 * @param {Record<string, any>} value the object
 * @param {{ at: string, where: string }} path schema path and instance path
 * @returns {SchemaError[]} problems
 */
function checkObject(schema, value, { at, where }) {
    /** @type {SchemaError[]} */
    const errors = [];
    for (const key of schema.required ?? []) {
        if (!(key in value)) {
            errors.push({ schemaPath: `${at}/required`, instancePath: where, message: `missing required "${key}"` });
        }
    }
    const properties = schema.properties ?? {};
    for (const [key, item] of Object.entries(value)) {
        const here = `${where}/${key}`;
        if (key in properties) {
            errors.push(...validate(properties[key], item, { at: `${at}/properties/${key}`, where: here }));
        } else if (schema.additionalProperties === false) {
            errors.push({
                schemaPath: `${at}/additionalProperties`,
                instancePath: here,
                message: `unexpected property "${key}"`,
            });
        } else if (typeof schema.additionalProperties === 'object') {
            errors.push(
                ...validate(schema.additionalProperties, item, { at: `${at}/additionalProperties`, where: here }),
            );
        }
    }
    return errors;
}

/**
 * Checks an array against `minItems` and `items`.
 * @param {Record<string, any>} schema the schema
 * @param {unknown[]} value the array
 * @param {{ at: string, where: string }} path schema path and instance path
 * @returns {SchemaError[]} problems
 */
function checkArray(schema, value, { at, where }) {
    /** @type {SchemaError[]} */
    const errors = [];
    if (schema.minItems !== undefined && value.length < schema.minItems) {
        errors.push({
            schemaPath: `${at}/minItems`,
            instancePath: where,
            message: `fewer than ${schema.minItems} items`,
        });
    }
    if (schema.items !== undefined) {
        value.forEach((item, i) => {
            errors.push(...validate(schema.items, item, { at: `${at}/items`, where: `${where}/${i}` }));
        });
    }
    return errors;
}

/**
 * Validates a value against a schema.
 * @param {Record<string, any>} schema the schema (or the part of it being checked)
 * @param {unknown} value the value
 * @param {{ at?: string, where?: string }} [path] the schema path and instance path of this part
 * @returns {SchemaError[]} every problem found, in document order; empty when the value is valid
 */
export function validate(schema, value, { at = '', where = '' } = {}) {
    const scalar = checkScalar(schema, value, at).map((e) => ({ ...e, instancePath: where }));
    if (scalar.length > 0 && scalar[0].schemaPath.endsWith('/type')) {
        return scalar;
    }
    if (typeOf(value) === 'object') {
        return [...scalar, ...checkObject(schema, /** @type {Record<string, any>} */ (value), { at, where })];
    }
    if (Array.isArray(value)) {
        return [...scalar, ...checkArray(schema, value, { at, where })];
    }
    return scalar;
}
