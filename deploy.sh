#!/bin/bash

set -e
set -x
set -u

check_prerequisites() {
    if [ -z "$TARGET_ENVIRONMENT" ]; then
        die "Enter a value for the environment (-e)."
    fi
}

while [[ $# != 0 ]]; do
    case "$1" in
    -x | --echo) # enable echo
        set -x
        ;;
    -e)
        TARGET_ENVIRONMENT="$2"
        shift
        ;;
    *)
        main
        ;;
    esac
    shift
done

check_prerequisites

az login --service-principal -u "${AZURE_CLIENT_ID}" -p "${AZURE_CLIENT_SECRET}" --tenant "${AZURE_TENANT_ID}"
az account set --subscription "${AZURE_SUBSCRIPTION_ID}"
az aks get-credentials -g ${AZURE_RESOURCE_GROUP} -n ${AZURE_AKS} --admin

CHART_VERSION=$(cat chart-version.txt)

helm upgrade --install backbone oci://ghcr.io/nmshd/backbone-helm-chart --version ${CHART_VERSION} -f values.${TARGET_ENVIRONMENT}.yaml
