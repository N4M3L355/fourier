FROM node:10
WORKDIR /app
COPY package.json /app
RUN npm install
COPY . /app
RUN npm run build
CMD npm start
EXPOSE 3010:3010


