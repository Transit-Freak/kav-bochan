package app.kavbochan.karon

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.view.View

/**
 * ציור הקרון (שלמה 12.10: "מפה מאיפה כל וופי מגיע"): נקודה לכל מכשיר, במרחק המשוער ממך לאורך הקרון.
 * הטלפון יודע רק כמה רחוק המכשיר, לא לאיזה כיוון — כשעומדים באמצע, הצד (קדימה/אחורה) והמיקום לרוחב
 * נבחרים לפי המכשיר, כדי שהנקודות לא יעלו זו על זו. מה שיוצא מחוץ לקרון מצויר חיוור.
 */
class CarView(ctx: Context) : View(ctx) {
    class Dot(val dist: Double, val kind: Kind, val seed: Int)

    private var dots = listOf<Dot>()
    private var len = 26.0
    private var where = 1                      // 0 קדמה, 1 אמצע, 2 סוף
    private val p = Paint(Paint.ANTI_ALIAS_FLAG)
    private val box = RectF()

    fun show(d: List<Dot>, length: Double, pos: Int) { dots = d; len = length; where = pos; invalidate() }

    override fun onDraw(c: Canvas) {
        val dp = resources.displayMetrics.density
        val w = width.toFloat()
        val h = height.toFloat()
        val top = 28 * dp
        val bottom = h - 28 * dp
        val carW = minOf(w * 0.42f, 150 * dp)
        val left = (w - carW) / 2
        val right = left + carW
        val scale = (bottom - top) / len.toFloat()

        p.style = Paint.Style.STROKE; p.strokeWidth = 2 * dp; p.color = Color.rgb(90, 90, 90)
        box.set(left, top, right, bottom)
        c.drawRoundRect(box, 18 * dp, 18 * dp, p)

        p.style = Paint.Style.FILL; p.textSize = 12 * dp; p.color = Color.GRAY
        p.textAlign = Paint.Align.CENTER
        c.drawText("קדמה", w / 2, top - 9 * dp, p)
        c.drawText("סוף", w / 2, bottom + 19 * dp, p)
        p.textAlign = Paint.Align.RIGHT; p.strokeWidth = 1 * dp
        var m = 5
        while (m < len) {
            val y = top + m * scale
            c.drawLine(left - 6 * dp, y, left, y, p)
            c.drawText("$m מ׳", left - 9 * dp, y + 4 * dp, p)
            m += 5
        }

        val uy = when (where) { 0 -> top; 2 -> bottom; else -> (top + bottom) / 2 }
        for (d in dots) {
            val dir = when (where) { 0 -> 1; 2 -> -1; else -> if (d.seed and 1 == 0) 1 else -1 }
            val raw = uy + dir * d.dist.toFloat() * scale
            val inside = raw in top..bottom
            val y = raw.coerceIn(6 * dp, h - 6 * dp)
            val x = left + carW * (0.12f + 0.76f * ((d.seed ushr 1) and 0xFF) / 255f)
            p.color = color(d.kind); p.alpha = if (inside) 230 else 60
            if (d.kind.wifi) c.drawRect(x - 5 * dp, y - 5 * dp, x + 5 * dp, y + 5 * dp, p)
            else c.drawCircle(x, y, 5 * dp, p)
        }

        p.color = Color.BLACK
        p.style = Paint.Style.STROKE; p.strokeWidth = 2.5f * dp
        c.drawCircle(w / 2, uy, 10 * dp, p)
        p.style = Paint.Style.FILL
        c.drawCircle(w / 2, uy, 4 * dp, p)
        p.textAlign = Paint.Align.LEFT; p.textSize = 14 * dp
        c.drawText("אתה", right + 8 * dp, uy + 5 * dp, p)
    }

    companion object {
        fun color(k: Kind): Int = when (k) {
            Kind.PHONE -> Color.rgb(30, 100, 220)
            Kind.EARBUDS -> Color.rgb(140, 60, 190)
            Kind.WATCH -> Color.rgb(0, 150, 90)
            Kind.OTHER -> Color.rgb(120, 120, 120)
            Kind.UNKNOWN -> Color.rgb(190, 190, 190)
            Kind.HOTSPOT -> Color.rgb(230, 120, 0)
            Kind.WIFI -> Color.rgb(0, 160, 170)
        }
    }
}
