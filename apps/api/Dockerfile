FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/*/package.json ./packages/*/

RUN npm ci 

COPY . .

RUN npm run build:api

FROM node:20-alpine AS runner

WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

RUN npm ci --only=production

ENV NODE_ENV production
ENV PORT 3000

EXPOSE 3000

CMD [ "node", "apps/api/dist/main.js" ]