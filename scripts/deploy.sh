#!/bin/bash

# patch version (1.0.0)
PACKAGE_VERSION_PATCH=$( sed -n 's/.*"version": "\(.*\)",/\1/p' package.json )
# minor version (v1.0)
PACKAGE_VERSION_MINOR=$( echo ${PACKAGE_VERSION_PATCH} | awk -F'.' '{print "v"$1"."$2}' )

# push to cdn
aws s3 cp ./dist/airmap.map.js s3://cdn.airmap.io/js/maps/${PACKAGE_VERSION_PATCH}/airmap.map.js --acl=public-read --profile default
aws s3 cp ./dist/airmap.map.js s3://cdn.airmap.io/js/maps/${PACKAGE_VERSION_MINOR}/airmap.map.js --acl=public-read --profile default
aws s3 cp ./dist/airmap.map.min.js s3://cdn.airmap.io/js/maps/${PACKAGE_VERSION_PATCH}/airmap.map.min.js --acl=public-read --profile default
aws s3 cp ./dist/airmap.map.min.js s3://cdn.airmap.io/js/maps/${PACKAGE_VERSION_MINOR}/airmap.map.min.js --acl=public-read --profile default

# issue cache invalidation for the minor version
CLOUDFRONT_DISTRIBUTION=$( sed -n -e '/CLOUDFRONT_DISTRIBUTION/ s/.*\= *//p' .env )
if [ -z ${CLOUDFRONT_DISTRIBUTION} ]; then
  echo "No ID set in .env for CLOUDFRONT_DISTRIBUTION. Skipping cache invalidation.";
else
  aws cloudfront create-invalidation --distribution-id ${CLOUDFRONT_DISTRIBUTION} --paths "/js/maps/${PACKAGE_VERSION_MINOR}/*";
fi
