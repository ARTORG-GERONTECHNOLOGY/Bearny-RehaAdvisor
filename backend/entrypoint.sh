#!/bin/sh


# Uncomment below to flush db e.g. after running tests
# Just make sure you really mean it 
# python manage.py flush --no-input

# We have base custom user model so need to makemigrations out of box
#python manage.py makemigrations core

#python manage.py migrate
#python manage.py collectstatic --noinput
#conda activate teleRehabApp
#python manage.py runserver 8000
#exec "$@"