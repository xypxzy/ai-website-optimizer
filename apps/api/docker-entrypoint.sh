#!/bin/sh
set -e

echo "Выполняем миграции Prisma..."
cd /app/apps/api && npx prisma migrate deploy

echo "Запускаем приложение..."
cd /app && exec node apps/api/dist/main.js