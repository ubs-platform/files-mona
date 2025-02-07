FROM node:22.5.1-alpine as build
WORKDIR /app
# COPY package.json  package-lock.json ./
COPY . ./
# RUN yarn install
RUN npx --yes nx run ubs-files-mona:build --skip-nx-cache

FROM node:22.5.1-alpine
WORKDIR /app
COPY --from=build /app/dist/apps/ubs-files-mona /app
COPY --from=build /app/node_modules /app/node_modules
EXPOSE 3000
CMD ["node", "/app/main.js"]
