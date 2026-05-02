@echo off
rem ##
rem ##  Agentic Software Engineering (ASE)
rem ##  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
rem ##  Licensed under GPL 3.0 <https://spdx.org/licenses/GPL-3.0-only>
rem ##

setlocal

rem #   resolve our base directory
set "basedir=%~dp0"

rem #   pass-through execution
node "%basedir%ase.js" %*

endlocal

