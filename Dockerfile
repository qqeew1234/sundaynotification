# 1단계: 빌드용 컨테이너 (Gradle 빌드 실행)
FROM openjdk:17-jdk-slim AS build
WORKDIR /app
COPY . .
# 리눅스 환경에서 gradlew가 실행될 수 있도록 권한 부여
RUN chmod +x ./gradlew
# Render의 메모리 제한을 고려하여 안전하게 빌드 진행
RUN ./gradlew clean bootJar --no-daemon

# 2단계: 실행용 컨테이너 (최종 이미지 크기 최소화)
FROM openjdk:17-jdk-slim
WORKDIR /app
# 빌드 스테이지에서 생성된 jar 파일만 쏙 빼오기
COPY --from=build /app/build/libs/*.jar app.jar
# Render가 동적으로 부여하는 포트에 바인딩
ENTRYPOINT ["sh", "-c", "java -jar app.jar --server.port=$PORT"]