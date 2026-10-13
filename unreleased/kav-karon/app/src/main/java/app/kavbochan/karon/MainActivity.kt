package app.kavbochan.karon

import android.Manifest
import android.app.Activity
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.TextView
import kotlin.math.roundToInt

/**
 * כמה עמוס הקרון (שלמה 12.10) — פרויקט פרטי, לא חלק מהאתר.
 * סורק 15 שניות את שידורי ה-Bluetooth בסביבה, מזהה לפי מה שכל מכשיר משדר אם הוא טלפון, אוזניות
 * או שעון, וסופר רק מכשירים שנראים בתוך הקרון — לפי אורך הקרון ואיפה אתה עומד.
 * לא נשמרות כתובות של מכשירים: רק הספירה, ויחס הכיול (טלפונים לאדם) בהגדרות.
 */
class MainActivity : Activity() {
    private val scanMs = 15_000L
    private val seen = HashMap<String, Pair<Int, Kind>>()   // כתובת → (האות החזק ביותר, סוג) — רק בזמן הסריקה
    private var scanning = false
    private val ui = Handler(Looper.getMainLooper())

    private lateinit var lengthIn: EditText
    private lateinit var where: RadioGroup
    private lateinit var status: TextView
    private lateinit var verdict: TextView
    private lateinit var details: TextView
    private lateinit var scanBtn: Button
    private lateinit var peopleIn: EditText
    private var lastPhones = 0

    private val prefs by lazy { getSharedPreferences("karon", Context.MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.decorView.layoutDirection = View.LAYOUT_DIRECTION_RTL
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(18), dp(22), dp(18), dp(24)) }
        col.addView(text("כמה עמוס הקרון", 24f, bold = true))
        col.addView(text("סורק את הטלפונים בסביבה דרך Bluetooth. מעריך בלבד — לא ספירה מדויקת.", 13f, Color.GRAY))

        col.addView(label("אורך הקרון (מטרים)"))
        lengthIn = EditText(this).apply { inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL; setText(prefs.getFloat("len", 26f).toString().removeSuffix(".0")) }
        col.addView(lengthIn)

        col.addView(label("איפה אתה עומד בקרון"))
        where = RadioGroup(this).apply { orientation = RadioGroup.HORIZONTAL }
        listOf("קדמה", "אמצע", "סוף").forEachIndexed { i, t -> where.addView(RadioButton(this).apply { id = 100 + i; text = t }) }
        where.check(100 + prefs.getInt("where", 1))
        col.addView(where)

