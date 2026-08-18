# The repository has no emit step: tsx runs the service in development and it runs it here
# too. A compiled image is a later concern, see README, "Conventions".
FROM node:22-bookworm-slim

WORKDIR /app

# Manifests first, so a code change does not invalidate the install layer. The whole
# workspace root is copied because the lockfile spans both workspaces.
COPY package.json package-lock.json ./
COPY service/package.json service/
COPY web/package.json web/
RUN npm ci --omit=dev

COPY . .

# Created here, owned by the unprivileged user, because Docker initialises a fresh named
# volume from the image content at this path — including its ownership. Without this the
# volume belongs to root and the service cannot create `handouts/` in it.
RUN mkdir -p /var/lib/handout && chown node:node /var/lib/handout
USER node

ENV HOST=0.0.0.0 PORT=3000 HANDOUT_DATA_DIR=/var/lib/handout
EXPOSE 3000

# The image has no curl; Node's own fetch is enough, and health reports the schema rather
# than only an open socket.
HEALTHCHECK --interval=5s --timeout=5s --retries=24 \
  CMD node -e "fetch('http://127.0.0.1:3000/_handout/api/health').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "start"]
