FROM node:20-alpine AS builder

WORKDIR /app

# Установка зависимостей для сборки
RUN apk add --no-cache python3 make g++

# Копируем package.json файлы сначала
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/

# Устанавливаем все зависимости
RUN npm ci

# Копируем весь код
COPY . .

# Сборка API
RUN npm run build:api

FROM node:20-alpine AS runner

# Установка Chromium и зависимостей для Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-emoji \
    python3 \
    make \
    g++

# Настраиваем переменные среды для Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Копируем package.json файлы
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/

# Устанавливаем зависимости
RUN npm ci --only=production && \
    npm install @nestjs/platform-express

# Копируем скомпилированный код, Prisma схему и .env файл
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
# COPY --from=builder /app/.env ./.env
COPY --from=builder /app/apps/api/.env ./apps/api/.env

# Создаем директорию для скриншотов
RUN mkdir -p uploads/screenshots && chmod -R 777 uploads

# Генерируем Prisma клиент
WORKDIR /app/apps/api
RUN npx prisma generate

WORKDIR /app

ENV NODE_ENV production
ENV PORT 3000
ENV JWT_SECRET yourjwtsecretkey

EXPOSE 3000

CMD [ "node", "apps/api/dist/main.js" ]