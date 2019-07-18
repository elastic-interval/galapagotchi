#!/bin/sh

set -x

cd fabric
yarn
yarn asbuild:optimized
cd ../client
yarn
yarn build:prod
docker-compose up --build -d
