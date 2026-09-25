# One image with the web app and the API. The API serves the built web app, so there is one URL.
# Build:  docker build --build-arg VITE_GOOGLE_CLIENT_ID=... -t khanan-rakshak .
# Run:    docker run -p 5002:5002 -e DATABASE_URL=... -e JWT_SECRET=... -e GOOGLE_CLIENT_ID=... khanan-rakshak

FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

# The Google client ID is baked into the web app when it is built.
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

COPY client/package.json client/package-lock.json client/
RUN npm ci --prefix client
COPY server/package.json server/package-lock.json server/
RUN npm ci --prefix server

COPY client client
COPY server server
RUN npm run build --prefix client && npm run build --prefix server && npm prune --omit=dev --prefix server

FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=5002
COPY --from=build /app/client/dist client/dist
COPY --from=build /app/server/package.json server/
COPY --from=build /app/server/node_modules server/node_modules
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/prisma server/prisma
EXPOSE 5002
WORKDIR /app/server
# Applies any new database migrations, then starts the API.
CMD ["npm", "run", "start:prod"]
