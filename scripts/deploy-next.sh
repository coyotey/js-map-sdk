#!/bin/bash

# push to cdn
# WARNING: Do not use this build for production. Breaking changes could be released here at any time.
aws s3 cp ./dist/airmap.map.js s3://cdn.airmap.io/js/maps/next/airmap.map.js --acl=public-read --profile default
aws s3 cp ./dist/airmap.map.min.js s3://cdn.airmap.io/js/maps/next/airmap.map.min.js --acl=public-read --profile default

# issue cache invalidation
CLOUDFRONT_DISTRIBUTION=$( sed -n -e '/CLOUDFRONT_DISTRIBUTION/ s/.*\= *//p' .env )
if [ -z ${CLOUDFRONT_DISTRIBUTION} ]; then
  echo "No ID set in .env for CLOUDFRONT_DISTRIBUTION. Skipping cache invalidation.";
else
  aws cloudfront create-invalidation --distribution-id ${CLOUDFRONT_DISTRIBUTION} --paths "/js/maps/next/*";
fi
