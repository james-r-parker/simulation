// --- LOGGER CLASS ---

export const LOG_LEVELS = {
    NONE: 0,
    ERROR: 1,
    WARN: 2,
    INFO: 3,
    DEBUG: 4,
};

export class Logger {
    constructor(level = LOG_LEVELS.INFO) {
        this.level = level;
    }

    log(message, data) {
        if (this.level >= LOG_LEVELS.INFO) {
            if (data !== undefined) {
                console.log(message, data);
            } else {
                console.log(message);
            }
        }
    }

    info(message, data) {
        if (this.level >= LOG_LEVELS.INFO) {
            if (data !== undefined) {
                console.info(message, data);
            } else {
                console.info(message);
            }
        }
    }

    warn(message, data) {
        if (this.level >= LOG_LEVELS.WARN) {
            if (data !== undefined) {
                console.warn(message, data);
            } else {
                console.warn(message);
            }
        }
    }

    error(message, data) {
        if (this.level >= LOG_LEVELS.ERROR) {
            if (data !== undefined) {
                console.error(message, data);
            } else {
                console.error(message);
            }
        }
    }
    
    debug(message, data) {
        if (this.level >= LOG_LEVELS.DEBUG) {
            if (data !== undefined) {
                console.debug(message, data);
            } else {
                console.debug(message);
            }
        }
    }
}
