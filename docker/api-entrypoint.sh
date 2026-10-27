#!/bin/sh
# API container entrypoint: migrate → (optionally) seed a fresh database → start.
set -e

echo "==> prisma migrate deploy"
npx prisma migrate deploy

if [ "$SEED_ON_BOOT" = "true" ]; then
  # Seed only a genuinely empty database (idempotent-safe): the seed itself is
  # append-only, but a fresh-install check keeps restarts fast and predictable.
  EMPTY=$(node -e 'const {PrismaClient}=require("@prisma/client");const p=new PrismaClient();p.country.count().then(c=>{console.log(c===0?"1":"0");return p.$disconnect()}).catch(()=>{console.log("0");process.exit(0)})')
  if [ "$EMPTY" = "1" ]; then
    echo "==> empty database — seeding world (54 countries, orgs, bots, demos)"
    node /app/seed-dist/seed.js
  else
    echo "==> database already populated — skipping seed"
  fi
fi

exec node dist/apps/api/src/main.js
