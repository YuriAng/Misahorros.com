# Multi-stage build: stage 1 builds the Vite frontend, stage 2 is a slim
# production runtime that only ships server code, production deps, the
# migration files, and the built static assets (design.md "Docker /
# Deployment").

# ---- stage 1: build frontend -------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
# node:22-alpine ships npm 10.x, whose optional-peer-dependency resolution
# for the nested `vite@8` pulled in transitively by vitest disagrees with
# the npm 11.x that generated package-lock.json (it demands every
# @esbuild/* platform package for that nested optional peer). Match the
# lockfile-generating npm major version so `npm ci` reads it deterministically.
RUN npm install -g npm@11
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- stage 2: runtime ----------------------------------------------------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

RUN npm install -g npm@11
COPY package*.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY knexfile.js docker-entrypoint.sh ./
COPY --from=build /app/dist ./dist

RUN chmod +x docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
