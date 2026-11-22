# syntax=docker/dockerfile:1
##
##  Agentic Software Engineering (ASE)
##  Copyright (c) 2025-2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
##  Licensed under Apache 2.0 <https://spdx.org/licenses/Apache-2.0>
##

#   base image: official Node.js on Alpine Linux
FROM        node:24-alpine

#   fail a RUN on any failed command inside a pipe (like "curl ... | bash")
SHELL       [ "/bin/ash", "-eo", "pipefail", "-c" ]

#   install additional tools
#   (libgcc, libstdc++ and ripgrep are required by the native Claude Code CLI on Alpine Linux,
#   procps provides the "ps -o lstart= -p" of the agent run recovery, unsupported by BusyBox)
RUN         apk add --no-cache \
                bash git openssh-client ca-certificates curl jq less vim \
                ripgrep libgcc libstdc++ procps

#   install ASE CLI tool from the locally packed package
ARG         ASE_VERSION
COPY        rse-ase-${ASE_VERSION}.tgz /tmp/
RUN         npm install -g /tmp/rse-ase-${ASE_VERSION}.tgz && \
            npm cache clean --force && \
            rm -f /tmp/rse-ase-${ASE_VERSION}.tgz

#   provide entrypoint which ensures Claude Code CLI and ASE plugin
#   exist on a fresh home volume and then runs the given command
COPY        --chmod=755 ase-entrypoint.sh /usr/local/bin/ase-entrypoint

#   create unprivileged system user with home directory /ase
RUN         addgroup -S ase && \
            adduser -S -G ase -h /ase -s /bin/bash ase

#   switch to unprivileged user
USER        ase:ase
WORKDIR     /ase
ENV         HOME=/ase \
            PATH=/ase/.local/bin:$PATH \
            USE_BUILTIN_RIPGREP=0

#   pre-install Claude Code CLI (native installer) and the ASE plugin
RUN         curl -fsSL https://claude.ai/install.sh | bash && \
            ase setup install

#   keep home directory (projects, Claude Code credentials) on an external volume
VOLUME      [ "/ase" ]

#   run "ase" by default, or any other given command (e.g. "bash" or "claude")
ENTRYPOINT  [ "/usr/local/bin/ase-entrypoint" ]
CMD         [ "ase" ]

