package com.smartblackboard.app

import android.content.Context
import android.graphics.*
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import kotlin.math.*

class BlackboardCanvasView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : View(context, attrs) {

    companion object {
        const val BOARD_W = 1080f
        const val BOARD_H = 1920f
    }

    var page: BoardPage = BoardPage()
        set(value) {
            field = value
            selectedElementId = null
            invalidate()
        }

    var currentTool: ToolMode = ToolMode.PEN
    var currentColor: Int = Color.parseColor("#F8FAFC")
    var strokeSize: Float = 8f
    var eraserRadius: Float = 36f
    var stylusOnlyMode: Boolean = false
    var showRuler: Boolean = false
    var showProtractor: Boolean = false

    var zoomFactor: Float = 1f
        private set
    private var panX = 0f
    private var panY = 0f

    var selectedElementId: String? = null
    var onHistorySnapshotRequested: (() -> Unit)? = null
    var onPageMutated: (() -> Unit)? = null
    var onZoomChanged: ((Float) -> Unit)? = null
    var onTextRequested: ((Float, Float, MathItem?) -> Unit)? = null

    private val bitmapCache = LinkedHashMap<String, Bitmap>(16, 0.75f, true)
    private var activeStroke: StrokeItem? = null
    private var activeShape: ShapeItem? = null
    private val erasingIds = HashSet<String>()
    private var eraserCursor: PointF? = null

    private data class LaserStroke(val color: Int, val size: Float, val points: MutableList<PointF>, var endedAt: Long = 0L)
    private val laserStrokes = mutableListOf<LaserStroke>()
    private var activeLaser: LaserStroke? = null

    private val multiSelectedIds = HashSet<String>()
    private var marqueeRect: RectF? = null
    private var marqueeStart = PointF()

