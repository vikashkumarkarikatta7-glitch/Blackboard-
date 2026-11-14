package com.smartblackboard.app

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfDocument
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream

object PdfTools {

    fun importPdfPagesToLocalImages(context: Context, uri: Uri): List<String> {
        val outPaths = mutableListOf<String>()
        val pfd: ParcelFileDescriptor = context.contentResolver.openFileDescriptor(uri, "r") ?: return outPaths
        val renderer = PdfRenderer(pfd)
        val mediaDir = File(context.filesDir, "media").apply { mkdirs() }

        for (i in 0 until renderer.pageCount) {
            val page = renderer.openPage(i)
            val bmp = Bitmap.createBitmap(1080, (1080f * page.height / page.width).toInt(), Bitmap.Config.ARGB_8888)
            bmp.eraseColor(Color.WHITE)
            page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            page.close()

            val file = File(mediaDir, "pdf_${System.currentTimeMillis()}_$i.png")
            FileOutputStream(file).use { bmp.compress(Bitmap.CompressFormat.PNG, 92, it) }
            bmp.recycle()
            outPaths.add(file.absolutePath)
        }
        renderer.close()
        pfd.close()
        return outPaths
    }

    fun exportPagePng(context: Context, canvasView: BlackboardCanvasView, page: BoardPage): File {
        val exportDir = File(context.cacheDir, "exports").apply { mkdirs() }
        val file = File(exportDir, "blackboard_${System.currentTimeMillis()}.png")
        val bmp = canvasView.renderPageToBitmap(page)
        FileOutputStream(file).use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bmp.recycle()
        return file
    }

    fun exportNotebookPdf(context: Context, canvasView: BlackboardCanvasView, notebook: BoardNotebook): File {
        val exportDir = File(context.cacheDir, "exports").apply { mkdirs() }
        val file = File(exportDir, "blackboard_${System.currentTimeMillis()}.pdf")
        val pdfDoc = PdfDocument()
        for ((index, page) in notebook.pages.withIndex()) {
            val pageInfo = PdfDocument.PageInfo.Builder(1080, 1920, index + 1).create()
            val pdfPage = pdfDoc.startPage(pageInfo)
            val bmp = canvasView.renderPageToBitmap(page)
            pdfPage.canvas.drawBitmap(bmp, 0f, 0f, null)
            bmp.recycle()
            pdfDoc.finishPage(pdfPage)
        }
        FileOutputStream(file).use { pdfDoc.writeTo(it) }
        pdfDoc.close()
        return file
    }

    fun shareFile(context: Context, file: File, mimeType: String) {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = mimeType
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "Share Blackboard Notes"))
    }
}
