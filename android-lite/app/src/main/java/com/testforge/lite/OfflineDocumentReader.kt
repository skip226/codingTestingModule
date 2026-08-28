package com.testforge.lite

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import java.io.ByteArrayOutputStream
import java.util.zip.ZipInputStream

fun readImportDocument(context: Context, uri: Uri): String {
    val resolver = context.contentResolver
    val name = resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
    }.orEmpty()
    val mime = resolver.getType(uri).orEmpty()

    return when {
        name.endsWith(".pdf", ignoreCase = true) || mime == "application/pdf" -> readPdf(context, uri)
        name.endsWith(".docx", ignoreCase = true) || mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" -> readDocx(context, uri)
        name.endsWith(".txt", ignoreCase = true) ||
            name.endsWith(".md", ignoreCase = true) ||
            mime.startsWith("text/") || mime == "application/octet-stream" -> readPlainText(context, uri)
        else -> error("Unsupported file type. Use PDF, DOCX, TXT, or Markdown.")
    }.trim().ifBlank { error("No readable text was found in that file.") }
}

private fun readPlainText(context: Context, uri: Uri): String =
    context.contentResolver.openInputStream(uri)
        ?.bufferedReader()
        ?.use { it.readText() }
        ?: error("Could not read that file.")

private fun readPdf(context: Context, uri: Uri): String {
    PDFBoxResourceLoader.init(context.applicationContext)
    val input = context.contentResolver.openInputStream(uri) ?: error("Could not open PDF.")
    input.use { stream ->
        PDDocument.load(stream).use { document ->
            return PDFTextStripper().getText(document)
        }
    }
}

private fun readDocx(context: Context, uri: Uri): String {
    val input = context.contentResolver.openInputStream(uri) ?: error("Could not open DOCX.")
    input.use { stream ->
        ZipInputStream(stream).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                if (entry.name == "word/document.xml") {
                    val bytes = ByteArrayOutputStream().use { output ->
                        val buffer = ByteArray(8192)
                        while (true) {
                            val count = zip.read(buffer)
                            if (count <= 0) break
                            output.write(buffer, 0, count)
                        }
                        output.toByteArray()
                    }
                    val xml = bytes.toString(Charsets.UTF_8)
                    return xml
                        .replace(Regex("</w:p>"), "\n")
                        .replace(Regex("</w:tr>"), "\n")
                        .replace(Regex("</w:tc>"), "\t")
                        .replace(Regex("<w:tab[^>]*/>"), "\t")
                        .replace(Regex("<w:br[^>]*/>"), "\n")
                        .replace(Regex("<[^>]+>"), "")
                        .replace("&amp;", "&")
                        .replace("&lt;", "<")
                        .replace("&gt;", ">")
                        .replace("&quot;", "\"")
                        .replace("&apos;", "'")
                }
            }
        }
    }
    error("That DOCX file does not contain readable document text.")
}
