FROM     node:alpine
WORKDIR  /opt/app
COPY     . .
RUN      npm install && \
		 npm cache clean --force
CMD      ["npm","start"]