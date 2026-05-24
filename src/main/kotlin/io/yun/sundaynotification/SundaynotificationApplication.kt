package io.yun.sundaynotification

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.context.annotation.Bean
import java.time.Clock

@SpringBootApplication
class SundaynotificationApplication {
    @Bean
    fun clock(): Clock = Clock.systemDefaultZone()
}

fun main(args: Array<String>) {
	runApplication<SundaynotificationApplication>(*args)
}
