import * as go from "gojs";
import { formatFromEnd, formatToEnd } from "../../converters";
import { INK, SURFACE, fontMono } from "../../theme";

export function linkEndLabel(end: "from" | "to"): go.TextBlock { //la multiplicidad
  const text = new go.TextBlock({
    font: fontMono("12px"),
    stroke: INK,
    background: SURFACE,
    margin: new go.Margin(4, 8, 4, 8),
    segmentIndex: NaN,
    segmentFraction: end === "from" ? 0.06 : 0.94,
    segmentOffset: new go.Point(0, -14),
    segmentOrientation: go.Link.OrientUpright,
    textAlign: "center",
  });
  return end === "from"
    ? text.bindTwoWay("text", "", formatFromEnd)
    : text.bindTwoWay("text", "", formatToEnd);
}

export function linkMidLabel(): go.TextBlock { //el texto central de la relacion
  return new go.TextBlock({
    font: fontMono("12px"),
    stroke: INK,
    background: SURFACE,
    margin: new go.Margin(4, 8, 4, 8),
    editable: true,
    segmentIndex: NaN,
    segmentFraction: 0.5,
    segmentOffset: new go.Point(0, -10),
    segmentOrientation: go.Orientation.None,
    textAlign: "center",
    maxSize: new go.Size(140, NaN),
    wrap: go.Wrap.Fit,
  }).bind(new go.Binding("text", "name").makeTwoWay());
}