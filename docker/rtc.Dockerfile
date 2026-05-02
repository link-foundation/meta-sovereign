# WebRTC signalling microservice (R-F6).
# Minimal node container running a WebRTC signalling broker. The actual
# broker code is the `bin/meta-sovereign rtc` subcommand once that lands
# in a follow-up PR; this Dockerfile reserves the deployable shape so
# the surrounding infrastructure (compose files, Helm charts) can be
# wired up in parallel.
FROM node:20-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY src ./src
COPY bin ./bin

EXPOSE 8788
CMD ["node", "bin/meta-sovereign.js", "serve", "--port=8788", "--store=/data"]