        scanBtn = Button(this).apply { text = "סריקה (15 שניות)"; textSize = 18f; setOnClickListener { startScan() } }
        col.addView(scanBtn, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(64)).apply { topMargin = dp(16) })

        status = text("", 13f, Color.GRAY)
        verdict = text("", 34f, bold = true).apply { gravity = Gravity.CENTER; setPadding(0, dp(14), 0, dp(4)) }
        details = text("", 15f)
        col.addView(status); col.addView(verdict); col.addView(details)

        col.addView(label("כיול: כמה אנשים יש עכשיו בקרון, בערך?"))
        col.addView(text("סופרים פעם אחת בעיניים אחרי סריקה, וכך האפליקציה לומדת כמה טלפונים יש לאדם.", 12f, Color.GRAY))
        peopleIn = EditText(this).apply { inputType = InputType.TYPE_CLASS_NUMBER; hint = "מספר אנשים" }
        col.addView(peopleIn)
        col.addView(Button(this).apply { text = "שמירת כיול"; setOnClickListener { calibrate() } })

        setContentView(ScrollView(this).apply { addView(col) })
    }

    private fun startScan() {
        if (scanning) return
        if (!hasPermission()) { askPermission(); return }
        val adapter: BluetoothAdapter? = (getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter
        if (adapter == null) { status.text = "אין Bluetooth במכשיר הזה"; return }
        if (!adapter.isEnabled) {
            status.text = "צריך להדליק Bluetooth"
            try { startActivity(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE)) } catch (e: SecurityException) {}
            return
        }
        val scanner = adapter.bluetoothLeScanner ?: run { status.text = "הסריקה לא זמינה כרגע"; return }
        prefs.edit().putFloat("len", carLength().toFloat()).putInt("where", where.checkedRadioButtonId - 100).apply()
        seen.clear()
        scanning = true
        scanBtn.isEnabled = false
        verdict.text = ""
        details.text = ""
        status.text = "סורק…"
        val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
        try { scanner.startScan(null, settings, callback) } catch (e: SecurityException) { status.text = "אין הרשאה לסריקה"; scanning = false; scanBtn.isEnabled = true; return }
        var left = (scanMs / 1000).toInt()
        val tick = object : Runnable {
            override fun run() {
                if (!scanning) return
                left--
                status.text = "סורק… עוד $left שניות · ${seen.size} מכשירים עד עכשיו"
                if (left > 0) ui.postDelayed(this, 1000) else {
                    try { scanner.stopScan(callback) } catch (e: SecurityException) {}
                    scanning = false
                    scanBtn.isEnabled = true
                    showResult()
                }
            }
        }
        ui.postDelayed(tick, 1000)
    }

    private val callback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, r: ScanResult) {
            val addr = r.device?.address ?: return
            val kind = Classify.kind(r.scanRecord?.bytes)
            val prev = seen[addr]
            seen[addr] = Pair(if (prev == null) r.rssi else maxOf(prev.first, r.rssi), if (prev != null && kind == Kind.UNKNOWN) prev.second else kind)
        }
        override fun onScanFailed(errorCode: Int) { ui.post { status.text = "הסריקה נכשלה (קוד $errorCode). נסו שוב." } }
    }

    private fun carLength() = lengthIn.text.toString().toDoubleOrNull()?.takeIf { it in 5.0..60.0 } ?: 26.0

    private fun showResult() {
        val len = carLength()
        // עומד באמצע — עד חצי קרון לכל כיוון; בקצה — עד אורך הקרון כולו
        val reach = if (where.checkedRadioButtonId == 101) len / 2 else len
        val minRssi = Classify.rssiAt(reach)
        val inCar = seen.values.filter { it.first >= minRssi }
        val byKind = Kind.values().associateWith { k -> inCar.count { it.second == k } }
        val phones = byKind[Kind.PHONE] ?: 0
        lastPhones = phones
        val perPerson = prefs.getFloat("ratio", 0.6f).toDouble()        // טלפונים מזוהים לאדם; ברירת מחדל עד כיול
        val people = (phones / perPerson).roundToInt()
        val (word, color) = when {
            people < 15 -> "ריק" to Color.rgb(0, 140, 70)
            people < 45 -> "בינוני" to Color.rgb(200, 140, 0)
            else -> "מלא" to Color.rgb(200, 40, 50)
        }
        verdict.text = word
        verdict.setTextColor(color)
        status.text = "נסרקו ${seen.size} מכשירים, ${inCar.size} מהם בתוך הקרון (עד כ-${reach.roundToInt()} מ׳)"
        details.text = buildString {
            append("כ-$people אנשים בקרון (הערכה)\n\n")
            Kind.values().forEach { k -> append("${k.label}: ${byKind[k]}\n") }
            append("\nטלפונים לאדם: ${"%.2f".format(perPerson)}${if (prefs.contains("ratio")) " (מכיול)" else " (ברירת מחדל — כדאי לכייל)"}")
        }
    }

    private fun calibrate() {
        val n = peopleIn.text.toString().toIntOrNull()
        if (n == null || n <= 0) { status.text = "צריך לכתוב כמה אנשים בערך"; return }
        if (lastPhones == 0) { status.text = "קודם סריקה, ואז כיול"; return }
        prefs.edit().putFloat("ratio", lastPhones.toFloat() / n).apply()
        status.text = "נשמר: ${"%.2f".format(lastPhones.toFloat() / n)} טלפונים לאדם"
        showResult()
    }

    private fun hasPermission(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED
        else checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun askPermission() {
        val p = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Manifest.permission.BLUETOOTH_SCAN else Manifest.permission.ACCESS_FINE_LOCATION
        requestPermissions(arrayOf(p), 1)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) startScan()
        else status.text = "בלי הרשאה לסריקת Bluetooth האפליקציה לא יכולה לעבוד"
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).roundToInt()
    private fun text(s: String, size: Float, color: Int = Color.BLACK, bold: Boolean = false) = TextView(this).apply {
        text = s; textSize = size; setTextColor(color); if (bold) setTypeface(typeface, Typeface.BOLD); setPadding(0, dp(4), 0, dp(4))
    }
    private fun label(s: String) = text(s, 15f, bold = true).apply { setPadding(0, dp(16), 0, 0) }
}
