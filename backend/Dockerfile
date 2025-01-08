# Use a base Ubuntu image
FROM ubuntu:22.04

# set work directory
WORKDIR /srv/app

# set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
# Activate conda environment and install dependencies

# Install necessary system packages
RUN apt-get update && \
    apt-get -y install build-essential wget curl bzip2 libpq-dev gcc && \
    apt-get clean

# Download and install Miniforge (similar to Anaconda, compatible with multiple architectures)
RUN wget --quiet https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O /opt/miniconda-installer.sh && bash /opt/miniconda-installer.sh -b -p /opt/conda

ENV PATH /opt/conda/bin:$PATH


COPY ./environment.yml .
RUN conda env create -f environment.yml
RUN echo "source activate teleRehabApp" > ~/.bashrc

ENV PATH /opt/conda/envs/teleRehabApp/bin:$PATH
# install dependencies
RUN pip install --upgrade pip
COPY ./requirements.txt .

# install temp dependencies for build of pyscopg2 etc
RUN pip install -r requirements.txt

# copy entrypoint.sh
#COPY ./entrypoint.sh .

# copy project
COPY . .

# run entrypoint.sh
#ENTRYPOINT ["/srv/app/entrypoint.sh"]

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
