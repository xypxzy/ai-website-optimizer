FROM node:20-alpine AS builder

WORKDIR /app

# Копируем только package.json файлы сначала
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/

# Устанавливаем все зависимости
RUN npm ci

# Копируем весь код
COPY . .

# Сборка API
RUN npm run build:api

FROM node:20-alpine AS runner

WORKDIR /app

# Устанавливаем инструменты для сборки нативных модулей
RUN apk add --no-cache python3 make g++

# Копируем package.json файлы
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/

# Устанавливаем зависимости
# Дополнительно устанавливаем @nestjs/platform-express для решения проблемы с HTTP-драйвером
RUN npm ci --only=production && \
    npm install @nestjs/platform-express

# Копируем скомпилированный код и Prisma схему
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

# Генерируем Prisma клиент
WORKDIR /app/apps/api
RUN npx prisma generate

WORKDIR /app

ENV NODE_ENV production
ENV PORT 3000
ENV JWT_SECRET yourjwtsecretkey

EXPOSE 3000

CMD [ "node", "apps/api/dist/main.js" ]