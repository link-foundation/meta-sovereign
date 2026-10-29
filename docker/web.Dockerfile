# Web/API microservice (R-F7).
# Runs `meta-sovereign serve` against a mounted data volume.
FROM node:26.13.0-alpine@sha256:c6ad9e9c1d80f6eb607c26b4b0a132ff7a2344fad1c78ea3baa2a7d4c8de6d94

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --global npm@12.2.1 && npm ci --omit=dev
COPY js/src ./js/src
COPY js/bin ./js/bin

ENV STORE_DIR=/data
VOLUME ["/data"]
EXPOSE 8787
CMD ["node", "js/bin/meta-sovereign.js", "serve", "--port=8787", "--store=/data"]
