# 1단계: 빌드용 컨테이너 (Java 25 완벽 지원 최신 환경)
FROM openjdk:25-ea-jdk-slim AS build
WORKDIR /app
COPY . .
# 리눅스 환경에서 gradlew 실행 권한 부여
RUN chmod +x ./gradlew
# Render 무료 플랜 메모리 한계를 고려하여 빌드 진행
RUN ./gradlew clean bootJar --no-daemon

# 2단계: 실행용 컨테이너
FROM openjdk:25-ea-slim
WORKDIR /app
# 빌드 컨테이너에서 완성된 jar 파일만 복사
COPY --from=build /app/build/libs/*.jar app.jar
# Render 동적 포트 바인딩
ENTRYPOINT ["sh", "-c", "java -jar app.jar --server.port=$PORT"]