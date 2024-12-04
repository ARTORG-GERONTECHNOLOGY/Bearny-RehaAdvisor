#FROM nginx:stable-alpine

#RUN rm /etc/nginx/conf.d/default.conf

#COPY /include.websocket /etc/nginx/app/include.websocket
#COPY /include.forwarded /etc/nginx/app/include.forwarded
#COPY /nginx.conf /etc/nginx/conf.d


FROM nginx:stable-alpine
RUN rm /etc/nginx/conf.d/default.conf


# Copy NGINX dev config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Config for logs
COPY log.conf /etc/nginx/log.conf


COPY /include.websocket /etc/nginx/app/include.websocket
COPY /include.forwarded /etc/nginx/app/include.forwarded
#COPY /nginx.conf /etc/nginx/conf.d
