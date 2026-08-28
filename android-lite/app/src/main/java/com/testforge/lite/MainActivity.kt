package com.testforge.lite

import android.content.Context
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import org.json.JSONArray
import org.json.JSONObject
import java.text.DateFormat
import java.util.Date
import java.util.UUID
import kotlin.math.roundToInt

data class Question(
    val prompt: String,
    val options: List<String>,
    val correctIndex: Int,
    val explanation: String
)

data class TestItem(
    val id: String,
    val className: String,
    val title: String,
    val questions: List<Question>
)

data class Attempt(
    val testId: String,
    val title: String,
    val className: String,
    val score: Int,
    val correct: Int,
    val total: Int,
    val timestamp: Long
)

enum class Screen { HOME, HISTORY, TEST }

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(
                colorScheme = darkColorScheme(
                    primary = Color(0xFF8CB4FF),
                    secondary = Color(0xFF78D8C7),
                    background = Color(0xFF0B1020),
                    surface = Color(0xFF121A2F)
                )
            ) {
                TestForgeLiteApp(this)
            }
        }
    }
}

@Composable
fun TestForgeLiteApp(context: Context) {
    val store = remember { LocalStore(context) }
    var classes by remember { mutableStateOf(store.loadClasses()) }
    var tests by remember { mutableStateOf(store.loadTests()) }
    var attempts by remember { mutableStateOf(store.loadAttempts()) }
    var selectedClass by remember { mutableStateOf(classes.firstOrNull() ?: "General") }
    var screen by remember { mutableStateOf(Screen.HOME) }
    var activeTest by remember { mutableStateOf<TestItem?>(null) }
    var showAddClass by remember { mutableStateOf(false) }
    var statusMessage by remember { mutableStateOf<String?>(null) }

    val overall = if (attempts.isEmpty()) null else attempts.map { it.score }.average().roundToInt()

    val importPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) {
            runCatching {
                val text = readImportDocument(context, uri)
                parseStructuredTest(text, selectedClass)
            }.onSuccess { imported ->
                tests = tests + imported
                store.saveTests(tests)
                statusMessage = "Imported ${imported.title} (${imported.questions.size} questions)."
            }.onFailure {
                statusMessage = it.message ?: "Import failed."
            }
        }
    }

    val backupWriter = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json")
    ) { uri: Uri? ->
        if (uri != null) {
            runCatching {
                val json = createBackupJson(context)
                context.contentResolver.openOutputStream(uri)?.use { output ->
                    output.write(json.toByteArray(Charsets.UTF_8))
                } ?: error("Could not create backup file.")
            }.onSuccess {
                statusMessage = "Backup saved. Keep that JSON file somewhere safe."
            }.onFailure {
                statusMessage = it.message ?: "Backup failed."
            }
        }
    }

    val backupReader = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) {
            runCatching {
                val text = context.contentResolver.openInputStream(uri)
                    ?.bufferedReader()
                    ?.use { it.readText() }
                    ?: error("Could not read backup file.")
                restoreBackupJson(context, text)
            }.onSuccess { restored ->
                classes = restored.classes
                tests = restored.tests
                attempts = restored.attempts
                selectedClass = classes.firstOrNull() ?: "General"
                statusMessage = "Backup restored: ${tests.size} tests and ${attempts.size} completed attempts."
            }.onFailure {
                statusMessage = it.message ?: "Restore failed."
            }
        }
    }

    if (showAddClass) {
        AddClassDialog(
            onDismiss = { showAddClass = false },
            onAdd = { name ->
                val clean = name.trim()
                if (clean.isNotBlank() && classes.none { it.equals(clean, true) }) {
                    classes = classes + clean
                    store.saveClasses(classes)
                    selectedClass = clean
                }
                showAddClass = false
            }
        )
    }

    when (screen) {
        Screen.TEST -> {
            val test = activeTest
            if (test == null) {
                screen = Screen.HOME
            } else {
                TestRunner(
                    test = test,
                    onBack = { screen = Screen.HOME },
                    onGraded = { attempt ->
                        attempts = listOf(attempt) + attempts
                        store.saveAttempts(attempts)
                    }
                )
            }
        }

        else -> Scaffold(
            topBar = {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column {
                        Text("TESTFORGE LITE", fontWeight = FontWeight.Black)
                        Text("Personal • Offline", style = MaterialTheme.typography.bodySmall)
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(overall?.let { "$it%" } ?: "--", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                        Text("overall grade", style = MaterialTheme.typography.labelSmall)
                    }
                }
            },
            bottomBar = {
                NavigationBar {
                    NavigationBarItem(
                        selected = screen == Screen.HOME,
                        onClick = { screen = Screen.HOME },
                        icon = { Text("⌂") },
                        label = { Text("Tests") }
                    )
                    NavigationBarItem(
                        selected = screen == Screen.HISTORY,
                        onClick = { screen = Screen.HISTORY },
                        icon = { Text("✓") },
                        label = { Text("History") }
                    )
                }
            }
        ) { padding ->
            Box(Modifier.fillMaxSize().padding(padding)) {
                if (screen == Screen.HISTORY) {
                    HistoryScreen(attempts)
                } else {
                    HomeScreen(
                        classes = classes,
                        selectedClass = selectedClass,
                        tests = tests,
                        statusMessage = statusMessage,
                        onSelectClass = { selectedClass = it },
                        onAddClass = { showAddClass = true },
                        onImport = {
                            importPicker.launch(
                                arrayOf(
                                    "application/pdf",
                                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                                    "text/plain",
                                    "text/markdown",
                                    "application/octet-stream"
                                )
                            )
                        },
                        onBackup = { backupWriter.launch("testforge-lite-backup.json") },
                        onRestore = { backupReader.launch(arrayOf("application/json", "text/plain", "application/octet-stream")) },
                        onTest = {
                            activeTest = it
                            screen = Screen.TEST
                        }
                    )
                }
            }
        }
    }
}

