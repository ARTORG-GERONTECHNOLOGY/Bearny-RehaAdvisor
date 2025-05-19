from django.http import HttpResponse


def index(request):
    return HttpResponse("<h1>Hello and welcome to my <u>Django App</u> project!</h1>")


