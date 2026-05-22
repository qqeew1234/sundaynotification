# 1단계: 빌드용 컨테이너 (정식 지원되는 Azul Zulu 자바 24 이미지 사용)
FROM azul/zulu-openjdk-alpine:24-latest AS build
WORKDIR /app
COPY . .

# 리눅스 환경에서 gradlew가 실행될 수 있도록 권한 부여
RUN chmod +x ./gradlew

# Render의 메모리 제한을 고려하고, 그래들 툴체인이 자바 24를 즉시 인식하도록 빌드 진행
RUN ./gradlew clean bootJar --no-daemon

# 2단계: 실행용 컨테이너 (앱 구동을 위한 자바 24 경량화 환경)
FROM azul/zulu-openjdk-alpine:24-jre-latest
WORKDIR /app

# 빌드 스테이지에서 생성된 최종 jar 파일만 복사
COPY --from=build /app/build/libs/*.jar app.jar

# Render가 동적으로 부여하는 포트에 바인딩하여 실행
ENTRYPOINT ["sh", "-c", "java -jar app.jar --server.port=$PORT"]