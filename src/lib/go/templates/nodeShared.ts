import * as go from "gojs";
import { formatSize, parseSize } from "../converters";
import {
  INK,
  OUTLINE_VARIANT,
  PRIMARY,
  SURFACE,
  SURFACE_CONTAINER_LOWEST,
} from "../theme";

export function backgroundShape(): go.Shape {
  return new go.Shape({
    name: "SHAPE",
    figure: "RoundedRectangle",
    parameter1: 2,
    fill: SURFACE,
    stroke: INK,
    strokeWidth: 1,
  }).bind(new go.Binding("desiredSize", "size", parseSize).makeTwoWay(formatSize));
}

export function selectionAdornment(): go.Adornment {
  return new go.Adornment("Spot").add(
    new go.Shape({
      figure: "RoundedRectangle",
      parameter1: 3,
      fill: null,
      stroke: PRIMARY,
      strokeWidth: 1.5,
      stretch: go.Stretch.Fill,
    })
  );
}

export function resizeAdornment(): go.Adornment {
  const handles: Array<{ alignment: go.Spot; focus: go.Spot }> = [
    { alignment: new go.Spot(0, 0, -6, -6), focus: go.Spot.TopLeft },
    { alignment: new go.Spot(0.5, 0, 0, -6), focus: go.Spot.Top },
    { alignment: new go.Spot(1, 0, 6, -6), focus: go.Spot.TopRight },
    { alignment: new go.Spot(0, 0.5, -6, 0), focus: go.Spot.Left },
    { alignment: new go.Spot(1, 0.5, 6, 0), focus: go.Spot.Right },
    { alignment: new go.Spot(0, 1, -6, 6), focus: go.Spot.BottomLeft },
    { alignment: new go.Spot(0.5, 1, 0, 6), focus: go.Spot.Bottom },
    { alignment: new go.Spot(1, 1, 6, 6), focus: go.Spot.BottomRight },
  ];

  const adornment = new go.Adornment("Spot").add(new go.Placeholder());
  for (const handle of handles) {
    adornment.add(
      new go.Shape({
        figure: "Rectangle",
        desiredSize: new go.Size(12, 12),
        fill: SURFACE_CONTAINER_LOWEST,
        stroke: PRIMARY,
        strokeWidth: 2,
        alignment: handle.alignment,
        alignmentFocus: handle.focus,
      })
    );
  }
  return adornment;
}

export function makePort(portId: string, spot: go.Spot): go.Shape {
  return new go.Shape({
    portId,
    fromSpot: spot,
    toSpot: spot,
    fromLinkable: true,
    toLinkable: true,
    fromLinkableDuplicates: true,
    toLinkableDuplicates: true,
    desiredSize: new go.Size(20, 20),
    fill: "transparent",
    stroke: null,
    alignment: spot,
    alignmentFocus: spot,
    cursor: "pointer",
  });
}

export function hasRows(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

export function separatorLine(prop: string): go.Shape {
  return new go.Shape({
    height: 1,
    stretch: go.Stretch.Horizontal,
    stroke: OUTLINE_VARIANT,
    strokeWidth: 1,
    visible: false,
  }).bind("visible", prop, hasRows);
}