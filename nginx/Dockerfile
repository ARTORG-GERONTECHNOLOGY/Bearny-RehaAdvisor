
# Nginx Dockerfile based on Ubuntu
FROM ubuntu:20.04
LABEL authors="nooraangelva"

# Install Nginx
RUN apt-get update && apt-get install -y nginx

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Expose the port
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
