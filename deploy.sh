#!/bin/sh

set -x

cd fabric
yarn
yarn build:prod

cd ../client
yarn
yarn build:prod

# uncomment once the site is up again
# docker-compose up --build -d
