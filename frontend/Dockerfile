# Use Ubuntu as the base image
FROM ubuntu:22.04
LABEL authors="nooraangelva"
# Install Node.js and npm
# Set environment variables
ENV NODE_VERSION=18.x
# set work directory
WORKDIR /srv/app/
# Install Node.js, npm, and other necessary packages
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION} | bash - && \
    apt-get install -y nodejs && \
    apt-get install -y build-essential && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*


# add to $PATH
ENV PATH /srv/app/node_modules/.bin:$PATH

# install app dependencies
COPY package.json package-lock.json ./
RUN npm install

# add app
COPY . ./
CMD ["npm", "start"]