package com.smartblackboard.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

class BoardStorageManager(private val context: Context) {

    private val dbFile = File(context.filesDir, "blackboard_notebook.json")

    fun saveNotebook(notebook: BoardNotebook) {
        val root = JSONObject().apply {
            put("id", notebook.id)
            put("name", notebook.name)
            put("currentPageIndex", notebook.currentPageIndex)
            val pagesArr = JSONArray()
            for (p in notebook.pages) {
                val pObj = JSONObject().apply {
                    put("id", p.id)
                    put("title", p.title)
                    put("background", p.background.name)
                    put("paper", p.paper.name)
                    val elsArr = JSONArray()
                    for (el in p.elements) {
                        elsArr.put(serializeElement(el))
                    }
                    put("elements", elsArr)
                }
                pagesArr.put(pObj)
            }
            put("pages", pagesArr)
        }
        dbFile.writeText(root.toString())
    }

    fun loadNotebook(): BoardNotebook {
        if (!dbFile.exists()) return BoardNotebook()
        return try {
            val root = JSONObject(dbFile.readText())
            val pagesArr = root.getJSONArray("pages")
            val pages = mutableListOf<BoardPage>()
            for (i in 0 until pagesArr.length()) {
                val pObj = pagesArr.getJSONObject(i)
                val elsArr = pObj.getJSONArray("elements")
                val els = mutableListOf<BoardElement>()
                for (j in 0 until elsArr.length()) {
                    deserializeElement(elsArr.getJSONObject(j))?.let { els.add(it) }
                }
                pages.add(
                    BoardPage(
                        id = pObj.getString("id"),
                        title = pObj.getString("title"),
                        background = BoardBg.valueOf(pObj.getString("background")),
                        paper = PaperPattern.valueOf(pObj.getString("paper")),
                        elements = els
                    )
                )
            }
            BoardNotebook(
                id = root.getString("id"),
                name = root.getString("name"),
                pages = if (pages.isEmpty()) mutableListOf(BoardPage()) else pages,
                currentPageIndex = root.optInt("currentPageIndex", 0)
            )
        } catch (_: Exception) {
            BoardNotebook()
        }
    }

    private fun serializeElement(el: BoardElement): JSONObject = when (el) {
        is StrokeItem -> JSONObject().apply {
            put("type", "stroke")
            put("id", el.id)
            put("tool", el.tool.name)
            put("color", el.color)
            put("size", el.size.toDouble())
            put("closed", el.closed)
            val pts = JSONArray()
            for (pt in el.points) {
                pts.put(JSONArray().put(pt.x).put(pt.y).put(pt.pressure))
            }
            put("points", pts)
        }
        is ShapeItem -> JSONObject().apply {
            put("type", "shape")
            put("id", el.id)
            put("shapeTool", el.shapeTool.name)
            put("color", el.color)
            put("size", el.size.toDouble())
            put("x1", el.x1.toDouble()); put("y1", el.y1.toDouble())
            put("x2", el.x2.toDouble()); put("y2", el.y2.toDouble())
        }
        is MathItem -> JSONObject().apply {
            put("type", "math")
            put("id", el.id)
            put("kind", el.kind)
            put("x", el.x.toDouble()); put("y", el.y.toDouble())
            put("width", el.width.toDouble()); put("height", el.height.toDouble())
            put("rotation", el.rotation.toDouble())
            put("color", el.color)
            put("content", el.content)
            put("numerator", el.numerator)
            put("denominator", el.denominator)
            put("fontSize", el.fontSize.toDouble())
            put("fontFamily", el.fontFamily)
            put("textAlign", el.textAlign)
        }
        is ImageItem -> JSONObject().apply {
            put("type", "image")
            put("id", el.id)
            put("imagePath", el.imagePath)
            put("x", el.x.toDouble()); put("y", el.y.toDouble())
            put("width", el.width.toDouble()); put("height", el.height.toDouble())
            put("rotation", el.rotation.toDouble())
            put("pinned", el.pinned)
        }
    }

    private fun deserializeElement(obj: JSONObject): BoardElement? = when (obj.getString("type")) {
        "stroke" -> {
            val ptsArr = obj.getJSONArray("points")
            val pts = mutableListOf<StrokePoint>()
            for (k in 0 until ptsArr.length()) {
                val pair = ptsArr.getJSONArray(k)
                pts.add(StrokePoint(pair.getDouble(0).toFloat(), pair.getDouble(1).toFloat(), pair.getDouble(2).toFloat()))
            }
            StrokeItem(
                id = obj.getString("id"),
                tool = ToolMode.valueOf(obj.getString("tool")),
                color = obj.getInt("color"),
                size = obj.getDouble("size").toFloat(),
                points = pts,
                closed = obj.optBoolean("closed", false)
            )
        }
        "shape" -> ShapeItem(
            id = obj.getString("id"),
            shapeTool = ToolMode.valueOf(obj.getString("shapeTool")),
            color = obj.getInt("color"),
            size = obj.getDouble("size").toFloat(),
            x1 = obj.getDouble("x1").toFloat(), y1 = obj.getDouble("y1").toFloat(),
            x2 = obj.getDouble("x2").toFloat(), y2 = obj.getDouble("y2").toFloat()
        )
        "math" -> MathItem(
            id = obj.getString("id"),
            kind = obj.getString("kind"),
            x = obj.getDouble("x").toFloat(), y = obj.getDouble("y").toFloat(),
            width = obj.getDouble("width").toFloat(), height = obj.getDouble("height").toFloat(),
            rotation = obj.optDouble("rotation", 0.0).toFloat(),
            color = obj.getInt("color"),
            content = obj.getString("content"),
            numerator = obj.optString("numerator", ""),
            denominator = obj.optString("denominator", ""),
            fontSize = obj.optDouble("fontSize", 48.0).toFloat(),
            fontFamily = obj.optString("fontFamily", "sans"),
            textAlign = obj.optString("textAlign", "left")
        )
        "image" -> ImageItem(
            id = obj.getString("id"),
            imagePath = obj.getString("imagePath"),
            x = obj.getDouble("x").toFloat(), y = obj.getDouble("y").toFloat(),
            width = obj.getDouble("width").toFloat(), height = obj.getDouble("height").toFloat(),
            rotation = obj.optDouble("rotation", 0.0).toFloat(),
            pinned = obj.optBoolean("pinned", false)
        )
        else -> null
    }
}