@Composable
fun HomeScreen(
    classes: List<String>,
    selectedClass: String,
    tests: List<TestItem>,
    statusMessage: String?,
    onSelectClass: (String) -> Unit,
    onAddClass: () -> Unit,
    onImport: () -> Unit,
    onBackup: () -> Unit,
    onRestore: () -> Unit,
    onTest: (TestItem) -> Unit
) {
    val filtered = tests.filter { it.className == selectedClass }
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text("Your Classes", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                classes.chunked(3).forEach { rowClasses ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        rowClasses.forEach { className ->
                            FilterChip(
                                selected = selectedClass == className,
                                onClick = { onSelectClass(className) },
                                label = { Text(className) }
                            )
                        }
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onAddClass) { Text("+ Class") }
                Button(onClick = onImport) { Text("Import Test") }
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onBackup) { Text("Backup") }
                OutlinedButton(onClick = onRestore) { Text("Restore") }
            }
            Text(
                "Imports: PDF, DOCX, TXT, MD. PDFs must contain selectable text.",
                style = MaterialTheme.typography.labelSmall
            )
            if (statusMessage != null) {
                Spacer(Modifier.height(8.dp))
                Text(statusMessage, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
            }
            Spacer(Modifier.height(14.dp))
            Text("$selectedClass Tests", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        }

        if (filtered.isEmpty()) {
            item {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                    Column(Modifier.padding(18.dp)) {
                        Text("No tests yet", fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(6.dp))
                        Text("Import a structured test file. A sample test is included under General on first install.")
                    }
                }
            }
        }

        items(filtered) { test ->
            Card(
                modifier = Modifier.fillMaxWidth().clickable { onTest(test) },
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
            ) {
                Column(Modifier.padding(18.dp)) {
                    Text(test.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(4.dp))
                    Text("${test.questions.size} questions")
                    Spacer(Modifier.height(8.dp))
                    Text("Tap to start →", color = MaterialTheme.colorScheme.primary)
                }
            }
        }
        item { Spacer(Modifier.height(20.dp)) }
    }
}

