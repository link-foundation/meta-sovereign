# WebRTC signalling microservice (R-F6).
# Minimal node container running a WebRTC signalling broker. The actual
# broker code is the `js/bin/meta-sovereign rtc` subcommand once that lands
# in a follow-up PR; this Dockerfile reserves the deployable shape so
# the surrounding infrastructure (compose files, Helm charts) can be
# wired up in parallel.
FROM node:26.12.1-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --global npm@12.2.1 && npm ci --omit=dev
COPY js/src ./js/src
COPY js/bin ./js/bin

EXPOSE 8788
CMD ["node", "js/bin/meta-sovereign.js", "serve", "--port=8788", "--store=/data"]
