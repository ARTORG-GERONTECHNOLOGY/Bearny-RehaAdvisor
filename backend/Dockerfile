
# Backend Dockerfile with Ubuntu and Anaconda for Python Management
FROM ubuntu:20.04

LABEL authors="nooraangelva"

# Install necessary packages
RUN apt-get update && \
    apt-get install -y wget bzip2 && \
    apt-get clean

# Install Anaconda
RUN wget https://repo.anaconda.com/archive/Anaconda3-2021.11-Linux-x86_64.sh && \
    bash Anaconda3-2021.11-Linux-x86_64.sh -b && \
    rm Anaconda3-2021.11-Linux-x86_64.sh

# Set PATH to Anaconda
ENV PATH /root/anaconda3/bin:$PATH

# Install MongoDB dependencies
RUN conda install pymongo

# Set working directory
WORKDIR /backend

# Copy environment.yml for conda
COPY environment.yml /backend/
RUN conda env create -f environment.yml

# Activate the environment
SHELL ["conda", "run", "-n", "webapp", "/bin/bash", "-c"]

# Copy project files
COPY . /backend/

# Expose the Django default port
EXPOSE 800
