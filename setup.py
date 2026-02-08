"""
py2app build configuration for Kindle Sender.

Usage (run from this directory):
    python setup.py py2app

The built app will be in dist/Kindle Sender.app
"""

from setuptools import setup

APP = ["app.py"]
APP_NAME = "Kindle Sender"

DATA_FILES = [
    ("templates", ["templates/index.html"]),
]

OPTIONS = {
    "argv_emulation": False,
    "iconfile": "icon.icns",
    "plist": {
        "CFBundleName": APP_NAME,
        "CFBundleDisplayName": APP_NAME,
        "CFBundleIdentifier": "com.irfan.kindle-sender",
        "CFBundleVersion": "1.0.0",
        "CFBundleShortVersionString": "1.0",
        "LSMinimumSystemVersion": "12.0",
        "NSHighResolutionCapable": True,
        "LSUIElement": False,
    },
    "packages": [
        "flask",
        "trafilatura",
        "ebooklib",
        "jinja2",
        "lxml",
        "certifi",
        "charset_normalizer",
        "lxml_html_clean",
    ],
    "includes": [
        "lxml.html.clean",
        "lxml._elementpath",
        "charset_normalizer.md__mypyc",
    ],
}

setup(
    name=APP_NAME,
    app=APP,
    data_files=DATA_FILES,
    options={"py2app": OPTIONS},
    setup_requires=["py2app"],
)
