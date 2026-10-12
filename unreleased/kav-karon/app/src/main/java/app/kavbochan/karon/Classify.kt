package app.kavbochan.karon

import kotlin.math.log10
import kotlin.math.pow

// סוג המכשיר לפי מה שהוא משדר בעצמו (שלמה 12.10: "לטלפון יש כתובת שונה מאוזניות, כך שאפשר להפריד")
enum class Kind(val label: String) {
    PHONE("טלפונים"), EARBUDS("אוזניות"), WATCH("שעונים"), OTHER("מכשירים אחרים"), UNKNOWN("לא מזוהים")
}

object Classify {
    private const val APPLE = 0x004C
    private const val UUID_FAST_PAIR = 0xFE2C      // גוגל "צימוד מהיר" — אוזניות ואביזרים
    private const val UUID_GOOGLE_NEARBY = 0xFEF3  // שירותי גוגל בטלפוני אנדרואיד

    /**
     * raw — הבתים של השידור (AD structures: אורך, סוג, נתונים).
     * מחזיר את הסוג לפי, בסדר הזה: נתוני יצרן של אפל, שדה "Appearance", ומזהי שירות.
     */
    fun kind(raw: ByteArray?): Kind {
        if (raw == null) return Kind.UNKNOWN
        var appearance = -1
        val uuids16 = mutableListOf<Int>()
        var appleType = -1
        var i = 0
        while (i < raw.size) {
            val len = raw[i].toInt() and 0xFF
            if (len == 0 || i + 1 + len > raw.size) break
            val type = raw[i + 1].toInt() and 0xFF
            val dataStart = i + 2
            val dataLen = len - 1
            when (type) {
                0x19 -> if (dataLen >= 2) appearance = u16(raw, dataStart)
                0x02, 0x03 -> { var j = 0; while (j + 1 < dataLen) { uuids16 += u16(raw, dataStart + j); j += 2 } }
                0x16 -> if (dataLen >= 2) uuids16 += u16(raw, dataStart)          // נתוני שירות
                0xFF -> if (dataLen >= 3 && u16(raw, dataStart) == APPLE) appleType = raw[dataStart + 2].toInt() and 0xFF
            }
            i += len + 1
        }
        // אפל: 0x10 "Nearby Info" ו-0x0C "Handoff" — אייפון/אייפד; 0x07 — AirPods; 0x12 — Find My (AirTag, מכשיר כבוי)
        when (appleType) {
            0x10, 0x0C -> return Kind.PHONE
            0x07 -> return Kind.EARBUDS
            -1 -> {}
            else -> return Kind.OTHER
        }
        if (appearance >= 0) {
            when (appearance shr 6) {          // קטגוריה לפי תקן ה-Bluetooth
                1 -> return Kind.PHONE
                3 -> return Kind.WATCH
                37 -> return Kind.EARBUDS      // מכשירי שמע לבישים
                else -> return Kind.OTHER
            }
        }
        if (UUID_FAST_PAIR in uuids16) return Kind.EARBUDS
        if (UUID_GOOGLE_NEARBY in uuids16) return Kind.PHONE
        return Kind.UNKNOWN
    }

    private fun u16(b: ByteArray, at: Int) = (b[at].toInt() and 0xFF) or ((b[at + 1].toInt() and 0xFF) shl 8)

    /** מרחק משוער במטרים מעוצמת האות: מודל דעיכה פשוט. גס — גוף אדם וכיס מחלישים את האות. */
    fun distance(rssi: Int, txAt1m: Int = -59, n: Double = 3.0): Double = 10.0.pow((txAt1m - rssi) / (10 * n))

    /** עוצמת האות שמתאימה למרחק — הסף שמעליו המכשיר נספר בקרון */
    fun rssiAt(meters: Double, txAt1m: Int = -59, n: Double = 3.0): Int = (txAt1m - 10 * n * log10(meters)).toInt()
}
