FROM node:26.12.1-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797

RUN apk add --no-cache iptables
COPY docker/cloud-egress.sh /usr/local/bin/cloud-egress
ENTRYPOINT ["/bin/sh", "/usr/local/bin/cloud-egress"]
