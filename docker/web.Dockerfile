# Web/API microservice (R-F7).
# Runs `meta-sovereign serve` against a mounted data volume.
FROM node:26.13.1-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS web

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --global npm@12.2.1 && npm ci --omit=dev
COPY js/src ./js/src
COPY js/bin ./js/bin
RUN install -d -o node -g node -m 0700 /data

ENV STORE_DIR=/data
VOLUME ["/data"]
EXPOSE 8787
CMD ["node", "js/bin/meta-sovereign.js", "serve", "--port=8787", "--store=/data"]
