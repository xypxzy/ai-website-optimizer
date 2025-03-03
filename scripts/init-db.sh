#!/bin/bash

echo "Ожидание запуска PostgreSQL..."
until docker exec postgres pg_isready -U postgres; do
  echo "Ждём PostgreSQL..."
  sleep 2
done

echo "PostgreSQL запущен, применяем миграции..."
docker exec -it api /bin/sh -c "cd /app/apps/api && npx prisma migrate deploy"