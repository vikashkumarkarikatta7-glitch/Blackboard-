package com.smartblackboard.app

import android.graphics.Color
import java.util.UUID

enum class BoardBg(val label: String, val colorInt: Int, val gridColorInt: Int) {
    BLACK("Black", Color.parseColor("#0E1114"), Color.argb(22, 255, 255, 255)),
    GREEN("Green", Color.parseColor("#133024"), Color.argb(26, 255, 255, 255)),
    WHITE("White", Color.parseColor("#F8FAFC"), Color.argb(28, 15, 23, 42)),
    BLUE("Blue", Color.parseColor("#0E223D"), Color.argb(34, 148, 197, 255))
}

enum class PaperPattern(val label: String) {
    PLAIN("Plain"),
    GRID("Grid"),
    DOTTED("Dotted"),
    RULED("Ruled"),
    AXES("Axes")
}

enum class ToolMode {
    SELECT,
    AREA_SELECT,
    PEN,
    PENCIL,
    HIGHLIGHTER,
    TEXT,
    LASER,
    ERASER,
    LINE,
    CIRCLE,
    RECTANGLE,
    SQUARE,
    TRIANGLE,
    ARROW,
    FREEHAND_SHAPE
}

data class StrokePoint(val x: Float, val y: Float, val pressure: Float)

sealed class BoardElement(open val id: String = UUID.randomUUID().toString())

data class StrokeItem(
    override val id: String = UUID.randomUUID().toString(),
    val tool: ToolMode,
    val color: Int,
    val size: Float,
    val points: MutableList<StrokePoint>,
    val closed: Boolean = false
) : BoardElement(id)

data class ShapeItem(
    override val id: String = UUID.randomUUID().toString(),
    val shapeTool: ToolMode,
    val color: Int,
    val size: Float,
    var x1: Float,
    var y1: Float,
    var x2: Float,
    var y2: Float
) : BoardElement(id)

data class MathItem(
    override val id: String = UUID.randomUUID().toString(),
    val kind: String, // "text", "fraction", "graph", "axes", "proof"
    var x: Float,
    var y: Float,
    var width: Float,
    var height: Float,
    var rotation: Float = 0f,
    val color: Int,
    var content: String,
    val numerator: String = "",
    val denominator: String = "",
    val expression: String = "",
    var fontSize: Float = 48f,
    var fontFamily: String = "sans",
    var textAlign: String = "left"
) : BoardElement(id)

data class ImageItem(
    override val id: String = UUID.randomUUID().toString(),
    val imagePath: String,
    var x: Float,
    var y: Float,
    var width: Float,
    var height: Float,
    var rotation: Float = 0f,
    var pinned: Boolean = false
) : BoardElement(id)

data class BoardPage(
    val id: String = UUID.randomUUID().toString(),
    var title: String = "Page 1",
    var background: BoardBg = BoardBg.BLACK,
    var paper: PaperPattern = PaperPattern.PLAIN,
    val elements: MutableList<BoardElement> = mutableListOf()
)

data class BoardNotebook(
    val id: String = UUID.randomUUID().toString(),
    var name: String = "Mathematics Board",
    val pages: MutableList<BoardPage> = mutableListOf(BoardPage()),
    var currentPageIndex: Int = 0
)
