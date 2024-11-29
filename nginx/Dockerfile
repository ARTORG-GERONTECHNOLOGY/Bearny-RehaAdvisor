FROM nginx:stable-alpine

RUN rm /etc/nginx/conf.d/default.conf

COPY /include.forwarded /etc/nginx/app/include.forwarded
COPY /nginx.conf /etc/nginx/conf.d