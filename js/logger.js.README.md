# Logger Documentation (`logger.js`)

## Overview
The `Logger` class provides a centralized logging utility with support for different log levels (INFO, WARN, ERROR, DEBUG).

## Why It Exists
- **Control**: Allows global control over verbosity. You can silence debug logs in production or focus only on errors.
- **Consistency**: Provides a standard way to format logs across the application.

## Key Features
- **Log Levels**: `NONE`, `ERROR`, `WARN`, `INFO`, `DEBUG`.
- **Methods**: `log()`, `info()`, `warn()`, `error()`, `debug()`.
- **Conditional Logging**: Checks the configured `level` before printing to the console, saving performance by avoiding unnecessary string formatting and console I/O.
