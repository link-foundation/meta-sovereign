# WebRTC signalling microservice (R-F6).
# Minimal node container running a WebRTC signalling broker. The actual
# broker code is the `js/bin/meta-sovereign rtc` subcommand once that lands
# in a follow-up PR; this Dockerfile reserves the deployable shape so
# the surrounding infrastructure (compose files, Helm charts) can be
# wired up in parallel.
FROM node:26.13.0-alpine@sha256:8996bb5821d62a8fd9bb27c1cb07462f3fdce6e47d640c6a881ead0b064ce216

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --global npm@12.2.2 && npm ci --omit=dev
COPY js/src ./js/src
COPY js/bin ./js/bin

EXPOSE 8788
CMD ["node", "js/bin/meta-sovereign.js", "serve", "--port=8788", "--store=/data"]
