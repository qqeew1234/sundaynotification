# sundaynotification

메이플스토리 이벤트 공지 중 `썬데이` 또는 `일요일` 키워드가 포함된 최신 이벤트를 조회해 HTML 페이지로 보여주는 Kotlin/Spring Boot 애플리케이션입니다.

## 주요 기능

- Nexon Open API의 메이플스토리 이벤트 공지 목록 조회
- `썬데이`, `일요일` 키워드가 포함된 이벤트 필터링
- 최신 이벤트 1건의 상세 내용을 HTML로 렌더링
- 라이트/다크 모드에 대응하는 단일 페이지 제공
- Docker 기반 배포 지원

## 기술 스택

- Kotlin 2.3 (기존: 2.2.21)
- Spring Boot 4.0.6
- Gradle Kotlin DSL
- Java 24
- Docker

## 프로젝트 구조

```text
src/main/kotlin/io/yun/sundaynotification
├── SundaynotificationApplication.kt
├── MapleStoryNoticeController.kt
├── MapleStoryNoticeService.kt
└── EventNoticeDto.kt

src/main/resources
├── application.properties
├── templates/index.html
└── static
    ├── app.js
    ├── favicon.png
    └── style.css
```

## 실행 방법

### 로컬 실행

Windows:

```powershell
.\gradlew.bat bootRun
```

macOS/Linux:

```bash
./gradlew bootRun
```

기본 포트는 `8081`입니다.

```text
http://localhost:8081
```

### 테스트

```powershell
.\gradlew.bat test
```

## Docker 실행

이미지 빌드:

```bash
docker build -t sundaynotification .
```

컨테이너 실행:

```bash
docker run --rm -p 8081:8081 -e PORT=8081 sundaynotification
```

## API

### `GET /`

최신 썬데이 메이플 이벤트를 HTML 페이지로 반환합니다.

- 진행 중인 관련 이벤트가 있으면 이벤트 제목, 기간, 상세 콘텐츠를 표시합니다.
- 관련 이벤트가 없으면 안내 메시지를 표시합니다.

## 설정

`src/main/resources/application.properties`

```properties
spring.application.name=sundaynotification
server.port=8081
server.max-http-request-header-size=16384
```

## 배포 참고

`Dockerfile`은 Render와 같이 실행 시점에 `PORT` 환경 변수를 주입하는 환경을 고려해 작성되어 있습니다.

```dockerfile
ENTRYPOINT ["sh", "-c", "java -jar app.jar --server.port=$PORT"]
```

## 개선 예정 항목

- Nexon Open API 키를 코드에 직접 두지 않고 환경 변수나 외부 설정으로 분리
- API 호출 실패 시 사용자에게 더 명확한 오류 화면 제공
- 이벤트 필터링 조건과 정렬 기준 테스트 추가
