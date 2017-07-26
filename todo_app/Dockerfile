FROM    node:alpine
WORKDIR /opt/app
COPY    todo .
RUN     npm install && \
        npm cache clean --force
EXPOSE  8080
CMD     ["npm", "start"]