    private var dragMode = 0 // 0=none, 1=move, 2=pan, 3=marquee, 4=moveGroup
    private var lastBoardPt = PointF()
    private var lastTouchPt = PointF()

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Typeface.SERIF
    }

    private val scaleDetector = ScaleGestureDetector(context,
        object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScale(detector: ScaleGestureDetector): Boolean {
                zoomFactor = (zoomFactor * detector.scaleFactor).coerceIn(0.6f, 4.0f)
                onZoomChanged?.invoke(zoomFactor)
                invalidate()
                return true
            }
        }
    )

    fun resetZoom() {
        zoomFactor = 1f
        panX = 0f
        panY = 0f
        onZoomChanged?.invoke(zoomFactor)
        invalidate()
    }

    private fun getBaseScale(): Float {
        if (width == 0 || height == 0) return 1f
        return min(width / BOARD_W, height / BOARD_H)
    }

    private fun screenToBoard(sx: Float, sy: Float): PointF {
        val scale = getBaseScale() * zoomFactor
        val boardDrawW = BOARD_W * scale
        val boardDrawH = BOARD_H * scale
        val offsetX = (width - boardDrawW) / 2f + panX
        val offsetY = (height - boardDrawH) / 2f + panY
        return PointF((sx - offsetX) / scale, (sy - offsetY) / scale)
    }

    private fun loadBitmapCached(path: String): Bitmap? {
        bitmapCache[path]?.let { if (!it.isRecycled) return it }
        val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(path, opts)
        var sample = 1
        while (opts.outWidth / sample > 1440 || opts.outHeight / sample > 2560) sample *= 2
        val decodeOpts = BitmapFactory.Options().apply {
            inSampleSize = sample
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        val bmp = BitmapFactory.decodeFile(path, decodeOpts) ?: return null
        if (bitmapCache.size >= 12) {
            val oldestKey = bitmapCache.keys.firstOrNull()
            oldestKey?.let { bitmapCache.remove(it) }
        }
        bitmapCache[path] = bmp
        return bmp
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        canvas.drawColor(Color.parseColor("#090B0E"))

        val scale = getBaseScale() * zoomFactor
        val boardDrawW = BOARD_W * scale
        val boardDrawH = BOARD_H * scale
        val offsetX = (width - boardDrawW) / 2f + panX
        val offsetY = (height - boardDrawH) / 2f + panY

        canvas.save()
        canvas.translate(offsetX, offsetY)
        canvas.scale(scale, scale)
        canvas.clipRect(0f, 0f, BOARD_W, BOARD_H)

        renderPageContent(canvas, page, includeSelection = true)

        activeStroke?.let { drawStroke(canvas, it, false) }
        activeShape?.let { drawShape(canvas, it, false) }

        if (currentTool == ToolMode.ERASER && eraserCursor != null) {
            paint.style = Paint.Style.FILL
            paint.color = Color.argb(40, 239, 68, 68)
            canvas.drawCircle(eraserCursor!!.x, eraserCursor!!.y, eraserRadius, paint)
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = 2.5f
            paint.color = Color.argb(220, 239, 68, 68)
            canvas.drawCircle(eraserCursor!!.x, eraserCursor!!.y, eraserRadius, paint)
        }

        if (showRuler) drawRulerOverlay(canvas)
        if (showProtractor) drawProtractorOverlay(canvas)

        marqueeRect?.let { r ->
            paint.style = Paint.Style.FILL
            paint.color = Color.argb(36, 56, 189, 248)
            canvas.drawRoundRect(r, 10f, 10f, paint)
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = 3f
            paint.color = Color.parseColor("#38BDF8")
            canvas.drawRoundRect(r, 10f, 10f, paint)
        }

        // Draw active & 2-second fading laser pointer strokes
        val nowMs = System.currentTimeMillis()
        laserStrokes.removeAll { it.endedAt > 0L && nowMs - it.endedAt >= 2000L }
        val allLasers = laserStrokes + listOfNotNull(activeLaser)
        for (ls in allLasers) {
            if (ls.points.isEmpty()) continue
            val alphaFrac = if (ls.endedAt > 0L) ((2000L - (nowMs - ls.endedAt)) / 2000f).coerceIn(0f, 1f) else 1f
            val path = Path().apply {
                moveTo(ls.points[0].x, ls.points[0].y)
                for (i in 1 until ls.points.size) lineTo(ls.points[i].x, ls.points[i].y)
            }
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = max(12f, ls.size * 1.6f)
            paint.color = ls.color
            paint.alpha = (200 * alphaFrac).toInt()
            canvas.drawPath(path, paint)
            paint.strokeWidth = max(4f, ls.size * 0.55f)
            paint.color = Color.WHITE
            paint.alpha = (255 * alphaFrac).toInt()
            canvas.drawPath(path, paint)
            paint.alpha = 255
        }
        if (laserStrokes.isNotEmpty() || activeLaser != null) {
            postInvalidateOnAnimation()
        }

        canvas.restore()
    }

    fun renderPageToBitmap(targetPage: BoardPage): Bitmap {
        val bmp = Bitmap.createBitmap(BOARD_W.toInt(), BOARD_H.toInt(), Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        renderPageContent(c, targetPage, includeSelection = false)
        return bmp
    }

    private fun renderPageContent(canvas: Canvas, target: BoardPage, includeSelection: Boolean) {
        // Background
        paint.style = Paint.Style.FILL
        paint.color = target.background.colorInt
        canvas.drawRect(0f, 0f, BOARD_W, BOARD_H, paint)

        // Paper Pattern
        drawPaperPattern(canvas, target)

        // Layer 1: Pinned background images
        for (el in target.elements) {
            if (el is ImageItem && el.pinned) drawImageItem(canvas, el)
        }
        // Layer 2: Unpinned images
        for (el in target.elements) {
            if (el is ImageItem && !el.pinned) drawImageItem(canvas, el)
        }
        // Layer 3: Math items, shapes, strokes
        for (el in target.elements) {
            val erasing = erasingIds.contains(el.id)
            when (el) {
                is MathItem -> drawMathItem(canvas, el, target.background == BoardBg.WHITE, erasing)
                is ShapeItem -> drawShape(canvas, el, erasing)
                is StrokeItem -> drawStroke(canvas, el, erasing)
                is ImageItem -> {}
            }
        }

        if (includeSelection && selectedElementId != null && currentTool == ToolMode.SELECT) {
            val sel = target.elements.find { it.id == selectedElementId }
            if (sel is ImageItem) {
                drawSelectionRect(canvas, sel.x, sel.y, sel.width, sel.height, sel.rotation)
            } else if (sel is MathItem) {
                drawSelectionRect(canvas, sel.x, sel.y, sel.width, sel.height, sel.rotation)
            }
        }
    }

    private fun drawPaperPattern(canvas: Canvas, target: BoardPage) {
        paint.style = Paint.Style.STROKE
        paint.color = target.background.gridColorInt
        paint.strokeWidth = 1.4f
        when (target.paper) {
            PaperPattern.GRID -> {
                var x = 45f
                while (x < BOARD_W) { canvas.drawLine(x, 0f, x, BOARD_H, paint); x += 45f }
                var y = 45f
                while (y < BOARD_H) { canvas.drawLine(0f, y, BOARD_W, y, paint); y += 45f }
            }
            PaperPattern.DOTTED -> {
                paint.style = Paint.Style.FILL
                var x = 42f
                while (x < BOARD_W) {
                    var y = 42f
                    while (y < BOARD_H) { canvas.drawCircle(x, y, 2.4f, paint); y += 42f }
                    x += 42f
                }
            }
            PaperPattern.RULED -> {
                var y = 140f
                while (y < BOARD_H - 60f) { canvas.drawLine(0f, y, BOARD_W, y, paint); y += 64f }
            }
            PaperPattern.AXES -> {
                var x = 0f
                while (x <= BOARD_W) { canvas.drawLine(x, 0f, x, BOARD_H, paint); x += 45f }
                var y = 0f
                while (y <= BOARD_H) { canvas.drawLine(0f, y, BOARD_W, y, paint); y += 45f }
                paint.strokeWidth = 3f
                paint.color = if (target.background == BoardBg.WHITE) Color.argb(120, 15, 23, 42) else Color.argb(120, 248, 250, 252)
                canvas.drawLine(40f, BOARD_H / 2f, BOARD_W - 40f, BOARD_H / 2f, paint)
                canvas.drawLine(BOARD_W / 2f, 60f, BOARD_W / 2f, BOARD_H - 60f, paint)
            }
            PaperPattern.PLAIN -> {}
        }
    }

    private fun drawImageItem(canvas: Canvas, item: ImageItem) {
        val bmp = loadBitmapCached(item.imagePath) ?: return
        canvas.save()
        canvas.translate(item.x + item.width / 2f, item.y + item.height / 2f)
        canvas.rotate(item.rotation)
        val dst = RectF(-item.width / 2f, -item.height / 2f, item.width / 2f, item.height / 2f)
        canvas.drawBitmap(bmp, null, dst, null)
        canvas.restore()
    }

    private fun drawSelectionRect(canvas: Canvas, x: Float, y: Float, w: Float, h: Float, rot: Float) {
        canvas.save()
        canvas.translate(x + w / 2f, y + h / 2f)
        canvas.rotate(rot)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 3f
        paint.color = Color.parseColor("#38BDF8")
        canvas.drawRect(-w / 2f, -h / 2f, w / 2f, h / 2f, paint)
        canvas.restore()
    }

    private fun drawStroke(canvas: Canvas, stroke: StrokeItem, erasing: Boolean) {
        if (stroke.points.isEmpty()) return
        paint.style = Paint.Style.STROKE
        paint.color = if (erasing) Color.argb(90, 239, 68, 68) else stroke.color
        paint.alpha = when {
            erasing -> 90
            stroke.tool == ToolMode.HIGHLIGHTER -> 85
            stroke.tool == ToolMode.PENCIL -> 195
            else -> 255
        }
        val path = Path()
        val pts = stroke.points
        if (pts.size == 1) {
            paint.style = Paint.Style.FILL
            canvas.drawCircle(pts[0].x, pts[0].y, max(2f, stroke.size / 2f), paint)
            paint.alpha = 255
            return
        }
        paint.strokeWidth = if (stroke.tool == ToolMode.HIGHLIGHTER) max(22f, stroke.size * 2.4f) else stroke.size
        path.moveTo(pts[0].x, pts[0].y)
        for (i in 1 until pts.size - 1) {
            val mx = (pts[i].x + pts[i + 1].x) / 2f
            val my = (pts[i].y + pts[i + 1].y) / 2f
            path.quadTo(pts[i].x, pts[i].y, mx, my)
        }
        path.lineTo(pts.last().x, pts.last().y)
        if (stroke.closed) path.close()
        canvas.drawPath(path, paint)
        paint.alpha = 255
    }

    private fun drawShape(canvas: Canvas, s: ShapeItem, erasing: Boolean) {
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = s.size
        paint.color = if (erasing) Color.argb(90, 239, 68, 68) else s.color
        when (s.shapeTool) {
            ToolMode.LINE -> canvas.drawLine(s.x1, s.y1, s.x2, s.y2, paint)
            ToolMode.ARROW -> {
                canvas.drawLine(s.x1, s.y1, s.x2, s.y2, paint)
                val angle = atan2((s.y2 - s.y1).toDouble(), (s.x2 - s.x1).toDouble())
                val headLen = max(18f, s.size * 3.2f)
                canvas.drawLine(
                    s.x2, s.y2,
                    (s.x2 - headLen * cos(angle - Math.PI / 6)).toFloat(),
                    (s.y2 - headLen * sin(angle - Math.PI / 6)).toFloat(), paint
                )
                canvas.drawLine(
                    s.x2, s.y2,
                    (s.x2 - headLen * cos(angle + Math.PI / 6)).toFloat(),
                    (s.y2 - headLen * sin(angle + Math.PI / 6)).toFloat(), paint
                )
            }
            ToolMode.RECTANGLE -> canvas.drawRect(min(s.x1, s.x2), min(s.y1, s.y2), max(s.x1, s.x2), max(s.y1, s.y2), paint)
            ToolMode.SQUARE -> {
                val side = max(abs(s.x2 - s.x1), abs(s.y2 - s.y1))
                val rx2 = if (s.x2 >= s.x1) s.x1 + side else s.x1 - side
                val ry2 = if (s.y2 >= s.y1) s.y1 + side else s.y1 - side
                canvas.drawRect(min(s.x1, rx2), min(s.y1, ry2), max(s.x1, rx2), max(s.y1, ry2), paint)
            }
            ToolMode.CIRCLE -> canvas.drawOval(min(s.x1, s.x2), min(s.y1, s.y2), max(s.x1, s.x2), max(s.y1, s.y2), paint)
            ToolMode.TRIANGLE -> {
                val l = min(s.x1, s.x2); val r = max(s.x1, s.x2)
                val t = min(s.y1, s.y2); val b = max(s.y1, s.y2)
                val p = Path().apply {
                    moveTo((l + r) / 2f, t); lineTo(r, b); lineTo(l, b); close()
                }
                canvas.drawPath(p, paint)
            }
            else -> {}
        }
    }

    private fun drawMathItem(canvas: Canvas, m: MathItem, lightBg: Boolean, erasing: Boolean) {
        canvas.save()
        canvas.translate(m.x, m.y)
        textPaint.color = if (erasing) Color.argb(100, 239, 68, 68) else m.color
        when (m.kind) {
            "text" -> {
                textPaint.typeface = if (m.fontFamily == "sans") Typeface.SANS_SERIF else Typeface.SERIF
                textPaint.textSize = m.fontSize
                val isLeft = m.textAlign == "left"
                textPaint.textAlign = if (isLeft) Paint.Align.LEFT else Paint.Align.CENTER
                val lines = m.content.split("\n")
                val lineH = m.fontSize * 1.32f
                val totalH = lines.size * lineH
                var yy = (m.height - totalH) / 2f + m.fontSize * 0.9f
                val xPos = if (isLeft) 16f else m.width / 2f
                for (line in lines) {
                    canvas.drawText(line, xPos, yy, textPaint)
                    yy += lineH
                }
                textPaint.typeface = Typeface.SERIF
            }
            "fraction" -> {
                textPaint.textSize = 44f
                textPaint.textAlign = Paint.Align.CENTER
                canvas.drawText(m.numerator, m.width / 2f, m.height * 0.34f, textPaint)
                canvas.drawText(m.denominator, m.width / 2f, m.height * 0.78f, textPaint)
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = 4f
                paint.color = textPaint.color
                canvas.drawLine(24f, m.height * 0.5f, m.width - 24f, m.height * 0.5f, paint)
            }
            "proof" -> {
                paint.style = Paint.Style.FILL
                paint.color = if (lightBg) Color.argb(14, 15, 23, 42) else Color.argb(16, 255, 255, 255)
                canvas.drawRoundRect(0f, 0f, m.width, m.height, 14f, 14f, paint)
                textPaint.textSize = 30f
                textPaint.textAlign = Paint.Align.LEFT
                var yy = 44f
                for (line in m.content.split("\n")) {
                    canvas.drawText(line, 24f, yy, textPaint)
                    yy += 46f
                }
            }
            "axes", "graph" -> {
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = 2f
                paint.color = if (lightBg) Color.argb(140, 15, 23, 42) else Color.argb(140, 248, 250, 252)
                canvas.drawLine(30f, m.height / 2f, m.width - 30f, m.height / 2f, paint)
                canvas.drawLine(m.width / 2f, 30f, m.width / 2f, m.height - 30f, paint)
            }
        }
        canvas.restore()
    }

    private fun drawRulerOverlay(canvas: Canvas) {
        paint.style = Paint.Style.FILL
        paint.color = Color.argb(42, 56, 189, 248)
        canvas.drawRoundRect(120f, 820f, 960f, 900f, 10f, 10f, paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 2.5f
        paint.color = Color.argb(200, 56, 189, 248)
        canvas.drawRoundRect(120f, 820f, 960f, 900f, 10f, 10f, paint)
    }

    private fun drawProtractorOverlay(canvas: Canvas) {
        paint.style = Paint.Style.FILL
        paint.color = Color.argb(38, 250, 204, 21)
        canvas.drawArc(340f, 520f, 740f, 920f, 180f, 180f, true, paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 2.5f
        paint.color = Color.argb(210, 250, 204, 21)
        canvas.drawArc(340f, 520f, 740f, 920f, 180f, 180f, true, paint)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        scaleDetector.onTouchEvent(event)
        if (event.pointerCount >= 2) {
            activeStroke = null
            activeShape = null
            if (event.actionMasked == MotionEvent.ACTION_MOVE && !scaleDetector.isInProgress) {
                val mx = (event.getX(0) + event.getX(1)) / 2f
                val my = (event.getY(0) + event.getY(1)) / 2f
                if (dragMode == 2) {
                    panX += mx - lastTouchPt.x
                    panY += my - lastTouchPt.y
                    invalidate()
                }
                lastTouchPt.set(mx, my)
                dragMode = 2
            } else if (event.actionMasked == MotionEvent.ACTION_POINTER_UP) {
                dragMode = 0
            }
            return true
        }

        if (stylusOnlyMode && event.getToolType(0) == MotionEvent.TOOL_TYPE_FINGER) {
            return true
        }

        val pt = screenToBoard(event.x, event.y)
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                dragMode = 0
                if (currentTool == ToolMode.SELECT) {
                    val hit = hitTestSelectable(pt.x, pt.y)
                    selectedElementId = hit?.id
                    if (hit != null) {
                        onHistorySnapshotRequested?.invoke()
                        dragMode = 1
                        lastBoardPt.set(pt)
                    }
                    invalidate()
                    return true
                }
                if (currentTool == ToolMode.AREA_SELECT) {
                    if (multiSelectedIds.isNotEmpty()) {
                        onHistorySnapshotRequested?.invoke()
                        dragMode = 4
                        lastBoardPt.set(pt)
                        return true
                    }
                    multiSelectedIds.clear()
                    marqueeStart.set(pt)
                    marqueeRect = RectF(pt.x, pt.y, pt.x, pt.y)
                    dragMode = 3
                    invalidate()
                    return true
                }
                if (currentTool == ToolMode.TEXT) {
                    val hit = hitTestSelectable(pt.x, pt.y) as? MathItem
                    val existing = if (hit != null && hit.kind == "text") hit else null
                    onTextRequested?.invoke(pt.x, pt.y, existing)
                    return true
                }
                if (currentTool == ToolMode.LASER) {
                    val lc = if (currentColor == Color.parseColor("#F8FAFC") || currentColor == Color.parseColor("#0F172A")) Color.parseColor("#FF3B30") else currentColor
                    activeLaser = LaserStroke(lc, strokeSize, mutableListOf(PointF(pt.x, pt.y)))
                    invalidate()
                    return true
                }
                if (currentTool == ToolMode.ERASER) {
                    erasingIds.clear()
                    markErasedHits(pt.x, pt.y)
                    eraserCursor = pt
                    invalidate()
                    return true
                }
                if (isShapeTool(currentTool)) {
                    activeShape = ShapeItem(
                        shapeTool = currentTool,
                        color = currentColor,
                        size = strokeSize,
                        x1 = pt.x, y1 = pt.y, x2 = pt.x, y2 = pt.y
                    )
                    invalidate()
                    return true
                }
                activeStroke = StrokeItem(
                    tool = currentTool,
                    color = currentColor,
                    size = strokeSize,
                    points = mutableListOf(StrokePoint(pt.x, pt.y, event.pressure))
                )
                invalidate()
            }
            MotionEvent.ACTION_MOVE -> {
                if (currentTool == ToolMode.AREA_SELECT && dragMode == 3) {
                    marqueeRect = RectF(min(marqueeStart.x, pt.x), min(marqueeStart.y, pt.y), max(marqueeStart.x, pt.x), max(marqueeStart.y, pt.y))
                    invalidate()
                    return true
                }
                if (currentTool == ToolMode.AREA_SELECT && dragMode == 4) {
                    val dx = pt.x - lastBoardPt.x; val dy = pt.y - lastBoardPt.y
                    lastBoardPt.set(pt)
                    for (el in page.elements) {
                        if (!multiSelectedIds.contains(el.id)) continue
                        when (el) {
                            is ImageItem -> { el.x += dx; el.y += dy }
                            is MathItem -> { el.x += dx; el.y += dy }
                            is ShapeItem -> { el.x1 += dx; el.y1 += dy; el.x2 += dx; el.y2 += dy }
                            is StrokeItem -> el.points.replaceAll { StrokePoint(it.x + dx, it.y + dy, it.pressure) }
                        }
                    }
                    invalidate()
                    return true
                }
                if (currentTool == ToolMode.LASER && activeLaser != null) {
                    activeLaser?.points?.add(PointF(pt.x, pt.y))
                    invalidate()
                    return true
                }
                if (currentTool == ToolMode.SELECT && dragMode == 1 && selectedElementId != null) {
                    val dx = pt.x - lastBoardPt.x
                    val dy = pt.y - lastBoardPt.y
                    lastBoardPt.set(pt)
                    val sel = page.elements.find { it.id == selectedElementId }
                    when (sel) {
                        is ImageItem -> { sel.x += dx; sel.y += dy }
                        is MathItem -> { sel.x += dx; sel.y += dy }
                        is ShapeItem -> { sel.x1 += dx; sel.y1 += dy; sel.x2 += dx; sel.y2 += dy }
                        is StrokeItem -> sel.points.replaceAll { StrokePoint(it.x + dx, it.y + dy, it.pressure) }
                        null -> {}
                    }
                    invalidate()
                    return true
                }
                if (currentTool == ToolMode.ERASER) {
                    markErasedHits(pt.x, pt.y)
                    eraserCursor = pt
                    invalidate()
                    return true
                }
                activeShape?.let {
                    it.x2 = pt.x; it.y2 = pt.y
                    invalidate()
                    return true
                }
                activeStroke?.let { s ->
                    for (h in 0 until event.historySize) {
                        val hp = screenToBoard(event.getHistoricalX(h), event.getHistoricalY(h))
                        s.points.add(StrokePoint(hp.x, hp.y, event.getHistoricalPressure(h)))
                    }
                    s.points.add(StrokePoint(pt.x, pt.y, event.pressure))
                    invalidate()
                }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                if (dragMode == 3 && marqueeRect != null) {
                    val r = marqueeRect!!
                    multiSelectedIds.clear()
                    for (el in page.elements) {
                        if (el is ImageItem && !el.pinned && RectF.intersects(r, RectF(el.x, el.y, el.x + el.width, el.y + el.height))) multiSelectedIds.add(el.id)
                        else if (el is MathItem && RectF.intersects(r, RectF(el.x, el.y, el.x + el.width, el.y + el.height))) multiSelectedIds.add(el.id)
                        else if (el is ShapeItem && RectF.intersects(r, RectF(min(el.x1, el.x2), min(el.y1, el.y2), max(el.x1, el.x2), max(el.y1, el.y2)))) multiSelectedIds.add(el.id)
                        else if (el is StrokeItem && el.points.any { r.contains(it.x, it.y) }) multiSelectedIds.add(el.id)
                    }
                    marqueeRect = null; dragMode = 0; invalidate(); return true
                }
                if (activeLaser != null) {
                    activeLaser!!.endedAt = System.currentTimeMillis()
                    laserStrokes.add(activeLaser!!)
                    activeLaser = null
                    invalidate()
                    return true
                }
                if (currentTool == ToolMode.ERASER) {
                    if (erasingIds.isNotEmpty()) {
                        onHistorySnapshotRequested?.invoke()
                        page.elements.removeAll { erasingIds.contains(it.id) }
                        onPageMutated?.invoke()
                    }
                    erasingIds.clear()
                    eraserCursor = null
                    invalidate()
                    return true
                }
                activeShape?.let { s ->
                    if (hypot((s.x2 - s.x1).toDouble(), (s.y2 - s.y1).toDouble()) > 8.0) {
                        onHistorySnapshotRequested?.invoke()
                        page.elements.add(s)
                        onPageMutated?.invoke()
                    }
                    activeShape = null
                    invalidate()
                    return true
                }
                activeStroke?.let { s ->
                    val closed = s.tool == ToolMode.FREEHAND_SHAPE && s.points.size > 6 &&
                        hypot((s.points.last().x - s.points.first().x).toDouble(),
                              (s.points.last().y - s.points.first().y).toDouble()) < 75.0
                    onHistorySnapshotRequested?.invoke()
                    page.elements.add(s.copy(closed = closed))
                    onPageMutated?.invoke()
                    activeStroke = null
                    invalidate()
                }
                if (dragMode == 1 || dragMode == 4) onPageMutated?.invoke()
                dragMode = 0
            }
        }
        return true
    }

    private fun isShapeTool(t: ToolMode) = t in setOf(
        ToolMode.LINE, ToolMode.CIRCLE, ToolMode.RECTANGLE,
        ToolMode.SQUARE, ToolMode.TRIANGLE, ToolMode.ARROW
    )

    private fun markErasedHits(x: Float, y: Float) {
        for (el in page.elements) {
            if (el is ImageItem) continue // Never erase imported photos or pinned PDFs
            if (el is StrokeItem) {
                val thresh = eraserRadius + el.size * 0.55f
                if (el.points.any { hypot((x - it.x).toDouble(), (y - it.y).toDouble()) <= thresh }) {
                    erasingIds.add(el.id)
                }
            } else if (el is ShapeItem) {
                val l = min(el.x1, el.x2) - eraserRadius
                val r = max(el.x1, el.x2) + eraserRadius
                val t = min(el.y1, el.y2) - eraserRadius
                val b = max(el.y1, el.y2) + eraserRadius
                if (x in l..r && y in t..b) erasingIds.add(el.id)
            } else if (el is MathItem) {
                if (x in el.x..(el.x + el.width) && y in el.y..(el.y + el.height)) {
                    erasingIds.add(el.id)
                }
            }
        }
    }

    private fun hitTestSelectable(x: Float, y: Float): BoardElement? {
        for (i in page.elements.indices.reversed()) {
            val el = page.elements[i]
            if (el is ImageItem && !el.pinned) {
                if (x in el.x..(el.x + el.width) && y in el.y..(el.y + el.height)) return el
            } else if (el is MathItem) {
                if (x in el.x..(el.x + el.width) && y in el.y..(el.y + el.height)) return el
            }
        }
        return null
    }
}
