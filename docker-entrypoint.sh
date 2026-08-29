#!/bin/sh
# Runs pending Knex migrations before starting the server. `set -e` plus
# using the shell's own exit status (no `||` swallowing) means a failed
# migration exits this script non-zero and `exec node server/index.js` is
# never reached — migration failure blocks API startup (design.md).
set -e

npx knex migrate:latest

exec node server/index.js
