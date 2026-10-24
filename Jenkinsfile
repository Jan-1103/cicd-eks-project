pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '10'))
  }

  // A new commit on GitHub is detected within 1 minute and the pipeline starts automatically
  triggers { pollSCM('* * * * *') }

  parameters {
    booleanParam(name: 'RUN_QUALITY_GATE', defaultValue: false,
                 description: 'Tick to make the pipeline wait for the SonarQube Quality Gate')
  }

  environment {
    AWS_REGION            = 'ap-south-1'
    CLUSTER_NAME          = 'cicd-eks-cluster'
    NAMESPACE             = 'cicd-app'
    SONAR_SERVER_NAME     = 'sonarqube'          // must match Manage Jenkins > System > SonarQube servers > Name
    BACKEND_REPO          = 'cicd-backend'
    FRONTEND_REPO         = 'cicd-frontend'

    // Jenkins credentials (nothing is hardcoded in Git)
    AWS_CREDS             = credentials('aws-creds')       // Username with password: access key id / secret key
    AWS_ACCESS_KEY_ID     = "${AWS_CREDS_USR}"
    AWS_SECRET_ACCESS_KEY = "${AWS_CREDS_PSW}"
    DB_PASSWORD           = credentials('db-password')     // Secret text
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
        sh 'git log -1 --oneline'
      }
    }

    stage('Build') {
      steps {
        dir('backend') {
          sh 'node --version && npm --version'
          sh 'npm install'
        }
      }
    }

    stage('Test') {
      steps {
        dir('backend') {
          sh 'npm test'
        }
      }
    }

    stage('SonarQube Analysis') {
      steps {
        withSonarQubeEnv("${SONAR_SERVER_NAME}") {
          sh '''
            sonar-scanner \
              -Dsonar.host.url="$SONAR_HOST_URL" \
              -Dsonar.token="$SONAR_AUTH_TOKEN"
          '''
        }
      }
    }

    stage('Quality Gate') {
      when { expression { params.RUN_QUALITY_GATE } }
      steps {
        timeout(time: 5, unit: 'MINUTES') {
          waitForQualityGate abortPipeline: true
        }
      }
    }

    stage('Docker Build') {
      steps {
        sh '''
          docker build -t local-backend:${BUILD_NUMBER}  ./backend
          docker build -t local-frontend:${BUILD_NUMBER} ./frontend
        '''
      }
    }

    stage('Trivy Scan') {
      steps {
        sh '''
          # full report (HIGH + CRITICAL) saved as proof
          trivy image --no-progress --severity HIGH,CRITICAL --ignore-unfixed --exit-code 0 \
            --format table -o trivy-backend.txt  local-backend:${BUILD_NUMBER}
          trivy image --no-progress --severity HIGH,CRITICAL --ignore-unfixed --exit-code 0 \
            --format table -o trivy-frontend.txt local-frontend:${BUILD_NUMBER}
          cat trivy-backend.txt trivy-frontend.txt

          # gate: fail the pipeline if any fixable CRITICAL vulnerability exists
          trivy image --no-progress --severity CRITICAL --ignore-unfixed --exit-code 1 local-backend:${BUILD_NUMBER}
          trivy image --no-progress --severity CRITICAL --ignore-unfixed --exit-code 1 local-frontend:${BUILD_NUMBER}
        '''
      }
      post {
        always { archiveArtifacts artifacts: 'trivy-*.txt', allowEmptyArchive: true }
      }
    }

    stage('Image Versioning') {
      steps {
        script {
          env.IMAGE_TAG = "${env.BUILD_NUMBER}-${env.GIT_COMMIT.take(7)}"
        }
        sh '''
          ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
          ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
          docker tag local-backend:${BUILD_NUMBER}  ${ECR_REGISTRY}/${BACKEND_REPO}:${IMAGE_TAG}
          docker tag local-backend:${BUILD_NUMBER}  ${ECR_REGISTRY}/${BACKEND_REPO}:latest
          docker tag local-frontend:${BUILD_NUMBER} ${ECR_REGISTRY}/${FRONTEND_REPO}:${IMAGE_TAG}
          docker tag local-frontend:${BUILD_NUMBER} ${ECR_REGISTRY}/${FRONTEND_REPO}:latest
          echo "Image version = ${IMAGE_TAG}"
        '''
      }
    }

    stage('Push to ECR') {
      steps {
        sh '''
          ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
          ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

          for REPO in ${BACKEND_REPO} ${FRONTEND_REPO}; do
            aws ecr describe-repositories --repository-names $REPO --region ${AWS_REGION} >/dev/null 2>&1 || \
              aws ecr create-repository --repository-name $REPO --region ${AWS_REGION} >/dev/null
          done

          aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}

          docker push ${ECR_REGISTRY}/${BACKEND_REPO}:${IMAGE_TAG}
          docker push ${ECR_REGISTRY}/${BACKEND_REPO}:latest
          docker push ${ECR_REGISTRY}/${FRONTEND_REPO}:${IMAGE_TAG}
          docker push ${ECR_REGISTRY}/${FRONTEND_REPO}:latest
        '''
      }
    }

    stage('EKS Deployment') {
      steps {
        sh '''
          ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
          ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

          aws eks update-kubeconfig --name ${CLUSTER_NAME} --region ${AWS_REGION}

          kubectl apply -f k8s/namespace.yaml
          kubectl apply -f k8s/configmap.yaml

          # Secret is created from the Jenkins credential, never stored in Git
          kubectl -n ${NAMESPACE} create secret generic db-secret \
            --from-literal=DB_PASSWORD="${DB_PASSWORD}" --dry-run=client -o yaml | kubectl apply -f -

          mkdir -p rendered
          for f in db backend frontend; do
            sed -e "s|IMAGE_BACKEND|${ECR_REGISTRY}/${BACKEND_REPO}:${IMAGE_TAG}|g" \
                -e "s|IMAGE_FRONTEND|${ECR_REGISTRY}/${FRONTEND_REPO}:${IMAGE_TAG}|g" \
                -e "s|IMAGE_TAG|${IMAGE_TAG}|g" k8s/$f.yaml > rendered/$f.yaml
          done

          kubectl apply -f rendered/db.yaml
          kubectl -n ${NAMESPACE} rollout status deployment/db --timeout=300s
          kubectl apply -f rendered/backend.yaml
          kubectl apply -f rendered/frontend.yaml
        '''
      }
    }

    stage('Deployment Validation') {
      steps {
        sh '''
          kubectl -n ${NAMESPACE} rollout status deployment/backend  --timeout=300s
          kubectl -n ${NAMESPACE} rollout status deployment/frontend --timeout=300s
          kubectl -n ${NAMESPACE} get pods -o wide
          kubectl -n ${NAMESPACE} get deployments -o wide

          LB=""
          for i in $(seq 1 40); do
            LB=$(kubectl -n ${NAMESPACE} get svc frontend -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
            if [ -n "$LB" ]; then break; fi
            echo "Waiting for load balancer..."; sleep 10
          done
          echo "APPLICATION URL: http://$LB"

          for i in $(seq 1 40); do
            if curl -fsS --max-time 10 "http://$LB/api/health" | tee /tmp/health.json | grep -q '"status":"ok"'; then
              echo "VALIDATION PASSED:"; cat /tmp/health.json; echo
              curl -fsS "http://$LB/api/message"; echo
              exit 0
            fi
            echo "App not ready yet, retrying..."; sleep 10
          done
          echo "VALIDATION FAILED"; exit 1
        '''
      }
    }
  }

  post {
    success { echo "SUCCESS: version ${env.IMAGE_TAG} built, scanned, pushed to ECR and deployed to EKS." }
    failure { echo 'FAILED: check the stage that is red.' }
  }
}
