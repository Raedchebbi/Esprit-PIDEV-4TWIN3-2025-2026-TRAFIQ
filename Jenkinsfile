pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  parameters {
    choice(name: 'COMPONENT', choices: ['backend', 'frontend', 'ai-engine', 'all'], description: 'Component to run through the pipeline')
    booleanParam(name: 'RUN_TESTS', defaultValue: true, description: 'Run unit tests')
    booleanParam(name: 'RUN_SONAR', defaultValue: false, description: 'Run SonarQube scans when Jenkins Sonar credentials are configured')
    booleanParam(name: 'BUILD_DOCKER', defaultValue: false, description: 'Build Docker images')
    booleanParam(name: 'PUSH_DOCKER', defaultValue: false, description: 'Push Docker images to Docker Hub')
    booleanParam(name: 'DEPLOY_K8S', defaultValue: false, description: 'Apply Kubernetes manifests and update workloads')
  }

  environment {
    DOCKER_REGISTRY = 'docker.io'
    DOCKER_NAMESPACE = 'mohamedkhalil26'
    BACKEND_IMAGE = 'trafiq-backend'
    FRONTEND_IMAGE = 'trafiq-frontend'
    AI_IMAGE = 'trafiq-ai-engine'
    KUBE_NAMESPACE = 'trafiq'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        script {
          env.IMAGE_TAG = sh(returnStdout: true, script: 'git rev-parse --short HEAD').trim()
        }
      }
    }

    stage('Backend Install') {
      when { expression { shouldRun('backend') } }
      steps {
        dir('backend/server') {
          sh 'npm ci'
        }
      }
    }

    stage('Backend Lint / Test / Build') {
      when { expression { shouldRun('backend') } }
      steps {
        dir('backend/server') {
          sh 'npm run lint'
          script {
            if (params.RUN_TESTS) {
              sh 'npm run test -- --runInBand'
            }
          }
          sh 'npm run build'
        }
      }
    }

    stage('Frontend Install') {
      when { expression { shouldRun('frontend') } }
      steps {
        dir('frontend') {
          sh 'npm ci'
        }
      }
    }

    stage('Frontend Lint / Test / Build') {
      when { expression { shouldRun('frontend') } }
      steps {
        dir('frontend') {
          sh 'npm run lint'
          script {
            if (params.RUN_TESTS) {
              sh 'npm run test'
            }
          }
          sh 'npm run build'
        }
      }
    }

    stage('AI Engine Validate') {
      when { expression { shouldRun('ai-engine') } }
      steps {
        dir('backend/ai-engine') {
          sh 'python -m py_compile detect_video.py prompts.py'
          sh 'python -m json.tool cameras.json > /tmp/trafiq-cameras.json'
        }
      }
    }

    stage('SonarQube Scan') {
      when { expression { return params.RUN_SONAR } }
      environment {
        SONAR_TOKEN = credentials('sonar-token')
      }
      steps {
        withSonarQubeEnv('SonarQube') {
          script {
            if (shouldRun('backend')) {
              sh '''
                sonar-scanner \
                  -Dproject.settings=sonar-project.properties \
                  -Dsonar.projectKey=trafiq-backend \
                  -Dsonar.projectName=TRAFIQ-Backend \
                  -Dsonar.sources=backend/server/src \
                  -Dsonar.tests=backend/server/src,backend/server/test \
                  -Dsonar.test.inclusions=backend/server/src/**/*.spec.ts,backend/server/test/**/*.ts \
                  -Dsonar.javascript.lcov.reportPaths=backend/server/coverage/lcov.info
              '''
            }
            if (shouldRun('frontend')) {
              sh '''
                sonar-scanner \
                  -Dproject.settings=sonar-project.properties \
                  -Dsonar.projectKey=trafiq-frontend \
                  -Dsonar.projectName=TRAFIQ-Frontend \
                  -Dsonar.sources=frontend/src \
                  -Dsonar.tests=frontend/src \
                  -Dsonar.test.inclusions=frontend/src/**/*.test.js,frontend/src/**/*.test.jsx \
                  -Dsonar.javascript.lcov.reportPaths=frontend/coverage/lcov.info
              '''
            }
          }
        }
      }
    }

    stage('Docker Build') {
      when { expression { return params.BUILD_DOCKER } }
      steps {
        script {
          if (shouldRun('backend')) {
            sh "docker build -t ${DOCKER_REGISTRY}/${DOCKER_NAMESPACE}/${BACKEND_IMAGE}:${IMAGE_TAG} -f backend/server/Dockerfile backend"
          }
          if (shouldRun('frontend')) {
            sh "docker build -t ${DOCKER_REGISTRY}/${DOCKER_NAMESPACE}/${FRONTEND_IMAGE}:${IMAGE_TAG} -f frontend/Dockerfile frontend"
          }
          if (shouldRun('ai-engine')) {
            sh "docker build -t ${DOCKER_REGISTRY}/${DOCKER_NAMESPACE}/${AI_IMAGE}:${IMAGE_TAG} -f backend/ai-engine/Dockerfile backend/ai-engine"
          }
        }
      }
    }

    stage('Docker Push') {
      when { expression { return params.PUSH_DOCKER } }
      environment {
        DOCKERHUB_USERNAME = credentials('dockerhub-username')
        DOCKERHUB_TOKEN = credentials('dockerhub-token')
      }
      steps {
        sh 'echo "$DOCKERHUB_TOKEN" | docker login docker.io -u "$DOCKERHUB_USERNAME" --password-stdin'
        script {
          if (shouldRun('backend')) {
            sh "docker push ${DOCKER_REGISTRY}/${DOCKER_NAMESPACE}/${BACKEND_IMAGE}:${IMAGE_TAG}"
          }
          if (shouldRun('frontend')) {
            sh "docker push ${DOCKER_REGISTRY}/${DOCKER_NAMESPACE}/${FRONTEND_IMAGE}:${IMAGE_TAG}"
          }
          if (shouldRun('ai-engine')) {
            sh "docker push ${DOCKER_REGISTRY}/${DOCKER_NAMESPACE}/${AI_IMAGE}:${IMAGE_TAG}"
          }
        }
      }
    }

    stage('Kubernetes Deploy') {
      when { expression { return params.DEPLOY_K8S } }
      environment {
        KUBECONFIG_FILE = credentials('kubeconfig')
        JWT_SECRET = credentials('jwt-secret')
        AI_WS_TOKEN = credentials('ai-ws-token')
        MONGODB_URI = credentials('mongodb-uri')
        REDIS_PASSWORD = credentials('redis-password')
        INITIAL_SUPER_ADMIN_EMAIL = credentials('initial-super-admin-email')
        INITIAL_SUPER_ADMIN_PASSWORD = credentials('initial-super-admin-password')
        GROQ_API_KEY = credentials('groq-api-key')
      }
      steps {
        sh '''
          export KUBECONFIG="$KUBECONFIG_FILE"
          kubectl create namespace "$KUBE_NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
          kubectl apply -f k8s/configmap.yaml
          kubectl create secret generic trafiq-backend-secrets \
            --namespace "$KUBE_NAMESPACE" \
            --from-literal=JWT_SECRET="$JWT_SECRET" \
            --from-literal=AI_WS_TOKEN="$AI_WS_TOKEN" \
            --from-literal=MONGODB_URI="$MONGODB_URI" \
            --from-literal=REDIS_PASSWORD="$REDIS_PASSWORD" \
            --from-literal=INITIAL_SUPER_ADMIN_EMAIL="$INITIAL_SUPER_ADMIN_EMAIL" \
            --from-literal=INITIAL_SUPER_ADMIN_PASSWORD="$INITIAL_SUPER_ADMIN_PASSWORD" \
            --dry-run=client -o yaml | kubectl apply -f -
          kubectl create secret generic trafiq-ai-secrets \
            --namespace "$KUBE_NAMESPACE" \
            --from-literal=AI_WS_TOKEN="$AI_WS_TOKEN" \
            --from-literal=GROQ_API_KEY="$GROQ_API_KEY" \
            --dry-run=client -o yaml | kubectl apply -f -
          kubectl apply -f k8s/mongodb-deployment.yaml
          kubectl apply -f k8s/redis-deployment.yaml
        '''
        script {
          if (shouldRun('backend')) {
            sh '''
              export KUBECONFIG="$KUBECONFIG_FILE"
              kubectl apply -f k8s/backend-deployment.yaml
              kubectl set image deployment/trafiq-backend backend="${DOCKER_REGISTRY}/${DOCKER_NAMESPACE}/${BACKEND_IMAGE}:${IMAGE_TAG}" -n "$KUBE_NAMESPACE"
              kubectl rollout status deployment/trafiq-backend -n "$KUBE_NAMESPACE" --timeout=180s
            '''
          }
          if (shouldRun('ai-engine')) {
            sh '''
              export KUBECONFIG="$KUBECONFIG_FILE"
              kubectl apply -f k8s/ai-engine-deployment.yaml
              kubectl set image deployment/trafiq-ai-engine ai-engine="${DOCKER_REGISTRY}/${DOCKER_NAMESPACE}/${AI_IMAGE}:${IMAGE_TAG}" -n "$KUBE_NAMESPACE"
              kubectl rollout status deployment/trafiq-ai-engine -n "$KUBE_NAMESPACE" --timeout=180s
            '''
          }
          if (shouldRun('frontend')) {
            sh '''
              export KUBECONFIG="$KUBECONFIG_FILE"
              kubectl apply -f k8s/frontend-deployment.yaml
              kubectl set image deployment/trafiq-frontend frontend="${DOCKER_REGISTRY}/${DOCKER_NAMESPACE}/${FRONTEND_IMAGE}:${IMAGE_TAG}" -n "$KUBE_NAMESPACE"
              kubectl rollout status deployment/trafiq-frontend -n "$KUBE_NAMESPACE" --timeout=180s
            '''
          }
        }
        sh '''
          export KUBECONFIG="$KUBECONFIG_FILE"
          kubectl apply -f k8s/ingress.yaml
        '''
      }
    }
  }

  post {
    always {
      archiveArtifacts artifacts: 'backend/server/test-results/**/*.xml,frontend/test-results/**/*.xml', allowEmptyArchive: true
      junit allowEmptyResults: true, testResults: 'backend/server/test-results/**/*.xml,frontend/test-results/**/*.xml'
    }
  }
}

boolean shouldRun(String component) {
  return params.COMPONENT == 'all' || params.COMPONENT == component
}
