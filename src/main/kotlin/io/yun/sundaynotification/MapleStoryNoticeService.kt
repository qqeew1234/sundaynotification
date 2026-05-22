package io.yun.sundaynotification

import org.springframework.stereotype.Service
import org.springframework.web.client.RestClient

@Service
class MapleStoryNoticeService {

    private val restClient = RestClient.builder()
        .baseUrl("https://open.api.nexon.com/maplestory/v1")
        .defaultHeader("accept", "application/json")
        .defaultHeader("x-nxopen-api-key", "test_487ac11adbc691bb423b4b42b4136b2f31ae042d7089becfda278a72761c05dfefe8d04e6d233bd35cf2fabdeb93fb0d")
        .build()

    fun getEventNotices(): List<EventNotice> {
        return try {
            val response = restClient.get()
                .uri("/notice-event")
                .retrieve()
                .body(EventNoticeResponse::class.java)

            response?.eventNotice ?: emptyList()
        } catch (e: Exception) {
            println("[DEBUG_LOG] API 호출 에러: ${e.message}")
            emptyList()
        }
    }

    fun getSundayEvents(): List<EventNotice> {
        return getEventNotices().filter { it.title.contains("썬데이") || it.title.contains("일요일") }
    }

    fun getEventDetail(noticeId: Long): EventDetailResponse? {
        return try {
            restClient.get()
                .uri { it.path("/notice-event/detail").queryParam("notice_id", noticeId).build() }
                .retrieve()
                .body(EventDetailResponse::class.java)
        } catch (e: Exception) {
            println("[DEBUG_LOG] 상세 조회 에러 ($noticeId): ${e.message}")
            null
        }
    }
}
