package com.testforge.lite

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

data class RestoredBackup(
    val classes: List<String>,
    val tests: List<TestItem>,
    val attempts: List<Attempt>
)

fun createBackupJson(context: Context): String {
    val store = LocalStore(context)
    store.loadTests() // Seeds the sample test on a fresh install before backup.
    val prefs = context.getSharedPreferences("testforge_lite", Context.MODE_PRIVATE)
    val classes = JSONArray(prefs.getString("classes", null) ?: JSONArray(store.loadClasses()).toString())
    val tests = JSONArray(prefs.getString("tests", null) ?: "[]")
    val attempts = JSONArray(prefs.getString("attempts", null) ?: "[]")

    return JSONObject().apply {
        put("format", "testforge-lite-backup")
        put("version", 1)
        put("classes", classes)
        put("tests", tests)
        put("attempts", attempts)
    }.toString(2)
}

fun restoreBackupJson(context: Context, text: String): RestoredBackup {
    val root = JSONObject(text)
    if (root.optString("format") != "testforge-lite-backup") {
        error("That file is not a TestForge Lite backup.")
    }
    val classes = root.getJSONArray("classes")
    val tests = root.getJSONArray("tests")
    val attempts = root.getJSONArray("attempts")

    val prefs = context.getSharedPreferences("testforge_lite", Context.MODE_PRIVATE)
    prefs.edit()
        .putString("classes", classes.toString())
        .putString("tests", tests.toString())
        .putString("attempts", attempts.toString())
        .commit()

    val store = LocalStore(context)
    return RestoredBackup(
        classes = store.loadClasses(),
        tests = store.loadTests(),
        attempts = store.loadAttempts()
    )
}
