#!/bin/bash
if [ "$#" -lt 1 ]; then
    echo "$# is Illegal number of parameters."
    echo "Usage: $0 [image version]"
    echo "exampler: $0 [0.0.1]"
	exit 1
fi

docker build -f "${PWD}/Dockerfile.arm32v7" . -t sangsangfarm.azurecr.io/ig100:$1
docker push sangsangfarm.azurecr.io/ig100:$1
echo sangsangfarm.azurecr.io/ig100:$1 
echo docker image pushed 