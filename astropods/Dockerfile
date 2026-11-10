# Money Lego assistant as an Astropods agent (see astropods/agent.mts and astropods.yml).
# Runs the app's own server code with tsx; no Next.js build is needed for the agent.
# Per the Astropods guide: run as root (no USER switch) and EXPOSE 80.
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
# The app's dependencies including dev (tsx runs the agent), then the two Astropods packages,
# which only install cleanly on Linux, so they live in the image, not package.json.
# NODE_ENV is set only afterwards: under production npm would prune tsx.
RUN npm ci --include=dev --no-audit --no-fund \
 && npm install --no-save --include=dev --no-audit --no-fund @astropods/adapter-core@0.15.1 @astropods/messaging@0.4.0 \
 && npm cache clean --force \
 && test -x node_modules/.bin/tsx

COPY tsconfig.json ./
COPY lib ./lib
COPY server ./server
COPY astropods ./astropods

ENV NODE_ENV=production
EXPOSE 80
CMD ["node_modules/.bin/tsx", "--conditions=react-server", "astropods/agent.mts"]
