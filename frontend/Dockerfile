# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies in a separate layer for repeatable cached builds.
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runner

# The runtime script writes runtime-config.js from Kubernetes-provided env vars.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh

COPY --from=build /app/dist /usr/share/nginx/html
COPY public/runtime-config.js /usr/share/nginx/html/runtime-config.js

RUN chown -R nginx:nginx \
    /usr/share/nginx/html \
    /var/cache/nginx \
    /var/log/nginx \
    /var/run \
    /etc/nginx/conf.d

USER nginx

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
