#!/bin/sh
npx playwright install
npx -y gh-star-gif \
    https://github.com/rse/ase \
    --out ./gh-star.gif \
    --message "Star this repo!" \
    --width 800 \
    --height 500 \
    --fps 15 \
    --scale 800 \
    --duration 4000
