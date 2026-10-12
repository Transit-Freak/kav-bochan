package app.kavbochan.karon

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ClassifyTest {
    private fun b(vararg v: Int) = ByteArray(v.size) { v[it].toByte() }

    @Test fun iphoneNearbyInfo() =   // flags + נתוני יצרן של אפל, סוג 0x10
        assertEquals(Kind.PHONE, Classify.kind(b(0x02, 0x01, 0x1A, 0x0A, 0xFF, 0x4C, 0x00, 0x10, 0x05, 0x01, 0x18, 0x00, 0x00, 0x00)))

    @Test fun airpods() =
        assertEquals(Kind.EARBUDS, Classify.kind(b(0x06, 0xFF, 0x4C, 0x00, 0x07, 0x19, 0x01)))

    @Test fun watchByAppearance() =    // Appearance 0x00C1 = שעון
        assertEquals(Kind.WATCH, Classify.kind(b(0x03, 0x19, 0xC1, 0x00)))

    @Test fun fastPairIsEarbuds() =    // נתוני שירות 0xFE2C
        assertEquals(Kind.EARBUDS, Classify.kind(b(0x06, 0x16, 0x2C, 0xFE, 0x01, 0x02, 0x03)))

    @Test fun unknownAndBroken() {
        assertEquals(Kind.UNKNOWN, Classify.kind(b(0x02, 0x01, 0x06)))
        assertEquals(Kind.UNKNOWN, Classify.kind(null))
        assertEquals(Kind.UNKNOWN, Classify.kind(b(0x09, 0xFF, 0x4C)))   // אורך שחורג מהשידור — לא קורס
    }

    @Test fun distanceRoundTrip() {
        val r = Classify.rssiAt(13.0)
        assertTrue(Classify.distance(r) in 12.0..14.5)
    }

    @Test fun wifiHotspotNames() {
        assertEquals(Kind.HOTSPOT, Classify.wifiKind("iPhone של שלמה"))
        assertEquals(Kind.HOTSPOT, Classify.wifiKind("Galaxy A54 1F3C"))
        assertEquals(Kind.WIFI, Classify.wifiKind("Israel Railways"))
        assertEquals(Kind.WIFI, Classify.wifiKind(null))
    }
}
