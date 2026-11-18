# Web/API microservice (R-F7).
# Runs `meta-sovereign serve` against a mounted data volume.
FROM node:26.13.0-alpine@sha256:8996bb5821d62a8fd9bb27c1cb07462f3fdce6e47d640c6a881ead0b064ce216

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --global npm@12.2.2 && npm ci --omit=dev
COPY js/src ./js/src
COPY js/bin ./js/bin

ENV STORE_DIR=/data
VOLUME ["/data"]
EXPOSE 8787
CMD ["node", "js/bin/meta-sovereign.js", "serve", "--port=8787", "--store=/data"]
