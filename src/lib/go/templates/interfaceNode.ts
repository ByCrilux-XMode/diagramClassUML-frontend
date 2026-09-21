import * as go from "gojs";
import {
  fontForAbstract,
  fontForClassName,
  formatLoc,
  formatMethod,
  parseLoc,
  toUnderline,
} from "../converters";
import {
  backgroundShape,
  makePort,
  resizeAdornment,
  selectionAdornment,
  separatorLine,
} from "./nodeShared";
import { INK, SHADOW, SURFACE_VARIANT_TEXT, fontMono, fontSans } from "../theme";

export function createInterfaceNodeTemplate(): go.Node {
  return new go.Node("Spot", {
    resizable: true,
    resizeObjectName: "SHAPE",
    minSize: new go.Size(120, 56),
    isShadowed: true,
    shadowColor: SHADOW,
    selectionAdornmentTemplate: selectionAdornment(),
    resizeAdornmentTemplate: resizeAdornment(),
  })
    .add(
      new go.Panel("Auto")
        .add(backgroundShape())
        .add(
          new go.Panel("Vertical", {
            margin: 4,
            stretch: go.GraphObject.Horizontal,
          })
        .add(
          new go.TextBlock({
            text: "«interface»",
            font: fontSans("12px", "400", "italic"),
            stroke: SURFACE_VARIANT_TEXT,
            textAlign: "center",
            stretch: go.GraphObject.Horizontal,
            wrap: go.TextBlock.WrapFit,
            maxLines: 1,
            overflow: go.TextBlock.OverflowEllipsis,
          }),
        )
        .add(
          new go.TextBlock({
            textAlign: "center",
            stroke: INK,
            editable: true,
            wrap: go.TextBlock.WrapFit,
            maxLines: 2,
            overflow: go.TextBlock.OverflowEllipsis,
            stretch: go.GraphObject.Horizontal,
          })
            .bind("text", "name")
            .bind("font", "isAbstract", fontForClassName),
        )
        .add(separatorLine("methods"))
        .add(methodsPanel()),
        )
    )
    .add(makePort("T", go.Spot.Top))
    .add(makePort("B", go.Spot.Bottom))
    .add(makePort("L", go.Spot.Left))
    .add(makePort("R", go.Spot.Right))
    .bind(new go.Binding("location", "loc", parseLoc).makeTwoWay(formatLoc))
    .bind(new go.Binding("opacity", "isGhost", (v) => (v ? 0.45 : 1)));
}

function methodsPanel(): go.Panel {
  return new go.Panel("Vertical", {
    stretch: go.GraphObject.Horizontal,
    itemTemplate: new go.Panel("Vertical", {
      margin: 0,
      stretch: go.GraphObject.Horizontal,
    }).add(
      new go.TextBlock({
        font: fontMono("12px"),
        stroke: SURFACE_VARIANT_TEXT,
        wrap: go.TextBlock.WrapFit,
        maxLines: 2,
        overflow: go.TextBlock.OverflowEllipsis,
        stretch: go.GraphObject.Horizontal,
      })
        .bind("text", "", formatMethod)
        .bind("isUnderline", "isStatic", toUnderline)
        .bind("font", "isAbstract", fontForAbstract),
    ),
  }).bind("itemArray", "methods");
}