@Composable
fun HistoryScreen(attempts: List<Attempt>) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item {
            Text("Completed Tests", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
        }
        if (attempts.isEmpty()) {
            item { Text("Complete a test and your scores will appear here.") }
        }
        items(attempts) { attempt ->
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Row(
                    Modifier.fillMaxWidth().padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(attempt.title, fontWeight = FontWeight.Bold)
                        Text(attempt.className, style = MaterialTheme.typography.bodySmall)
                        Text(
                            DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(attempt.timestamp)),
                            style = MaterialTheme.typography.labelSmall
                        )
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text("${attempt.score}%", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        Text("${attempt.correct}/${attempt.total}", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}

@Composable
fun TestRunner(test: TestItem, onBack: () -> Unit, onGraded: (Attempt) -> Unit) {
    val answers = remember(test.id) {
        mutableStateListOf<Int>().apply { repeat(test.questions.size) { add(-1) } }
    }
    var graded by remember(test.id) { mutableStateOf(false) }
    var score by remember(test.id) { mutableStateOf(0) }

    Scaffold(
        topBar = {
            Row(
                Modifier.fillMaxWidth().padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                TextButton(onClick = onBack) { Text("← Back") }
                Spacer(Modifier.width(8.dp))
                Column {
                    Text(test.title, fontWeight = FontWeight.Bold)
                    Text(test.className, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            if (graded) {
                item {
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                        Column(Modifier.padding(18.dp)) {
                            Text("Final Score", style = MaterialTheme.typography.labelLarge)
                            Text("$score%", style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Black)
                            Text("Saved to your local history.")
                        }
                    }
                }
            }

            items(test.questions.size) { index ->
                val question = test.questions[index]
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                    Column(Modifier.padding(16.dp)) {
                        Text("${index + 1}. ${question.prompt}", fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(10.dp))
                        question.options.forEachIndexed { optionIndex, option ->
                            val selected = answers[index] == optionIndex
                            val correct = question.correctIndex == optionIndex
                            val isWrongSelected = graded && selected && !correct
                            val prefix = when {
                                graded && correct -> "✓ "
                                isWrongSelected -> "✕ "
                                else -> ""
                            }
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable(enabled = !graded) { answers[index] = optionIndex }
                                    .padding(vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                RadioButton(selected = selected, onClick = if (graded) null else ({ answers[index] = optionIndex }))
                                Text(
                                    text = "$prefix$option",
                                    textDecoration = if (isWrongSelected) TextDecoration.LineThrough else TextDecoration.None,
                                    color = when {
                                        graded && correct -> MaterialTheme.colorScheme.secondary
                                        isWrongSelected -> MaterialTheme.colorScheme.error
                                        else -> MaterialTheme.colorScheme.onSurface
                                    }
                                )
                            }
                        }
                        if (graded) {
                            HorizontalDivider(Modifier.padding(vertical = 8.dp))
                            Text("Explanation", fontWeight = FontWeight.Bold)
                            Text(question.explanation)
                        }
                    }
                }
            }

            item {
                if (!graded) {
                    val complete = answers.all { it >= 0 }
                    Button(
                        modifier = Modifier.fillMaxWidth(),
                        enabled = complete,
                        onClick = {
                            val correctCount = test.questions.indices.count { answers[it] == test.questions[it].correctIndex }
                            score = ((correctCount.toDouble() / test.questions.size) * 100).roundToInt()
                            graded = true
                            onGraded(
                                Attempt(
                                    testId = test.id,
                                    title = test.title,
                                    className = test.className,
                                    score = score,
                                    correct = correctCount,
                                    total = test.questions.size,
                                    timestamp = System.currentTimeMillis()
                                )
                            )
                        }
                    ) { Text(if (complete) "Grade Test" else "Answer all questions") }
                } else {
                    Button(modifier = Modifier.fillMaxWidth(), onClick = onBack) { Text("Return to Tests") }
                }
                Spacer(Modifier.height(24.dp))
            }
        }
    }
}

@Composable
fun AddClassDialog(onDismiss: () -> Unit, onAdd: (String) -> Unit) {
    var name by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Create class") },
        text = {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                singleLine = true,
                label = { Text("Class name") }
            )
        },
        confirmButton = { TextButton(onClick = { onAdd(name) }, enabled = name.isNotBlank()) { Text("Create") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

fun parseStructuredTest(text: String, className: String): TestItem {
    val title = Regex("(?im)^Title:\\s*(.+)$").find(text)?.groupValues?.get(1)?.trim()
        ?: "Imported Test ${DateFormat.getDateInstance(DateFormat.SHORT).format(Date())}"

    val starts = Regex("(?m)^\\s*\\d+[.)]\\s+").findAll(text).map { it.range.first }.toList()
    if (starts.isEmpty()) error("No numbered questions found. Use: 1. Question, A. choice, Answer: A")

    val questions = mutableListOf<Question>()
    starts.forEachIndexed { index, start ->
        val end = if (index + 1 < starts.size) starts[index + 1] else text.length
        val block = text.substring(start, end).trim()
        val lines = block.lines().map { it.trim() }.filter { it.isNotBlank() }
        if (lines.isEmpty()) return@forEachIndexed

        val prompt = lines.first().replaceFirst(Regex("^\\d+[.)]\\s*"), "").trim()
        val options = lines.mapNotNull { line ->
            Regex("^([A-Da-d])[.)]\\s*(.+)$").find(line)?.groupValues?.get(2)?.trim()
        }
        val answerLetter = lines.firstNotNullOfOrNull { line ->
            Regex("(?i)^Answer:\\s*([A-D])\\b").find(line)?.groupValues?.get(1)?.uppercase()
        }
        val answer = answerLetter?.firstOrNull()?.let { it.code - 'A'.code } ?: -1
        val explanation = lines.firstNotNullOfOrNull { line ->
            Regex("(?i)^Explanation:\\s*(.*)$").find(line)?.groupValues?.get(1)?.trim()
        }.orEmpty().ifBlank { "Review the correct answer and compare it with the other choices." }

        if (prompt.isNotBlank() && options.size >= 2 && answer in options.indices) {
            questions += Question(prompt, options, answer, explanation)
        }
    }

    if (questions.isEmpty()) error("Questions were found, but none had a usable answer key.")
    return TestItem(UUID.randomUUID().toString(), className, title, questions)
}

class LocalStore(context: Context) {
    private val prefs = context.getSharedPreferences("testforge_lite", Context.MODE_PRIVATE)

    fun loadClasses(): List<String> {
        val raw = prefs.getString("classes", null) ?: return listOf("General")
        val arr = JSONArray(raw)
        return (0 until arr.length()).map { arr.getString(it) }.ifEmpty { listOf("General") }
    }

    fun saveClasses(classes: List<String>) {
        prefs.edit().putString("classes", JSONArray(classes).toString()).apply()
    }

    fun loadTests(): List<TestItem> {
        val raw = prefs.getString("tests", null)
        if (raw == null) {
            val seeded = listOf(sampleTest())
            saveTests(seeded)
            return seeded
        }
        val arr = JSONArray(raw)
        return (0 until arr.length()).map { index -> testFromJson(arr.getJSONObject(index)) }
    }

    fun saveTests(tests: List<TestItem>) {
        val arr = JSONArray()
        tests.forEach { arr.put(testToJson(it)) }
        prefs.edit().putString("tests", arr.toString()).apply()
    }

    fun loadAttempts(): List<Attempt> {
        val raw = prefs.getString("attempts", null) ?: return emptyList()
        val arr = JSONArray(raw)
        return (0 until arr.length()).map { index ->
            val o = arr.getJSONObject(index)
            Attempt(
                testId = o.getString("testId"),
                title = o.getString("title"),
                className = o.getString("className"),
                score = o.getInt("score"),
                correct = o.getInt("correct"),
                total = o.getInt("total"),
                timestamp = o.getLong("timestamp")
            )
        }
    }

    fun saveAttempts(attempts: List<Attempt>) {
        val arr = JSONArray()
        attempts.forEach {
            arr.put(JSONObject().apply {
                put("testId", it.testId)
                put("title", it.title)
                put("className", it.className)
                put("score", it.score)
                put("correct", it.correct)
                put("total", it.total)
                put("timestamp", it.timestamp)
            })
        }
        prefs.edit().putString("attempts", arr.toString()).apply()
    }

    private fun testToJson(test: TestItem): JSONObject = JSONObject().apply {
        put("id", test.id)
        put("className", test.className)
        put("title", test.title)
        put("questions", JSONArray().apply {
            test.questions.forEach { q ->
                put(JSONObject().apply {
                    put("prompt", q.prompt)
                    put("options", JSONArray(q.options))
                    put("correctIndex", q.correctIndex)
                    put("explanation", q.explanation)
                })
            }
        })
    }

    private fun testFromJson(o: JSONObject): TestItem {
        val qArr = o.getJSONArray("questions")
        val questions = (0 until qArr.length()).map { i ->
            val q = qArr.getJSONObject(i)
            val opt = q.getJSONArray("options")
            Question(
                prompt = q.getString("prompt"),
                options = (0 until opt.length()).map { opt.getString(it) },
                correctIndex = q.getInt("correctIndex"),
                explanation = q.getString("explanation")
            )
        }
        return TestItem(o.getString("id"), o.getString("className"), o.getString("title"), questions)
    }

    private fun sampleTest() = TestItem(
        id = "sample-computer-basics",
        className = "General",
        title = "Computer Basics Sample",
        questions = listOf(
            Question(
                "Which component is the computer's short-term working memory?",
                listOf("SSD", "RAM", "Power supply", "Monitor"),
                1,
                "RAM temporarily stores information the processor is actively using."
            ),
            Question(
                "Which component executes program instructions?",
                listOf("CPU", "Keyboard", "Hard drive", "Speaker"),
                0,
                "The CPU processes and executes instructions from software."
            ),
            Question(
                "Which device is primarily an input device?",
                listOf("Monitor", "Printer", "Keyboard", "Speaker"),
                2,
                "A keyboard sends user input into the computer."
            )
        )
    )
}
