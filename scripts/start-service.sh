#!/bin/sh
# start-service.sh

# Проверяем запускаемся ли мы в режиме воркера
if [ "$WORKER_ONLY" = "true" ]; then
  echo "Starting in worker mode"
  exec node apps/api/dist/worker.js
else
  echo "Starting API server"
  exec node apps/api/dist/main.js
fi