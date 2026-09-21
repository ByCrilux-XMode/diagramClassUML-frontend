import * as go from "gojs";
import {
  fontForAbstract,
  fontForClassName,
  formatAttribute,
  formatMethod,
  formatLoc,
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
import { INK, SHADOW, SURFACE_VARIANT_TEXT, fontMono } from "../theme";
import { Rows, Space } from "lucide-react";
import { styleText } from "util";

export function createClassNodeTemplate(): go.Node {
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
            stretch: go.Stretch.Horizontal,
          })
            .add(
              new go.TextBlock({
                textAlign: "center",
                stroke: INK,
                editable: true,
                wrap: go.Wrap.Fit,
                maxLines: 2,
                overflow: go.TextOverflow.Ellipsis,
                stretch: go.Stretch.Horizontal,
              })
                .bind(new go.Binding("text", "name").makeTwoWay())
                .bind("font", "isAbstract", fontForClassName),
            )
            .add( new go.TextBlock({font: fontMono("10px")}))
            .add(separatorLine("attributes"))
            .add( new go.TextBlock({font: fontMono("10px")}))
            .add(attributesPanel())
            .add( new go.TextBlock({font: fontMono("10px")}))
            .add(separatorLine("methods"))
            .add( new go.TextBlock({font: fontMono("10px")}))
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

function attributesPanel(): go.Panel {
  return new go.Panel("Vertical", {
    stretch: go.Stretch.Horizontal,
    itemTemplate: new go.Panel("Vertical", {
      margin: 0,
      stretch: go.Stretch.Horizontal,
    }).add(
      new go.TextBlock({
        font: fontMono("12px"),
        stroke: SURFACE_VARIANT_TEXT,
        wrap: go.Wrap.Fit,
        maxLines: 2,
        overflow: go.TextOverflow.Ellipsis,
        stretch: go.Stretch.Horizontal,
      })
        .bind("text", "", formatAttribute)
        .bind("isUnderline", "isStatic", toUnderline),
    )
    .add( new go.TextBlock(
      {font: fontMono("5px")}
    )
    ),
  }).bind("itemArray", "attributes");
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
    )
    .add( new go.TextBlock(
      {font: fontMono("5px")}
    )),
  }).bind("itemArray", "methods");
}