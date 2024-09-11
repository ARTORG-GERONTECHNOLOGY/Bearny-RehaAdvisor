
# Backend Dockerfile with Ubuntu and Anaconda for Python Management
FROM ubuntu:20.04

LABEL authors="nooraangelva"
ARG TARGETARCH

# Install necessary packages
RUN apt-get update && \
    apt-get -y install wget libgl1-mesa-glx libegl1-mesa libxrandr2 libxrandr2 libxss1 libxcursor1 libxcomposite1 libasound2 libxi6 libxtst6 && \
    apt-get clean

# Download and install Anaconda
RUN wget --quiet https://repo.anaconda.com/archive/Anaconda3-2024.06-1-Linux-aarch64.sh -O /tmp/anaconda.sh && \
    bash /tmp/anaconda.sh -b && \
    rm /tmp/anaconda.sh

# Set PATH to Anaconda
ENV PATH /root/anaconda3/bin:$PATH

RUN source activate base

# Install MongoDB dependencies
RUN conda install pymongo

# Set working directory
WORKDIR /backend

# Copy environment.yml for conda
COPY environment.yml /backend/
RUN conda env create -f environment.yml

# Activate the environment
SHELL ["conda", "run", "-n", "teleRehabApp", "/bin/bash", "-c"]

# Copy project files
COPY . /backend/

# Expose the Django default port
EXPOSE 800
