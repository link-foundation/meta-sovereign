# WebRTC signalling microservice (R-F6).
# Minimal node container running a WebRTC signalling broker. The actual
# broker code is the `js/bin/meta-sovereign rtc` subcommand once that lands
# in a follow-up PR; this Dockerfile reserves the deployable shape so
# the surrounding infrastructure (compose files, Helm charts) can be
# wired up in parallel.
FROM node:26.13.0-alpine@sha256:c6ad9e9c1d80f6eb607c26b4b0a132ff7a2344fad1c78ea3baa2a7d4c8de6d94

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --global npm@12.2.1 && npm ci --omit=dev
COPY js/src ./js/src
COPY js/bin ./js/bin

EXPOSE 8788
CMD ["node", "js/bin/meta-sovereign.js", "serve", "--port=8788", "--store=/data"]
