package io.yun.sundaynotification

import java.time.format.DateTimeFormatter
import java.time.ZoneId
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

@RestController
class MapleStoryNoticeController(
    private val mapleStoryNoticeService: MapleStoryNoticeService
) {

    private val formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
    private val kstZone = ZoneId.of("Asia/Seoul")

    @GetMapping("/")
    fun getNoticesHtml(): String {
        val sundayNotices = mapleStoryNoticeService.getSundayEvents().sortedByDescending { it.dateEventStart } // 최신순 정렬

        if (sundayNotices.isEmpty()) {
            return """
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { 
                            background: #fafafa; 
                            color: #555; 
                            font-family: sans-serif; 
                            display: flex; 
                            justify-content: center; 
                            align-items: center; 
                            height: 100vh; 
                            margin: 0; 
                        }
                        @media (prefers-color-scheme: dark) {
                            body { background: #121212; color: #aaa; }
                        }
                    </style>
                </head>
                <body>
                    <h1 style="font-size: 1.2em; font-weight: normal;">진행 중인 썬데이 메이플 이벤트가 없습니다.</h1>
                </body>
                </html>
            """.trimIndent()
        }

        // 최신 이벤트 하나만 선택
        val latestNotice = sundayNotices.first()
        val detail = mapleStoryNoticeService.getEventDetail(latestNotice.noticeId)

        return """
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>최신 썬데이 메이플 알림</title>
                <!-- 눈이 편안하고 트렌디한 구글 한글 폰트 적용 -->
                <link rel="preconnect" href="https://fonts.googleapis.com">
                <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap" rel="stylesheet">
     <style>
    /* === [라이트 모드] 따뜻한 아이보리 톤 통합 === */
    html, body { 
        background-color: #f9f8f6 !important; 
        margin: 0; 
        padding: 0; 
        width: 100%; 
        min-height: 100vh; 
        display: flex;
        justify-content: center;
        align-items: flex-start;
        font-family: 'Noto Sans KR', -apple-system, sans-serif;
    }
    
    /* 스크롤바 숨기기 */
    html, body { -ms-overflow-style: none; scrollbar-width: none; }
    html::-webkit-scrollbar, body::-webkit-scrollbar { display: none; }
    
    .event-card { 
        width: 100%; 
        max-width: 800px; 
        min-height: 100vh;
        background: #f9f8f6; 
        box-sizing: border-box; 
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 40px 0px; 
    }
    
    .event-header {
        text-align: center;
        width: 100%;
        margin-bottom: 25px;
        padding: 0 20px;
        box-sizing: border-box;
    }
    
    /* 썬데이 메이플 메인 타이틀 */
    .event-title { 
        font-size: 1.8em; 
        font-weight: 800;
        margin: 0 0 10px 0; 
        word-break: keep-all;
    }
    .event-title a { 
        color: #d35400; /* 깊은 오렌지 브라운 */
        text-decoration: none; 
    }
    .event-title a:hover { 
        text-decoration: underline;
    }
    
    /* === [변경] 날짜 배경 제거 및 깔끔한 텍스트 정돈 === */
    .event-date { 
        display: block;
        background: none !important; /* 배경색 완전 제거 */
        padding: 0;
        border-radius: 0;
        box-shadow: none !important;
        color: #6e7a8a; /* 눈이 편안한 차분한 블루 그레이 */
        font-size: 0.95em; 
        font-weight: 500;
        letter-spacing: -0.3px;
    }
    /* 달력 아이콘과 글자 사이 여백 */
    .event-date::before {
      
        margin-right: 4px;
        font-size: 0.95em;
    }
    
    .event-content { 
        width: 100%;
        background: transparent; 
        padding: 0; 
    }
    
    /* 이미지 반응형 최적화 */
    .event-content img { 
        width: 100%; 
        max-width: 100%; 
        height: auto; 
        max-height: 85vh; 
        object-fit: contain; 
        display: block; 
        margin: 0 auto; 
    }

    /* === [다크 모드] 초콜릿 톤 통합 === */
    @media (prefers-color-scheme: dark) {
        html, body { 
            background-color: #1a1919 !important; 
        }
        body { color: #efefef; }
        .event-card { 
            background: #1a1919; 
        }
        .event-title a { 
            color: #ffb74d; 
        }
        /* 다크모드 날짜 텍스트 색상 최적화 */
        .event-date { 
            color: #a0aab5; 
        }
    }
</style>
                <script>
                    let clickCount = 0;
                    function handleHiddenClick(event) {
                        // event-card 내부 클릭은 제외 (빈 공간 클릭만 감지)
                        if (event.target === document.body || event.target === document.documentElement) {
                            clickCount++;
                            if (clickCount === 5) {
                                alert("♥유진님 사랑해♥");
                                clickCount = 0;
                            }
                        } else {
                            clickCount = 0; // 카드 내부 클릭 시 초기화 (선택 사항)
                        }
                    }
                </script>
            </head>
            <body onclick="handleHiddenClick(event)">
                <div class="event-card">
                    <div class="event-header">
                        <h2 class="event-title">
                            <a href="${latestNotice.url}" target="_blank">${latestNotice.title}</a>
                        </h2>
                        <div class="event-date">
                            기간: ${latestNotice.dateEventStart.atZoneSameInstant(kstZone).format(formatter)} 
                            ~ ${latestNotice.dateEventEnd.atZoneSameInstant(kstZone).format(formatter)}
                        </div>
                    </div>
                    <div class="event-content">
                        ${detail?.contents ?: "상세 내용을 불러올 수 없습니다."}
                    </div>
                </div>
            </body>
            </html>
        """.trimIndent()
    }
}