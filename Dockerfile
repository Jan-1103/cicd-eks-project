FROM jenkins/jenkins:lts-jdk17
USER root

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl unzip ca-certificates gnupg jq nodejs npm \
    && rm -rf /var/lib/apt/lists/*

# docker CLI (talks to Docker Desktop through /var/run/docker.sock)
RUN ARCH=$(uname -m) \
    && curl -fsSL https://download.docker.com/linux/static/stable/${ARCH}/docker-27.3.1.tgz | tar xz -C /tmp \
    && mv /tmp/docker/docker /usr/local/bin/docker && rm -rf /tmp/docker

# AWS CLI v2
RUN ARCH=$(uname -m) \
    && curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-${ARCH}.zip" -o /tmp/awscli.zip \
    && unzip -q /tmp/awscli.zip -d /tmp && /tmp/aws/install && rm -rf /tmp/aws /tmp/awscli.zip

# kubectl
RUN ARCH=$(dpkg --print-architecture) \
    && curl -fsSLo /usr/local/bin/kubectl "https://dl.k8s.io/release/$(curl -fsSL https://dl.k8s.io/release/stable.txt)/bin/linux/${ARCH}/kubectl" \
    && chmod +x /usr/local/bin/kubectl

# Trivy
RUN curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin

# SonarScanner CLI (uses the JDK already in the Jenkins image)
RUN curl -fsSLo /tmp/scanner.zip https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-6.2.1.4610.zip \
    && unzip -q /tmp/scanner.zip -d /opt && mv /opt/sonar-scanner-* /opt/sonar-scanner \
    && ln -s /opt/sonar-scanner/bin/sonar-scanner /usr/local/bin/sonar-scanner && rm /tmp/scanner.zip

# run as root so Jenkins can use the docker socket (fine for a college lab)
USER root
