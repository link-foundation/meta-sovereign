# WebRTC signalling microservice (R-F6).
# Minimal node container running a WebRTC signalling broker. The actual
# broker code is the `js/bin/meta-sovereign rtc` subcommand once that lands
# in a follow-up PR; this Dockerfile reserves the deployable shape so
# the surrounding infrastructure (compose files, Helm charts) can be
# wired up in parallel.
FROM node:20-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY js/src ./js/src
COPY js/bin ./js/bin

EXPOSE 8788
CMD ["node", "js/bin/meta-sovereign.js", "serve", "--port=8788", "--store=/data"]
