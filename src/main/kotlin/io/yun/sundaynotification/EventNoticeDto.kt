package io.yun.sundaynotification

import com.fasterxml.jackson.annotation.JsonProperty
import java.time.OffsetDateTime

data class EventNoticeResponse(
    @JsonProperty("event_notice")
    val eventNotice: List<EventNotice>
)

data class EventNotice(
    val title: String,
    val url: String,
    @JsonProperty("thumbnail_url")
    val thumbnailUrl: String,
    @JsonProperty("notice_id")
    val noticeId: Long,
    val date: OffsetDateTime,
    @JsonProperty("date_event_start")
    val dateEventStart: OffsetDateTime,
    @JsonProperty("date_event_end")
    val dateEventEnd: OffsetDateTime
)

data class EventDetailResponse(
    val title: String,
    val contents: String,
    val date: OffsetDateTime,
    @JsonProperty("date_event_start")
    val dateEventStart: OffsetDateTime,
    @JsonProperty("date_event_end")
    val dateEventEnd: OffsetDateTime
)
