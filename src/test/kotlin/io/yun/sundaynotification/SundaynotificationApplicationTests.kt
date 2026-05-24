package io.yun.sundaynotification

import org.junit.jupiter.api.Test
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.beans.factory.annotation.Autowired
import java.time.OffsetDateTime
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@SpringBootTest
class SundaynotificationApplicationTests {

    @Autowired
    lateinit var service: MapleStoryNoticeService

    @Test
    fun contextLoads() {
    }

    @Test
    fun testSundayEventsFilteringAndExpiration() {
        val now = OffsetDateTime.parse("2026-05-25T01:00:00+09:00")

        val expiredSundayEvent = EventNotice(
            title = "[썬데이 메이플] 매주 일요일 특별한 혜택!",
            url = "http://example.com/expired",
            thumbnailUrl = "thumb1",
            noticeId = 1,
            date = now.minusDays(2),
            dateEventStart = now.minusDays(2),
            dateEventEnd = now.minusMinutes(1) // Ended 1 minute ago (expired)
        )

        val activeSundayEvent = EventNotice(
            title = "[썬데이 메이플] 매주 일요일 특별한 혜택!",
            url = "http://example.com/active",
            thumbnailUrl = "thumb2",
            noticeId = 2,
            date = now.minusDays(1),
            dateEventStart = now.minusDays(1),
            dateEventEnd = now.plusDays(1) // Ends tomorrow (active)
        )

        val activeSundayKeywordEvent = EventNotice(
            title = "일요일의 특별 혜택 이벤트",
            url = "http://example.com/active2",
            thumbnailUrl = "thumb3",
            noticeId = 3,
            date = now.minusDays(1),
            dateEventStart = now.minusDays(1),
            dateEventEnd = now.plusDays(1) // Ends tomorrow (active)
        )

        val nonSundayEvent = EventNotice(
            title = "평일 메가 버닝 이벤트",
            url = "http://example.com/normal",
            thumbnailUrl = "thumb4",
            noticeId = 4,
            date = now.minusDays(1),
            dateEventStart = now.minusDays(1),
            dateEventEnd = now.plusDays(5) // Active, but not a Sunday event
        )

        val notices = listOf(expiredSundayEvent, activeSundayEvent, activeSundayKeywordEvent, nonSundayEvent)
        val filtered = service.getSundayEvents(notices, now)

        assertEquals(2, filtered.size)
        assertTrue(filtered.any { it.noticeId == 2L })
        assertTrue(filtered.any { it.noticeId == 3L })
        assertTrue(filtered.none { it.noticeId == 1L })
        assertTrue(filtered.none { it.noticeId == 4L })
    }

    @Test
    fun testShowcaseVisibility() {
        val mockService = org.mockito.Mockito.mock(MapleStoryNoticeService::class.java)
        org.mockito.Mockito.`when`(mockService.getSundayEvents()).thenReturn(emptyList())

        // 1. Before June 14, 2026
        val beforeLimitClock = java.time.Clock.fixed(
            java.time.Instant.parse("2026-06-13T14:59:59Z"), // 23:59:59 KST (14:59:59 UTC)
            java.time.ZoneId.of("Asia/Seoul")
        )
        val controllerBefore = MapleStoryNoticeController(mockService, beforeLimitClock)
        val modelBefore = org.springframework.ui.ExtendedModelMap()
        controllerBefore.index(modelBefore)
        assertEquals(true, modelBefore["showShowcase"])

        // 2. On/After June 14, 2026
        val afterLimitClock = java.time.Clock.fixed(
            java.time.Instant.parse("2026-06-13T15:00:00Z"), // 2026-06-14T00:00:00 KST (15:00:00 UTC)
            java.time.ZoneId.of("Asia/Seoul")
        )
        val controllerAfter = MapleStoryNoticeController(mockService, afterLimitClock)
        val modelAfter = org.springframework.ui.ExtendedModelMap()
        controllerAfter.index(modelAfter)
        assertEquals(false, modelAfter["showShowcase"])
    }
}
