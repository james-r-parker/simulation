/** @param {Readonly<Record<string, any>>} config world config @returns {Record<string, any>} observer-only scratch */
export function createObserverScratch(config) {
    return {
        fatalBiteObservations: new Float64Array(config.maxAgents * 8),
        recoilEnergyLife: new Float64Array(config.maxAgents),
        biteSkipParent: new Uint8Array(config.maxAgents),
        thrustSkipParent: new Uint8Array(config.maxAgents),
        ledger: new Float64Array(2),
        point: new Float64Array(2),
        contacts: new Int32Array(2 * config.maxContacts),
    };
}
