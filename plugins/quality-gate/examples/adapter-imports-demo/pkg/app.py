import os

from .helpers import parse


def run():
    return parse(os.environ.get("HOST"))
