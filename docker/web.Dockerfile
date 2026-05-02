# Web/API microservice (R-F7).
# Runs `meta-sovereign serve` against a mounted data volume.
FROM node:20-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY src ./src
COPY bin ./bin

ENV STORE_DIR=/data
VOLUME ["/data"]
EXPOSE 8787
CMD ["node", "bin/meta-sovereign.js", "serve", "--port=8787", "--store=/data"]
