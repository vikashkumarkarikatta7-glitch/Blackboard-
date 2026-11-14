package com.smartblackboard.app

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.smartblackboard.app.databinding.ActivityMainBinding
import java.io.File
import java.io.FileOutputStream

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var storage: BoardStorageManager
    private lateinit var notebook: BoardNotebook

    private val undoStack = ArrayDeque<List<BoardElement>>()
    private val redoStack = ArrayDeque<List<BoardElement>>()

    private val pickImageLauncher = registerForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri?.let { importImageFromUri(it) }
    }

    private val pickPdfLauncher = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        uri?.let { importPdfFromUri(it) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        storage = BoardStorageManager(this)
        notebook = storage.loadNotebook()
        loadCurrentPageIntoCanvas()
        wireControls()
    }

    private fun currentPage(): BoardPage = notebook.pages[notebook.currentPageIndex.coerceIn(0, notebook.pages.lastIndex)]

    private fun loadCurrentPageIntoCanvas() {
        val page = currentPage()
        binding.blackboardCanvas.page = page
        binding.btnPages.text = "Page ${notebook.currentPageIndex + 1}/${notebook.pages.size}"
        undoStack.clear()
        redoStack.clear()
    }

    private fun pushUndoSnapshot() {
        val snapshot = currentPage().elements.map { it }
        undoStack.addLast(snapshot)
        if (undoStack.size > 30) undoStack.removeFirst()
        redoStack.clear()
    }

    private fun wireControls() {
        binding.blackboardCanvas.onHistorySnapshotRequested = { pushUndoSnapshot() }
        binding.blackboardCanvas.onPageMutated = { storage.saveNotebook(notebook) }
        binding.blackboardCanvas.onZoomChanged = { z -> binding.btnZoomReset.text = "${(z * 100).toInt()}%" }
        binding.blackboardCanvas.onTextRequested = { x, y, existing -> showTextInputDialog(x, y, existing) }

        binding.btnToolSelect.setOnClickListener { binding.blackboardCanvas.currentTool = ToolMode.SELECT }
        binding.btnToolAreaSelect.setOnClickListener { binding.blackboardCanvas.currentTool = ToolMode.AREA_SELECT }
        binding.btnToolPen.setOnClickListener { binding.blackboardCanvas.currentTool = ToolMode.PEN }
        binding.btnToolPencil.setOnClickListener { binding.blackboardCanvas.currentTool = ToolMode.PENCIL }
        binding.btnToolHighlighter.setOnClickListener { binding.blackboardCanvas.currentTool = ToolMode.HIGHLIGHTER }
        binding.btnToolText.setOnClickListener { binding.blackboardCanvas.currentTool = ToolMode.TEXT }
        binding.btnToolLaser.setOnClickListener { binding.blackboardCanvas.currentTool = ToolMode.LASER }
        binding.btnToolEraser.setOnClickListener { binding.blackboardCanvas.currentTool = ToolMode.ERASER }

        binding.btnUndo.setOnClickListener {
            if (undoStack.isNotEmpty()) {
                redoStack.addLast(currentPage().elements.toList())
                val prev = undoStack.removeLast()
                currentPage().elements.clear()
                currentPage().elements.addAll(prev)
                binding.blackboardCanvas.invalidate()
                storage.saveNotebook(notebook)
            }
        }

        binding.btnRedo.setOnClickListener {
            if (redoStack.isNotEmpty()) {
                undoStack.addLast(currentPage().elements.toList())
                val next = redoStack.removeLast()
                currentPage().elements.clear()
                currentPage().elements.addAll(next)
                binding.blackboardCanvas.invalidate()
                storage.saveNotebook(notebook)
            }
        }

        binding.btnZoomReset.setOnClickListener { binding.blackboardCanvas.resetZoom() }

        binding.btnShapes.setOnClickListener { showShapesDialog() }
        binding.btnColors.setOnClickListener { showColorAndSizeDialog() }
        binding.btnMath.setOnClickListener { showMathToolsDialog() }
        binding.btnMedia.setOnClickListener { showMediaDialog() }
        binding.btnBgPaper.setOnClickListener { showBoardBgDialog() }
        binding.btnPages.setOnClickListener { showPagesDialog() }
        binding.btnExport.setOnClickListener { showExportDialog() }

        binding.btnClear.setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle("Clear Board")
                .setMessage("Clear all strokes and items on this page?")
                .setPositiveButton("Clear") { _, _ ->
                    pushUndoSnapshot()
                    currentPage().elements.clear()
                    binding.blackboardCanvas.invalidate()
                    storage.saveNotebook(notebook)
                }
                .setNegativeButton("Cancel", null)
                .show()
        }
    }

    private fun showTextInputDialog(x: Float, y: Float, existing: MathItem?) {
        val input = EditText(this).apply {
            hint = "Type text here..."
            minLines = 2
            maxLines = 6
            if (existing != null) setText(existing.content)
        }
        val sizeSeek = SeekBar(this).apply {
            max = 80
            progress = ((existing?.fontSize ?: 48f).toInt() - 24).coerceIn(0, 80)
        }
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(40, 20, 40, 12)
            addView(input)
            addView(sizeSeek)
        }
        AlertDialog.Builder(this)
            .setTitle(if (existing == null) "Type on Blackboard" else "Edit Text")
            .setView(box)
            .setPositiveButton(if (existing == null) "Add" else "Update") { _, _ ->
                val txt = input.text.toString().trimEnd()
                if (txt.isBlank()) return@setPositiveButton
                val fSize = (24 + sizeSeek.progress).toFloat()
                val lines = txt.split("\n")
                val maxChars = lines.maxOfOrNull { it.length } ?: 1
                val estW = (maxChars * fSize * 0.62f + 40f).coerceIn(140f, 1020f)
                val estH = (lines.size * fSize * 1.32f + 24f).coerceAtLeast(fSize * 1.5f)
                pushUndoSnapshot()
                if (existing != null) {
                    existing.content = txt
                    existing.fontSize = fSize
                    existing.width = estW
                    existing.height = estH
                } else {
                    currentPage().elements.add(
                        MathItem(
                            kind = "text",
                            x = x.coerceIn(24f, 1080f - estW - 24f),
                            y = y.coerceIn(24f, 1920f - estH - 24f),
                            width = estW,
                            height = estH,
                            color = binding.blackboardCanvas.currentColor,
                            content = txt,
                            fontSize = fSize,
                            fontFamily = "sans",
                            textAlign = "left"
                        )
                    )
                }
                binding.blackboardCanvas.invalidate()
                storage.saveNotebook(notebook)
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showShapesDialog() {
        val labels = arrayOf("Straight Line", "Circle", "Rectangle", "Square", "Triangle", "Arrow", "Freehand Shape")
        val tools = arrayOf(ToolMode.LINE, ToolMode.CIRCLE, ToolMode.RECTANGLE, ToolMode.SQUARE, ToolMode.TRIANGLE, ToolMode.ARROW, ToolMode.FREEHAND_SHAPE)
        AlertDialog.Builder(this)
            .setTitle("Drawing Shapes")
            .setItems(labels) { _, i -> binding.blackboardCanvas.currentTool = tools[i] }
            .show()
    }

    private fun showColorAndSizeDialog() {
        val names = arrayOf("White", "Red", "Blue", "Green", "Yellow", "Orange", "Pink", "Purple", "Black")
        val colors = intArrayOf(
            Color.parseColor("#F8FAFC"), Color.parseColor("#EF4444"), Color.parseColor("#38BDF8"),
            Color.parseColor("#4ADE80"), Color.parseColor("#FACC15"), Color.parseColor("#FB923C"),
            Color.parseColor("#F472B6"), Color.parseColor("#C084FC"), Color.parseColor("#0F172A")
        )
        val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(48, 24, 48, 12) }
        val seek = SeekBar(this).apply {
            max = 40
            progress = binding.blackboardCanvas.strokeSize.toInt()
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(sb: SeekBar?, p: Int, fromUser: Boolean) {
                    val v = p.coerceAtLeast(2).toFloat()
                    binding.blackboardCanvas.strokeSize = v
                    binding.blackboardCanvas.eraserRadius = (v * 3f).coerceIn(18f, 90f)
                }
                override fun onStartTrackingTouch(sb: SeekBar?) {}
                override fun onStopTrackingTouch(sb: SeekBar?) {}
            })
        }
        layout.addView(seek)
        AlertDialog.Builder(this)
            .setTitle("Chalk Color & Thickness")
            .setView(layout)
            .setItems(names) { _, idx -> binding.blackboardCanvas.currentColor = colors[idx] }
            .show()
    }

    private fun showMathToolsDialog() {
        val opts = arrayOf("Insert Math Symbol", "Insert Fraction (a/b)", "Insert Proof Box", "Stamp Coordinate Axes", "Toggle Ruler", "Toggle Protractor")
        AlertDialog.Builder(this)
            .setTitle("Mathematics Teaching Tools")
            .setItems(opts) { _, which ->
                when (which) {
                    0 -> {
                        val syms = arrayOf("∑", "∫", "∂", "√", "∞", "π", "θ", "Δ", "≈", "≠", "≤", "≥", "∴", "∠", "⊥", "∥")
                        AlertDialog.Builder(this).setTitle("Pick Symbol").setItems(syms) { _, si ->
                            pushUndoSnapshot()
                            currentPage().elements.add(MathItem(kind = "text", x = 440f, y = 860f, width = 200f, height = 120f, color = binding.blackboardCanvas.currentColor, content = syms[si]))
                            binding.blackboardCanvas.invalidate(); storage.saveNotebook(notebook)
                        }.show()
                    }
                    1 -> {
                        val num = EditText(this).apply { hint = "Numerator (e.g. 3)" }
                        val den = EditText(this).apply { hint = "Denominator (e.g. 4)" }
                        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(40, 16, 40, 16); addView(num); addView(den) }
                        AlertDialog.Builder(this).setTitle("Stacked Fraction").setView(box).setPositiveButton("Insert") { _, _ ->
                            pushUndoSnapshot()
                            currentPage().elements.add(MathItem(kind = "fraction", x = 440f, y = 840f, width = 200f, height = 180f, color = binding.blackboardCanvas.currentColor, content = "${num.text}/${den.text}", numerator = num.text.toString(), denominator = den.text.toString()))
                            binding.blackboardCanvas.invalidate(); storage.saveNotebook(notebook)
                        }.show()
                    }
                    2 -> {
                        val input = EditText(this).apply { setText("Given: ...\nProve: ...\n∴ Q.E.D.") }
                        AlertDialog.Builder(this).setTitle("Proof & Formula Box").setView(input).setPositiveButton("Insert") { _, _ ->
                            pushUndoSnapshot()
                            currentPage().elements.add(MathItem(kind = "proof", x = 100f, y = 360f, width = 880f, height = 280f, color = binding.blackboardCanvas.currentColor, content = input.text.toString()))
                            binding.blackboardCanvas.invalidate(); storage.saveNotebook(notebook)
                        }.show()
                    }
                    3 -> {
                        pushUndoSnapshot()
                        currentPage().elements.add(MathItem(kind = "axes", x = 140f, y = 560f, width = 800f, height = 800f, color = binding.blackboardCanvas.currentColor, content = "Axes"))
                        binding.blackboardCanvas.invalidate(); storage.saveNotebook(notebook)
                    }
                    4 -> { binding.blackboardCanvas.showRuler = !binding.blackboardCanvas.showRuler; binding.blackboardCanvas.invalidate() }
                    5 -> { binding.blackboardCanvas.showProtractor = !binding.blackboardCanvas.showProtractor; binding.blackboardCanvas.invalidate() }
                }
            }.show()
    }

    private fun showMediaDialog() {
        val opts = arrayOf("Add Photo from Gallery", "Import PDF Document", "Pin/Unpin Last Image")
        AlertDialog.Builder(this)
            .setTitle("Photo & PDF Import")
            .setItems(opts) { _, which ->
                when (which) {
                    0 -> pickImageLauncher.launch("image/*")
                    1 -> pickPdfLauncher.launch(arrayOf("application/pdf"))
                    2 -> {
                        val lastImg = currentPage().elements.filterIsInstance<ImageItem>().lastOrNull()
                        if (lastImg != null) {
                            lastImg.pinned = !lastImg.pinned
                            binding.blackboardCanvas.invalidate(); storage.saveNotebook(notebook)
                            Toast.makeText(this, if (lastImg.pinned) "Image pinned to background" else "Image unpinned", Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            }.show()
    }

    private fun showBoardBgDialog() {
        val opts = arrayOf("Black Board", "Green Board", "White Board", "Blue Board", "Plain", "Square Grid", "Dotted Grid", "Ruled", "Coordinate Axes")
        AlertDialog.Builder(this)
            .setTitle("Board Color & Paper")
            .setItems(opts) { _, which ->
                when (which) {
                    0 -> currentPage().background = BoardBg.BLACK
                    1 -> currentPage().background = BoardBg.GREEN
                    2 -> currentPage().background = BoardBg.WHITE
                    3 -> currentPage().background = BoardBg.BLUE
                    4 -> currentPage().paper = PaperPattern.PLAIN
                    5 -> currentPage().paper = PaperPattern.GRID
                    6 -> currentPage().paper = PaperPattern.DOTTED
                    7 -> currentPage().paper = PaperPattern.RULED
                    8 -> currentPage().paper = PaperPattern.AXES
                }
                binding.blackboardCanvas.invalidate(); storage.saveNotebook(notebook)
            }.show()
    }

    private fun showPagesDialog() {
        val labels = notebook.pages.mapIndexed { idx, p -> "${idx + 1}. ${p.title}" } + listOf("+ Add New Page", "+ Duplicate Current Page", "- Delete Current Page")
        AlertDialog.Builder(this)
            .setTitle("Pages (${notebook.pages.size})")
            .setItems(labels.toTypedArray()) { _, idx ->
                val count = notebook.pages.size
                when {
                    idx < count -> { notebook.currentPageIndex = idx; loadCurrentPageIntoCanvas() }
                    idx == count -> {
                        notebook.pages.add(BoardPage(title = "Page ${count + 1}", background = currentPage().background))
                        notebook.currentPageIndex = notebook.pages.lastIndex
                        loadCurrentPageIntoCanvas()
                    }
                    idx == count + 1 -> {
                        val cur = currentPage()
                        notebook.pages.add(cur.copy(id = java.util.UUID.randomUUID().toString(), title = "${cur.title} Copy", elements = cur.elements.toMutableList()))
                        notebook.currentPageIndex = notebook.pages.lastIndex
                        loadCurrentPageIntoCanvas()
                    }
                    idx == count + 2 && count > 1 -> {
                        notebook.pages.removeAt(notebook.currentPageIndex)
                        notebook.currentPageIndex = notebook.currentPageIndex.coerceAtMost(notebook.pages.lastIndex)
                        loadCurrentPageIntoCanvas()
                    }
                }
                storage.saveNotebook(notebook)
            }.show()
    }

    private fun showExportDialog() {
        val opts = arrayOf("Share Current Page (PNG)", "Export & Share All Pages (PDF)")
        AlertDialog.Builder(this)
            .setTitle("Export & Share Offline")
            .setItems(opts) { _, which ->
                if (which == 0) {
                    val file = PdfTools.exportPagePng(this, binding.blackboardCanvas, currentPage())
                    PdfTools.shareFile(this, file, "image/png")
                } else {
                    val file = PdfTools.exportNotebookPdf(this, binding.blackboardCanvas, notebook)
                    PdfTools.shareFile(this, file, "application/pdf")
                }
            }.show()
    }

    private fun importImageFromUri(uri: Uri) {
        val input = contentResolver.openInputStream(uri) ?: return
        val bmp = BitmapFactory.decodeStream(input)
        input.close()
        if (bmp == null) return
        val mediaDir = File(filesDir, "media").apply { mkdirs() }
        val file = File(mediaDir, "img_${System.currentTimeMillis()}.png")
        FileOutputStream(file).use { bmp.compress(Bitmap.CompressFormat.PNG, 95, it) }
        val ratio = minOf(880f / bmp.width, 1200f / bmp.height, 1f)
        val w = bmp.width * ratio
        val h = bmp.height * ratio
        bmp.recycle()
        pushUndoSnapshot()
        currentPage().elements.add(ImageItem(imagePath = file.absolutePath, x = (1080f - w) / 2f, y = (1920f - h) / 2f, width = w, height = h))
        binding.blackboardCanvas.invalidate()
        storage.saveNotebook(notebook)
    }

    private fun importPdfFromUri(uri: Uri) {
        val paths = PdfTools.importPdfPagesToLocalImages(this, uri)
        if (paths.isEmpty()) return
        pushUndoSnapshot()
        paths.forEachIndexed { idx, path ->
            if (idx > 0) {
                notebook.pages.add(BoardPage(title = "PDF Page ${idx + 1}", background = currentPage().background))
                notebook.currentPageIndex = notebook.pages.lastIndex
            }
            currentPage().elements.add(ImageItem(imagePath = path, x = 40f, y = 120f, width = 1000f, height = 1420f, pinned = true))
        }
        loadCurrentPageIntoCanvas()
        storage.saveNotebook(notebook)
    }
}
