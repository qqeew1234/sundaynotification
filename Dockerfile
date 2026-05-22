# 1단계: 빌드용 컨테이너 (프로젝트의 높은 자바 버전을 수용할 수 있도록 최신 버전 적용)
FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /app
COPY . .
# 리눅스 환경에서 gradlew가 실행될 수 있도록 권한 부여
RUN chmod +x ./gradlew
# Render의 메모리 제한을 고려하여 안전하게 빌드 진행
RUN ./gradlew clean bootJar --no-daemon

# 2단계: 실행용 컨테이너 (경량화된 alpine 실행 환경)
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
# 빌드 스테이지에서 생성된 jar 파일만 복사
COPY --from=build /app/build/libs/*.jar app.jar
# Render가 동적으로 부여하는 포트에 바인딩
ENTRYPOINT ["sh", "-c", "java -jar app.jar --server.port=$PORT"]