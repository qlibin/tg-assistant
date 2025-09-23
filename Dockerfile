# Docker image version should be in sync with the version used in package.json, otherwise playwright won't be able to locate the browser binaries
FROM mcr.microsoft.com/playwright:v1.54.1-jammy

# Install AWS Lambda Runtime Interface Client
RUN apt-get update && apt-get install -y \
    autoconf \
    cmake \
    g++ \
    libcurl4-openssl-dev \
    libtool \
    make \
    unzip \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean


# Define function directory
ARG FUNCTION_DIR="/function"

# Create function directory
RUN mkdir -p ${FUNCTION_DIR}

# Copy package files
COPY package.json package-lock.json ${FUNCTION_DIR}/

# Set working directory
WORKDIR ${FUNCTION_DIR}

# Install production dependencies
RUN npm install --production --ignore-scripts

# Copy pre-compiled JavaScript files from dist directory
COPY dist/ ${FUNCTION_DIR}/dist/

# Install AWS Lambda Runtime Interface Client
RUN npm install aws-lambda-ric

# Add the Lambda Runtime Interface Emulator
ADD https://github.com/aws/aws-lambda-runtime-interface-emulator/releases/latest/download/aws-lambda-rie /usr/bin/aws-lambda-rie
RUN chmod +x /usr/bin/aws-lambda-rie

# Copy entrypoint script
COPY entrypoint.sh /
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["dist/index.handler"]