FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --registry=https://mirrors.huaweicloud.com/repository/npm/

COPY . .
ARG VITE_API_BASE_URL=/api
ARG VITE_APP_VERSION=dev
ARG VITE_BUILD_DATE=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_APP_VERSION=${VITE_APP_VERSION}
ENV VITE_BUILD_DATE=${VITE_BUILD_DATE}
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
