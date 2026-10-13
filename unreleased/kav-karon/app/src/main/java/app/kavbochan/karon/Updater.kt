package app.kavbochan.karon

import android.app.Activity
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * עדכון עצמי (שלמה 12.10: "שהתכונה תדע לעדכן את עצמה"). כל בנייה בדחיפה מעלה ל-release "kav-karon"
 * את kav-karon.apk ואת version.json עם מספר הגרסה. האפליקציה בודקת בפתיחה, ואם יש חדשה — מורידה
 * ומתקינה דרך מתקין החבילות של אנדרואיד (הוא מבקש אישור בלחיצה).
 * זה השימוש היחיד באינטרנט: שום דבר לא נשלח מהטלפון.
 */
object Updater {
    private const val BASE = "https://github.com/Transit-Freak/kav-bochan/releases/download/kav-karon/"
    const val ACTION_INSTALLED = "app.kavbochan.karon.INSTALLED"

    private fun open(path: String): HttpURLConnection =
        (URL(BASE + path).openConnection() as HttpURLConnection).apply { connectTimeout = 10_000; readTimeout = 30_000 }

    /** מספר הגרסה האחרונה שפורסמה, או null אם אין רשת */
    fun latest(): Int? = try {
        val c = open("version.json")
        try { if (c.responseCode == 200) JSONObject(c.inputStream.bufferedReader().readText()).optInt("code", 0) else null }
        finally { c.disconnect() }
    } catch (e: Exception) { null }

    fun download(to: File): Boolean = try {
        val c = open("kav-karon.apk")
        try {
            if (c.responseCode != 200) false
            else { c.inputStream.use { inp -> to.outputStream().use { inp.copyTo(it) } }; to.length() > 0 }
        } finally { c.disconnect() }
    } catch (e: Exception) { false }

    fun install(a: Activity, apk: File) {
        val installer = a.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        val id = installer.createSession(params)
        installer.openSession(id).use { s ->
            s.openWrite("kav-karon.apk", 0, apk.length()).use { out ->
                apk.inputStream().use { it.copyTo(out) }
                s.fsync(out)
            }
            val back = Intent(a, MainActivity::class.java).setAction(ACTION_INSTALLED)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
            s.commit(PendingIntent.getActivity(a, 0, back, flags).intentSender)
        }
    }
}
