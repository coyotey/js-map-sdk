#!/bin/bash

# build the docs
npm run docs

# commit
git add API.md
git commit -m "chore: update docs for latest version"

# bump version based on commit history
npm run standard-version
