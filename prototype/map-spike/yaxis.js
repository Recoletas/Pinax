/**
 * P1 spike：y 轴转换与像素投影辅助。
 *
 * MapDocument v2 声明 `coordinateSystem.yAxis: 'down'`（数据原点在左上）；
 * OpenLayers 视口按 y 向上解释坐标。视口层统一在此翻转，业务/生成层不做两次约定。
 */

/** 数据 y → 视口 y。 */
export function dataYToViewportY(y, mapHeight) {
  return mapHeight - y
}

/** 视口 y → 数据 y（命中/编辑写回用）。 */
export function viewportYToDataY(y, mapHeight) {
  return mapHeight - y
}

/**
 * ImageCanvas canvasFunction 的源矩形计算：
 * 返回 canvas 的第 0 行对应视口 extent 的 maxY（= 数据 y 最小行）。
 */
export function terrainSourceRect(extent, mapHeight) {
  const [minX, minY, maxX, maxY] = extent
  return {
    sx: minX,
    sy: mapHeight - maxY,
    sw: maxX - minX,
    sh: maxY - minY,
  }
}
