package io.yun.sundaynotification

import java.time.format.DateTimeFormatter
import java.time.ZoneId
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.Clock
import org.springframework.stereotype.Controller
import org.springframework.ui.Model
import org.springframework.web.bind.annotation.GetMapping

@Controller
class MapleStoryNoticeController(
    private val mapleStoryNoticeService: MapleStoryNoticeService,
    private val clock: Clock
) {

    private val formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
    private val kstZone = ZoneId.of("Asia/Seoul")

    @GetMapping("/")
    fun index(model: Model): String {
        val latestNotice = mapleStoryNoticeService.getSundayEvents()
            .maxByOrNull { it.dateEventStart }

        if (latestNotice != null) {
            val detail = mapleStoryNoticeService.getEventDetail(latestNotice.noticeId)

            model.addAttribute("notice", latestNotice)
            model.addAttribute("startAt", latestNotice.dateEventStart.atZoneSameInstant(kstZone).format(formatter))
            model.addAttribute("endAt", latestNotice.dateEventEnd.atZoneSameInstant(kstZone).format(formatter))
            model.addAttribute("contents", detail?.contents ?: "상세 내용을 불러올 수 없습니다.")
        }

        val now = OffsetDateTime.now(clock)
        val showcaseLimit = OffsetDateTime.of(2026, 6, 14, 0, 0, 0, 0, ZoneOffset.ofHours(9))
        val showShowcase = now.isBefore(showcaseLimit)
        model.addAttribute("showShowcase", showShowcase)

        return "index"
    }
}
