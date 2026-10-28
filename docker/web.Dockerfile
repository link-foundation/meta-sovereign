# Web/API microservice (R-F7).
# Runs `meta-sovereign serve` against a mounted data volume.
FROM node:26.12.1-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --global npm@12.2.1 && npm ci --omit=dev
COPY js/src ./js/src
COPY js/bin ./js/bin

ENV STORE_DIR=/data
VOLUME ["/data"]
EXPOSE 8787
CMD ["node", "js/bin/meta-sovereign.js", "serve", "--port=8787", "--store=/data"]
